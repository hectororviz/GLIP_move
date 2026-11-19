import { NextResponse } from "next/server";
import { clean, glpiFetch } from "@/lib/glpi";

function personOf(u: any) {
  const id = Number(u?.id);
  const login = clean(u?.name);
  const firstname = clean(u?.firstname);
  const realname = clean(u?.realname);
  const display = [firstname, realname].filter(Boolean).join(" ") || login || `Usuario ${id}`;
  return {
    id,
    login,
    firstname,
    realname,
    display,
    email: clean(u?.email),
    phone: clean(u?.phone || u?.mobile),
    isActive: u?.is_active == null ? true : Number(u.is_active) !== 0,
    isDeleted: String(u?.is_deleted).startsWith("1"),
  };
}

function isUsable(u: any) {
  if (!u || u.id == null) return false;
  if (String(u.is_deleted).startsWith("1")) return false;
  // is_active 0 = desactivado (ej. *-old migrados). null/undefined se trata como activo.
  if (u.is_active != null && Number(u.is_active) === 0) return false;
  return true;
}

// GET /api/glpi/users?q=ana -> usuarios GLPI (solo campos seguros)
// GET /api/glpi/users?id=12 -> un usuario GLPI por ID
// GET /api/glpi/users?location_id=362 -> usuarios con locations_id = puesto (aunque sin bienes)
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const byId = Number(sp.get("id"));
  if (byId) {
    try {
      const u = await glpiFetch(`/User/${byId}`);
      return NextResponse.json({ user: personOf(u) });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
  }
  const byLoc = Number(sp.get("location_id"));
  if (byLoc) {
    try {
      const params = new URLSearchParams({ "searchText[locations_id]": String(byLoc), range: "0-20" }).toString();
      const list = await glpiFetch(`/User/?${params}`);
      const users = (Array.isArray(list) ? list : [])
        .filter(isUsable)
        .map(personOf);
      return NextResponse.json({ users });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
  }
  const q = sp.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Parámetros: ?q= | ?id= | ?location_id=" }, { status: 400 });
  try {
    const fields = ["name", "firstname", "realname"];
    const errors: string[] = [];
    const settled = await Promise.all(
      fields.map(async (field) => {
        try {
          const params = new URLSearchParams({ [`searchText[${field}]`]: q, range: "0-20" }).toString();
          const list = await glpiFetch(`/User/?${params}`);
          return Array.isArray(list) ? list : [];
        } catch (e: any) {
          errors.push(`${field}: ${e.message}`);
          return [];
        }
      })
    );
    const seen = new Set<number>();
    const users = settled
      .flat()
      .filter(isUsable)
      .map(personOf)
      .filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      })
      .slice(0, 20);
    if (!users.length && errors.length === fields.length) {
      return NextResponse.json({ error: errors[0] }, { status: 502 });
    }
    return NextResponse.json({ users });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
