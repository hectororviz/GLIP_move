import { NextResponse } from "next/server";
import { ASSET_TYPES, getLocationsCached, glpiFetch } from "@/lib/glpi";
import { loadFloors } from "@/lib/maps";
import { loadConfig } from "@/lib/config";
import { readActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// Agregado operativo con caché corta: 6 tipos × 1 listado liviano
// (sin expand_dropdowns => locations_id/users_id numéricos) + locales.
const TTL = 5 * 60 * 1000;
const PAGE = 1000;
let cache: { at: number; data: any } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json({ ...cache.data, cached_at: cache.at, cached: true });
  }
  const floors = await loadFloors();
  const drawn = new Set(floors.flatMap((f) => f.puestos.map((p) => p.glpi_id)));
  const byLoc = new Map<number, { items: number; users: Set<number> }>();

  let glpiOk = false;
  let glpiError: string | null = null;
  let latencyMs: number | null = null;
  const byType: { type: string; total: number; truncated: boolean; unlocated: number; assigned: number }[] = [];

  const t0 = Date.now();
  const settled = await Promise.all(
    [...ASSET_TYPES].map(async (t) => {
      try {
        const list = await glpiFetch(`/${t}/?range=0-${PAGE - 1}`);
        return { t, list: Array.isArray(list) ? list : [] as any[] };
      } catch (e: any) {
        return { t, list: null as any[] | null, err: String(e?.message || e) };
      }
    })
  );
  latencyMs = Date.now() - t0;
  glpiOk = settled.some((s) => s.list !== null);
  if (!glpiOk) glpiError = settled.find((s) => (s as any).err)?.err || "GLPI no responde";

  for (const s of settled) {
    if (!s.list) {
      byType.push({ type: s.t, total: 0, truncated: false, unlocated: 0, assigned: 0 });
      continue;
    }
    let unlocated = 0;
    let assigned = 0;
    for (const it of s.list) {
      const loc = Number(it?.locations_id) || 0;
      const usr = Number(it?.users_id) || 0;
      if (usr) assigned++;
      if (!loc) {
        unlocated++;
      } else if (drawn.has(loc)) {
        let e = byLoc.get(loc);
        if (!e) { e = { items: 0, users: new Set() }; byLoc.set(loc, e); }
        e.items++;
        if (usr) e.users.add(usr);
      }
    }
    byType.push({ type: s.t, total: s.list.length, truncated: s.list.length >= PAGE, unlocated, assigned });
  }

  const total = byType.reduce((a, b) => a + b.total, 0);
  const unlocated = byType.reduce((a, b) => a + b.unlocated, 0);
  const assigned = byType.reduce((a, b) => a + b.assigned, 0);
  const truncated = byType.some((b) => b.truncated);

  // Nombres de puestos + hijos sin dibujar (para salud).
  let locName = new Map<number, string>();
  let undrawn = 0;
  try {
    const locs = await getLocationsCached();
    locName = new Map(locs.map((l) => [l.id, l.name]));
    for (const f of floors) {
      if (f.glpiLocationId == null) continue;
      const kids = locs.filter((l) => l.parentId === f.glpiLocationId);
      const drawnHere = new Set(f.puestos.map((p) => p.glpi_id));
      undrawn += kids.filter((k) => !drawnHere.has(k.id)).length;
    }
  } catch {}

  const floorStats = floors.map((f) => {
    const ids = f.puestos.map((p) => p.glpi_id);
    let withItems = 0;
    let occupied = 0;
    const top = ids
      .map((id) => ({ id, name: locName.get(id) || `#${id}`, items: byLoc.get(id)?.items || 0, users: byLoc.get(id)?.users.size || 0 }))
      .sort((a, b) => b.items - a.items);
    for (const t of top) {
      if (t.items > 0) withItems++;
      if (t.users > 0) occupied++;
    }
    return { id: f.id, name: f.name, hasMap: !!f.image, puestos: ids.length, withItems, occupied, top: top.slice(0, 3) };
  });

  const cfg = await loadConfig();
  const data = {
    stats: { total, unlocated, assigned, truncated, byType },
    floors: floorStats,
    puestos: {
      drawn: drawn.size,
      withItems: [...byLoc.values()].filter((e) => e.items > 0).length,
      occupied: [...byLoc.values()].filter((e) => e.users.size > 0).length,
    },
    recent: await readActivity(10),
    health: {
      glpiOk,
      glpiError,
      latencyMs,
      appTokenSet: !!cfg.appToken,
      userTokenSet: !!cfg.userTokenEnc,
      floorsWithoutMap: floors.filter((f) => !f.image).map((f) => ({ id: f.id, name: f.name })),
      undrawn,
    },
  };
  cache = { at: Date.now(), data };
  return NextResponse.json({ ...data, cached_at: cache.at, cached: false });
}
