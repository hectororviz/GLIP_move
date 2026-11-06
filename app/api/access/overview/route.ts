import { NextRequest, NextResponse } from "next/server";
import { canReadAccess, getAuth } from "@/lib/auth";
import { loadAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

// GET /api/access/overview?area= -> correos y carpetas de un área (o todas si no se pasa)
export async function GET(req: NextRequest) {
  const a = getAuth(req as any);
  if (a.kind === "none") return NextResponse.json({ error: "Inicia sesión para ver accesos." }, { status: 401 });
  if (!canReadAccess(req as any)) return NextResponse.json({ error: "Tu perfil no tiene permiso." }, { status: 403 });
  const area = new URL(req.url).searchParams.get("area") || "";
  const db = await loadAccess();
  const areas = area ? db.areas.filter((x) => x.id === area) : db.areas;
  const out = areas
    .map((x) => ({
      ...x,
      mails: db.mails
        .filter((m) => m.areaId === x.id)
        .map((m) => ({ ...m, personas: db.mailGrants.filter((g) => g.accountId === m.id).length }))
        .sort((p, q) => p.nombre.localeCompare(q.nombre)),
      shares: db.shares
        .filter((s) => s.areaId === x.id)
        .map((s) => ({ ...s, personas: db.shareGrants.filter((g) => g.shareId === s.id).length }))
        .sort((p, q) => p.nombre.localeCompare(q.nombre)),
    }))
    .sort((p, q) => p.nombre.localeCompare(q.nombre));
  return NextResponse.json({ areas: out });
}
