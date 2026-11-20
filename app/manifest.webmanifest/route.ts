import { NextResponse } from "next/server";
import { buildManifest } from "@/lib/manifest-json";

export const dynamic = "force-dynamic";

// Sirve /manifest.webmanifest (→ /move/manifest.webmanifest con basePath).
// Se usa route handler en lugar del archivo especial app/manifest.ts porque
// la convención de archivo impone <link rel="manifest" href="/manifest.webmanifest">
// sin basePath en el HTML (mergeStaticMetadata lo fija incondicionalmente),
// mientras que con route handler gana el `manifest:` explícito del layout.
export async function GET() {
  const m = await buildManifest();
  return new NextResponse(JSON.stringify(m), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
