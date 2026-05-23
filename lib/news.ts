import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  summary: string | null;
  relevance: "macroeconomics" | "banking" | "both" | "fallback";
};

const DEFAULT_FEEDS = [
  { source: "Gazeta.uz", url: "https://www.gazeta.uz/ru/rss/" },
  { source: "Kun.uz Finance", url: "https://kun.uz/news/rss" },
  {
    source: "Reuters Central Asia",
    url: "https://news.google.com/rss/search?q=site%3Areuters.com%20%28Uzbekistan%20OR%20%22Central%20Asia%22%29%20%28banking%20OR%20central%20bank%20OR%20inflation%20OR%20economy%29&hl=en-US&gl=US&ceid=US%3Aen"
  }
];

const KEYWORDS = ["bank", "banking", "central bank", "cbu", "monetary", "policy rate", "refinancing", "inflation", "currency", "exchange rate", "macroeconomic", "gdp", "budget", "debt", "credit", "loan", "deposit", "uzbekistan", "uzbek", "sum", "soum", "so'm", "iqtisod", "moliya", "markaziy bank", "inflyatsiya", "kredit", "valyuta"];

function configuredFeeds() {
  if (!process.env.NEWS_FEEDS_JSON) return DEFAULT_FEEDS;
  try {
    const parsed = JSON.parse(process.env.NEWS_FEEDS_JSON);
    if (Array.isArray(parsed) && parsed.every((item) => item?.source && item?.url)) return parsed as typeof DEFAULT_FEEDS;
  } catch {
    return DEFAULT_FEEDS;
  }
  return DEFAULT_FEEDS;
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "UzbekistanFinanceDashboard/1.0" }, next: { revalidate: 900 } });
  if (!response.ok) throw new Error(`Feed failed: ${url} ${response.status}`);
  return response.text();
}

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeRssItems(xml: string, source: string): NewsItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const parsed = parser.parse(xml);
  const channelItems = arrayify(parsed?.rss?.channel?.item);
  const atomItems = arrayify(parsed?.feed?.entry);
  const items = channelItems.length > 0 ? channelItems : atomItems;

  return items.slice(0, 20).map((item: any) => {
    const link = typeof item.link === "string" ? item.link : item.link?.href;
    return {
      title: String(item.title ?? "").replace(/\s+/g, " ").trim(),
      url: String(link ?? item.guid ?? ""),
      source,
      publishedAt: item.pubDate ?? item.published ?? item.updated ?? null,
      summary: String(item.description ?? item.summary ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || null,
      relevance: "fallback"
    };
  });
}

async function scrapeKunFinance(): Promise<NewsItem[]> {
  const url = "https://kun.uz/news/category/iqtisodiyot";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  return $("a")
    .map((_, link) => {
      const href = $(link).attr("href");
      const title = $(link).text().replace(/\s+/g, " ").trim();
      if (!href || title.length < 20 || !href.includes("/news/")) return null;
      return { title, url: new URL(href, "https://kun.uz").toString(), source: "Kun.uz Finance", publishedAt: null, summary: null, relevance: "fallback" as const };
    })
    .get()
    .filter((item): item is NewsItem => Boolean(item))
    .slice(0, 20);
}

function keywordFilter(items: NewsItem[]) {
  return items.filter((item) => {
    const haystack = `${item.title} ${item.summary ?? ""}`.toLowerCase();
    return KEYWORDS.some((keyword) => haystack.includes(keyword));
  });
}

async function llmFilter(items: NewsItem[]) {
  if (!process.env.OPENAI_API_KEY || items.length === 0) return keywordFilter(items);
  const compact = items.slice(0, 40).map((item, index) => ({ index, title: item.title, summary: item.summary, source: item.source }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gpt-4.1-mini",
      input: [
        { role: "system", content: "Return only JSON. Keep Uzbekistan or Central Asia news relevant to macroeconomics or banking. Reject sport, culture, crime, lifestyle, and generic politics unless clearly tied to fiscal, monetary, currency, bank, credit, inflation, trade, GDP, budget, or financial stability topics." },
        { role: "user", content: JSON.stringify({ items: compact, schema: [{ index: 0, relevance: "macroeconomics|banking|both" }] }) }
      ]
    })
  });
  if (!response.ok) return keywordFilter(items);
  const payload = await response.json();
  const text = payload.output_text ?? payload.output?.[0]?.content?.[0]?.text ?? "[]";
  try {
    const decisions = JSON.parse(text) as { index: number; relevance: NewsItem["relevance"] }[];
    const byIndex = new Map(decisions.map((decision) => [decision.index, decision.relevance]));
    return items.slice(0, 40).filter((_, index) => byIndex.has(index)).map((item, index) => ({ ...item, relevance: byIndex.get(index) ?? "fallback" }));
  } catch {
    return keywordFilter(items);
  }
}

export async function aggregateRelevantNews() {
  const settled = await Promise.allSettled(configuredFeeds().map(async (feed) => normalizeRssItems(await fetchText(feed.url), feed.source)));
  const items = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (!items.some((item) => item.source === "Kun.uz Finance")) {
    try {
      items.push(...(await scrapeKunFinance()));
    } catch {}
  }
  const deduped = Array.from(new Map(items.filter((item) => item.title && item.url).map((item) => [item.url, item])).values());
  const filtered = await llmFilter(deduped);
  return filtered.slice(0, 18);
}
