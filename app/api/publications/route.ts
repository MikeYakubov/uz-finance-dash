import { NextResponse } from "next/server";
import { fetchCbuPublications } from "@/lib/publications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await fetchCbuPublications();
  return NextResponse.json({ ok: true, items, updatedAt: new Date().toISOString() });
}
