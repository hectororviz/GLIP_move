import { NextRequest, NextResponse } from "next/server";
import { loadFloors, imagePath } from "@/lib/maps";
import { promises as fs } from "fs";

const CT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// GET /api/maps/[id]/image -> sirve el plano del piso
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const floors = await loadFloors();
  const f = floors.find((x) => x.id === params.id);
  if (!f) return NextResponse.json({ error: "Piso no existe" }, { status: 404 });
  const p = await imagePath(f);
  if (!p) return NextResponse.json({ error: "Sin imagen. Súbela en /config." }, { status: 404 });
  const ext = ("." + (p.split(".").pop() || "").toLowerCase()) as keyof typeof CT;
  const buf = await fs.readFile(p);
  return new Response(buf, {
    headers: {
      "Content-Type": CT[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
