import { NextResponse } from "next/server";
import { aggregateRelevantNews } from "@/lib/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await aggregateRelevantNews();
  return NextResponse.json({ ok: true, items, updatedAt: new Date().toISOString() });
}
