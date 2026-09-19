import { useEffect, useMemo, useState } from "react";
import SortHeader from "../components/SortHeader";
import { CBB_RATING_SYSTEMS } from "../lib/cbbRatingSystems";
import { createCbbTeamMatcher } from "../lib/cbbTeamNameMatch";
import { parseCbbMasseyCsv } from "../lib/cbbRatingsCsv";
import {
  fetchCbbTeams,
  fetchCbbRatingPulls,
  syncCbbTeams,
  syncCbbdRatings,
  saveCbbRatingRows,
  fetchScrapedCbbRatings,
  type CbbTeamRow,
  type CbbRatingPullRow,
} from "../lib/api/cbbData";

interface ConglomeratedCbbRow {
  team: string;
  conference: string | null;
  values: Record<string, number>;
}

function fmtNum(v: number | null | undefined, digits = 1): string {
  return v == null || Number.isNaN(v) ? "–" : v.toFixed(digits);
}

function formatDiffNote(bySystem?: Record<string, { total: number; changed: number; unchanged: number; newTeams: number }>): string {
  if (!bySystem) return "";
  const parts = Object.entries(bySystem).map(([key, s]) => {
    const label = CBB_RATING_SYSTEMS.find((sys) => sys.key === key)?.label ?? key;
    const updated = s.changed + s.newTeams;
    return `${label} ${updated}/${s.total} updated (${s.unchanged} unchanged)`;
  });
  return parts.length > 0 ? ` — ${parts.join(", ")}` : "";
}

