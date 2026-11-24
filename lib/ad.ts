// Snapshot del AD (lista directa del servidor).
// El CSV se importa con upsert por login_key: agrega logins nuevos y
// actualiza cuenta/vencimiento/días/estado. Nunca borra; los ausentes en el
// último CSV quedan marcados con ausenteUltimoImport=true.
import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "./config";
import { prisma, usePostgres, withWriteLock } from "./db";

export type AdCuenta = "HABILITADA" | "DESHABILITADA";
export type AdEstado = "VIGENTE" | "VENCIDA" | "PROXIMA A VENCER" | "NO VENCE";

export type AdUser = {
  loginKey: string;
  login: string;
  nombre: string;
  cuenta: AdCuenta;
  ultimoCambio: string;
  ultimoCambioTs: number | null;
  vencimiento: string;
  vencimientoTs: number | null;
  diasRestantes: number | null;
  estadoClave: AdEstado;
  ausenteUltimoImport: boolean;
  firstSeenAt: number;
  updatedAt: number;
  lastImportAt: number;
};

export type AdDB = {
  version: 1;
  users: AdUser[];
  importedAt: number | null;
  sourceFile: string | null;
};

const EMPTY: AdDB = { version: 1, users: [], importedAt: null, sourceFile: null };

async function adPath(): Promise<string> {
  const d = dataDir();
  await fs.mkdir(d, { recursive: true });
  return path.join(d, "ad-users.json");
}

export function loginKeyOf(v: any): string {
  return String(v ?? "").trim().toLowerCase();
}

// Fecha del AD: "d/m/yyyy h:mm:ss" (hora opcional). Vacío -> null.
export function parseFechaAD(v: any): { raw: string; ts: number | null } {
  const raw = String(v ?? "").trim();
  if (!raw) return { raw: "", ts: null };
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!m) return { raw, ts: null };
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const hh = Number(m[4] ?? "0");
  const mi = Number(m[5] ?? "0");
  const ss = Number(m[6] ?? "0");
  const ts = new Date(yyyy, mm - 1, dd, hh, mi, ss).getTime();
  return { raw, ts: Number.isFinite(ts) ? ts : null };
}

function normalizeCuenta(v: any): AdCuenta {
  const t = String(v ?? "").trim().toUpperCase();
  if (t === "HABILITADA") return "HABILITADA";
  if (t === "DESHABILITADA") return "DESHABILITADA";
  throw new Error(`Cuenta inválida: "${v}" (esperado HABILITADA/DESHABILITADA)`);
}

function normalizeEstado(v: any): AdEstado {
  const t = String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (t === "VIGENTE") return "VIGENTE";
  if (t === "VENCIDA") return "VENCIDA";
  if (t === "PROXIMA A VENCER" || t === "PRÓXIMA A VENCER" || t === "PROXIMA") return "PROXIMA A VENCER";
  if (t === "NO VENCE") return "NO VENCE";
  throw new Error(`EstadoClave inválido: "${v}"`);
}

function parseDias(v: any): number | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`DiasRestantes inválido: "${v}"`);
  return Math.trunc(n);
}

