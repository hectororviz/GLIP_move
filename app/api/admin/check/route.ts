import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function adminOk(req: NextRequest): boolean {
  const expected = process.env.ADMIN_PASSWORD || "plain:cambia-esto";
  const cookie = req.cookies.get("gm_admin")?.value;
  return !!cookie && expected.startsWith("plain:") && cookie === expected.slice(6);
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ admin: adminOk(req) });
}
