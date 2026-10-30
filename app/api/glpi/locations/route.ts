import { NextRequest, NextResponse } from "next/server";
import { getLocationsCached } from "@/lib/glpi";

export const dynamic = "force-dynamic";

// GET /api/glpi/locations -> lista plana [{id,name,completename,parentId}]
// GET /api/glpi/locations?parent=X -> solo hijos directos de X
export async function GET(req: NextRequest) {
  try {
    const parent = req.nextUrl.searchParams.get("parent");
    const all = await getLocationsCached();
    const locations =
      parent == null ? all : all.filter((l) => l.parentId === Number(parent));
    return NextResponse.json({ locations });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
