// College Basketball's own CSV parsers. These generic CSV helpers are a
// direct copy of the ones in the main YCPR (CFB) repo's
// src/lib/ratingsCsv.ts — duplicated rather than shared across repos
// since this app is meant to be fully standalone (own deploy, own
// dependency tree, no cross-repo imports).

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        fields.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function splitCsvLines(text: string): string[] {
  return text.replace(/^﻿/, "").split(/\r\n|\r|\n/).filter((l) => l.length > 0);
}

function findHeaderIdx(headers: string[], name: string): number {
  const target = name.trim().toLowerCase();
  return headers.findIndex((h) => h.trim().toLowerCase() === target);
}

// ---------------------------------------------------------------------
// Massey CBB weekly CSV — UNVERIFIED against a real export yet (Chris
// hasn't looked at the actual file format). Assumes the same convention
// as Massey's CFB export: NOT header-keyed for the rating column itself
// — a blank header follows each named RANK column (e.g. "...,Pwr,,
// Off,,..." means "Pwr" holds a rank integer, and the column right
// after it holds the real Pwr rating). If a real file turns out to be
// shaped differently, fix this against that real file rather than
// guessing further.
//
// No sign-flip, no min-max normalization — CBB keeps every system on
// its own native higher-is-better scale (same choice as CBBD's SRS/Elo
// in api/cbb.ts). Massey's raw Pwr is already higher-is-better.
// ---------------------------------------------------------------------
export interface CbbMasseyRow {
  team: string;
  value: number;
}

export function parseCbbMasseyCsv(text: string): CbbMasseyRow[] {
  const lines = splitCsvLines(text);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const teamIdx = findHeaderIdx(headers, "Team");
  const pwrLabelIdx = findHeaderIdx(headers, "Pwr");
  if (teamIdx === -1 || pwrLabelIdx === -1) return [];
  const pwrValueIdx = pwrLabelIdx + 1;

  const out: CbbMasseyRow[] = [];
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const team = (fields[teamIdx] ?? "").trim();
    const raw = (fields[pwrValueIdx] ?? "").trim();
    if (!team || raw === "") continue;
    const n = Number(raw);
    if (Number.isNaN(n)) continue;
    out.push({ team, value: n });
  }
  return out;
}
