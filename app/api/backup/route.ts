import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { promises as fs } from "fs";
import path from "path";
import { loadFloors, saveFloors, mapsDir } from "@/lib/maps";

export const dynamic = "force-dynamic";

function adminOk(req: NextRequest): boolean {
  const expected = process.env.ADMIN_PASSWORD || "plain:cambia-esto";
  const cookie = req.cookies.get("gm_admin")?.value;
  return !!cookie && expected.startsWith("plain:") && cookie === expected.slice(6);
}

// GET /api/backup -> descarga ZIP con floors.json + imágenes
export async function GET(req: NextRequest) {
  if (!adminOk(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const floors = await loadFloors();
    const zip = new AdmZip();
    zip.addFile("floors.json", Buffer.from(JSON.stringify(floors, null, 2), "utf8"));
    const mapDir = mapsDir();
    for (const f of floors) {
      if (!f.image) continue;
      try {
        const data = await fs.readFile(path.join(mapDir, f.image));
        zip.addFile(`maps/${f.image}`, data);
      } catch {}
    }
    const buf = zip.toBuffer();
    const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="glpi-move-backup-${ts}.zip"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/backup (multipart: file) -> reemplaza pisos + imágenes
export async function POST(req: NextRequest) {
  if (!adminOk(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const MAX = 50 * 1024 * 1024;
  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Formulario inválido" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  const blob = file as File;
  if (blob.size > MAX) return NextResponse.json({ error: "Máximo 50 MB" }, { status: 413 });
  const buf = Buffer.from(await blob.arrayBuffer());
  let zip: AdmZip;
  try { zip = new AdmZip(buf); } catch {
    return NextResponse.json({ error: "ZIP inválido" }, { status: 400 });
  }
  const entry = zip.getEntry("floors.json");
  if (!entry) return NextResponse.json({ error: "Falta floors.json en el ZIP" }, { status: 400 });
  let floors: any;
  try { floors = JSON.parse(entry.getData().toString("utf8")); } catch {
    return NextResponse.json({ error: "floors.json no es JSON válido" }, { status: 400 });
  }
  if (!Array.isArray(floors)) return NextResponse.json({ error: "floors.json debe ser un array" }, { status: 400 });
  // validación mínima
  for (const f of floors) {
    if (!f || typeof f.id !== "string" || !f.id.trim()) return NextResponse.json({ error: "Piso sin id válido" }, { status: 400 });
    if (!Array.isArray(f.puestos)) return NextResponse.json({ error: `Piso ${f.id}: puestos no es array` }, { status: 400 });
    for (const p of f.puestos) {
      if (!p || p.glpi_id == null) return NextResponse.json({ error: `Piso ${f.id}: puesto sin glpi_id` }, { status: 400 });
      for (const k of ["x", "y", "w", "h"]) {
        if (typeof p[k] !== "number" || !Number.isFinite(p[k])) return NextResponse.json({ error: `Piso ${f.id}: puesto con ${k} inválido` }, { status: 400 });
      }
    }
    if (f.glpiLocationId != null && typeof f.glpiLocationId !== "number") {
      f.glpiLocationId = Number(f.glpiLocationId) || null;
    }
  }
  const mapDir = mapsDir();
  await fs.mkdir(mapDir, { recursive: true });
  // limpiar imágenes huérfanas previas
  try {
    const prev = await loadFloors();
    const prevImgs = new Set(prev.map((p) => p.image).filter(Boolean) as string[]);
    const wanted = new Set(floors.map((p: any) => p.image).filter(Boolean));
    for (const img of prevImgs) {
      if (!wanted.has(img)) {
        try { await fs.unlink(path.join(mapDir, img)); } catch {}
      }
    }
  } catch {}
  // escribir imágenes del ZIP (solo en data/maps, nombres saneados)
  for (const f of floors) {
    if (!f.image) continue;
    const safe = String(f.image).replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safe || safe !== f.image) { f.image = null; continue; }
    const e = zip.getEntry(`maps/${f.image}`);
    if (!e) { f.image = null; continue; }
    await fs.writeFile(path.join(mapDir, f.image), e.getData());
  }
  await saveFloors(floors);
  const totalPuestos = floors.reduce((a: number, f: any) => a + (f.puestos?.length || 0), 0);
  return NextResponse.json({ ok: true, pisos: floors.length, puestos: totalPuestos });
}
