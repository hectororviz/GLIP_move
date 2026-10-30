import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "@/lib/config";

export const dynamic = "force-dynamic";

const MAX_BODY = 20 * 1024;
const MAX_FILE = 200 * 1024;

// POST /api/client-logs {origin, status, detail, tech} -> log de diagnóstico
// visible en `docker logs` y en data/client-logs.jsonl
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return NextResponse.json({ error: "Registro muy grande" }, { status: 413 });
    let body: any = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw: raw.slice(0, 500) }; }
    const entry = {
      at: new Date().toISOString(),
      ip: req.headers.get("x-forwarded-for") || "local",
      origin: String(body?.origin || "").slice(0, 120),
      status: String(body?.status || "").slice(0, 40),
      detail: String(body?.detail || "").slice(0, 300),
      tech: body?.tech ?? null,
    };
    const line = JSON.stringify(entry) + "\n";
    console.log("[client-log]", line.trim().slice(0, 2000));
    try {
      const dir = dataDir();
      await fs.mkdir(dir, { recursive: true });
      const p = path.join(dir, "client-logs.jsonl");
      try {
        const st = await fs.stat(p);
        if (st.size > MAX_FILE) await fs.writeFile(p, "", "utf8");
      } catch {}
      await fs.appendFile(p, line, "utf8");
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
