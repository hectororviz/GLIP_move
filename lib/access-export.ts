import * as XLSX from "xlsx";
import { loadAccess } from "./access";

export const MAIL_HEADER = ["Área", "Correo", "Dirección", "Persona", "UserID", "Envía", "Recibe"];
export const SHARE_HEADER = ["Área", "Carpeta", "Ruta", "Persona", "UserID", "Acceso"];

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
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function sheetFrom(header: string[], rows: (string | number)[][], widths: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!autofilter"] = { ref: ws["!ref"] || "A1" };
  return ws;
}

const SI_NO = (b: boolean) => (b ? "Sí" : "No");

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
    if (!grants.length) mailRows.push([area.nombre, m.nombre, m.direccion, "", "", "", ""].map(safe));
    for (const g of grants) {
      mailRows.push([area.nombre, m.nombre, m.direccion, g.userDisplay || "", g.userId, SI_NO(g.canSend), SI_NO(g.canRead)].map(safe));
    }
  }
  const shareRows: (string | number)[][] = [];
  for (const s of shares) {
    const grants = db.shareGrants
      .filter((g) => g.shareId === s.id)
      .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
    if (!grants.length) shareRows.push([area.nombre, s.nombre, s.ruta, "", "", ""].map(safe));
    for (const g of grants) {
      shareRows.push([area.nombre, s.nombre, s.ruta, g.userDisplay || "", g.userId, "Sí"].map(safe));
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(MAIL_HEADER, mailRows, [22, 22, 30, 28, 10, 10, 10]), "Correos");
  XLSX.utils.book_append_sheet(wb, sheetFrom(SHARE_HEADER, shareRows, [22, 22, 34, 28, 10, 10]), "Carpetas");
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
    ? grants.map((g) => [area, m.nombre, m.direccion, g.userDisplay || "", g.userId, SI_NO(g.canSend), SI_NO(g.canRead)].map(safe))
    : [[area, m.nombre, m.direccion, "", "", "", ""].map(safe)];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(MAIL_HEADER, rows, [22, 22, 30, 28, 10, 10, 10]), "Correo");
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
    ? grants.map((g) => [area, s.nombre, s.ruta, g.userDisplay || "", g.userId, "Sí"].map(safe))
    : [[area, s.nombre, s.ruta, "", "", ""].map(safe)];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(SHARE_HEADER, rows, [22, 22, 34, 28, 10, 10]), "Carpeta");
  return { wb, filename: `accesos-carpeta-${slug(s.nombre)}-${stamp()}.xlsx` };
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}
