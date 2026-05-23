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
5. Fill in `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET`.
6. Optionally add `OPENAI_API_KEY` for LLM news filtering.
7. Run the first update by visiting `/api/fetch-rates?secret=YOUR_CRON_SECRET` on your deployed domain.

## Vercel Deployment Click Path

1. Go to `https://vercel.com/dashboard`.
2. Click `Add New...`.
3. Click `Project`.
4. Under `Import Git Repository`, find this repository and click `Import`.
5. Keep `Framework Preset` as `Next.js`.
6. Add the environment variables from `.env.example`.
7. Click `Deploy`.
8. Open `Settings` -> `Cron Jobs` and confirm `/api/fetch-rates` is listed.

Vercel cron schedules are UTC. `0 4 * * *` runs at 09:00 in Tashkent.