function SyncControls({ onDataChanged }: { onDataChanged: () => void }) {
  const [year, setYear] = useState(2025);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<{ source: string; names: string[] } | null>(null);

  async function handleSyncTeams() {
    setBusy("teams");
    setLog(null);
    try {
      const result = await syncCbbTeams(year);
      setLog(`Teams — ${result.teamsUpserted} upserted.`);
      onDataChanged();
    } catch (err: any) {
      setLog(err.message ?? "Team sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleSyncCbbdRatings() {
    setBusy("cbbd");
    setLog(null);
    try {
      const result = await syncCbbdRatings(year);
      const parts = Object.entries(result.results).map(
        ([key, r]: [string, any]) => `${key.toUpperCase()}: ${r.saved}/${r.fetched} (${r.matched} matched to a team)`
      );
      setLog(`CBBD ratings (${year}) — ${parts.join("; ")}`);
      onDataChanged();
    } catch (err: any) {
      setLog(err.message ?? "CBBD ratings sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleMasseyUpload(file: File) {
    setBusy("massey");
    setLog(null);
    try {
      const text = await file.text();
      const parsed = parseCbbMasseyCsv(text);
      if (parsed.length === 0) {
        setLog('Parsed 0 rows from this file — check that it still has "Team" and "Pwr" columns with those exact headers.');
        return;
      }
      const teams = await fetchCbbTeams();
      const matcher = createCbbTeamMatcher(teams.map((t) => t.school));
      const { matched, unmatched: um } = matcher.matchTeamRows(parsed, (r) => r.team);
      const teamConfByName = new Map(teams.map((t) => [t.school, t.conference]));
      const rows = matched.map((m) => ({ team: m.team, conference: teamConfByName.get(m.team) ?? null, values: { massey: m.row.value } }));
      const result = await saveCbbRatingRows(rows);
      setLog(`Massey upload — parsed ${parsed.length}, matched ${matched.length}, saved ${result.saved} values.${formatDiffNote(result.bySystem)}`);
      setUnmatched(um.length > 0 ? { source: "Massey CSV", names: um.map((r) => r.team) } : null);
      onDataChanged();
    } catch (err: any) {
      setLog(err.message ?? "Massey upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleSyncScraped() {
    setBusy("scraped");
    setLog(null);
    try {
      const { rows: scraped, counts } = await fetchScrapedCbbRatings();
      if (scraped.length === 0) {
        setLog("Parsed 0 rows from all three sources — a page layout may have changed.");
        return;
      }
      const teams = await fetchCbbTeams();
      const matcher = createCbbTeamMatcher(teams.map((t) => t.school));
      const teamConfByName = new Map(teams.map((t) => [t.school, t.conference]));
      const matchedRows: { team: string; conference: string | null; values: Record<string, number> }[] = [];
      const unmatchedNames: string[] = [];
      for (const r of scraped) {
        const canonical = matcher.matchSchoolMascotName(r.team);
        if (canonical) matchedRows.push({ team: canonical, conference: teamConfByName.get(canonical) ?? null, values: r.values });
        else unmatchedNames.push(r.team);
      }
      const result = await saveCbbRatingRows(matchedRows);
      setLog(
        `Scraped ratings — TeamRankings ${counts.teamrankings}, D-Ratings ${counts.dratings}, Wilson ${counts.wilson} parsed; ` +
          `matched ${matchedRows.length}/${scraped.length} rows, saved ${result.saved} values.${formatDiffNote(result.bySystem)}`
      );
      setUnmatched(unmatchedNames.length > 0 ? { source: "Scraped ratings", names: unmatchedNames } : null);
      onDataChanged();
    } catch (err: any) {
      setLog(err.message ?? "Scraped ratings sync failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ border: "1px solid var(--hash)", borderRadius: 8, padding: "0.9rem 1rem", marginBottom: "1.25rem" }}>
      <div className="section-label" style={{ marginBottom: "0.6rem" }}>
        Pull / upload ratings
      </div>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <button className="menu-btn" onClick={handleSyncTeams} disabled={busy != null}>
          {busy === "teams" ? "Syncing…" : "Sync CBBD Teams"}
        </button>
        <label style={{ fontSize: "0.8rem", color: "var(--chalk-dim)" }}>
          Season{" "}
          <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10) || year)} style={{ width: 70 }} />
        </label>
        <button className="menu-btn" onClick={handleSyncCbbdRatings} disabled={busy != null}>
          {busy === "cbbd" ? "Syncing…" : "Sync CBBD Ratings (SRS + Elo)"}
        </button>
        <button className="menu-btn" onClick={handleSyncScraped} disabled={busy != null} title="TeamRankings Predictive, D-Ratings (Standard/Inference), Wilson">
          {busy === "scraped" ? "Syncing…" : "Sync Scraped (TR / D-Ratings / Wilson)"}
        </button>
        <label className="menu-btn" style={{ cursor: "pointer" }}>
          {busy === "massey" ? "Uploading…" : "Upload Massey CSV"}
          <input
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            disabled={busy != null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleMasseyUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {log && <p style={{ fontSize: "0.8rem", color: "var(--chalk-dim)", marginBottom: 0, whiteSpace: "pre-line" }}>{log}</p>}
      {unmatched && (
        <p style={{ fontSize: "0.78rem", color: "#e0a030", marginTop: "0.4rem" }}>
          {unmatched.source}: {unmatched.names.length} team name(s) couldn't be matched and were skipped —{" "}
          {unmatched.names.join(", ")}
        </p>
      )}
    </div>
  );
}

function ConglomeratedCbbTable({ rows }: { rows: ConglomeratedCbbRow[] }) {
  const [sortKey, setSortKey] = useState("srs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc"); // higher-is-better -> descending shows best first
  const [confFilter, setConfFilter] = useState("");

  const conferences = useMemo(() => Array.from(new Set(rows.map((r) => r.conference).filter(Boolean))).sort() as string[], [rows]);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = rows.filter((r) => !confFilter || r.conference === confFilter);

  const sorted = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      const av = sortKey === "team" || sortKey === "conference" ? a[sortKey] : a.values[sortKey];
      const bv = sortKey === "team" || sortKey === "conference" ? b[sortKey] : b.values[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [filtered, sortKey, sortDir]);

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <select value={confFilter} onChange={(e) => setConfFilter(e.target.value)}>
          <option value="">All conferences</option>
          {conferences.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="table-scroll" style={{ overflowX: "auto", border: "1px solid var(--hash)", borderRadius: 8, maxHeight: 650, overflowY: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.76rem" }}>
          <thead>
            <tr>
              <SortHeader label="Team" sortKey="team" active={sortKey === "team"} dir={sortDir} onClick={handleSort} />
              <SortHeader label="Conference" sortKey="conference" active={sortKey === "conference"} dir={sortDir} onClick={handleSort} />
              {CBB_RATING_SYSTEMS.map((s) => (
                <SortHeader key={s.key} label={s.label} sortKey={s.key} active={sortKey === s.key} dir={sortDir} onClick={handleSort} align="right" />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.team}>
                <td style={{ padding: "0.3rem 0.6rem", borderBottom: "1px solid var(--hash)" }}>{r.team}</td>
                <td style={{ padding: "0.3rem 0.6rem", borderBottom: "1px solid var(--hash)" }}>{r.conference ?? "–"}</td>
                {CBB_RATING_SYSTEMS.map((s) => (
                  <td key={s.key} style={{ padding: "0.3rem 0.6rem", borderBottom: "1px solid var(--hash)", textAlign: "right" }}>
                    {fmtNum(r.values[s.key])}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={2 + CBB_RATING_SYSTEMS.length} className="empty">
                  No teams yet — click "Sync CBBD Teams" above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CbbPowerRatingsPanel({ onBack }: { onBack: () => void }) {
  const [teams, setTeams] = useState<CbbTeamRow[]>([]);
  const [pulls, setPulls] = useState<CbbRatingPullRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchCbbTeams(), fetchCbbRatingPulls()])
      .then(([t, p]) => {
        if (cancelled) return;
        setTeams(t);
        setPulls(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const rows: ConglomeratedCbbRow[] = useMemo(() => {
    const byTeam = new Map<string, ConglomeratedCbbRow>();
    for (const t of teams) byTeam.set(t.school, { team: t.school, conference: t.conference, values: {} });
    for (const p of pulls) {
      const row = byTeam.get(p.team);
      if (row) row.values[p.systemKey] = p.value;
      else byTeam.set(p.team, { team: p.team, conference: p.conference, values: { [p.systemKey]: p.value } });
    }
    return Array.from(byTeam.values());
  }, [teams, pulls]);

  return (
    <div>
      <button className="menu-btn" onClick={onBack} style={{ marginBottom: "1.5rem" }}>
        ‹ College Basketball
      </button>
      <h2 style={{ marginTop: 0 }}>CBB Power Ratings</h2>
      <p style={{ color: "var(--chalk-dim)", fontSize: "0.85rem", marginTop: 0 }}>
        CBBD's own team list is the canonical roster — every other source's team names get matched against it.
        Every system here keeps its own native higher-is-better scale; nothing is normalized onto the CFB site's
        negative-is-better convention.
      </p>

      <SyncControls onDataChanged={() => setRefreshKey((k) => k + 1)} />

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {loading ? <p style={{ color: "var(--chalk-dim)" }}>Loading…</p> : <ConglomeratedCbbTable rows={rows} />}
    </div>
  );
}
