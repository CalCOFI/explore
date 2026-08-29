// selection model = the URL (plan § Architecture). every lens is a pure function of the slice + this.
import type { IconName } from "./icons";
export type Lens = "station" | "hex" | "cruise" | "region" | "section";
export type Realm = "bio" | "env";
export type Den = "per_10m2" | "per_1000m3" | "raw";
export type Stat = "mean" | "med" | "n";

export interface Sel {
  lens: Lens;
  res: number;                 // hex resolution 3..7
  realm: Realm;
  taxon: string;               // bio: worms:217452
  var: string;                 // env: temperature | oxygen_ml_l
  stage: string | null;        // bio life stage; null = "let the picker default it" (D8 rule 4)
  den: Den | null;             // bio denominator; null = default per rule 4
  years: [number, number];
  depth: [number, number];     // depth band, m (10 m bins)
  layer: string;               // region lens: one spatial layer (single-select, layers overlap)
  region: string | null;       // selected polygon
  line: number;                // section lens: CalCOFI line
  cruise: string | null;       // cruise + section lens
  stat: Stat;
  anom: boolean;               // section: anomaly vs climatology
  tour: boolean;               // ?tour=off suppresses the opening morph, the welcome card and the tour
  tourOn: boolean;             // ?tour=on forces the welcome card (demos)
  release: string | null;      // ?release=vYYYY.MM.DD; null = latest.txt
  station: string | null;      // a selected grid cell (its coverage card)
  datasets: string[] | null;   // dataset filter (pills); null = every dataset in the slice
  theme: "dark" | "light" | null;
  hide: PanelId[];             // folded rails (D11 rule 4: `hide=depth,years`, absent when it is the viewport default)
  max: PanelId | null;         // the maximized panel (`max=section`)
}
export type PanelId = "select" | "depth" | "years" | "section" | "cruise" | "station" | "timing";
export const PANEL_IDS: PanelId[] = ["select", "depth", "years", "section", "cruise", "station", "timing"];
/** the folds a visit starts with (D11 rule 3, once per visit): ≥ 1200 px all open; 900–1200 the depth rail folded */
export const DEFAULT_HIDE: PanelId[] = typeof innerWidth === "number" && innerWidth < 1200 ? ["depth"] : [];

export const LENSES: Lens[] = ["station", "hex", "cruise", "region", "section"];
export const LENS_TITLE: Record<Lens, string> = {
  station: "Stations — what has been collected where",
  hex: "Hexagons — larval fish and oceanography by area",
  cruise: "Cruises — the ship steaming the grid",
  region: "Regions — summaries within management areas",
  section: "Sections — a line through the water column",
};
export const LENS_SHORT: Record<Lens, string> = {
  station: "Stations", hex: "Hexagons", cruise: "Cruises", region: "Regions", section: "Sections",
};
export const LAYERS = ["Marine Protected Areas", "National Marine Sanctuaries", "CDFW Regions", "CA Counties"];
export const ENV_VARS_FALLBACK: Record<string, string> = { temperature: "Temperature (°C)", oxygen_ml_l: "Oxygen (ml/L)" };
export const VAL_COL: Record<Den, string> = { per_10m2: "density_per_10m2", per_1000m3: "density_per_1000m3", raw: "value" };
export const DEN_LABEL: Record<Den, string> = {
  per_10m2: "per 10 m² (areal, depth-integrated)",
  per_1000m3: "per 1000 m³ (volumetric)",
  raw: "raw count — not comparable across gear or datasets",
};
export const STAT_LABEL: Record<Stat, string> = { mean: "mean", med: "median", n: "observations" }; // "rows" is database-speak (D12)
// H3 mean edge length per resolution (km) — what "hexagon size" shows; `res` stays in the URL (D12)
export const RES_KM: Record<number, string> = { 3: "~60 km", 4: "~23 km", 5: "~8.5 km", 6: "~3.2 km", 7: "~1.2 km" };
export const LENS_ICON: Record<Lens, IconName> = { station: "lens-stations", hex: "lens-hexagons", cruise: "lens-cruises", region: "lens-regions", section: "lens-sections" };
export const RELEASE = "v2026.08.25";
export const DEFAULT_TAXON = "worms:217452"; // Pacific sardine
export const YEAR_OPEN = 9999; // "through the latest year in the release" until coverage.json says which

export const DEFAULTS: Sel = {
  lens: "station", res: 5, realm: "bio", taxon: DEFAULT_TAXON, var: "temperature",
  stage: null, den: null, years: [1949, YEAR_OPEN], depth: [0, 500], layer: LAYERS[1], region: null, // sanctuaries read at the grid's zoom; MPAs are slivers
  line: 90, cruise: null, stat: "mean", anom: false, tour: true, tourOn: false, theme: null, release: null, station: null, datasets: null,
  hide: DEFAULT_HIDE, max: null,
};

const num = (v: string | null, d: number) => (v != null && v !== "" && !isNaN(+v) ? +v : d);
const pair = (v: string | null, d: [number, number]): [number, number] => {
  if (!v) return d;
  const m = v.split(/[-–:]/).map(Number);
  return m.length === 2 && m.every((x) => !isNaN(x)) ? [Math.min(m[0], m[1]), Math.max(m[0], m[1])] : d;
};

