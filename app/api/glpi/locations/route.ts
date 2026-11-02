import { NextRequest, NextResponse } from "next/server";
import { clearLocationsCache, getLocationsCached, glpiFetch } from "@/lib/glpi";
import { loadFloors } from "@/lib/maps";
import { getAuth, isOperator } from "@/lib/auth";
import { appendActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// GET /api/glpi/locations -> lista plana [{id,name,completename,parentId,room}]
// GET /api/glpi/locations?parent=X -> solo hijos directos de X
// GET /api/glpi/locations?id=X -> detalle de una ubicación
// GET /api/glpi/locations?q=1234 -> ubicaciones por nombre o interno (room)
// PATCH /api/glpi/locations {id, room} -> edita el interno (operador)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const byId = Number(sp.get("id"));
    if (byId) {
      const all = await getLocationsCached();
      const loc = all.find((l) => l.id === byId);
      if (!loc) return NextResponse.json({ error: "Ubicación inexistente" }, { status: 404 });
      return NextResponse.json({ location: loc });
    }
    const q = sp.get("q")?.trim();
    if (q) {
      const all = await getLocationsCached();
      const needle = q.toLowerCase();
      const locations = all
        .filter(
          (l) =>
            l.name.toLowerCase().includes(needle) ||
            (l.room || "").toLowerCase().includes(needle) ||
            String(l.id) === q
        )
        .slice(0, 20);
      return NextResponse.json({ locations });
    }
    const parent = sp.get("parent");
    const all = await getLocationsCached();
    const locations =
      parent == null ? all : all.filter((l) => l.parentId === Number(parent));
    return NextResponse.json({ locations });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = getAuth(req);
  if (auth.kind === "none") return NextResponse.json({ error: "Inicia sesión para editar." }, { status: 401 });
  if (auth.kind === "user" && !isOperator(req)) return NextResponse.json({ error: "Tu perfil no tiene permiso de edición." }, { status: 403 });
  const sessionToken = auth.kind === "user" && auth.session ? auth.session.glpiToken : null;
  try {
    const b = await req.json();
    const id = Number(b?.id);
    const room = b?.room == null || String(b.room).trim() === "" ? "" : String(b.room).trim().slice(0, 50);
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    // Solo puestos dibujados en los planos.
    const floors = await loadFloors();
    const drawn = new Set(floors.flatMap((f) => f.puestos.map((p) => p.glpi_id)));
    if (!drawn.has(id)) return NextResponse.json({ error: "Solo se puede editar el interno de puestos dibujados." }, { status: 400 });
    const r = await glpiFetch(`/Location/${id}?session_write=true`, {
      method: "PUT",
      body: JSON.stringify({ input: { room } }),
    }, true, sessionToken);
    // Invalidar caché de ubicaciones en este proceso.
    clearLocationsCache();
    const actor = auth.kind === "admin" ? "admin" : auth.session?.login || "?";
    await appendActivity({ ts: Date.now(), actor, action: room ? `fijó interno ${room}` : "quitó interno", type: "Location", id });
    return NextResponse.json({ ok: true, result: r });
  } catch (e: any) {
    const msg = String(e.message || "");
    const status = /no right|RIGHT/i.test(msg) ? 403 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
