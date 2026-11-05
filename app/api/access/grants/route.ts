import { NextRequest, NextResponse } from "next/server";
import { isOperator, getAuth } from "@/lib/auth";
import { loadAccess, saveAccess } from "@/lib/access";
import { clean, glpiFetch } from "@/lib/glpi";

export const dynamic = "force-dynamic";

function deny(req: NextRequest) {
  const a = getAuth(req as any);
  if (a.kind === "none") return NextResponse.json({ error: "Inicia sesión para ver accesos." }, { status: 401 });
  if (!isOperator(req as any)) return NextResponse.json({ error: "Tu perfil no tiene permiso." }, { status: 403 });
  return null;
}

async function glpiDisplay(userId: number): Promise<string | null> {
  try {
    const u: any = await glpiFetch(`/User/${userId}`);
    const fn = clean(u?.firstname);
    const rn = clean(u?.realname);
    return [fn, rn].filter(Boolean).join(" ") || clean(u?.name);
  } catch {
    return null;
  }
}

// GET /api/access/grants?user_id= | ?accountId= | ?shareId=
// user_id -> ficha persona: correos+carpetas asignadas (con nombres de recurso y área)
// accountId -> personas del correo + checks; shareId -> personas de la carpeta
export async function GET(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  const sp = new URL(req.url).searchParams;
  const userId = Number(sp.get("user_id"));
  const accountId = sp.get("accountId") || "";
  const shareId = sp.get("shareId") || "";
  const db = await loadAccess();
  const areaName = (id: string) => db.areas.find((a) => a.id === id)?.nombre || "—";

  if (userId) {
    const mails = db.mailGrants
      .filter((g) => g.userId === userId)
      .map((g) => {
        const m = db.mails.find((x) => x.id === g.accountId);
        return { ...g, nombre: m?.nombre || g.accountId, direccion: m?.direccion || "—", area: m ? areaName(m.areaId) : "—" };
      })
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    const shares = db.shareGrants
      .filter((g) => g.userId === userId)
      .map((g) => {
        const s = db.shares.find((x) => x.id === g.shareId);
        return { ...g, nombre: s?.nombre || g.shareId, ruta: s?.ruta || "—", area: s ? areaName(s.areaId) : "—" };
      })
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    return NextResponse.json({ user_id: userId, mails, shares });
  }

  if (accountId) {
    const m = db.mails.find((x) => x.id === accountId);
    if (!m) return NextResponse.json({ error: "Correo no existe" }, { status: 404 });
    const personas = db.mailGrants
      .filter((g) => g.accountId === accountId)
      .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
    return NextResponse.json({ mail: { ...m, area: areaName(m.areaId) }, personas });
  }

  if (shareId) {
    const s = db.shares.find((x) => x.id === shareId);
    if (!s) return NextResponse.json({ error: "Carpeta no existe" }, { status: 404 });
    const personas = db.shareGrants
      .filter((g) => g.shareId === shareId)
      .sort((a, b) => (a.userDisplay || "").localeCompare(b.userDisplay || ""));
    return NextResponse.json({ share: { ...s, area: areaName(s.areaId) }, personas });
  }

  return NextResponse.json({ error: "Parámetros: ?user_id= | ?accountId= | ?shareId=" }, { status: 400 });
}

// POST /api/access/grants {scope:'mail'|'share', accountId/shareId, userId, canSend?, canRead?}
// mail: upsert con al menos un check; share: otorga acceso (idempotente)
export async function POST(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  const auth = getAuth(req as any);
  const actor = auth.kind === "admin" ? "admin" : auth.session?.login || "?";
  try {
    const b = await req.json();
    const scope = String(b?.scope || "");
    const userId = Number(b?.userId);
    if (!Number.isFinite(userId) || userId <= 0) return NextResponse.json({ error: "userId inválido" }, { status: 400 });
    const display = (await glpiDisplay(userId)) || String(b?.userDisplay || "").trim() || null;
    if (!display) return NextResponse.json({ error: "La persona no existe en GLPI" }, { status: 400 });

    const db = await loadAccess();
    if (scope === "mail") {
      const accountId = String(b?.accountId || "").trim();
      const canSend = !!b?.canSend;
      const canRead = !!b?.canRead;
      if (!accountId || !db.mails.some((m) => m.id === accountId)) {
        return NextResponse.json({ error: "Correo no existe" }, { status: 404 });
      }
      if (!canSend && !canRead) return NextResponse.json({ error: "Tildá Envía y/o Recibe" }, { status: 400 });
      const ex = db.mailGrants.find((g) => g.accountId === accountId && g.userId === userId);
      if (ex) {
        ex.canSend = canSend;
        ex.canRead = canRead;
        ex.userDisplay = display;
        ex.by = actor;
        ex.at = Date.now();
      } else {
        db.mailGrants.push({ accountId, userId, userDisplay: display, canSend, canRead, by: actor, at: Date.now() });
      }
      await saveAccess(db);
      return NextResponse.json({ ok: true });
    }
    if (scope === "share") {
      const shareId = String(b?.shareId || "").trim();
      if (!shareId || !db.shares.some((s) => s.id === shareId)) {
        return NextResponse.json({ error: "Carpeta no existe" }, { status: 404 });
      }
      const ex = db.shareGrants.find((g) => g.shareId === shareId && g.userId === userId);
      if (!ex) db.shareGrants.push({ shareId, userId, userDisplay: display, by: actor, at: Date.now() });
      else {
        ex.userDisplay = display;
        ex.by = actor;
        ex.at = Date.now();
      }
      await saveAccess(db);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "scope debe ser 'mail' | 'share'" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error" }, { status: 400 });
  }
}

// DELETE /api/access/grants?scope=mail&accountId=&userId= | ?scope=share&shareId=&userId=
export async function DELETE(req: NextRequest) {
  const d = deny(req);
  if (d) return d;
  const sp = new URL(req.url).searchParams;
  const scope = sp.get("scope");
  const userId = Number(sp.get("userId"));
  if (!Number.isFinite(userId) || userId <= 0) return NextResponse.json({ error: "userId inválido" }, { status: 400 });
  const db = await loadAccess();
  if (scope === "mail") {
    const accountId = String(sp.get("accountId") || "");
    db.mailGrants = db.mailGrants.filter((g) => !(g.accountId === accountId && g.userId === userId));
  } else if (scope === "share") {
    const shareId = String(sp.get("shareId") || "");
    db.shareGrants = db.shareGrants.filter((g) => !(g.shareId === shareId && g.userId === userId));
  } else {
    return NextResponse.json({ error: "scope debe ser 'mail' | 'share'" }, { status: 400 });
  }
  await saveAccess(db);
  return NextResponse.json({ ok: true });
}
