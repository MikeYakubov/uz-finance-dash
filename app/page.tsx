import { Activity, ArrowDownRight, ArrowUpRight, Banknote, FileText, Landmark, Newspaper } from "lucide-react";
import { aggregateRelevantNews, type NewsItem } from "@/lib/news";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type RateRow = { as_of_date: string; code: string; numeric_code: string | null; name: string | null; nominal: number; rate: number; diff: number | null };
type GoldRow = { as_of_date: string; weight_grams: number; sell_price_uzs: number | null; buyback_intact_uzs: number | null; buyback_damaged_uzs: number | null };
type PolicyRow = { as_of_date: string; value_percent: number; source_url: string };
type PublicationRow = { title: string; url: string; section: string; detected_at?: string };
type DashboardData = { rates: RateRow[]; gold: GoldRow[]; policy: PolicyRow | null; publications: PublicationRow[]; news: NewsItem[]; isSample: boolean };

const WATCHLIST = ["USD", "EUR", "RUB", "CNY", "GBP", "JPY", "KRW", "TRY", "KZT"];

function money(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function compactDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Tashkent" }).format(new Date(value));
}

function sampleData(): DashboardData {
  return {
    isSample: true,
    rates: [
      { as_of_date: "2026-05-23", code: "USD", numeric_code: "840", name: "US Dollar", nominal: 1, rate: 12840.15, diff: 8.42 },
      { as_of_date: "2026-05-23", code: "EUR", numeric_code: "978", name: "Euro", nominal: 1, rate: 13928.4, diff: -16.11 },
      { as_of_date: "2026-05-23", code: "RUB", numeric_code: "643", name: "Russian Ruble", nominal: 1, rate: 157.28, diff: 0.46 },
      { as_of_date: "2026-05-23", code: "CNY", numeric_code: "156", name: "Chinese Yuan", nominal: 1, rate: 1778.62, diff: 3.11 },
      { as_of_date: "2026-05-23", code: "GBP", numeric_code: "826", name: "Pound Sterling", nominal: 1, rate: 16382.2, diff: -24.7 },
      { as_of_date: "2026-05-23", code: "KZT", numeric_code: "398", name: "Kazakh Tenge", nominal: 1, rate: 25.4, diff: 0.03 }
    ],
    gold: [
      { as_of_date: "2026-05-23", weight_grams: 5, sell_price_uzs: 6238000, buyback_intact_uzs: 5987000, buyback_damaged_uzs: 5869000 },
      { as_of_date: "2026-05-23", weight_grams: 10, sell_price_uzs: 12476000, buyback_intact_uzs: 11974000, buyback_damaged_uzs: 11738000 },
      { as_of_date: "2026-05-23", weight_grams: 20, sell_price_uzs: 24952000, buyback_intact_uzs: 23948000, buyback_damaged_uzs: 23476000 }
    ],
    policy: { as_of_date: "2026-05-23", value_percent: 14, source_url: "https://cbu.uz/en/monetary-policy/refinancing-rate/" },
    publications: [{ title: "Central Bank review PDF publications will appear here after the first cron run.", url: "https://cbu.uz/en/press_center/reviews/", section: "Reviews" }],
    news: [{ title: "Finance news will be filtered for Uzbekistan macroeconomics and banking after deployment.", url: "https://www.gazeta.uz/ru/rss/", source: "System", publishedAt: null, summary: null, relevance: "fallback" }]
  };
}

