import * as cheerio from "cheerio";

export type CbuPublication = {
  title: string;
  url: string;
  section: string;
  published_at: string | null;
};

const SECTIONS = [
  { section: "Press Center", url: "https://cbu.uz/en/press_center/" },
  { section: "Reviews", url: "https://cbu.uz/en/press_center/reviews/" }
];

async function fetchHtml(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "UzbekistanFinanceDashboard/1.0" }, next: { revalidate: 900 } });
  if (!response.ok) throw new Error(`CBU publication fetch failed: ${url} ${response.status}`);
  return response.text();
}

function extractPdfLinks(html: string, baseUrl: string, section: string): CbuPublication[] {
  const $ = cheerio.load(html);
  return $("a[href*='.pdf']")
    .map((_, link) => {
      const href = $(link).attr("href");
      if (!href) return null;
      const title = $(link).text().replace(/\s+/g, " ").trim() || $(link).closest("article, li, .news, .item").text().replace(/\s+/g, " ").trim() || "CBU PDF publication";
      return { title: title.slice(0, 240), url: new URL(href, baseUrl).toString(), section, published_at: null };
    })
    .get()
    .filter((item): item is CbuPublication => Boolean(item));
}

export async function fetchCbuPublications() {
  const publications: CbuPublication[] = [];
  for (const entry of SECTIONS) {
    const html = await fetchHtml(entry.url);
    publications.push(...extractPdfLinks(html, entry.url, entry.section));
    const $ = cheerio.load(html);
    const articleLinks = $("a[href]")
      .map((_, link) => new URL($(link).attr("href") ?? "", entry.url).toString())
      .get()
      .filter((url) => url.startsWith("https://cbu.uz/") && !url.endsWith(".pdf"))
      .slice(0, 15);
    const nested = await Promise.allSettled(articleLinks.map(async (url) => extractPdfLinks(await fetchHtml(url), url, entry.section)));
    publications.push(...nested.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
  }
  return Array.from(new Map(publications.map((publication) => [publication.url, publication])).values()).slice(0, 30);
}
