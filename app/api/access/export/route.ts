import { NextRequest, NextResponse } from "next/server";
import { isOperator, getAuth } from "@/lib/auth";
import { buildAreaWorkbook, buildMailWorkbook, buildShareWorkbook, workbookToBuffer } from "@/lib/access-export";

export const dynamic = "force-dynamic";

// GET /api/access/export?scope=area|mail|share&id= -> XLSX real (solo operador)
export async function GET(req: NextRequest) {
  const a = getAuth(req as any);
  if (a.kind === "none") return NextResponse.json({ error: "Inicia sesión para ver accesos." }, { status: 401 });
  if (!isOperator(req as any)) return NextResponse.json({ error: "Tu perfil no tiene permiso." }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const scope = sp.get("scope") || "";
  const id = sp.get("id") || "";
  if (!id) return NextResponse.json({ error: "Parámetros: ?scope=area|mail|share&id=" }, { status: 400 });
  try {
    const built =
      scope === "area" ? await buildAreaWorkbook(id)
      : scope === "mail" ? await buildMailWorkbook(id)
      : scope === "share" ? await buildShareWorkbook(id)
      : null;
    if (!built) return NextResponse.json({ error: "scope debe ser 'area' | 'mail' | 'share'" }, { status: 400 });
    const buf = workbookToBuffer(built.wb);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${built.filename}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (e: any) {
    const status = (e as any)?.status || 400;
    return NextResponse.json({ error: String(e.message || e).slice(0, 200) }, { status });
  }
}
