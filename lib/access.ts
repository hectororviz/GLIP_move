import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "./config";
import { prisma, usePostgres, withWriteLock } from "./db";

export type Area = {
  id: string;
  nombre: string;
  responsableUserId: number;
  responsableNombre: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MailAccount = {
  id: string;
  nombre: string;
  direccion: string; // lower/trim
  areaId: string;
  createdAt: number;
  updatedAt: number;
};

export type Share = {
  id: string;
  nombre: string;
  ruta: string; // normalizada, se muestra tal cual
  areaId: string;
  createdAt: number;
  updatedAt: number;
};

export type MailGrant = {
  accountId: string;
  userId: number;
  userDisplay: string | null;
  userFirstname: string | null;
  userRealname: string | null;
  canSend: boolean;
  canRead: boolean;
  by: string | null;
  at: number;
};

export type ShareGrant = {
  shareId: string;
  userId: number;
  userDisplay: string | null;
  userFirstname: string | null;
  userRealname: string | null;
  by: string | null;
  at: number;
};

export type AccessDB = {
  version: 1;
  areas: Area[];
  mails: MailAccount[];
  shares: Share[];
  mailGrants: MailGrant[];
  shareGrants: ShareGrant[];
};

const EMPTY: AccessDB = { version: 1, areas: [], mails: [], shares: [], mailGrants: [], shareGrants: [] };

async function accessPath(): Promise<string> {
  const d = dataDir();
  await fs.mkdir(d, { recursive: true });
  return path.join(d, "access.json");
}

export function slug(s: string): string {
  const base = (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "item";
  return base;
}

export function normalizeEmail(v: string): string {
  return (v || "").trim().toLowerCase();
}

export function normalizeRuta(v: string): string {
  // Conserva display pero colapsa separadores y quita trailing (salvo raíz).
  let t = (v || "").trim().replace(/\//g, "\\");
  t = t.replace(/\\{2,}/g, "\\");
  // UNC \\srv\... -> normalizar a \\srv\... (2 barras iniciales)
  if (/^\\\\/.test((v || "").trim()) || /^\/\//.test((v || "").trim())) {
    t = "\\\\" + t.replace(/^\\+/, "");
  }
  if (t.length > 3) t = t.replace(/\\+$/, "");
  return t;
}

export function rutaKey(v: string): string {
  return normalizeRuta(v).toLowerCase();
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function asDb(j: any): AccessDB {
  if (!j || typeof j !== "object") return structuredClone(EMPTY);
  return {
    version: 1,
    areas: Array.isArray(j.areas) ? j.areas : [],
    mails: Array.isArray(j.mails) ? j.mails : [],
    shares: Array.isArray(j.shares) ? j.shares : [],
    mailGrants: Array.isArray(j.mailGrants) ? j.mailGrants : [],
    shareGrants: Array.isArray(j.shareGrants) ? j.shareGrants : [],
  };
}

export async function loadAccess(): Promise<AccessDB> {
  if (usePostgres()) {
    try {
      const db = prisma();
      const [areas, mails, shares, mailGrants, shareGrants] = await Promise.all([
        db.area.findMany({ orderBy: { id: "asc" } }),
        db.mail.findMany({ orderBy: { id: "asc" } }),
        db.share.findMany({ orderBy: { id: "asc" } }),
        db.mailGrant.findMany({ orderBy: [{ accountId: "asc" }, { userId: "asc" }] }),
        db.shareGrant.findMany({ orderBy: [{ shareId: "asc" }, { userId: "asc" }] }),
      ]);
      return {
        version: 1,
        areas: areas.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          responsableUserId: a.responsableUserId,
          responsableNombre: a.responsableNombre,
          createdAt: Number(a.createdAt),
          updatedAt: Number(a.updatedAt),
        })),
        mails: mails.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          direccion: m.direccion,
          areaId: m.areaId,
          createdAt: Number(m.createdAt),
          updatedAt: Number(m.updatedAt),
        })),
        shares: shares.map((s) => ({
          id: s.id,
          nombre: s.nombre,
          ruta: s.ruta,
          areaId: s.areaId,
          createdAt: Number(s.createdAt),
          updatedAt: Number(s.updatedAt),
        })),
        mailGrants: mailGrants.map((g) => ({
          accountId: g.accountId,
          userId: g.userId,
          userDisplay: g.userDisplay,
          userFirstname: g.userFirstname,
          userRealname: g.userRealname,
          canSend: g.canSend,
          canRead: g.canRead,
          by: g.by,
          at: Number(g.at),
        })),
        shareGrants: shareGrants.map((g) => ({
          shareId: g.shareId,
          userId: g.userId,
          userDisplay: g.userDisplay,
          userFirstname: g.userFirstname,
          userRealname: g.userRealname,
          by: g.by,
          at: Number(g.at),
        })),
      };
    } catch {
      return structuredClone(EMPTY);
    }
  }
  try {
    const raw = await fs.readFile(await accessPath(), "utf8");
    return asDb(JSON.parse(raw));
  } catch {
    return structuredClone(EMPTY);
  }
}