// Parser CSV mínimo para el export del AD: separador ;, campos entrecomillados
// con "" como escape, BOM y CRLF tolerados.
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else {
      if (c === '"') quoted = true;
      else if (c === ";") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export type AdParsedRow = {
  login: string;
  nombre: string;
  cuenta: AdCuenta;
  ultimoCambio: string;
  ultimoCambioTs: number | null;
  vencimiento: string;
  vencimientoTs: number | null;
  diasRestantes: number | null;
  estadoClave: AdEstado;
};

export function parseAdCsv(text: string): { rows: AdParsedRow[]; errors: string[] } {
  const clean = String(text ?? "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) throw new Error("CSV vacío");
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const need = ["usuario", "nombre", "cuenta", "ultimocambio", "vencimiento", "diasrestantes", "estadoclave"];
  const normH = header.map((h) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ""));
  for (const n of need) {
    if (!normH.includes(n)) throw new Error(`Falta columna "${n}" en el header (separador esperado ;)`);
  }
  const idx = (n: string) => normH.indexOf(n);
  const rows: AdParsedRow[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    try {
      const login = String(cols[idx("usuario")] ?? "").trim().replace(/^"|"$/g, "");
      const nombre = String(cols[idx("nombre")] ?? "").trim();
      if (!login) throw new Error("Usuario vacío");
      const cuenta = normalizeCuenta(cols[idx("cuenta")]);
      const uc = parseFechaAD(cols[idx("ultimocambio")]);
      const ve = parseFechaAD(cols[idx("vencimiento")]);
      const dias = parseDias(cols[idx("diasrestantes")]);
      const estado = normalizeEstado(cols[idx("estadoclave")]);
      rows.push({
        login, nombre, cuenta,
        ultimoCambio: uc.raw, ultimoCambioTs: uc.ts,
        vencimiento: ve.raw, vencimientoTs: ve.ts,
        diasRestantes: dias, estadoClave: estado,
      });
    } catch (e: any) {
      errors.push(`Línea ${i + 1}: ${e.message || "inválida"}`);
    }
  }
  return { rows, errors };
}

function asDb(j: any): AdDB {
  if (!j || typeof j !== "object") return structuredClone(EMPTY);
  const users = Array.isArray(j.users) ? j.users : [];
  return {
    version: 1,
    users: users.filter((u: any) => u && typeof u.loginKey === "string"),
    importedAt: typeof j.importedAt === "number" ? j.importedAt : null,
    sourceFile: typeof j.sourceFile === "string" ? j.sourceFile : null,
  };
}

export async function loadAd(): Promise<AdDB> {
  if (usePostgres()) {
    try {
      const db = prisma();
      const rows = await db.adUser.findMany({ orderBy: { nombre: "asc" } });
      const users: AdUser[] = rows.map((r) => ({
        loginKey: r.loginKey,
        login: r.login,
        nombre: r.nombre,
        cuenta: (r.cuenta === "DESHABILITADA" ? "DESHABILITADA" : "HABILITADA") as AdCuenta,
        ultimoCambio: r.ultimoCambio,
        ultimoCambioTs: r.ultimoCambioTs != null ? Number(r.ultimoCambioTs) : null,
        vencimiento: r.vencimiento,
        vencimientoTs: r.vencimientoTs != null ? Number(r.vencimientoTs) : null,
        diasRestantes: r.diasRestantes,
        estadoClave: r.estadoClave as AdEstado,
        ausenteUltimoImport: r.ausenteUltimoImport,
        firstSeenAt: Number(r.firstSeenAt),
        updatedAt: Number(r.updatedAt),
        lastImportAt: Number(r.lastImportAt),
      }));
      const importedAt = users.length ? Math.max(...users.map((u) => u.lastImportAt)) : null;
      const sourceFile = rows.length ? rows[0].sourceFile || null : null;
      return { version: 1, users, importedAt, sourceFile };
    } catch {
      return structuredClone(EMPTY);
    }
  }
  try {
    return asDb(JSON.parse(await fs.readFile(await adPath(), "utf8")));
  } catch {
    return structuredClone(EMPTY);
  }
}

export async function saveAd(db: AdDB): Promise<void> {
  if (usePostgres()) {
    await withWriteLock(() =>
      prisma().$transaction(async (tx) => {
        await tx.adUser.deleteMany();
        if (db.users.length) {
          await tx.adUser.createMany({
            data: db.users.map((u) => ({
              loginKey: u.loginKey,
              login: u.login,
              nombre: u.nombre,
              cuenta: u.cuenta,
              ultimoCambio: u.ultimoCambio,
              ultimoCambioTs: u.ultimoCambioTs != null ? BigInt(u.ultimoCambioTs) : null,
              vencimiento: u.vencimiento,
              vencimientoTs: u.vencimientoTs != null ? BigInt(u.vencimientoTs) : null,
              diasRestantes: u.diasRestantes,
              estadoClave: u.estadoClave,
              ausenteUltimoImport: u.ausenteUltimoImport,
              firstSeenAt: BigInt(u.firstSeenAt),
              updatedAt: BigInt(u.updatedAt),
              lastImportAt: BigInt(u.lastImportAt),
              sourceFile: db.sourceFile,
            })),
          });
        }
      }),
    );
    return;
  }
  const p = await adPath();
  const tmp = `${p}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, p);
}

export type AdImportReport = {
  totalCsv: number;
  nuevos: number;
  actualizados: number;
  ausentes: number;
  deshabilitados: number;
  vencidos: number;
  proximos: number;
  errores: string[];
};

// Upsert: agrega logins nuevos, actualiza existentes, marca ausentes.
// Nunca borra.
export function applyAdImport(db: AdDB, rows: AdParsedRow[], sourceFile: string, now = Date.now()): AdImportReport {
  const seen = new Set<string>();
  let nuevos = 0;
  let actualizados = 0;
  const byKey = new Map(db.users.map((u) => [u.loginKey, u]));
  for (const r of rows) {
    const key = loginKeyOf(r.login);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const ex = byKey.get(key);
    if (ex) {
      ex.login = r.login.trim();
      ex.nombre = r.nombre;
      ex.cuenta = r.cuenta;
      ex.ultimoCambio = r.ultimoCambio;
      ex.ultimoCambioTs = r.ultimoCambioTs;
      ex.vencimiento = r.vencimiento;
      ex.vencimientoTs = r.vencimientoTs;
      ex.diasRestantes = r.diasRestantes;
      ex.estadoClave = r.estadoClave;
      ex.ausenteUltimoImport = false;
      ex.updatedAt = now;
      ex.lastImportAt = now;
      actualizados++;
    } else {
      const u: AdUser = {
        loginKey: key,
        login: r.login.trim(),
        nombre: r.nombre,
        cuenta: r.cuenta,
        ultimoCambio: r.ultimoCambio,
        ultimoCambioTs: r.ultimoCambioTs,
        vencimiento: r.vencimiento,
        vencimientoTs: r.vencimientoTs,
        diasRestantes: r.diasRestantes,
        estadoClave: r.estadoClave,
        ausenteUltimoImport: false,
        firstSeenAt: now,
        updatedAt: now,
        lastImportAt: now,
      };
      db.users.push(u);
      byKey.set(key, u);
      nuevos++;
    }
  }
  let ausentes = 0;
  for (const u of db.users) {
    if (!seen.has(u.loginKey)) { u.ausenteUltimoImport = true; ausentes++; }
  }
  db.importedAt = now;
  db.sourceFile = sourceFile;
  const deshabilitados = db.users.filter((u) => u.cuenta === "DESHABILITADA" && !u.ausenteUltimoImport).length;
  const vencidos = db.users.filter((u) => u.estadoClave === "VENCIDA" && !u.ausenteUltimoImport).length;
  const proximos = db.users.filter((u) => u.estadoClave === "PROXIMA A VENCER" && !u.ausenteUltimoImport).length;
  return { totalCsv: seen.size, nuevos, actualizados, ausentes, deshabilitados, vencidos, proximos, errores: [] };
}
