import { NextRequest, NextResponse } from "next/server";
import { isOperator, getAuth } from "@/lib/auth";
import { createShare, loadAccess, rutaKey, saveAccess, validateShareInput } from "@/lib/access";
import { norm } from "@/lib/search";

export const dynamic = "force-dynamic";

function deny(req: NextRequest) {
  const a = getAuth(req as any);
  if (a.kind === "none") return NextResponse.json({ error: "Inicia sesión para ver accesos." }, { status: 401 });
  if (!isOperator(req as any)) return NextResponse.json({ error: "Tu perfil no tiene permiso." }, { status: 403 });
  return null;
}

// GET /api/access/shares?area=&q=
export async function GET(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  const sp = new URL(req.url).searchParams;
  const area = sp.get("area") || "";
  const q = norm(sp.get("q") || "");
  const db = await loadAccess();
  const byArea = (id: string) => db.areas.find((a) => a.id === id) || null;
  const shares = db.shares
    .filter((s) => !area || s.areaId === area)
    .filter((s) => !q || norm(s.nombre).includes(q) || norm(s.ruta).includes(q) || norm(byArea(s.areaId)?.nombre).includes(q))
    .map((s) => ({
      ...s,
      area: byArea(s.areaId)?.nombre || "—",
      personas: db.shareGrants.filter((g) => g.shareId === s.id).length,
    }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre));
  return NextResponse.json({ shares });
}

export async function POST(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  try {
    const b = await req.json();
    const v = validateShareInput(b);
    const db = await loadAccess();
    const share = createShare(db, v.nombre, v.ruta, v.areaId);
    await saveAccess(db);
    return NextResponse.json({ share });
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
    const s = db.shares.find((x) => x.id === id);
    if (!s) return NextResponse.json({ error: "Carpeta no existe" }, { status: 404 });
    if (b?.nombre !== undefined) {
      const n = String(b.nombre).trim();
      if (!n) return NextResponse.json({ error: "nombre requerido" }, { status: 400 });
      s.nombre = n.slice(0, 120);
    }
    if (b?.ruta !== undefined) {
      const v = validateShareInput({ nombre: s.nombre, ruta: b.ruta, areaId: s.areaId });
      if (db.shares.some((x) => x.id !== id && rutaKey(x.ruta) === rutaKey(v.ruta))) {
        return NextResponse.json({ error: "Ya existe una carpeta con esa ruta" }, { status: 400 });
      }
      s.ruta = v.ruta;
    }
    if (b?.areaId !== undefined) {
      const areaId = String(b.areaId).trim();
      if (!db.areas.some((a) => a.id === areaId)) return NextResponse.json({ error: "El área no existe" }, { status: 400 });
      s.areaId = areaId;
    }
    s.updatedAt = Date.now();
    await saveAccess(db);
    return NextResponse.json({ share: s });
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
  if (!db.shares.some((s) => s.id === id)) return NextResponse.json({ error: "Carpeta no existe" }, { status: 404 });
  const n = db.shareGrants.filter((g) => g.shareId === id).length;
  if (n > 0 && !force) {
    return NextResponse.json({ error: `Tiene ${n} persona(s) con acceso. Quitá los accesos o reintentá con force.` }, { status: 409 });
  }
  db.shares = db.shares.filter((s) => s.id !== id);
  if (force) db.shareGrants = db.shareGrants.filter((g) => g.shareId !== id);
  await saveAccess(db);
  return NextResponse.json({ ok: true });
}
