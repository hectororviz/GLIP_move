import { NextRequest, NextResponse } from "next/server";
import { isOperator, getAuth } from "@/lib/auth";
import { createArea, loadAccess, saveAccess, validateAreaInput } from "@/lib/access";
import { clean, glpiFetch } from "@/lib/glpi";

export const dynamic = "force-dynamic";

function deny(req: NextRequest) {
  const a = getAuth(req as any);
  if (a.kind === "none") return NextResponse.json({ error: "Inicia sesión para ver accesos." }, { status: 401 });
  if (!isOperator(req as any)) return NextResponse.json({ error: "Tu perfil no tiene permiso." }, { status: 403 });
  return null;
}

// GET /api/access/areas -> lista con conteos
export async function GET(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  const db = await loadAccess();
  const areas = db.areas
    .map((a) => ({
      ...a,
      mails: db.mails.filter((m) => m.areaId === a.id).length,
      shares: db.shares.filter((s) => s.areaId === a.id).length,
    }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre));
  return NextResponse.json({ areas });
}

// POST /api/access/areas {nombre, responsableUserId} (responsable = usuario GLPI)
export async function POST(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  try {
    const b = await req.json();
    const { nombre } = validateAreaInput(b);
    const responsableUserId = Number(b?.responsableUserId);
    if (!Number.isFinite(responsableUserId) || responsableUserId <= 0) {
      return NextResponse.json({ error: "responsableUserId requerido (usuario GLPI)" }, { status: 400 });
    }
    // Valida que el responsable exista en GLPI y congela snapshot de nombre.
    let responsableNombre: string | null = null;
    try {
      const u: any = await glpiFetch(`/User/${responsableUserId}`);
      const fn = clean(u?.firstname);
      const rn = clean(u?.realname);
      responsableNombre = [fn, rn].filter(Boolean).join(" ") || clean(u?.name);
    } catch {
      return NextResponse.json({ error: "El responsable no existe en GLPI" }, { status: 400 });
    }
    const db = await loadAccess();
    const area = createArea(db, nombre, responsableUserId, responsableNombre);
    await saveAccess(db);
    return NextResponse.json({ area });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error" }, { status: 400 });
  }
}

// PUT /api/access/areas {id, nombre?, responsableUserId?}
export async function PUT(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  try {
    const b = await req.json();
    const id = String(b?.id || "").trim();
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const db = await loadAccess();
    const a = db.areas.find((x) => x.id === id);
    if (!a) return NextResponse.json({ error: "Área no existe" }, { status: 404 });
    if (b?.nombre !== undefined) {
      const { nombre } = validateAreaInput(b);
      if (db.areas.some((x) => x.id !== id && x.nombre.toLowerCase() === nombre.toLowerCase())) {
        return NextResponse.json({ error: "Ya existe un área con ese nombre" }, { status: 400 });
      }
      a.nombre = nombre;
    }
    if (b?.responsableUserId !== undefined) {
      const rid = Number(b.responsableUserId);
      if (!Number.isFinite(rid) || rid <= 0) return NextResponse.json({ error: "responsable inválido" }, { status: 400 });
      try {
        const u: any = await glpiFetch(`/User/${rid}`);
        const fn = clean(u?.firstname);
        const rn = clean(u?.realname);
        a.responsableUserId = rid;
        a.responsableNombre = [fn, rn].filter(Boolean).join(" ") || clean(u?.name);
      } catch {
        return NextResponse.json({ error: "El responsable no existe en GLPI" }, { status: 400 });
      }
    }
    a.updatedAt = Date.now();
    await saveAccess(db);
    return NextResponse.json({ area: a });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error" }, { status: 400 });
  }
}

// DELETE /api/access/areas?id= -> bloquea si tiene correos/carpetas
export async function DELETE(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  const id = String(new URL(req.url).searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const db = await loadAccess();
  if (!db.areas.some((a) => a.id === id)) return NextResponse.json({ error: "Área no existe" }, { status: 404 });
  const mails = db.mails.filter((m) => m.areaId === id).length;
  const shares = db.shares.filter((s) => s.areaId === id).length;
  if (mails + shares > 0) {
    return NextResponse.json(
      { error: `El área tiene ${mails} correo(s) y ${shares} carpeta(s). Reasigná o borrá esos recursos antes.` },
      { status: 409 }
    );
  }
  db.areas = db.areas.filter((a) => a.id !== id);
  await saveAccess(db);
  return NextResponse.json({ ok: true });
}
