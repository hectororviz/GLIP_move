import { NextResponse } from "next/server";
import { ASSET_TYPES, enrich, glpiFetch } from "@/lib/glpi";

function params(o: Record<string, string>): string {
  return new URLSearchParams(o).toString();
}

// GET /api/glpi/user-assets?user_id=12 -> equipos del usuario agrupados por puesto
export async function GET(req: Request) {
  const userId = Number(new URL(req.url).searchParams.get("user_id"));
  if (!userId) return NextResponse.json({ error: "Parámetro: ?user_id=" }, { status: 400 });
  try {
    const errors: string[] = [];
    const settled = await Promise.all(
      [...ASSET_TYPES].map(async (t) => {
        try {
          const list = await glpiFetch(`/${t}/?${params({ "searchText[users_id]": String(userId), expand_dropdowns: "true", range: "0-100" })}`);
          const arr = Array.isArray(list) ? list : [];
          return arr.map((it) => enrich(it, t));
        } catch (e: any) {
          errors.push(`${t}: ${e.message}`);
          return [];
        }
      })
    );
    const items = settled.flat();
    if (!items.length && errors.length === ASSET_TYPES.length) {
      return NextResponse.json({ error: errors[0] }, { status: 502 });
    }
    const groups = new Map<number | null, any[]>();
    for (const it of items) {
      const k = it._locationId ?? null;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(it);
    }
    const located = [...groups.entries()]
      .filter(([k]) => k != null)
      .map(([location_id, items]) => ({ location_id, items }))
      .sort((a, b) => b.items.length - a.items.length);
    return NextResponse.json({ user_id: userId, groups: located, unlocated: groups.get(null) || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
