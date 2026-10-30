import { NextRequest, NextResponse } from "next/server";
import { glpiFetch } from "@/lib/glpi";

// GET /api/config/test — verifica credenciales contra GLPI 10 (requiere admin local).
export async function GET(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD || "plain:cambia-esto";
  const cookie = req.cookies.get("gm_admin")?.value;
  const ok = !!cookie && expected.startsWith("plain:") && cookie === expected.slice(6);
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const [profiles, entities] = await Promise.all([
      glpiFetch("/getMyProfiles"),
      glpiFetch("/getMyEntities").catch(() => null),
    ]);
    const names = (profiles?.myprofiles || []).map((p: any) => p.name);
    return NextResponse.json({
      ok: true,
      profiles: names,
      entities: entities?.myentities || null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}
