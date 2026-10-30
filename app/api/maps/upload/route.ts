import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { loadFloors, saveFloors, mapsDir } from "@/lib/maps";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";


const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const MAX_BYTES = 10 * 1024 * 1024;

// POST /api/maps/upload formData {floorId, file} -> guarda plano (admin)
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const form = await req.formData();
  const floorId = String(form.get("floorId") || "");
  const file = form.get("file") as File | null;
  if (!floorId || !file) return NextResponse.json({ error: "floorId + file requeridos" }, { status: 400 });
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: "Solo JPG/PNG/WebP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Máximo 10MB" }, { status: 400 });

  const floors = await loadFloors();
  const i = floors.findIndex((f) => f.id === floorId);
  if (i < 0) return NextResponse.json({ error: "Piso no existe" }, { status: 404 });

  await fs.mkdir(mapsDir(), { recursive: true });
  // borra imagen anterior
  if (floors[i].image) {
    try { await fs.unlink(path.join(mapsDir(), floors[i].image!)); } catch {}
  }
  const name = `${floorId}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(mapsDir(), name), buf);
  floors[i].image = name;
  await saveFloors(floors);
  return NextResponse.json({ ok: true, image: name });
}
