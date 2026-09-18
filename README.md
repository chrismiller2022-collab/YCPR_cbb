# YCPR — College Basketball

Standalone admin app for College Basketball power ratings. Split out of
the main YCPR (CFB) repo into its own repo/Vercel project so it gets its
own Vercel Hobby 12-serverless-function budget instead of competing with
the CFB site's (already full) one.

Shares the same Supabase project as the main site — `cbb_teams` and
`cbb_rating_pulls` live there, just as their own tables. No data
migration needed; nothing here touches any CFB table.

## Setup

1. **Vercel**: create a new project, import this GitHub repo
   (`YCPR_cbb`). Framework preset: Vite. Build command / output
   directory: defaults are fine (`vite build` / `dist`).
2. **Environment variables** (Vercel project settings → Environment
   Variables) — see `api/env.example` for the full list with comments:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
   - `CBBD_API_KEY`

   The Supabase values are the SAME project as the main YCPR site (same
   `VITE_SUPABASE_URL`/keys) unless you want to split the database too.
3. Deploy. First visit prompts for the admin password, then shows two
   tiles: **Power Ratings** and **College Football** (an external link
   back to the main site).
4. On Power Ratings: **Sync CBBD Teams** first (populates the canonical
   roster + conferences everything else matches against), then **Sync
   CBBD Ratings** for SRS/Elo, then **Upload Massey CSV** once you have
   a real export to test the parser against (unverified — see the
   comment in `src/lib/cbbRatingsCsv.ts`).

## Local dev

```
npm install
npm run dev
```

Needs a `.env` file (gitignored) with the same vars as `api/env.example`
for local Supabase/CBBD access — Vite dev server proxies `/api/*` via
`vercel dev` if you want the serverless functions locally too, or just
point `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` at the real project
and skip local API testing.
