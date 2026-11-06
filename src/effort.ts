// the Effort layer (`effort=on`): sql/effort_track.sql rows → deck.gl PathLayer data. A path is beginning · middle · end
// from sample_track's six lon/lat columns (never its geom: the WASM engine loads no spatial extension); a point with a
// NULL or NaN coordinate is dropped, and a path left with fewer than two points is not drawn.
export type TrackType = "effort_segment" | "sight_line" | string;
export interface EffortRow {
  sample_key: string; dataset_key: string; track_type: TrackType; cruise_key: string | null; t: number | null; length_km: number | null;
  longitude_beg: number | null; latitude_beg: number | null; longitude_mid: number | null; latitude_mid: number | null; longitude_end: number | null; latitude_end: number | null;
}
export interface EffortPath { path: [number, number][]; track_type: TrackType; sample_key: string; dataset_key: string; t: number | null; length_km: number | null }

const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export function effortPath(r: EffortRow): [number, number][] {
  const pts: [number, number][] = [];
  for (const [lon, lat] of [[r.longitude_beg, r.latitude_beg], [r.longitude_mid, r.latitude_mid], [r.longitude_end, r.latitude_end]])
    if (ok(lon) && ok(lat)) pts.push([lon, lat]);
  return pts;
}
export function effortPaths(rows: readonly EffortRow[]): EffortPath[] {
  const out: EffortPath[] = [];
  for (const r of rows) {
    const path = effortPath(r);
    if (path.length >= 2) out.push({ path, track_type: r.track_type, sample_key: r.sample_key, dataset_key: r.dataset_key, t: r.t, length_km: r.length_km });
  }
  return out;
}
/** the Layers card's summary: on-effort segments and their total length (sight lines are not effort) */
export function effortSummary(paths: readonly EffortPath[]): { n: number; km: number } {
  let n = 0, km = 0;
  for (const p of paths) if (p.track_type === "effort_segment") { n++; if (ok(p.length_km)) km += p.length_km; }
  return { n, km };
}