// Escritura atómica tmp+rename para evitar JSON truncado (mismo espíritu que saveFloors).
export async function saveAccess(db: AccessDB): Promise<void> {
  if (usePostgres()) {
    // Reemplazo atómico en transacción: todo o nada (antes: read-modify-write
    // sin lock). Serializado en proceso; UNIQUE/FK protegen entre instancias.
    await withWriteLock(() =>
      prisma().$transaction(async (tx) => {
        await tx.mailGrant.deleteMany();
        await tx.shareGrant.deleteMany();
        await tx.mail.deleteMany();
        await tx.share.deleteMany();
        await tx.area.deleteMany();
        if (db.areas.length) {
          await tx.area.createMany({
            data: db.areas.map((a) => ({
              id: a.id,
              nombre: a.nombre,
              responsableUserId: a.responsableUserId,
              responsableNombre: a.responsableNombre,
              createdAt: BigInt(a.createdAt),
              updatedAt: BigInt(a.updatedAt),
            })),
          });
        }
        if (db.mails.length) {
          await tx.mail.createMany({
            data: db.mails.map((m) => ({
              id: m.id,
              nombre: m.nombre,
              direccion: m.direccion,
              areaId: m.areaId,
              createdAt: BigInt(m.createdAt),
              updatedAt: BigInt(m.updatedAt),
            })),
          });
        }
        if (db.shares.length) {
          await tx.share.createMany({
            data: db.shares.map((s) => ({
              id: s.id,
              nombre: s.nombre,
              ruta: s.ruta,
              rutaKey: rutaKey(s.ruta),
              areaId: s.areaId,
              createdAt: BigInt(s.createdAt),
              updatedAt: BigInt(s.updatedAt),
            })),
          });
        }
        if (db.mailGrants.length) {
          await tx.mailGrant.createMany({
            data: db.mailGrants.map((g) => ({
              accountId: g.accountId,
              userId: g.userId,
              userDisplay: g.userDisplay,
              userFirstname: g.userFirstname,
              userRealname: g.userRealname,
              canSend: g.canSend,
              canRead: g.canRead,
              by: g.by,
              at: BigInt(g.at),
            })),
          });
        }
        if (db.shareGrants.length) {
          await tx.shareGrant.createMany({
            data: db.shareGrants.map((g) => ({
              shareId: g.shareId,
              userId: g.userId,
              userDisplay: g.userDisplay,
              userFirstname: g.userFirstname,
              userRealname: g.userRealname,
              by: g.by,
              at: BigInt(g.at),
            })),
          });
        }
      }),
    );
    return;
  }
  const p = await accessPath();
  const tmp = `${p}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, p);
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = slug(base);
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(`${id}-${n}`)) n++;
  return `${id}-${n}`;
}

export function validateAreaInput(b: any): { nombre: string } {
  const nombre = String(b?.nombre || "").trim();
  if (!nombre) throw new Error("nombre requerido");
  if (nombre.length > 120) throw new Error("nombre muy largo (máx 120)");
  return { nombre };
}

export function validateMailInput(b: any): { nombre: string; direccion: string; areaId: string } {
  const nombre = String(b?.nombre || "").trim();
  const direccion = normalizeEmail(String(b?.direccion || ""));
  const areaId = String(b?.areaId || "").trim();
  if (!nombre) throw new Error("nombre requerido");
  if (!direccion || !isEmail(direccion)) throw new Error("dirección de correo inválida");
  if (!areaId) throw new Error("areaId requerido");
  return { nombre: nombre.slice(0, 120), direccion, areaId };
}

export function validateShareInput(b: any): { nombre: string; ruta: string; areaId: string } {
  const nombre = String(b?.nombre || "").trim();
  const ruta = normalizeRuta(String(b?.ruta || ""));
  const areaId = String(b?.areaId || "").trim();
  if (!nombre) throw new Error("nombre requerido");
  if (!ruta || ruta.length < 3) throw new Error("ruta inválida (ej. \\\\srv\\contable)");
  if (!areaId) throw new Error("areaId requerido");
  return { nombre: nombre.slice(0, 120), ruta, areaId };
}

// ---- mutaciones puras (la ruta valida auth y responsable contra GLPI) ----
export function createArea(db: AccessDB, nombre: string, responsableUserId: number, responsableNombre: string | null): Area {
  const now = Date.now();
  const taken = new Set(db.areas.map((a) => a.id));
  if (db.areas.some((a) => a.nombre.toLowerCase() === nombre.toLowerCase())) {
    throw new Error("Ya existe un área con ese nombre");
  }
  const a: Area = {
    id: uniqueId(nombre, taken),
    nombre,
    responsableUserId,
    responsableNombre,
    createdAt: now,
    updatedAt: now,
  };
  db.areas.push(a);
  return a;
}

export function createMail(db: AccessDB, nombre: string, direccion: string, areaId: string): MailAccount {
  if (!db.areas.some((a) => a.id === areaId)) throw new Error("El área no existe");
  if (db.mails.some((m) => m.direccion.toLowerCase() === direccion.toLowerCase())) {
    throw new Error("Ya existe un correo con esa dirección");
  }
  const now = Date.now();
  const taken = new Set(db.mails.map((m) => m.id));
  const m: MailAccount = { id: uniqueId(`${nombre}-${direccion.split("@")[0]}`, taken), nombre, direccion, areaId, createdAt: now, updatedAt: now };
  db.mails.push(m);
  return m;
}

export function createShare(db: AccessDB, nombre: string, ruta: string, areaId: string): Share {
  if (!db.areas.some((a) => a.id === areaId)) throw new Error("El área no existe");
  const k = rutaKey(ruta);
  if (db.shares.some((s) => rutaKey(s.ruta) === k)) throw new Error("Ya existe una carpeta con esa ruta");
  const now = Date.now();
  const taken = new Set(db.shares.map((s) => s.id));
  const s: Share = { id: uniqueId(nombre, taken), nombre, ruta, areaId, createdAt: now, updatedAt: now };
  db.shares.push(s);
  return s;
}
