# Uzbekistan Finance Dashboard

Production starter for a dark, dense Uzbekistan finance dashboard built with Next.js, Supabase, and Vercel Cron Jobs.

## File Structure

```text
app/
  api/
    fetch-rates/route.ts      Daily CBU updater for rates, gold, policy rate, and PDFs
    news/route.ts             News aggregator endpoint
    publications/route.ts     Live CBU PDF tracker endpoint
  globals.css                 Dark terminal UI styling
  layout.tsx                  SEO metadata and app shell
  page.tsx                    Dashboard UI
lib/
  cbu.ts                      CBU exchange-rate, gold-price, and policy-rate collectors
  news.ts                     RSS/scraper aggregator plus LLM relevance filter
  publications.ts             CBU Press Center and Reviews PDF scanner
  supabase-admin.ts           Server-only Supabase client
  time.ts                     Date and number normalization helpers
supabase/
  schema.sql                  Database tables and indexes
vercel.json                   Daily 09:00 Tashkent cron schedule
.env.example                  Environment variable template
```

## Setup Steps

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. Copy `.env.example` to `.env.local`.
5. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
   - optional `OPENAI_API_KEY` for LLM news filtering
6. Run the first update by visiting:

```text
https://your-domain.vercel.app/api/fetch-rates?secret=YOUR_CRON_SECRET
```

## Daily Automation

`vercel.json` contains:

```json
{
  "crons": [
    {
      "path": "/api/fetch-rates",
      "schedule": "0 4 * * *"
    }
  ]
}
```

Vercel cron schedules are UTC. Tashkent is UTC+5, so `04:00 UTC` equals `09:00 Asia/Tashkent`.

## Main API Function

The production updater lives at:

```text
app/api/fetch-rates/route.ts
```

It:

- checks `CRON_SECRET`
- fetches CBU exchange rates from the official JSON feed
- scrapes CBU gold bar selling and buyback prices
- reads CBU policy-rate dynamics from the XLSX file linked on the policy-rate page
- scans CBU Press Center and Reviews for PDFs
- upserts everything into Supabase

## UI

The dashboard UI lives at:

```text
app/page.tsx
app/globals.css
```

It uses a dark, high-density trading-terminal layout with:

- currency watchlist strip
- daily exchange-rate table
- policy-rate tile
- gold bar table
- macro and banking news feed
- CBU PDF tracker

## Vercel Deployment Click Path

1. Push this folder to a GitHub repository.
2. Go to `https://vercel.com/dashboard`.
3. Click `Add New...`.
4. Click `Project`.
5. Under `Import Git Repository`, find your repository and click `Import`.
6. In `Configure Project`, keep `Framework Preset` as `Next.js`.
7. Open `Environment Variables`.
8. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
   - `OPENAI_API_KEY` if you want LLM filtering
   - `LLM_MODEL` set to `gpt-4.1-mini` or your preferred model
9. Click `Deploy`.
10. After deployment finishes, open your project.
11. Click `Settings`.
12. Click `Cron Jobs` to confirm `/api/fetch-rates` is listed.
13. Trigger the first run manually with `/api/fetch-rates?secret=YOUR_CRON_SECRET`.

## News Sources

Default sources are:

- Gazeta.uz RSS
- Kun.uz RSS with finance-page scrape fallback
- Reuters Central Asia via Google News RSS query fallback

You can override them by setting `NEWS_FEEDS_JSON` to:

```json
[
  { "source": "Gazeta.uz", "url": "https://www.gazeta.uz/ru/rss/" },
  { "source": "Kun.uz Finance", "url": "https://kun.uz/news/rss" }
]
```
