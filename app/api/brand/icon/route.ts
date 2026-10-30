import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";
import { loadConfig, saveConfig } from "@/lib/config";
import { dataDir } from "@/lib/config";

export const dynamic = "force-dynamic";

const MAX = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);


function brandDir() { return path.join(dataDir(), "brand"); }
function brandPath(name: string) { return path.join(brandDir(), name); }

// GET /api/brand/icon -> sirve el icono si existe
export async function GET() {
  const cfg = await loadConfig();
  if (!cfg.brandIcon) return new NextResponse(null, { status: 404 });
  try {
    const data = await fs.readFile(brandPath(cfg.brandIcon));
    const ext = path.extname(cfg.brandIcon).toLowerCase();
    const type = ext === ".svg" ? "image/svg+xml" : ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": type, "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

// POST /api/brand/icon (multipart: file) -> guarda y actualiza config
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Formulario inválido" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  const blob = file as File;
  if (blob.size > MAX) return NextResponse.json({ error: "Máximo 2 MB" }, { status: 413 });
  if (!ALLOWED.has(blob.type)) return NextResponse.json({ error: "Solo PNG, JPG, WebP o SVG" }, { status: 415 });
  const ext = blob.type === "image/svg+xml" ? "svg" : blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
  const name = `icon.${ext}`;
  const dir = brandDir();
  await fs.mkdir(dir, { recursive: true });
  // limpiar iconos anteriores
  try {
    for (const n of await fs.readdir(dir)) {
      if (/^icon\./.test(n)) await fs.unlink(path.join(dir, n)).catch(() => {});
    }
  } catch {}
  await fs.writeFile(path.join(dir, name), Buffer.from(await blob.arrayBuffer()));
  const cfg = await loadConfig();
  await saveConfig({ ...cfg, brandIcon: name });
  return NextResponse.json({ ok: true, brandIcon: name });
}

// DELETE /api/brand/icon -> quita el icono
export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const cfg = await loadConfig();
  if (cfg.brandIcon) {
    try { await fs.unlink(brandPath(cfg.brandIcon)); } catch {}
  }
  await saveConfig({ ...cfg, brandIcon: null });
  return NextResponse.json({ ok: true });
}
