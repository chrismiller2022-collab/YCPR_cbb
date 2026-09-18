/**
 * Supabase/PostgREST caps a single query at a fixed max-rows setting
 * (1000 rows on this project) and silently truncates anything beyond
 * that — no error, just fewer rows than actually match. The `games`
 * table alone has 1600+ rows for the current season, so any unbounded
 * `.eq("season", season)` query silently drops whichever games happen to
 * sort past row 1000 (in practice: a team's later-season games, or FCS
 * games as a whole once combined with all of FBS pushes the count over).
 *
 * This walks a query in pages via `.range()` until it's exhausted, so
 * callers always get every matching row regardless of table size.
 * `buildQuery` must build a FRESH query each call (it's invoked once per
 * page) since a Supabase query builder can't be re-ranged after it's
 * already been sent.
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
