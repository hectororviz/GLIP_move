import * as XLSX from "xlsx";
import { loadAccess } from "./access";

export const MAIL_HEADER = ["Área", "Correo", "Dirección", "Apellido", "Nombre", "UserID", "Envía", "Recibe"];
export const SHARE_HEADER = ["Área", "Carpeta", "Ruta", "Apellido", "Nombre", "UserID", "Acceso"];

type GrantLike = { userDisplay?: string | null; userFirstname?: string | null; userRealname?: string | null; userId: number };

// Apellido|Nombre desde los campos guardados; fallback heurístico sobre el display
// ("Nombre APELLIDO": tokens finales en mayúsculas = apellido; si no, última palabra).
export function namesOf(g: GrantLike): [string, string] {
  if (g.userRealname || g.userFirstname) return [g.userRealname || "", g.userFirstname || ""];
  const t = String(g.userDisplay || "").trim().split(/\s+/).filter(Boolean);
  if (!t.length) return ["", ""];
  const isUp = (s: string) => /[A-ZÁÉÍÓÚÑÜ]/.test(s) && s === s.toUpperCase();
  let i = t.length;
  while (i > 0 && isUp(t[i - 1].replace(/['’`-]/g, ""))) i--;
  if (i === t.length) return t.length > 1 ? [t[t.length - 1], t.slice(0, -1).join(" ")] : [t[0], ""];
  if (i === 0) return [t.join(" "), ""];
  return [t.slice(i).join(" "), t.slice(0, i).join(" ")];
}

function slug(s: string): string {
  return (
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "item"
  );
}

// Evita inyección de fórmulas al abrir en Excel (ej. "=cmd|...").
function safe(v: any): string | number {
  if (v == null) return "";
  if (typeof v === "number") return v;
  const s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
  return s;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${d.getDate()}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function sheetFrom(header: string[], rows: (string | number)[][], widths: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!autofilter"] = { ref: ws["!ref"] || "A1" };
  return ws;
}

const SI_NO = (b: boolean) => (b ? "Sí" : "No");

const MAIL_WIDTHS = [22, 22, 30, 24, 24, 10, 10, 10];
const SHARE_WIDTHS = [22, 22, 34, 24, 24, 10, 10];

function mailRow(area: string, nombre: string, direccion: string, g: GrantLike, canSend: boolean, canRead: boolean): (string | number)[] {
  const [ap, nom] = namesOf(g);
  return [area, nombre, direccion, ap, nom, (g as any).userId, SI_NO(canSend), SI_NO(canRead)].map(safe);
}

function mailRowOf(area: string, m: { nombre: string; direccion: string }, g: any): (string | number)[] {
  return mailRow(area, m.nombre, m.direccion, g, g.canSend, g.canRead);
}

function mailEmpty(area: string, nombre: string, direccion: string): (string | number)[] {
  return [area, nombre, direccion, "", "", "", "", ""].map(safe);
}

function shareRow(area: string, nombre: string, ruta: string, g: GrantLike): (string | number)[] {
  const [ap, nom] = namesOf(g);
  return [area, nombre, ruta, ap, nom, (g as any).userId, "Sí"].map(safe);
}

function shareEmpty(area: string, nombre: string, ruta: string): (string | number)[] {
  return [area, nombre, ruta, "", "", "", ""].map(safe);
}

export async function buildAreaWorkbook(areaId: string) {
  const db = await loadAccess();
  const area = db.areas.find((a) => a.id === areaId);
  if (!area) throw Object.assign(new Error("Área no existe"), { status: 404 });
  const mails = db.mails.filter((m) => m.areaId === areaId).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const shares = db.shares.filter((s) => s.areaId === areaId).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const mailRows: (string | number)[][] = [];
  for (const m of mails) {
    const grants = db.mailGrants
      .filter((g) => g.accountId === m.id)
      .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
    if (!grants.length) mailRows.push(mailEmpty(area.nombre, m.nombre, m.direccion));
    for (const g of grants) {
      mailRows.push(mailRowOf(area.nombre, m, g));
    }
  }
  const shareRows: (string | number)[][] = [];
  for (const s of shares) {
    const grants = db.shareGrants
      .filter((g) => g.shareId === s.id)
      .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
    if (!grants.length) shareRows.push(shareEmpty(area.nombre, s.nombre, s.ruta));
    for (const g of grants) {
      shareRows.push(shareRow(area.nombre, s.nombre, s.ruta, g));
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(MAIL_HEADER, mailRows, MAIL_WIDTHS), "Correos");
  XLSX.utils.book_append_sheet(wb, sheetFrom(SHARE_HEADER, shareRows, SHARE_WIDTHS), "Carpetas");
  return { wb, filename: `accesos-area-${slug(area.nombre)}-${stamp()}.xlsx` };
}

export async function buildMailWorkbook(accountId: string) {
  const db = await loadAccess();
  const m = db.mails.find((x) => x.id === accountId);
  if (!m) throw Object.assign(new Error("Correo no existe"), { status: 404 });
  const area = db.areas.find((a) => a.id === m.areaId)?.nombre || "—";
  const grants = db.mailGrants
    .filter((g) => g.accountId === accountId)
    .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
  const rows = grants.length
    ? grants.map((g) => mailRowOf(area, m, g))
    : [mailEmpty(area, m.nombre, m.direccion)];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(MAIL_HEADER, rows, MAIL_WIDTHS), "Correo");
  return { wb, filename: `accesos-correo-${slug(m.nombre)}-${stamp()}.xlsx` };
}

export async function buildShareWorkbook(shareId: string) {
  const db = await loadAccess();
  const s = db.shares.find((x) => x.id === shareId);
  if (!s) throw Object.assign(new Error("Carpeta no existe"), { status: 404 });
  const area = db.areas.find((a) => a.id === s.areaId)?.nombre || "—";
  const grants = db.shareGrants
    .filter((g) => g.shareId === shareId)
    .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
  const rows = grants.length
    ? grants.map((g) => shareRow(area, s.nombre, s.ruta, g))
    : [shareEmpty(area, s.nombre, s.ruta)];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(SHARE_HEADER, rows, SHARE_WIDTHS), "Carpeta");
  return { wb, filename: `accesos-carpeta-${slug(s.nombre)}-${stamp()}.xlsx` };
}

export async function buildAllMailsWorkbook() {
  const db = await loadAccess();
  const areaById = new Map(db.areas.map((a) => [a.id, a.nombre]));
  const mails = [...db.mails].sort((a, b) =>
    (areaById.get(a.areaId) || "").localeCompare(areaById.get(b.areaId) || "") || a.nombre.localeCompare(b.nombre)
  );
  const rows: (string | number)[][] = [];
  for (const m of mails) {
    const area = areaById.get(m.areaId) || "—";
    const grants = db.mailGrants
      .filter((g) => g.accountId === m.id)
      .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
    if (!grants.length) rows.push(mailEmpty(area, m.nombre, m.direccion));
    for (const g of grants) {
      rows.push(mailRowOf(area, m, g));
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(MAIL_HEADER, rows, MAIL_WIDTHS), "Correos");
  return { wb, filename: `accesos-correos-todo-${stamp()}.xlsx` };
}

export async function buildAllSharesWorkbook() {
  const db = await loadAccess();
  const areaById = new Map(db.areas.map((a) => [a.id, a.nombre]));
  const shares = [...db.shares].sort((a, b) =>
    (areaById.get(a.areaId) || "").localeCompare(areaById.get(b.areaId) || "") || a.nombre.localeCompare(b.nombre)
  );
  const rows: (string | number)[][] = [];
  for (const s of shares) {
    const area = areaById.get(s.areaId) || "—";
    const grants = db.shareGrants
      .filter((g) => g.shareId === s.id)
      .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
    if (!grants.length) rows.push(shareEmpty(area, s.nombre, s.ruta));
    for (const g of grants) {
      rows.push(shareRow(area, s.nombre, s.ruta, g));
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(SHARE_HEADER, rows, SHARE_WIDTHS), "Carpetas");
  return { wb, filename: `accesos-carpetas-todo-${stamp()}.xlsx` };
}

export async function buildAllAreasWorkbook() {
  const db = await loadAccess();
  const sortedAreas = [...db.areas].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const mailRows: (string | number)[][] = [];
  for (const area of sortedAreas) {
    const mails = db.mails.filter((m) => m.areaId === area.id).sort((a, b) => a.nombre.localeCompare(b.nombre));
    for (const m of mails) {
      const grants = db.mailGrants
        .filter((g) => g.accountId === m.id)
        .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
      if (!grants.length) mailRows.push(mailEmpty(area.nombre, m.nombre, m.direccion));
      for (const g of grants) {
        mailRows.push(mailRowOf(area.nombre, m, g));
      }
    }
  }
  const shareRows: (string | number)[][] = [];
  for (const area of sortedAreas) {
    const shares = db.shares.filter((s) => s.areaId === area.id).sort((a, b) => a.nombre.localeCompare(b.nombre));
    for (const s of shares) {
      const grants = db.shareGrants
        .filter((g) => g.shareId === s.id)
        .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
      if (!grants.length) shareRows.push(shareEmpty(area.nombre, s.nombre, s.ruta));
      for (const g of grants) {
        shareRows.push(shareRow(area.nombre, s.nombre, s.ruta, g));
      }
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(MAIL_HEADER, mailRows, MAIL_WIDTHS), "Correos");
  XLSX.utils.book_append_sheet(wb, sheetFrom(SHARE_HEADER, shareRows, SHARE_WIDTHS), "Carpetas");
  return { wb, filename: `accesos-areas-todo-${stamp()}.xlsx` };
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}
