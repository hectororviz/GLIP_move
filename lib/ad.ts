// Snapshot del AD (lista directa del servidor).
// Formatos CSV soportados (se detectan por header):
//  v1 (viejo): Usuario;Nombre;Cuenta;UltimoCambio;Vencimiento;DiasRestantes;EstadoClave
//  v2 (nuevo): Usuario;Nombre;Cuenta;UltimoCambio;Dias;Email;UltimoLogon
//    Dias = "No vence" (o "Sin información" / "Debe cambiar clave") o días restantes (nro).
// El CSV se importa con upsert por login_key: agrega logins nuevos y
// actualiza cuenta/días/estado/email/logon. Nunca borra; los ausentes en el
// último CSV quedan marcados con ausenteUltimoImport=true.
import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "./config";
import { prisma, usePostgres, withWriteLock } from "./db";

export type AdCuenta = "HABILITADA" | "DESHABILITADA";
export type AdEstado =
  | "VIGENTE"
  | "VENCIDA"
  | "PROXIMA A VENCER"
  | "NO VENCE"
  | "DEBE CAMBIAR CLAVE"
  | "SIN INFORMACION";

export type AdUser = {
  loginKey: string;
  login: string;
  nombre: string;
  cuenta: AdCuenta;
  ultimoCambio: string;
  ultimoCambioTs: number | null;
  vencimiento: string; // legado v1 (v2 no lo trae)
  vencimientoTs: number | null;
  diasRestantes: number | null; // null cuando Dias es texto ("No vence", etc.)
  diasTexto: string; // texto crudo de Dias cuando no es número, "" si es número
  estadoClave: AdEstado;
  email: string;
  ultimoLogon: string;
  ultimoLogonTs: number | null;
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
  if (t === "DEBE CAMBIAR CLAVE" || t === "DEBE CAMBIAR") return "DEBE CAMBIAR CLAVE";
  if (t === "SIN INFORMACION" || t === "SIN INFORMACIÓN" || t === "SIN INFO" || t === "S/INF") return "SIN INFORMACION";
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
  diasTexto: string;
  estadoClave: AdEstado;
  email: string;
  ultimoLogon: string;
  ultimoLogonTs: number | null;
};

function normHeader(h: string): string {
  return h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "");
}

// Estado derivado para v2 (sin columna EstadoClave): reproduce la lógica
// del script (vencida / próxima 7 días / vigente).
function estadoDeDias(dias: number | null, texto: string): AdEstado {
  if (dias != null) {
    if (dias < 0) return "VENCIDA";
    if (dias <= 7) return "PROXIMA A VENCER";
    return "VIGENTE";
  }
  const t = texto.toLowerCase();
  if (!t || t.includes("sin inform")) return "SIN INFORMACION";
  if (t.includes("no vence")) return "NO VENCE";
  if (t.includes("debe cambiar")) return "DEBE CAMBIAR CLAVE";
  return "SIN INFORMACION";
}

