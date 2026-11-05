import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/auth";
import { ASSET_TYPES, clean, enrich, glpiFetch } from "@/lib/glpi";
import { inventoryVariants, parseGlpiUrl } from "@/lib/inventory";
import { loadAccess } from "@/lib/access";
import { norm } from "@/lib/search";

export const dynamic = "force-dynamic";

const LIM = 20;

function params(o: Record<string, string>): string {
  return new URLSearchParams(o).toString();
}

function personOf(u: any) {
  const id = Number(u?.id);
  const login = clean(u?.name);
  const firstname = clean(u?.firstname);
  const realname = clean(u?.realname);
  const display = [firstname, realname].filter(Boolean).join(" ") || login || `Usuario ${id}`;
  return { id, login, firstname, realname, display, email: clean(u?.email), phone: clean(u?.phone || u?.mobile) };
}

async function searchEquipos(q: string): Promise<{ items: any[]; error?: string }> {
  // Atajo QR GLPI: front/<tipo>.form.php?id= -> detalle directo.
  const parsed = parseGlpiUrl(q);
  if (parsed) {
    try {
      const item = await glpiFetch(`/${parsed.type}/${parsed.id}?expand_dropdowns=true`);
      return { items: [enrich(item, parsed.type)] };
    } catch (e: any) {
      return { items: [], error: String(e.message || e).slice(0, 200) };
    }
  }
  const variants = inventoryVariants(q);
  const errors: string[] = [];
  const byInv = await Promise.all(
    [...ASSET_TYPES].map(async (t) => {
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
  if (!items.length && !errors.length) {
    const fb = await Promise.all(
      [...ASSET_TYPES].map(async (t) => {
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
  if (!uniq.length && errors.length) return { items: [], error: errors[0].slice(0, 200) };
  return { items: uniq.slice(0, LIM), error: undefined };
}

async function searchPersonas(q: string): Promise<{ items: any[]; error?: string }> {
  const fields = ["name", "firstname", "realname"];
  const errors: string[] = [];
  const settled = await Promise.all(
    fields.map(async (field) => {
      try {
        const p = new URLSearchParams({ [`searchText[${field}]`]: q, range: "0-20" }).toString();
        const list = await glpiFetch(`/User/?${p}`);
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
    .filter((u) => u && u.id != null && !String(u.is_deleted).startsWith("1"))
    .map(personOf)
    .filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    })
    .slice(0, LIM);
  if (!users.length && errors.length === fields.length) return { items: [], error: errors[0].slice(0, 200) };
  return { items: users };
}

// GET /api/search?q= -> agregador: equipos + personas (público) y áreas/correos/carpetas (solo operador).
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ error: "Parámetro: ?q=" }, { status: 400 });
  const canOperate = isOperator(req as any);
  const nq = norm(q);

  const [eq, per] = await Promise.all([searchEquipos(q), searchPersonas(q)]);

  // Accesos: solo operador; si no, acordeones bloqueados sin filtrar nada.
  let areas: any[] = [];
  let correos: any[] = [];
  let carpetas: any[] = [];
  let accessError: string | undefined;
  if (canOperate) {
    try {
      const db = await loadAccess();
      const areaById = new Map(db.areas.map((a) => [a.id, a]));
      areas = db.areas
        .filter((a) => !nq || norm(a.nombre).includes(nq) || norm(a.responsableNombre).includes(nq))
        .map((a) => ({
          ...a,
          mails: db.mails.filter((m) => m.areaId === a.id).length,
          shares: db.shares.filter((s) => s.areaId === a.id).length,
        }))
        .slice(0, LIM);
      correos = db.mails
        .filter((m) => {
          const area = areaById.get(m.areaId);
          return !nq || norm(m.nombre).includes(nq) || norm(m.direccion).includes(nq) || norm(area?.nombre).includes(nq);
        })
        .map((m) => {
          const grants = db.mailGrants.filter((g) => g.accountId === m.id);
          return {
            ...m,
            area: areaById.get(m.areaId)?.nombre || "—",
            personas: grants.length,
            envian: grants.filter((g) => g.canSend).length,
            reciben: grants.filter((g) => g.canRead).length,
          };
        })
        .slice(0, LIM);
      carpetas = db.shares
        .filter((s) => {
          const area = areaById.get(s.areaId);
          return !nq || norm(s.nombre).includes(nq) || norm(s.ruta).includes(nq) || norm(area?.nombre).includes(nq);
        })
        .map((s) => ({
          ...s,
          area: areaById.get(s.areaId)?.nombre || "—",
          personas: db.shareGrants.filter((g) => g.shareId === s.id).length,
        }))
        .slice(0, LIM);
    } catch (e: any) {
      accessError = String(e.message || e).slice(0, 200);
    }
  }

  return NextResponse.json({
    q,
    canOperate,
    results: {
      equipos: { total: eq.items.length, items: eq.items, error: eq.error },
      personas: { total: per.items.length, items: per.items, error: per.error },
      areas: canOperate ? { total: areas.length, items: areas, error: accessError } : { locked: true as const, total: 0, items: [] },
      correos: canOperate ? { total: correos.length, items: correos, error: accessError } : { locked: true as const, total: 0, items: [] },
      carpetas: canOperate ? { total: carpetas.length, items: carpetas, error: accessError } : { locked: true as const, total: 0, items: [] },
    },
  });
}
