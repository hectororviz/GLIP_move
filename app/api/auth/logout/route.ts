import { NextRequest, NextResponse } from "next/server";
import { getSession, killSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const s = getSession(req);
  if (s) await killSession(s);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("gm_user", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
