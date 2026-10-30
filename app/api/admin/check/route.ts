import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  return NextResponse.json({ admin: isAdmin(req) });
}
