import * as cheerio from "cheerio";
import * as XLSX from "xlsx";
import { normalizeDateToIso, parseNumber, parseUzs, tashkentTodayIso } from "@/lib/time";

export const CBU_RATES_URL = "https://cbu.uz/ru/arkhiv-kursov-valyut/json/";
export const CBU_GOLD_URL = "https://cbu.uz/en/banknotes-coins/gold-bars/prices/";
export const CBU_POLICY_RATE_URL = "https://cbu.uz/en/monetary-policy/refinancing-rate/";

type CbuRateRow = {
  id?: number;
  Code?: string;
  Ccy?: string;
  CcyNm_EN?: string;
  Nominal?: string;
  Rate?: string;
  Diff?: string;
  Date?: string;
};

export type ExchangeRateRecord = {
  as_of_date: string;
  code: string;
  numeric_code: string | null;
  name: string | null;
  nominal: number;
  rate: number;
  diff: number | null;
  raw: CbuRateRow;
};

export type GoldPriceRecord = {
  as_of_date: string;
  weight_grams: number;
  sell_price_uzs: number | null;
  buyback_intact_uzs: number | null;
  buyback_damaged_uzs: number | null;
  source_url: string;
  raw: Record<string, unknown>;
};

export type PolicyRateRecord = {
  as_of_date: string;
  value_percent: number;
  source_url: string;
  raw: Record<string, unknown>;
};

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "UzbekistanFinanceDashboard/1.0" },
    next: { revalidate: 0 }
  });

  if (!response.ok) throw new Error(`Fetch failed for ${url}: ${response.status}`);
  return response.text();
}

export async function fetchExchangeRates(dateIso?: string): Promise<ExchangeRateRecord[]> {
  const url = dateIso ? `https://cbu.uz/ru/arkhiv-kursov-valyut/json/all/${dateIso}/` : CBU_RATES_URL;
  const response = await fetch(url, {
    headers: { "User-Agent": "UzbekistanFinanceDashboard/1.0" },
    next: { revalidate: 0 }
  });

  if (!response.ok) throw new Error(`CBU rates request failed: ${response.status}`);
  const rows = (await response.json()) as CbuRateRow[];

  return rows
    .map((row) => ({
      as_of_date: normalizeDateToIso(row.Date),
      code: String(row.Ccy ?? "").trim(),
      numeric_code: row.Code ? String(row.Code) : null,
      name: row.CcyNm_EN ?? null,
      nominal: parseUzs(row.Nominal) ?? 1,
      rate: parseNumber(row.Rate) ?? 0,
      diff: parseNumber(row.Diff),
      raw: row
    }))
    .filter((row) => row.code && row.rate > 0);
}

export async function fetchGoldPrices(): Promise<GoldPriceRecord[]> {
  const html = await fetchText(CBU_GOLD_URL);
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const updateMatch = text.match(/Update date:\s*([0-9A-Za-z ,:.]+)/);
  const asOfDate = normalizeDateToIso(updateMatch?.[1], tashkentTodayIso());

  const tableRows = $("tr")
    .map((_, row) =>
      $(row)
        .find("td, th")
        .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
        .get()
    )
    .get()
    .filter((row): row is string[] => Array.isArray(row) && row.some(Boolean));

  const fromTable = tableRows
    .map((cells) => {
      const joined = cells.join(" ");
      const weight = parseUzs(joined.match(/(\d+)\s*grams/i)?.[1]);
      if (!weight) return null;
      const prices = cells.map(parseUzs).filter((value): value is number => value !== null && value > 1000);
      if (prices.length < 3) return null;
      return {
        as_of_date: asOfDate,
        weight_grams: weight,
        sell_price_uzs: prices[0],
        buyback_intact_uzs: prices[1],
        buyback_damaged_uzs: prices[2],
        source_url: CBU_GOLD_URL,
        raw: { cells }
      };
    })
    .filter((row): row is GoldPriceRecord => Boolean(row));

  if (fromTable.length > 0) return fromTable;

  const regex = /(\d+)\s+grams\s+([\d\s]+)\s+uzs\s+([\d\s]+)\s+uzs\s+([\d\s]+)\s+uzs/gi;
  return [...text.matchAll(regex)].map((match) => ({
    as_of_date: asOfDate,
    weight_grams: parseUzs(match[1]) ?? 0,
    sell_price_uzs: parseUzs(match[2]),
    buyback_intact_uzs: parseUzs(match[3]),
    buyback_damaged_uzs: parseUzs(match[4]),
    source_url: CBU_GOLD_URL,
    raw: { match: match[0] }
  }));
}

function excelDateToIso(value: unknown) {
  if (typeof value === "number" && value > 20000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  return normalizeDateToIso(value, "");
}

export async function fetchPolicyRate(): Promise<PolicyRateRecord | null> {
  const html = await fetchText(CBU_POLICY_RATE_URL);
  const $ = cheerio.load(html);
  const xlsxHref = $("a[href$='.xlsx']").first().attr("href");

  if (xlsxHref) {
    const sourceUrl = new URL(xlsxHref, CBU_POLICY_RATE_URL).toString();
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": "UzbekistanFinanceDashboard/1.0" },
      next: { revalidate: 0 }
    });

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const candidates = rows
        .map((row) => {
          const date = row.map(excelDateToIso).find(Boolean);
          const rate = row.map(parseNumber).find((value): value is number => value !== null && value > 0 && value < 100);
          return date && rate ? { date, rate, row } : null;
        })
        .filter((row): row is { date: string; rate: number; row: unknown[] } => Boolean(row));
      const latest = candidates.at(-1);
      if (latest) return { as_of_date: latest.date, value_percent: latest.rate, source_url: sourceUrl, raw: { row: latest.row } };
    }
  }

  const bodyText = $("body").text().replace(/\s+/g, " ");
  const fallback = bodyText.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
  const value = parseNumber(fallback?.[1]);
  return value ? { as_of_date: tashkentTodayIso(), value_percent: value, source_url: CBU_POLICY_RATE_URL, raw: { fallback: true } } : null;
}
