import { NextRequest, NextResponse } from "next/server";
import { canReadAccess, getAuth } from "@/lib/auth";
import { loadAd } from "@/lib/ad";
import { norm } from "@/lib/search";

export const dynamic = "force-dynamic";

function denyRead(req: NextRequest) {
  const a = getAuth(req as any);
  if (a.kind === "none") return NextResponse.json({ error: "Inicia sesión para ver accesos." }, { status: 401 });
  if (!canReadAccess(req as any)) return NextResponse.json({ error: "Tu perfil no tiene permiso." }, { status: 403 });
  return null;
}

// GET /api/access/ad?q=&cuenta=&estado=&login=
// Lista del snapshot AD (base = último CSV importado). Sin GLPI en vivo.
export async function GET(req: NextRequest) {
  const d = denyRead(req);
  if (d) return d;
  const sp = new URL(req.url).searchParams;
  const login = sp.get("login")?.trim().toLowerCase();
  const db = await loadAd();
  if (login) {
    const u = db.users.find((x) => x.loginKey === login);
    if (!u) return NextResponse.json({ error: "Usuario AD no encontrado" }, { status: 404 });
    return NextResponse.json({ user: u, meta: { importedAt: db.importedAt, sourceFile: db.sourceFile } });
  }
  const q = norm(sp.get("q") || "");
  const cuenta = (sp.get("cuenta") || "").trim().toUpperCase();
  const estado = (sp.get("estado") || "").trim().toUpperCase();
  const users = db.users
    .filter((u) => {
      if (q && !(norm(u.nombre).includes(q) || norm(u.login).includes(q))) return false;
      if (cuenta && u.cuenta !== cuenta) return false;
      if (estado && u.estadoClave !== estado) return false;
      return true;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return NextResponse.json({
    users,
    meta: { importedAt: db.importedAt, sourceFile: db.sourceFile, total: db.users.length },
  });
}
