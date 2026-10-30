import { NextRequest, NextResponse } from "next/server";
import { loadConfig, saveConfig, encryptSecret, publicConfig } from "@/lib/config";

// El GET sin esto se prerenderiza como estático y el standalone responde 405 a PUT.
export const dynamic = "force-dynamic";

function adminOk(req: NextRequest): boolean {
  const expected = process.env.ADMIN_PASSWORD || "plain:cambia-esto";
  const cookie = req.cookies.get("gm_admin")?.value;
  if (!cookie) return false;
  if (expected.startsWith("plain:")) return cookie === expected.slice(6);
  return false;
}

export async function GET() {
  return NextResponse.json(publicConfig(await loadConfig()));
}

export async function PUT(req: NextRequest) {
  if (!adminOk(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json();
  const current = await loadConfig();
  const accent = /^#[0-9a-fA-F]{6}$/.test(body.accentColor || "") ? body.accentColor : current.accentColor;
  await saveConfig({
    glpiBaseUrl: String(body.glpiBaseUrl || current.glpiBaseUrl).trim().replace(/\/$/, ""),
    appToken: typeof body.appToken === "string" ? body.appToken.trim() : current.appToken,
    userTokenEnc: body.userToken ? encryptSecret(String(body.userToken).trim()) : current.userTokenEnc,
    keepUserOnMove: body.keepUserOnMove ?? current.keepUserOnMove,
    rootLocationId:
      body.rootLocationId === "" || body.rootLocationId == null ? null : Number(body.rootLocationId),
    appName: typeof body.appName === "string" ? body.appName.trim().slice(0, 40) || current.appName : current.appName,
    accentColor: accent,
  });
  return NextResponse.json({ ok: true });
}
