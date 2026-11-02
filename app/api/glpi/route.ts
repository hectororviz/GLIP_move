import { NextRequest, NextResponse } from "next/server";
import { glpiFetch, enrich, ASSET_TYPES } from "@/lib/glpi";
import { inventoryVariants } from "@/lib/inventory";
import { getAuth, isOperator } from "@/lib/auth";
import { appendActivity } from "@/lib/activity";

function params(o: Record<string, string>): string {
  return new URLSearchParams(o).toString();
}

// GET /api/glpi?q=12865&type=Computer   -> búsqueda tolerante a ceros
// GET /api/glpi?location_id=42          -> activos del puesto (fan-out tipos)
// GET /api/glpi?type=Computer&id=123    -> detalle enriquecido
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const id = sp.get("id");
    const type = sp.get("type");
    const q = sp.get("q");
    const loc = sp.get("location_id");

    if (type && id) {
      const item = await glpiFetch(`/${type}/${id}?expand_dropdowns=true`);
      return NextResponse.json({ item: enrich(item, type), type });
    }

    if (loc) {
      const types = type && type !== "all" ? [type] : [...ASSET_TYPES];
      const errors: string[] = [];
      const settled = await Promise.all(
        types.map(async (t) => {
          try {
            const list = await glpiFetch(`/${t}/?${params({ "searchText[locations_id]": loc, expand_dropdowns: "true", range: "0-100" })}`);
            const arr = Array.isArray(list) ? list : [];
            return arr.map((it) => enrich(it, t));
          } catch (e: any) {
            errors.push(`${t}: ${e.message}`);
            return [];
          }
        })
      );
      const items = settled.flat();
      if (!items.length && errors.length === types.length) {
        return NextResponse.json({ error: errors[0] }, { status: 502 });
      }
      return NextResponse.json({ items });
    }

    if (q) {
      const types = type && type !== "all" ? [type] : [...ASSET_TYPES];
      const variants = inventoryVariants(q);
      const errors: string[] = [];
      // 1) por N° inventario (otherserial) en paralelo por tipo
      const byInv = await Promise.all(
        types.map(async (t) => {
          for (const v of variants) {
            try {
              const list = await glpiFetch(`/${t}/?${params({ "searchText[otherserial]": v, expand_dropdowns: "true", range: "0-20" })}`);
              if (Array.isArray(list) && list.length) return list.map((it) => enrich(it, t));
            } catch (e: any) {
              errors.push(`${t}: ${e.message}`);
            }
          }
          return [];
        })
      );
      let items = byInv.flat();
      // 2) fallback: nombre o serie contienen
      if (!items.length && !errors.length) {
        const fb = await Promise.all(
          types.map(async (t) => {
            const out: any[] = [];
            for (const field of ["name", "serial"] as const) {
              try {
                const list = await glpiFetch(`/${t}/?${params({ [`searchText[${field}]`]: q.trim(), expand_dropdowns: "true", range: "0-20" })}`);
                if (Array.isArray(list)) for (const it of list) out.push(enrich(it, t));
              } catch (e: any) {
                errors.push(`${t}: ${e.message}`);
              }
            }
            return out;
          })
        );
        items = fb.flat();
      }
      const seen = new Set<string>();
      const uniq = items.filter((it) => {
        const k = `${it._type}-${it.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (!uniq.length && errors.length) {
        return NextResponse.json({ error: errors[0] }, { status: 502 });
      }
      return NextResponse.json({ items: uniq.slice(0, 20) });
    }

    return NextResponse.json({ error: "Parámetros: ?q= | ?location_id= | ?type=&id=" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

// PATCH /api/glpi  { type, id, location_id|null, user_id? } -> traslado
// GLPI legacy: PUT /{Type}/{id} {"input": {"locations_id": X}}
// Sin ubicación => locations_id: 0. users_id no se toca salvo user_id explícito.
export async function PATCH(req: NextRequest) {
  const auth = getAuth(req);
  if (auth.kind === "none") return NextResponse.json({ error: "Inicia sesión para editar." }, { status: 401 });
  if (auth.kind === "user" && !isOperator(req)) return NextResponse.json({ error: "Tu perfil no tiene permiso de edición." }, { status: 403 });
  const sessionToken = auth.kind === "user" && auth.session ? auth.session.glpiToken : null;
  try {
    const b = await req.json();
    const { type, id, location_id, user_id } = b;
    if (!type || !id) return NextResponse.json({ error: "type + id requeridos" }, { status: 400 });
    const input: Record<string, any> = {
      locations_id: location_id == null ? 0 : Number(location_id),
    };
    if (user_id !== undefined) input.users_id = user_id == null ? 0 : Number(user_id);
    const r = await glpiFetch(`/${type}/${id}?session_write=true`, {
      method: "PUT",
      body: JSON.stringify({ input }),
    }, true, sessionToken);
    const actor = auth.kind === "admin" ? "admin" : auth.session?.login || "?";
    const action =
      user_id !== undefined && location_id !== undefined
        ? (user_id == null ? "reasignó usuario (sale del puesto)" : "asignó usuario (sale del puesto)")
        : user_id !== undefined
          ? (user_id == null ? "quitó usuario" : "asignó usuario")
          : location_id == null
            ? "sacó del puesto"
            : "movió de puesto";
    await appendActivity({
      ts: Date.now(),
      actor,
      action,
      type: String(type),
      id: Number(id),
      location_id: location_id === undefined ? undefined : (location_id == null ? null : Number(location_id)),
      user_id: user_id === undefined ? undefined : (user_id == null ? null : Number(user_id)),
    });
    return NextResponse.json({ ok: true, result: r });
  } catch (e: any) {
    const msg = String(e.message || "");
    const status = /no right|RIGHT/i.test(msg) ? 403 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
