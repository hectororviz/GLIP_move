import { NextRequest, NextResponse } from "next/server";
import { authStatus } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return NextResponse.json(authStatus(req));
}
