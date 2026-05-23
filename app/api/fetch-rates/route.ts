import { NextResponse } from "next/server";
import { fetchExchangeRates, fetchGoldPrices, fetchPolicyRate } from "@/lib/cbu";
import { fetchCbuPublications } from "@/lib/publications";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization");
  const querySecret = new URL(request.url).searchParams.get("secret");
  return header === `Bearer ${secret}` || querySecret === secret;
}

function settledError(result: PromiseSettledResult<unknown>) {
  return result.status === "rejected" ? result.reason?.message ?? String(result.reason) : null;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const [ratesResult, goldResult, policyResult, publicationsResult] = await Promise.allSettled([
    fetchExchangeRates(),
    fetchGoldPrices(),
    fetchPolicyRate(),
    fetchCbuPublications()
  ]);

  const writes: Promise<unknown>[] = [];
  if (ratesResult.status === "fulfilled" && ratesResult.value.length > 0) {
    writes.push(supabase.from("exchange_rates").upsert(ratesResult.value, { onConflict: "as_of_date,code" }));
  }
  if (goldResult.status === "fulfilled" && goldResult.value.length > 0) {
    writes.push(supabase.from("gold_prices").upsert(goldResult.value, { onConflict: "as_of_date,weight_grams" }));
  }
  if (policyResult.status === "fulfilled" && policyResult.value) {
    writes.push(supabase.from("policy_rates").upsert(policyResult.value, { onConflict: "as_of_date" }));
  }
  if (publicationsResult.status === "fulfilled" && publicationsResult.value.length > 0) {
    writes.push(supabase.from("cbu_publications").upsert(publicationsResult.value, { onConflict: "url" }));
  }

  const writeResults = await Promise.allSettled(writes);
  const writeErrors = writeResults
    .map((result) => {
      if (result.status === "rejected") return result.reason?.message ?? String(result.reason);
      const possibleError = (result.value as { error?: { message?: string } })?.error;
      return possibleError?.message ?? null;
    })
    .filter(Boolean);

  const errors = [settledError(ratesResult), settledError(goldResult), settledError(policyResult), settledError(publicationsResult), ...writeErrors].filter(Boolean);
  return NextResponse.json({
    ok: errors.length === 0,
    updatedAt: new Date().toISOString(),
    counts: {
      exchangeRates: ratesResult.status === "fulfilled" ? ratesResult.value.length : 0,
      goldPrices: goldResult.status === "fulfilled" ? goldResult.value.length : 0,
      policyRates: policyResult.status === "fulfilled" && policyResult.value ? 1 : 0,
      publications: publicationsResult.status === "fulfilled" ? publicationsResult.value.length : 0
    },
    errors
  });
}
