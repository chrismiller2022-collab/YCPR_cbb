import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const missingConfig = !url || !anonKey;

if (missingConfig) {
  // Don't let a missing env var take down the whole app. createClient()
  // throws synchronously if given an empty string, and this module gets
  // imported by several pages (Home, SOS, Resume Ratings, Week Report),
  // so a throw here would blank-screen the entire site rather than just
  // that one page's live-data section. Fall back to a placeholder URL
  // that createClient will accept; the resulting queries will fail at
  // request time instead, which useWeeklyStats/useWeeklyChange already
  // catch and surface as a normal error state.
  console.warn(
    "Supabase env vars are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
      "(see .env.example) in your Vercel project settings. Live weekly data will not " +
      "load until these are set, but the rest of the site will work normally."
  );
}

// This client only ever holds the public anon key, which is safe to ship to
// the browser as long as Row Level Security policies only allow reads (see
// supabase/schema.sql). Writes happen through /api/admin-save using the
// service role key, which never reaches the browser.
export const supabase = createClient(
  missingConfig ? "https://placeholder.supabase.co" : url,
  missingConfig ? "placeholder-anon-key" : anonKey
);

export const supabaseConfigured = !missingConfig;

