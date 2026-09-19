// College Basketball's own rating-system registry — deliberately
// separate from src/lib/ratingSystems.ts (CFB). Same "one place to add a
// new system" idea, but CBB values are NOT normalized onto the CFB
// site's negative-is-better convention: CBBD's own SRS/Elo (and Massey's
// CBB ratings) are all higher-is-better on their own native scales, and
// there's no existing CBB consensus/YC to normalize against yet.

export type CbbRatingSource = "cbbd_api" | "csv_upload" | "scraped";

export interface CbbRatingSystemDef {
  key: string;
  label: string;
  source: CbbRatingSource;
}

export const CBB_RATING_SYSTEMS: CbbRatingSystemDef[] = [
  { key: "srs", label: "SRS", source: "cbbd_api" },
  { key: "elo", label: "Elo", source: "cbbd_api" },
  { key: "massey", label: "Massey", source: "csv_upload" },
  { key: "teamrankings", label: "TeamRankings", source: "scraped" },
  // D-Ratings' own page shows "Standard" and "Inference" side by side —
  // "Inference" is a plausible match for the "Donchess Inference"
  // system Chris asked about, but that attribution isn't confirmed
  // anywhere on the page itself, so labeled by what D-Ratings actually
  // calls it rather than guessing.
  { key: "dratings_standard", label: "D-Ratings Std", source: "scraped" },
  { key: "dratings_inference", label: "D-Ratings Inf", source: "scraped" },
  { key: "wilson", label: "Wilson", source: "scraped" },
];

export const CBB_RATING_SYSTEMS_BY_KEY: Record<string, CbbRatingSystemDef> = Object.fromEntries(
  CBB_RATING_SYSTEMS.map((s) => [s.key, s])
);
