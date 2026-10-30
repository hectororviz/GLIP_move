import { NextRequest, NextResponse } from "next/server";
import { glpiFetch } from "@/lib/glpi";
import { isAdmin } from "@/lib/auth";

// GET /api/config/test — verifica credenciales contra GLPI 10 (requiere admin local).
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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
