import { supabase } from "../supabaseClient";
import { fetchAllRows } from "./fetchAll";

// College Basketball's own data layer — mirrors src/lib/api/ratingSystems.ts
// (CFB) in shape, but reads/writes the cbb_teams / cbb_rating_pulls tables
// via api/cbb.ts instead. Kept separate rather than generalizing the two
// sports behind one set of functions: the CFB side has a static
// data/teams.ts roster and a much larger action surface, and forcing both
// sports through one abstraction now would make either harder to change
// independently later.

export interface CbbTeamRow {
  cbbdId: number;
  school: string;
  conference: string | null;
}

export async function fetchCbbTeams(): Promise<CbbTeamRow[]> {
  const rows = await fetchAllRows<any>((from, to) =>
    supabase.from("cbb_teams").select("cbbd_id, school, conference").order("id").range(from, to)
  );
  return rows.map((r) => ({ cbbdId: r.cbbd_id, school: r.school, conference: r.conference ?? null }));
}

export interface CbbRatingPullRow {
  systemKey: string;
  team: string;
  conference: string | null;
  value: number;
  pulledAt: string;
}

export async function fetchCbbRatingPulls(): Promise<CbbRatingPullRow[]> {
  const rows = await fetchAllRows<any>((from, to) =>
    supabase.from("cbb_rating_pulls").select("system_key, team, conference, value, pulled_at").order("id").range(from, to)
  );
  return rows.map((r) => ({ systemKey: r.system_key, team: r.team, conference: r.conference ?? null, value: Number(r.value), pulledAt: r.pulled_at }));
}

// Every CBB server call goes through one consolidated endpoint
// (api/cbb.ts) — same reasoning as the CFB side's ratings.ts: Vercel
// Hobby's 12-function cap.
function authedPost(action: string, body: Record<string, any>) {
  const password = sessionStorage.getItem("admin_password") ?? "";
  return fetch("/api/cbb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, action, ...body }),
  }).then(async (res) => {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  });
}

export function syncCbbTeams() {
  return authedPost("syncTeams", {});
}

export function syncCbbdRatings(season: number) {
  return authedPost("syncCbbdRatings", { season });
}

export interface CbbRatingSaveRow {
  team: string;
  conference?: string | null;
  values: Record<string, number>;
}

export function saveCbbRatingRows(rows: CbbRatingSaveRow[]) {
  return authedPost("save", { rows });
}
