import { createClient } from "@supabase/supabase-js";

// College Basketball's own consolidated endpoint — this app's ONLY
// serverless function. Originally lived inside the main YCPR (CFB) repo
// as api/cbb.ts there too, but moved into its own repo/Vercel project so
// it gets a fresh 12-function Hobby budget instead of sharing the CFB
// site's (already-full) one. Action-dispatched from a single file the
// same way the CFB side's api/ratings.ts is, though there's no longer a
// function-count reason to keep everything in one file here — kept this
// way for now just to port over cleanly; feel free to split it up.

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const CBBD_API_KEY = process.env.CBBD_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CBBD_BASE = "https://api.collegebasketballdata.com";

async function cbbdFetch(path: string) {
  const res = await fetch(`${CBBD_BASE}${path}`, {
    headers: { Authorization: `Bearer ${CBBD_API_KEY}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CBBD request failed (${res.status}) for ${path}: ${text || res.statusText}`);
  }
  return res.json();
}

function dedupeByKey<T>(rows: T[], keyOf: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(keyOf(row), row);
  return Array.from(byKey.values());
}

interface IncomingSaveRow {
  team: string;
  conference?: string | null;
  values: Record<string, number>;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ error: "ADMIN_PASSWORD is not configured on the server" });
    return;
  }

  const { password, action } = req.body ?? {};
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  // This standalone app has no separate admin-save.ts — the password
  // gate (src/pages/PasswordGate.tsx) checks against this action instead.
  if (action === "checkPassword") {
    res.status(200).json({ ok: true });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Supabase server env vars are not configured" });
    return;
  }
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // -----------------------------------------------------------------
  // action: "syncTeams" — pulls CBBD's own team list (the canonical
  // roster every other system's team names get matched against — see
  // src/lib/cbbTeamNameMatch.ts) plus each team's current conference.
  // No FBS/FCS-style division split here — CBBD's /teams FILTERED BY
  // SEASON is already just the current D1 field (364 teams, verified).
  //
  // Bug fixed here: /teams with NO season param returns CBBD's entire
  // historical roster across every division it has ever tracked
  // (1500+ teams — D1, D2, D3, NAIA, disbanded programs, the works),
  // not just this season's D1 slate. That set has real duplicate
  // `school` values (mostly small D3 schools CBBD has two historical
  // entries for, e.g. "Holy Cross" under two different ids), which the
  // whole batch upsert then failed on outright (Postgres rejects the
  // entire upsert on any single unique-constraint violation — nothing
  // landed, not even the valid rows). Scoping to ?season= fixes this at
  // the source; the dedupe-by-school below is a second line of defense
  // in case CBBD ever reintroduces a dup within one season's own list.
  // -----------------------------------------------------------------
  if (action === "syncTeams") {
    if (!CBBD_API_KEY) {
      res.status(500).json({ error: "CBBD_API_KEY is not configured on the server" });
      return;
    }
    const { season } = req.body ?? {};
    if (!season || typeof season !== "number") {
      res.status(400).json({ error: "Missing or invalid 'season'" });
      return;
    }
    try {
      const teams = await cbbdFetch(`/teams?season=${season}`);
      const byId = new Map<number, any>();
      for (const t of teams ?? []) {
        if (t.id == null || !t.school) continue;
        byId.set(t.id, {
          cbbd_id: t.id,
          school: t.school,
          conference: t.conference ?? null,
          updated_at: new Date().toISOString(),
        });
      }
      // Last-one-wins on `school` too — belt and suspenders against the
      // exact failure mode above, so a stray dup degrades to "one of the
      // two got skipped" instead of "the whole sync saved nothing."
      const bySchool = new Map<string, any>();
      for (const r of byId.values()) bySchool.set(r.school, r);
      const rows = Array.from(bySchool.values());
      if (rows.length === 0) throw new Error("CBBD returned 0 teams");

      const { error, count } = await supabaseAdmin.from("cbb_teams").upsert(rows, { onConflict: "cbbd_id", count: "exact" });
      if (error) throw error;

      res.status(200).json({ ok: true, teamsUpserted: count ?? rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Team sync failed" });
    }
    return;
  }

  // -----------------------------------------------------------------
  // action: "syncCbbdRatings" — SRS and Elo, straight from CBBD, joined
  // to cbb_teams by CBBD's own numeric team id (both endpoints and
  // /teams share the same id space — confirmed directly, e.g. Duke is
  // id 72 in both /teams and /ratings/srs's teamId) rather than by
  // matching team-name strings, since CBBD is internally consistent
  // with itself. Kept on CBBD's own native higher-is-better scale — no
  // reason to force this onto the CFB site's negative-is-better
  // convention when CBB has no such convention of its own yet.
  // -----------------------------------------------------------------
  if (action === "syncCbbdRatings") {
    if (!CBBD_API_KEY) {
      res.status(500).json({ error: "CBBD_API_KEY is not configured on the server" });
      return;
    }
    const { season } = req.body ?? {};
    if (!season || typeof season !== "number") {
      res.status(400).json({ error: "Missing or invalid 'season'" });
      return;
    }
    try {
      const { data: teamRows, error: teamsError } = await supabaseAdmin.from("cbb_teams").select("cbbd_id, school, conference");
      if (teamsError) throw teamsError;
      const teamById = new Map((teamRows ?? []).map((t: any) => [t.cbbd_id, t]));
      if (teamById.size === 0) throw new Error("cbb_teams is empty — run Sync Teams first");

      const [srsRaw, eloRaw] = await Promise.all([
        cbbdFetch(`/ratings/srs?season=${season}`),
        cbbdFetch(`/ratings/elo?season=${season}`),
      ]);

      const results: Record<string, { fetched: number; matched: number; saved: number }> = {};
      const now = new Date().toISOString();

      async function saveSystem(systemKey: string, raw: any[], valueField: string) {
        const fetched = raw?.length ?? 0;
        const upsertRows: any[] = [];
        for (const r of raw ?? []) {
          const team = teamById.get(r.teamId);
          if (!team || r[valueField] == null) continue;
          upsertRows.push({
            system_key: systemKey,
            team: team.school,
            conference: team.conference,
            value: r[valueField],
            pulled_at: now,
          });
        }
        const deduped = dedupeByKey(upsertRows, (r) => `${r.system_key}::${r.team}`);
        if (deduped.length === 0) {
          results[systemKey] = { fetched, matched: 0, saved: 0 };
          return;
        }
        const { error, count } = await supabaseAdmin
          .from("cbb_rating_pulls")
          .upsert(deduped, { onConflict: "system_key,team", count: "exact" });
        if (error) throw error;
        results[systemKey] = { fetched, matched: deduped.length, saved: count ?? deduped.length };
      }

      await saveSystem("srs", srsRaw, "rating");
      await saveSystem("elo", eloRaw, "elo");

      res.status(200).json({ ok: true, season, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "CBBD ratings sync failed" });
    }
    return;
  }

  // -----------------------------------------------------------------
  // action: "scrapedProxy" — three sources confirmed scrapable via a
  // plain server-side fetch (no bot-block, no JS-rendered data):
  //   - TeamRankings' own Predictive rating page (server-rendered table)
  //   - D-Ratings' NCAA ratings page (Standard + Inference columns)
  //   - Wilson's ratings, hosted at talismanred.com (NOT masseyratings.com
  //     — Wilson has his own page there, confirmed live)
  // Massey/Massey Composite (Cloudflare-walled), Bart Torvik (JS
  // verification wall), Haslametrics (ships an empty table skeleton,
  // populated by JS with no visible data endpoint), and ESPN BPI (blocks
  // plain fetches outright) were all checked and are NOT scrapable this
  // way — don't add them here without a real headless-browser approach.
  //
  // Raw parsed data only, same as CBBD teams/ratings above — matching
  // against cbb_teams (mascot-suffixed names for D-Ratings need the
  // matcher's matchSchoolMascotName) and saving happens client-side.
  // -----------------------------------------------------------------
  if (action === "scrapedProxy") {
    try {
      const [trHtml, drHtml, wilHtml] = await Promise.all([
        fetch("https://www.teamrankings.com/ncaa-basketball/ranking/predictive-by-other", {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" },
        }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`TeamRankings fetch failed (${r.status})`)))),
        fetch("https://www.dratings.com/sports/ncaa-college-basketball-ratings/", {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" },
        }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`D-Ratings fetch failed (${r.status})`)))),
        fetch("https://talismanred.com/ratings/hoops/rankings2.shtml", {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" },
        }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Wilson (TalismanRed) fetch failed (${r.status})`)))),
      ]);

      // TeamRankings: <td class="nowrap" data-sort="TEAM">...</td> for
      // the team cell (clean name, no need to strip the "(W-L)" suffix
      // shown in the link text), then the third <td> is the rating.
      function parseTeamRankings(html: string): { team: string; value: number }[] {
        const out: { team: string; value: number }[] = [];
        const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch: RegExpExecArray | null;
        while ((rowMatch = rowRe.exec(html))) {
          const row = rowMatch[1];
          const teamMatch = row.match(/class="nowrap" data-sort="([^"]+)"/);
          if (!teamMatch) continue;
          const cells: string[] = [];
          const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let cellMatch: RegExpExecArray | null;
          while ((cellMatch = cellRe.exec(row))) cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
          if (cells.length < 3) continue;
          const value = parseFloat(cells[2]);
          if (!Number.isNaN(value)) out.push({ team: teamMatch[1], value });
        }
        return out;
      }

      // D-Ratings: 7 <td> per row — team (inside an <a>, "School
      // Mascot" format, e.g. "Michigan Wolverines"), Overall, Change,
      // SOS, Standard, Inference, Vegas. Each of the last four cells
      // carries a trailing "(rank)" badge after the number.
      function parseDRatings(html: string): { team: string; standard: number; inference: number }[] {
        const out: { team: string; standard: number; inference: number }[] = [];
        const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch: RegExpExecArray | null;
        while ((rowMatch = rowRe.exec(html))) {
          const row = rowMatch[1];
          const teamMatch = row.match(/<a[^>]*>([^<]+)<\/a>/);
          if (!teamMatch) continue;
          const cells: string[] = [];
          const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let cellMatch: RegExpExecArray | null;
          while ((cellMatch = cellRe.exec(row))) cells.push(cellMatch[1].replace(/<[^>]+>/g, " ").trim());
          if (cells.length < 6) continue;
          const standard = parseFloat(cells[4]);
          const inference = parseFloat(cells[5]);
          if (!Number.isNaN(standard) && !Number.isNaN(inference)) {
            out.push({ team: teamMatch[1].trim(), standard, inference });
          }
        }
        return out;
      }

      // Wilson (talismanred.com): plain <td> cells, team name already
      // bare (no mascot suffix) — Rank, Team, W, L, Rating, ...
      function parseWilson(html: string): { team: string; value: number }[] {
        const out: { team: string; value: number }[] = [];
        const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch: RegExpExecArray | null;
        while ((rowMatch = rowRe.exec(html))) {
          const row = rowMatch[1];
          const cells: string[] = [];
          const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let cellMatch: RegExpExecArray | null;
          while ((cellMatch = cellRe.exec(row))) cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
          if (cells.length < 5 || !/^\d+$/.test(cells[0])) continue; // header/section rows
          const value = parseFloat(cells[4]);
          if (cells[1] && !Number.isNaN(value)) out.push({ team: cells[1], value });
        }
        return out;
      }

      const trRows = parseTeamRankings(trHtml);
      const drRows = parseDRatings(drHtml);
      const wilRows = parseWilson(wilHtml);
      if (trRows.length === 0 && drRows.length === 0 && wilRows.length === 0) {
        throw new Error("Parsed 0 rows from all three sources — a page layout may have changed");
      }

      const byTeam = new Map<string, { team: string; values: Record<string, number> }>();
      function upsert(team: string, key: string, value: number) {
        const existing = byTeam.get(team) ?? { team, values: {} };
        existing.values[key] = value;
        byTeam.set(team, existing);
      }
      for (const r of trRows) upsert(r.team, "teamrankings", r.value);
      for (const r of drRows) {
        upsert(r.team, "dratings_standard", r.standard);
        upsert(r.team, "dratings_inference", r.inference);
      }
      for (const r of wilRows) upsert(r.team, "wilson", r.value);

      res.status(200).json({
        ok: true,
        rows: Array.from(byTeam.values()),
        counts: { teamrankings: trRows.length, dratings: drRows.length, wilson: wilRows.length },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Scraped ratings fetch failed" });
    }
    return;
  }

  // -----------------------------------------------------------------
  // action: "save" — generic save for any non-CBBD-API system (Massey
  // CSV upload, and whatever gets added after it). Matching against
  // cbb_teams happens client-side (src/lib/cbbTeamNameMatch.ts), same
  // division of labor as the CFB side's ratings.ts "save" action — this
  // just upserts whatever team names already resolved to canonical ones.
  // Same per-system "X/X updated (N unchanged)" diff as the CFB side.
  // -----------------------------------------------------------------
  if (action === "save") {
    const { rows } = req.body ?? {};
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "Missing or empty 'rows'" });
      return;
    }

    const now = new Date().toISOString();
    const upsertRows: any[] = [];
    for (const row of rows as IncomingSaveRow[]) {
      if (!row.team || !row.values) continue;
      for (const [systemKey, value] of Object.entries(row.values)) {
        if (value == null || Number.isNaN(value)) continue;
        upsertRows.push({
          system_key: systemKey,
          team: row.team,
          conference: row.conference ?? null,
          value,
          pulled_at: now,
        });
      }
    }
    if (upsertRows.length === 0) {
      res.status(400).json({ error: "No usable (non-null) values in 'rows'" });
      return;
    }

    const deduped = dedupeByKey(upsertRows, (r) => `${r.system_key}::${r.team}`);

    const systemKeys = Array.from(new Set(deduped.map((r) => r.system_key)));
    const { data: existingRows } = await supabaseAdmin
      .from("cbb_rating_pulls")
      .select("system_key, team, value")
      .in("system_key", systemKeys);
    const existingByKey = new Map((existingRows ?? []).map((r: any) => [`${r.system_key}::${r.team}`, Number(r.value)]));

    const bySystem: Record<string, { total: number; changed: number; unchanged: number; newTeams: number }> = {};
    for (const r of deduped) {
      const stats = (bySystem[r.system_key] ??= { total: 0, changed: 0, unchanged: 0, newTeams: 0 });
      stats.total++;
      const old = existingByKey.get(`${r.system_key}::${r.team}`);
      if (old == null) stats.newTeams++;
      else if (Math.abs(r.value - old) < 0.005) stats.unchanged++;
      else stats.changed++;
    }

    const { error, count } = await supabaseAdmin
      .from("cbb_rating_pulls")
      .upsert(deduped, { onConflict: "system_key,team", count: "exact" });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true, saved: count ?? deduped.length, bySystem });
    return;
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
}
