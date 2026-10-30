import { NextRequest, NextResponse } from "next/server";
import { createSession, canOperate } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any = null;
  try { body = await req.json(); } catch { body = {}; }
  const login = String(body?.login || "").trim();
  const password = String(body?.password || "");
  if (!login || !password) return NextResponse.json({ error: "Usuario y clave requeridos" }, { status: 400 });
  const sess = await createSession(login, password);
  if (!sess) return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  const res = NextResponse.json({ ok: true, user: { login: sess.login, name: sess.name, profiles: sess.profiles }, canOperate: canOperate(sess) });
  res.cookies.set("gm_user", sess.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  return res;
}