async function getDashboardData(): Promise<DashboardData> {
  try {
    const supabase = getSupabaseAdmin();
    const [ratesResult, goldResult, policyResult, publicationsResult, newsResult] = await Promise.allSettled([
      supabase.from("exchange_rates").select("*").order("as_of_date", { ascending: false }).order("code").limit(150),
      supabase.from("gold_prices").select("*").order("as_of_date", { ascending: false }).order("weight_grams").limit(20),
      supabase.from("policy_rates").select("*").order("as_of_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("cbu_publications").select("*").order("detected_at", { ascending: false }).limit(8),
      aggregateRelevantNews()
    ]);
    const allRates = ratesResult.status === "fulfilled" ? ratesResult.value.data ?? [] : [];
    const latestRateDate = allRates[0]?.as_of_date;
    const rates = allRates.filter((rate) => rate.as_of_date === latestRateDate);
    const allGold = goldResult.status === "fulfilled" ? goldResult.value.data ?? [] : [];
    const latestGoldDate = allGold[0]?.as_of_date;
    const gold = allGold.filter((row) => row.as_of_date === latestGoldDate);
    return {
      isSample: rates.length === 0,
      rates: rates.length ? (rates as RateRow[]) : sampleData().rates,
      gold: gold.length ? (gold as GoldRow[]) : sampleData().gold,
      policy: policyResult.status === "fulfilled" && policyResult.value.data ? (policyResult.value.data as PolicyRow) : sampleData().policy,
      publications: publicationsResult.status === "fulfilled" && publicationsResult.value.data?.length ? (publicationsResult.value.data as PublicationRow[]) : sampleData().publications,
      news: newsResult.status === "fulfilled" && newsResult.value.length ? newsResult.value : sampleData().news
    };
  } catch {
    return sampleData();
  }
}

function Change({ value }: { value: number | null }) {
  const isUp = (value ?? 0) >= 0;
  return <span className={isUp ? "change up" : "change down"}>{isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{money(Math.abs(value ?? 0), 2)}</span>;
}

export default async function Home() {
  const data = await getDashboardData();
  const rateMap = new Map(data.rates.map((rate) => [rate.code, rate]));
  const mainRates = WATCHLIST.map((code) => rateMap.get(code)).filter((rate): rate is RateRow => Boolean(rate));
  const latestDate = data.rates[0]?.as_of_date;
  const goldDate = data.gold[0]?.as_of_date;
  return (
    <main className="terminal">
      <header className="topbar"><div><p className="eyebrow">UZBEKISTAN MARKET MONITOR</p><h1>Finance Terminal</h1></div><div className="status-row">{data.isSample ? <span className="badge warning">Sample mode</span> : <span className="badge live">Live data</span>}<span className="timestamp">Tashkent close: {compactDate(latestDate)}</span></div></header>
      <section className="ticker-strip" aria-label="Exchange rate watchlist">{mainRates.map((rate) => <div className="ticker" key={rate.code}><span>{rate.code}</span><strong>{money(rate.rate, 2)}</strong><Change value={rate.diff} /></div>)}</section>
      <section className="grid">
        <div className="panel wide"><div className="panel-head"><div><p className="eyebrow">CBU DAILY FIXING</p><h2>Exchange Rates</h2></div><Banknote size={18} /></div><div className="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Nominal</th><th>UZS</th><th>Diff</th></tr></thead><tbody>{data.rates.slice(0, 18).map((rate) => <tr key={rate.code}><td className="mono">{rate.code}</td><td>{rate.name}</td><td>{rate.nominal}</td><td className="number">{money(rate.rate, 2)}</td><td><Change value={rate.diff} /></td></tr>)}</tbody></table></div></div>
        <div className="panel"><div className="panel-head"><div><p className="eyebrow">MONETARY POLICY</p><h2>Policy Rate</h2></div><Landmark size={18} /></div><div className="hero-metric"><strong>{data.policy ? `${money(data.policy.value_percent, 2)}%` : "-"}</strong><span>{compactDate(data.policy?.as_of_date)}</span></div><a className="source-link" href={data.policy?.source_url ?? "https://cbu.uz/en/monetary-policy/refinancing-rate/"} target="_blank">CBU source</a></div>
        <div className="panel"><div className="panel-head"><div><p className="eyebrow">GOLD BARS</p><h2>CBU Prices</h2></div><Activity size={18} /></div><p className="subtle">{compactDate(goldDate)}</p><div className="mini-table">{data.gold.map((row) => <div className="mini-row" key={row.weight_grams}><span>{row.weight_grams}g</span><strong>{money(row.sell_price_uzs, 0)}</strong><small>buyback {money(row.buyback_intact_uzs, 0)}</small></div>)}</div></div>
        <div className="panel tall"><div className="panel-head"><div><p className="eyebrow">FILTERED FLOW</p><h2>Macro & Banking News</h2></div><Newspaper size={18} /></div><div className="feed">{data.news.map((item) => <a href={item.url} className="feed-item" target="_blank" key={`${item.source}-${item.url}`}><span>{item.source}</span><strong>{item.title}</strong><small>{item.relevance}</small></a>)}</div></div>
        <div className="panel tall"><div className="panel-head"><div><p className="eyebrow">CBU PUBLICATIONS</p><h2>PDF Tracker</h2></div><FileText size={18} /></div><div className="feed compact">{data.publications.map((item) => <a href={item.url} className="feed-item" target="_blank" key={item.url}><span>{item.section}</span><strong>{item.title}</strong><small>{item.detected_at ? compactDate(item.detected_at) : "detected after cron"}</small></a>)}</div></div>
      </section>
    </main>
  );
}
