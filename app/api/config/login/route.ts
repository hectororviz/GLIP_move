import { NextRequest, NextResponse } from "next/server";
import { glpiFetch } from "@/lib/glpi";

// Login admin local para /config. Password en env ADMIN_PASSWORD.
export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.ADMIN_PASSWORD || "plain:cambia-esto";
  const ok = expected.startsWith("plain:") ? password === expected.slice(6) : false;
  if (!ok) return NextResponse.json({ error: "Clave incorrecta" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("gm_admin", password, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 86400 });
  return res;
}
