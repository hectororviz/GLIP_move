import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { loadFloors, saveFloors, createFloor, type Floor } from "@/lib/maps";


// GET /api/maps -> lista de pisos con puestos
export async function GET() {
  return NextResponse.json({ floors: await loadFloors() });
}

// POST /api/maps {name} -> crea piso (admin)
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name requerido" }, { status: 400 });
  const f = await createFloor(name.trim());
  return NextResponse.json({ floor: f });
}

// PUT /api/maps {id, name?, rootLocationId?, puestos?} -> actualiza (admin)
export async function PUT(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const floors = await loadFloors();
  const i = floors.findIndex((f) => f.id === body.id);
  if (i < 0) return NextResponse.json({ error: "Piso no existe" }, { status: 404 });
  const f: Floor = {
    ...floors[i],
    name: body.name ?? floors[i].name,
    glpiLocationId:
      body.glpiLocationId === "" || body.glpiLocationId == null
        ? floors[i].glpiLocationId ?? null
        : Number(body.glpiLocationId),
    puestos: Array.isArray(body.puestos)
      ? body.puestos
          .filter((p: any) => p && p.glpi_id != null)
          .map((p: any) => ({
            glpi_id: Number(p.glpi_id),
            x: Number(p.x) || 0,
            y: Number(p.y) || 0,
            w: Number(p.w) || 5,
            h: Number(p.h) || 5,
          }))
      : floors[i].puestos,
  };
  floors[i] = f;
  await saveFloors(floors);
  return NextResponse.json({ floor: f });
}

// DELETE /api/maps?id= -> elimina piso + imagen (admin)
export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const floors = await loadFloors();
  const f = floors.find((x) => x.id === id);
  if (!f) return NextResponse.json({ error: "Piso no existe" }, { status: 404 });
  if (f.image) {
    try {
      const { promises: fsp } = await import("fs");
      const { mapsDir } = await import("@/lib/maps");
      await fsp.unlink(`${mapsDir()}/${f.image}`);
    } catch {}
  }
  await saveFloors(floors.filter((x) => x.id !== id));
  return NextResponse.json({ ok: true });
}
