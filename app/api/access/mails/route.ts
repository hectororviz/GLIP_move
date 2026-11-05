import { NextRequest, NextResponse } from "next/server";
import { isOperator, getAuth } from "@/lib/auth";
import { createMail, loadAccess, saveAccess, validateMailInput } from "@/lib/access";
import { norm } from "@/lib/search";

export const dynamic = "force-dynamic";

function deny(req: NextRequest) {
  const a = getAuth(req as any);
  if (a.kind === "none") return NextResponse.json({ error: "Inicia sesión para ver accesos." }, { status: 401 });
  if (!isOperator(req as any)) return NextResponse.json({ error: "Tu perfil no tiene permiso." }, { status: 403 });
  return null;
}

// GET /api/access/mails?area=&q= -> correos (con área y conteo de personas)
export async function GET(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  const sp = new URL(req.url).searchParams;
  const area = sp.get("area") || "";
  const q = norm(sp.get("q") || "");
  const db = await loadAccess();
  const byArea = (id: string) => db.areas.find((a) => a.id === id) || null;
  const mails = db.mails
    .filter((m) => !area || m.areaId === area)
    .filter((m) => !q || norm(m.nombre).includes(q) || norm(m.direccion).includes(q) || norm(byArea(m.areaId)?.nombre).includes(q))
    .map((m) => {
      const grants = db.mailGrants.filter((g) => g.accountId === m.id);
      return {
        ...m,
        area: byArea(m.areaId)?.nombre || "—",
        personas: grants.length,
        envian: grants.filter((g) => g.canSend).length,
        reciben: grants.filter((g) => g.canRead).length,
      };
    })
    .sort((x, y) => x.nombre.localeCompare(y.nombre));
  return NextResponse.json({ mails });
}

export async function POST(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  try {
    const b = await req.json();
    const v = validateMailInput(b);
    const db = await loadAccess();
    const mail = createMail(db, v.nombre, v.direccion, v.areaId);
    await saveAccess(db);
    return NextResponse.json({ mail });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error" }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  try {
    const b = await req.json();
    const id = String(b?.id || "").trim();
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const db = await loadAccess();
    const m = db.mails.find((x) => x.id === id);
    if (!m) return NextResponse.json({ error: "Correo no existe" }, { status: 404 });
    if (b?.nombre !== undefined) {
      const n = String(b.nombre).trim();
      if (!n) return NextResponse.json({ error: "nombre requerido" }, { status: 400 });
      m.nombre = n.slice(0, 120);
    }
    if (b?.direccion !== undefined) {
      const { validateMailInput } = await import("@/lib/access");
      const v = validateMailInput({ nombre: m.nombre, direccion: b.direccion, areaId: m.areaId });
      if (db.mails.some((x) => x.id !== id && x.direccion.toLowerCase() === v.direccion.toLowerCase())) {
        return NextResponse.json({ error: "Ya existe un correo con esa dirección" }, { status: 400 });
      }
      m.direccion = v.direccion;
    }
    if (b?.areaId !== undefined) {
      const areaId = String(b.areaId).trim();
      if (!db.areas.some((a) => a.id === areaId)) return NextResponse.json({ error: "El área no existe" }, { status: 400 });
      m.areaId = areaId;
    }
    m.updatedAt = Date.now();
    await saveAccess(db);
    return NextResponse.json({ mail: m });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  const sp = new URL(req.url).searchParams;
  const id = String(sp.get("id") || "").trim();
  const force = sp.get("force") === "1";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const db = await loadAccess();
  if (!db.mails.some((m) => m.id === id)) return NextResponse.json({ error: "Correo no existe" }, { status: 404 });
  const n = db.mailGrants.filter((g) => g.accountId === id).length;
  if (n > 0 && !force) {
    return NextResponse.json({ error: `Tiene ${n} persona(s) asignada(s). Quitá los accesos o reintentá con force.` }, { status: 409 });
  }
  db.mails = db.mails.filter((m) => m.id !== id);
  if (force) db.mailGrants = db.mailGrants.filter((g) => g.accountId !== id);
  await saveAccess(db);
  return NextResponse.json({ ok: true });
}