export function fromUrl(): Sel {
  const p = new URLSearchParams(location.search);
  const lens = (LENSES as string[]).includes(p.get("lens") ?? "") ? (p.get("lens") as Lens) : DEFAULTS.lens;
  const v = p.get("var");
  const den = p.get("den");
  const stat = p.get("stat");
  return {
    ...DEFAULTS,
    lens,
    res: Math.min(7, Math.max(3, num(p.get("res"), DEFAULTS.res))),
    realm: v ? "env" : "bio",
    taxon: p.get("taxon") ?? DEFAULTS.taxon,
    var: v ?? DEFAULTS.var,
    stage: p.get("stage"),
    den: den && (den in VAL_COL) ? (den as Den) : null,
    years: pair(p.get("years"), DEFAULTS.years),
    depth: pair(p.get("depth"), DEFAULTS.depth),
    layer: LAYERS.includes(p.get("layer") ?? "") ? (p.get("layer") as string) : DEFAULTS.layer,
    region: p.get("region"),
    line: num(p.get("line"), DEFAULTS.line),
    cruise: p.get("cruise"),
    stat: stat && (stat in STAT_LABEL) ? (stat as Stat) : DEFAULTS.stat,
    anom: p.get("anom") === "1",
    tour: p.get("tour") !== "off",
    tourOn: p.get("tour") === "on",
    release: p.get("release"),
    station: p.get("station"),
    datasets: p.get("datasets") ? p.get("datasets")!.split(",").filter(Boolean) : null,
    theme: (p.get("theme") as Sel["theme"]) ?? null,
    hide: p.has("hide") ? (p.get("hide")!.split(",").filter((x): x is PanelId => (PANEL_IDS as string[]).includes(x))) : DEFAULT_HIDE,
    max: (PANEL_IDS as string[]).includes(p.get("max") ?? "") ? (p.get("max") as PanelId) : null,
  };
}

export function toUrl(s: Sel) {
  const p = new URLSearchParams();
  p.set("lens", s.lens);
  if (s.lens === "hex") p.set("res", String(s.res));
  if (s.realm === "env") p.set("var", s.var);
  else {
    p.set("taxon", s.taxon);
    if (s.stage) p.set("stage", s.stage);
    if (s.den) p.set("den", s.den);
  }
  if (s.years[0] !== 1949 || s.years[1] !== YEAR_OPEN) p.set("years", `${s.years[0]}-${s.years[1]}`);
  if (s.depth[0] !== DEFAULTS.depth[0] || s.depth[1] !== DEFAULTS.depth[1]) p.set("depth", `${s.depth[0]}-${s.depth[1]}`);
  if (s.lens === "region") { p.set("layer", s.layer); if (s.region) p.set("region", s.region); }
  if (s.lens === "section") { p.set("line", String(s.line)); if (s.anom) p.set("anom", "1"); }
  if ((s.lens === "section" || s.lens === "cruise") && s.cruise) p.set("cruise", s.cruise);
  if (s.stat !== DEFAULTS.stat) p.set("stat", s.stat);
  if (!s.tour) p.set("tour", "off"); else if (s.tourOn) p.set("tour", "on");
  if (s.release) p.set("release", s.release);
  if (s.station) p.set("station", s.station);
  if (s.datasets?.length) p.set("datasets", s.datasets.join(","));
  if (s.theme) p.set("theme", s.theme);
  if (s.hide.slice().sort().join(",") !== DEFAULT_HIDE.slice().sort().join(",")) p.set("hide", s.hide.join(","));
  if (s.max) p.set("max", s.max);
  const url = `${location.pathname}?${p.toString()}`;
  if (url !== location.pathname + location.search) history.replaceState(null, "", url);
}

// the picker's rule-4 defaults, from picker.sql rows
export interface PickerRow {
  dataset_key: string; life_stage: string | null; effort_class: string; tow_type: string | null; units: string;
  n: number; n_10m2: number; n_1000m3: number; n_flagged: number;
}
export function defaultStage(rows: PickerRow[]): string | null {
  // the stage with the most rows carrying effort, tie -> most rows; eggs and larvae are never merged
  const by = new Map<string | null, { eff: number; n: number }>();
  for (const r of rows) {
    const k = r.life_stage;
    const cur = by.get(k) ?? { eff: 0, n: 0 };
    cur.n += r.n; cur.eff += Math.max(r.n_10m2, r.n_1000m3);
    by.set(k, cur);
  }
  let best: string | null = null, bs = { eff: -1, n: -1 };
  for (const [k, v] of by) if (v.eff > bs.eff || (v.eff === bs.eff && v.n > bs.n)) { best = k; bs = v; }
  return best;
}
export function defaultDen(rows: PickerRow[], stage: string | null): Den {
  // the denominator that covers the most datasets WITH effort for this taxon x stage — never largest-n
  const ds10 = new Set<string>(), ds1000 = new Set<string>();
  for (const r of rows) if (r.life_stage === stage) {
    if (r.n_10m2 > 0) ds10.add(r.dataset_key);
    if (r.n_1000m3 > 0) ds1000.add(r.dataset_key);
  }
  if (ds10.size === 0 && ds1000.size === 0) return "raw";
  return ds1000.size > ds10.size ? "per_1000m3" : "per_10m2";
}
