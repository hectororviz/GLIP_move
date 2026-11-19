import { NextRequest, NextResponse } from "next/server";
import { clean, glpiFetch } from "@/lib/glpi";
import { getAuth, isOperator } from "@/lib/auth";
import { loadFloors } from "@/lib/maps";
import { appendActivity } from "@/lib/activity";

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

// PATCH /api/glpi/users { id, location_id } -> fija el puesto de la persona.
// location_id: glpi_id de puesto dibujado, o null/0 para dejarla sin puesto.
// No mueve bienes. Solo operador. Rechaza usuarios inactivos/borrados.
export async function PATCH(req: NextRequest) {
  const auth = getAuth(req);
  if (auth.kind === "none") return NextResponse.json({ error: "Inicia sesión para editar." }, { status: 401 });
  if (auth.kind === "user" && !isOperator(req)) return NextResponse.json({ error: "Tu perfil no tiene permiso de edición." }, { status: 403 });
  const sessionToken = auth.kind === "user" && auth.session ? auth.session.glpiToken : null;
  try {
    const b = await req.json();
    const id = Number(b?.id);
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const locRaw = b?.location_id;
    const loc = locRaw == null ? 0 : Number(locRaw);
    if (locRaw != null && !Number.isFinite(loc)) return NextResponse.json({ error: "location_id inválido" }, { status: 400 });
    if (loc) {
      const floors = await loadFloors();
      const drawn = new Set(floors.flatMap((f) => f.puestos.map((p) => p.glpi_id)));
      if (!drawn.has(loc)) return NextResponse.json({ error: "Solo se puede asignar a puestos dibujados." }, { status: 400 });
    }
    const cur = await glpiFetch(`/User/${id}`, {}, true, sessionToken);
    if (!cur || cur.id == null) return NextResponse.json({ error: `Usuario inexistente (#${id}).` }, { status: 400 });
    if (String(cur.is_deleted).startsWith("1") || (cur.is_active != null && Number(cur.is_active) === 0)) {
      return NextResponse.json({ error: "Usuario inactivo: elegí un usuario vigente." }, { status: 400 });
    }
    await glpiFetch(`/User/${id}?session_write=true`, {
      method: "PUT",
      body: JSON.stringify({ input: { locations_id: loc } }),
    }, true, sessionToken);
    const fresh = await glpiFetch(`/User/${id}`, {}, true, sessionToken);
    if (Number(fresh?.locations_id) !== loc) {
      return NextResponse.json({ error: "GLPI no aplicó el puesto de la persona." }, { status: 502 });
    }
    const actor = auth.kind === "admin" ? "admin" : auth.session?.login || "?";
    await appendActivity({ ts: Date.now(), actor, action: loc ? "asignó puesto a persona" : "quitó puesto a persona", type: "User", id, location_id: loc || null, user_id: id });
    return NextResponse.json({ ok: true, userId: id, location_id: loc });
  } catch (e: any) {
    const msg = String(e.message || "");
    const status = /no right|RIGHT/i.test(msg) ? 403 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
