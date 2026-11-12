import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "./config";
import { prisma, usePostgres, withWriteLock } from "./db";

export type Puesto = {
  glpi_id: number;
  x: number; // % sobre la imagen
  y: number;
  w: number;
  h: number;
};

export type Floor = {
  id: string;
  name: string;
  image: string | null; // nombre de archivo en data/maps/
  glpiLocationId: number | null; // ubicación GLPI padre = el piso
  puestos: Puesto[];
};

export function mapsDir(): string {
  const d = process.env.DATA_DIR || path.join(process.cwd(), "data");
  return path.join(d, "maps");
}

async function floorsPath(): Promise<string> {
  const d = dataDir();
  await fs.mkdir(d, { recursive: true });
  await fs.mkdir(mapsDir(), { recursive: true });
  return path.join(d, "floors.json");
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "piso"
  );
}

type LegacyFloor = Floor & { rootLocationId?: number | null; puestos: any[] };

function normalizeFloors(j: any): Floor[] {
  if (!Array.isArray(j)) return [];
  // Migra formato anterior (rootLocationId, puestos con nombre propio)
  return (j as LegacyFloor[]).map((f) => ({
    id: String(f.id),
    name: String(f.name || f.id),
    image: f.image || null,
    glpiLocationId:
      f.glpiLocationId ?? (f.rootLocationId == null ? null : Number(f.rootLocationId)),
    puestos: Array.isArray(f.puestos)
      ? f.puestos
          .filter((x) => x && x.glpi_id != null)
          .map((x) => ({
            glpi_id: Number(x.glpi_id),
            x: Number(x.x) || 0,
            y: Number(x.y) || 0,
            w: Number(x.w) || 5,
            h: Number(x.h) || 5,
          }))
      : [],
  }));
}

export async function loadFloors(): Promise<Floor[]> {
  if (usePostgres()) {
    try {
      const rows = await prisma().floor.findMany({
        orderBy: [{ sort: "asc" }, { id: "asc" }],
        include: { puestos: true },
      });
      return rows.map((f) => ({
        id: f.id,
        name: f.name,
        image: f.image,
        glpiLocationId: f.glpiLocationId,
        puestos: f.puestos
          .slice()
          .sort((a, b) => a.glpiId - b.glpiId)
          .map((p) => ({ glpi_id: p.glpiId, x: p.x, y: p.y, w: p.w, h: p.h })),
      }));
    } catch {
      return [];
    }
  }
  const p = await floorsPath();
  try {
    const j = JSON.parse(await fs.readFile(p, "utf8"));
    return normalizeFloors(j);
  } catch {
    return [];
  }
}

export async function saveFloors(f: Floor[]): Promise<void> {
  if (usePostgres()) {
    // Reemplazo atómico en transacción (antes: writeFile directo, truncable).
    // Serializado en proceso con withWriteLock; constraints PG como 2da capa.
    await withWriteLock(() =>
      prisma().$transaction(async (tx) => {
        await tx.puesto.deleteMany();
        await tx.floor.deleteMany();
        for (let i = 0; i < f.length; i++) {
          const fl = f[i];
          await tx.floor.create({
            data: {
              id: fl.id,
              name: fl.name,
              image: fl.image,
              glpiLocationId: fl.glpiLocationId,
              sort: i,
              puestos: {
                create: fl.puestos.map((p) => ({
                  glpiId: p.glpi_id,
                  x: p.x,
                  y: p.y,
                  w: p.w,
                  h: p.h,
                })),
              },
            },
          });
        }
      }),
    );
    return;
  }
  // JSON: tmp+rename (antes writeFile directo) para evitar truncado.
  const p = await floorsPath();
  const tmp = `${p}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(f, null, 2), "utf8");
  await fs.rename(tmp, p);
}

export async function createFloor(name: string): Promise<Floor> {
  const floors = await loadFloors();
  let id = slug(name);
  let n = 2;
  while (floors.some((f) => f.id === id)) id = `${slug(name)}-${n++}`;
  const f: Floor = { id, name, image: null, glpiLocationId: null, puestos: [] };
  floors.push(f);
  await saveFloors(floors);
  return f;
}

export async function imagePath(floor: Floor): Promise<string | null> {
  if (!floor.image) return null;
  const p = path.join(mapsDir(), floor.image);
  try {
    await fs.access(p);
    return p;
  } catch {
    return null;
  }
}