export function parseAdCsv(text: string): { rows: AdParsedRow[]; errors: string[]; formato: "v1" | "v2" } {
  const clean = String(text ?? "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) throw new Error("CSV vacío");
  const header = splitCsvLine(lines[0]).map((h) => normHeader(h));
  const idx = (n: string) => header.indexOf(n);
  if (idx("usuario") < 0 || idx("nombre") < 0 || idx("cuenta") < 0) {
    throw new Error('Faltan columnas base "Usuario/Nombre/Cuenta" (separador esperado ;)');
  }
  const isV2 = idx("dias") >= 0 && idx("diasrestantes") < 0;
  const isV1 = idx("diasrestantes") >= 0;
  if (!isV1 && !isV2) throw new Error('Falta columna "Dias" o "DiasRestantes"');
  const formato = isV2 ? "v2" : "v1";
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
      if (formato === "v1") {
        const ve = parseFechaAD(cols[idx("vencimiento")]);
        const dias = parseDias(cols[idx("diasrestantes")]);
        const estado = normalizeEstado(cols[idx("estadoclave")]);
        rows.push({
          login, nombre, cuenta,
          ultimoCambio: uc.raw, ultimoCambioTs: uc.ts,
          vencimiento: ve.raw, vencimientoTs: ve.ts,
          diasRestantes: dias, diasTexto: "", estadoClave: estado,
          email: "", ultimoLogon: "", ultimoLogonTs: null,
        });
      } else {
        const diasCell = String(cols[idx("dias")] ?? "").trim();
        let diasRestantes: number | null = null;
        let diasTexto = "";
        if (diasCell !== "" && /^-?\d+$/.test(diasCell)) diasRestantes = parseInt(diasCell, 10);
        else diasTexto = diasCell;
        const email = String(cols[idx("email")] ?? "").trim().toLowerCase();
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`Email inválido: "${email}"`);
        const ul = parseFechaAD(cols[idx("ultimologon")]);
        rows.push({
          login, nombre, cuenta,
          ultimoCambio: uc.raw, ultimoCambioTs: uc.ts,
          vencimiento: "", vencimientoTs: null,
          diasRestantes, diasTexto,
          estadoClave: estadoDeDias(diasRestantes, diasTexto),
          email, ultimoLogon: ul.raw, ultimoLogonTs: ul.ts,
        });
      }
    } catch (e: any) {
      errors.push(`Línea ${i + 1}: ${e.message || "inválida"}`);
    }
  }
  return { rows, errors, formato };
}

function asDb(j: any): AdDB {
  if (!j || typeof j !== "object") return structuredClone(EMPTY);
  const users = Array.isArray(j.users) ? j.users : [];
  return {
    version: 1,
    users: users
      .filter((u: any) => u && typeof u.loginKey === "string")
      .map((u: any) => ({
        loginKey: u.loginKey,
        login: String(u.login || ""),
        nombre: String(u.nombre || ""),
        cuenta: u.cuenta === "DESHABILITADA" ? "DESHABILITADA" : "HABILITADA",
        ultimoCambio: String(u.ultimoCambio || ""),
        ultimoCambioTs: u.ultimoCambioTs ?? null,
        vencimiento: String(u.vencimiento || ""),
        vencimientoTs: u.vencimientoTs ?? null,
        diasRestantes: u.diasRestantes ?? null,
        diasTexto: String(u.diasTexto || ""),
        estadoClave: (u.estadoClave || "SIN INFORMACION") as AdEstado,
        email: String(u.email || ""),
        ultimoLogon: String(u.ultimoLogon || ""),
        ultimoLogonTs: u.ultimoLogonTs ?? null,
        ausenteUltimoImport: !!u.ausenteUltimoImport,
        firstSeenAt: Number(u.firstSeenAt || 0),
        updatedAt: Number(u.updatedAt || 0),
        lastImportAt: Number(u.lastImportAt || 0),
      })),
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
        diasTexto: (r as any).diasTexto ?? "",
        estadoClave: r.estadoClave as AdEstado,
        email: (r as any).email ?? "",
        ultimoLogon: (r as any).ultimoLogon ?? "",
        ultimoLogonTs: (r as any).ultimoLogonTs != null ? Number((r as any).ultimoLogonTs) : null,
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
              diasTexto: u.diasTexto,
              estadoClave: u.estadoClave,
              email: u.email,
              ultimoLogon: u.ultimoLogon,
              ultimoLogonTs: u.ultimoLogonTs != null ? BigInt(u.ultimoLogonTs) : null,
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
      ex.diasTexto = r.diasTexto;
      ex.estadoClave = r.estadoClave;
      // Email/logon: no pisar con vacío (v1 no trae esas columnas y los datos
      // del AD pueden estar parcialmente cargados).
      if (r.email) ex.email = r.email;
      if (r.ultimoLogon) { ex.ultimoLogon = r.ultimoLogon; ex.ultimoLogonTs = r.ultimoLogonTs; }
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
        diasTexto: r.diasTexto,
        estadoClave: r.estadoClave,
        email: r.email,
        ultimoLogon: r.ultimoLogon,
        ultimoLogonTs: r.ultimoLogonTs,
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
