import { NextRequest, NextResponse } from "next/server";
import { getAuth, isAdmin } from "@/lib/auth";
import { applyAdImport, loadAd, parseAdCsv, saveAd } from "@/lib/ad";
import { appendActivity } from "@/lib/activity";
import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "@/lib/config";

export const dynamic = "force-dynamic";

// POST /api/access/ad/import (multipart: file) -> upsert snapshot AD.
// Solo admin (clave local o perfil GLPI_ADMIN_PROFILES).
export async function POST(req: NextRequest) {
  const a = getAuth(req as any);
  if (a.kind === "none") return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  if (!isAdmin(req as any)) return NextResponse.json({ error: "Solo administradores pueden importar el AD." }, { status: 403 });
  const MAX = 5 * 1024 * 1024;
  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Formulario inválido" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Archivo CSV requerido" }, { status: 400 });
  const blob = file as File;
  if (blob.size > MAX) return NextResponse.json({ error: "Máximo 5 MB" }, { status: 413 });
  if (!/\.csv$/i.test(blob.name || "")) return NextResponse.json({ error: "Se espera un archivo .csv" }, { status: 400 });
  const text = await blob.text();
  let parsed: { rows: any[]; errors: string[]; formato: string };
  try {
    parsed = parseAdCsv(text);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "CSV inválido" }, { status: 400 });
  }
  if (!parsed.rows.length) {
    return NextResponse.json({ error: "El CSV no trae filas de usuarios", errores: parsed.errors }, { status: 400 });
  }
  const db = await loadAd();
  const report = applyAdImport(db, parsed.rows, blob.name);
  report.errores = parsed.errors.slice(0, 50);
  try {
    await saveAd(db);
  } catch (e: any) {
    return NextResponse.json({ error: `No se pudo guardar: ${e.message}` }, { status: 500 });
  }
  try {
    const out = path.join(dataDir(), `ad-import-report-${Date.now()}.json`);
    await fs.writeFile(out, JSON.stringify({ fecha: new Date().toISOString(), archivo: blob.name, ...report }, null, 2), "utf8");
  } catch {}
  const actor = a.kind === "admin" ? "admin" : a.session?.login || "?";
  await appendActivity({ ts: Date.now(), actor, action: `importó AD ${parsed.formato} (${report.nuevos} nuevos, ${report.actualizados} actualizados)`, type: "AdUser", id: 0 });
  return NextResponse.json({ ok: true, archivo: blob.name, formato: parsed.formato, ...report });
}
