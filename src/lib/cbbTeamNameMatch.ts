// Fuzzy team-name matching for College Basketball's external rating
// sources (Massey CSV first, more to follow) — same approach as
// src/lib/teamNameMatch.ts (CFB), deliberately NOT sharing code with it:
// this is a brand-new roster with its own naming quirks nobody has
// tested yet, and CFB's ALIASES dict is hand-tuned against 855+ real CFB
// name variants that have nothing to do with basketball. Rather than a
// static canonical roster (CFB's data/teams.ts), CBB's roster lives in
// the cbb_teams table (synced from CBBD) since there's no hand-curated
// file for it yet — so this is a factory: createCbbTeamMatcher(schools)
// builds the matcher functions bound to whatever roster was just
// fetched, instead of importing a fixed list at module load time.
//
// ALIASES starts empty on purpose — there's no CBB-specific naming data
// to hand-tune against yet. Add entries here the same way CFB's grew:
// when a real sync reports a name as unmatched, confirm the correct
// team and add "normalized input" -> "canonical school" below.
const ALIASES: Record<string, string> = {};

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandAbbrevs(norm: string): string {
  const words = norm.split(" ");
  return words
    .map((w, i) => {
      if (i === words.length - 1 && w === "st") return "state";
      if (i === 0 && w === "n") return "north";
      if (i === 0 && w === "s") return "south";
      if (i === 0 && w === "e") return "east";
      if (i === 0 && w === "w") return "west";
      if (i === 0 && w === "c") return "central";
      return w;
    })
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export interface CbbTeamMatchResult {
  input: string;
  matched: string | null;
  confidence: "exact" | "alias" | "fuzzy" | "none";
}

export interface CbbBulkMatchResult<T> {
  matched: { row: T; team: string; confidence: "exact" | "alias" | "fuzzy" }[];
  unmatched: T[];
}

export function createCbbTeamMatcher(canonicalSchools: string[]) {
  const schoolsByName = new Set(canonicalSchools);
  const normalizedCanonical: Record<string, string> = Object.fromEntries(canonicalSchools.map((s) => [normalize(s), s]));
  const schoolsNorm = canonicalSchools.map((s) => [s, normalize(s)] as const);

  function matchTeamName(input: string): CbbTeamMatchResult {
    if (schoolsByName.has(input)) return { input, matched: input, confidence: "exact" };

    const norm = normalize(input);
    if (ALIASES[norm]) return { input, matched: ALIASES[norm], confidence: "alias" };
    if (normalizedCanonical[norm]) return { input, matched: normalizedCanonical[norm], confidence: "exact" };

    const expanded = expandAbbrevs(norm);
    if (expanded !== norm) {
      if (ALIASES[expanded]) return { input, matched: ALIASES[expanded], confidence: "alias" };
      if (normalizedCanonical[expanded]) return { input, matched: normalizedCanonical[expanded], confidence: "alias" };
    }

    // Same conservative fuzzy fallback as the CFB matcher — skip short
    // names entirely (distance-2 on a short abbreviation isn't a real
    // signal) and use a tight ratio otherwise.
    if (norm.length < 6) return { input, matched: null, confidence: "none" };
    let best: { team: string; dist: number } | null = null;
    for (const [school, sNorm] of schoolsNorm) {
      const d = levenshtein(norm, sNorm);
      if (best == null || d < best.dist) best = { team: school, dist: d };
    }
    if (best && best.dist <= Math.max(1, Math.floor(norm.length * 0.15))) {
      return { input, matched: best.team, confidence: "fuzzy" };
    }
    return { input, matched: null, confidence: "none" };
  }

  function matchTeamRows<T>(rows: T[], nameOf: (row: T) => string): CbbBulkMatchResult<T> {
    const matched: CbbBulkMatchResult<T>["matched"] = [];
    const unmatched: T[] = [];
    for (const row of rows) {
      const result = matchTeamName(nameOf(row));
      if (result.matched) matched.push({ row, team: result.matched, confidence: result.confidence as any });
      else unmatched.push(row);
    }
    return { matched, unmatched };
  }

  // Some sources (D-Ratings) give "School Mascot" instead of just the
  // school name (e.g. "Michigan Wolverines") — same problem the CFB
  // matcher's matchSchoolMascotName solves, same fix: try the string as
  // given first, then progressively drop trailing words, since the
  // canonical name is almost always a strict prefix of the full form.
  function matchSchoolMascotName(input: string): string | null {
    let result = matchTeamName(input);
    if (result.matched) return result.matched;
    const words = input.split(" ");
    for (let cut = 1; cut <= 2 && words.length - cut >= 1; cut++) {
      result = matchTeamName(words.slice(0, words.length - cut).join(" "));
      if (result.matched) return result.matched;
    }
    return null;
  }

  return { matchTeamName, matchTeamRows, matchSchoolMascotName };
}
