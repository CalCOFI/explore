// colour ramps for the data layer (Ben, 2026-09-07: "borrow from cmocean, oce's GEBCO, pals"): eleven stops each,
// interpolated in RGB. cmocean 0.3.2 (Thyng et al. 2016, MIT) via the R package; viridis from viridisLite; GEBCO
// from oce::oceColorsGebco(). A ramp id ending in "_r" is the same ramp reversed. The default per variable follows
// cmocean's own conventions (thermal for temperature, haline for salinity, …); `ramp=` in the URL overrides it.
export interface Ramp { label: string; family: "cmocean" | "viridis" | "oce"; kind: "sequential" | "diverging" | "cyclic"; stops: string[] }
const c = (label: string, kind: Ramp["kind"], s: string): Ramp => ({ label, family: "cmocean", kind, stops: s.split(",") });
export const RAMPS: Record<string, Ramp> = {
  viridis: { label: "viridis", family: "viridis", kind: "sequential", stops: "#440154,#482576,#414487,#35608D,#2A788E,#21908C,#22A884,#43BF71,#7AD151,#BBDF27,#FDE725".split(",") },
  thermal: c("thermal", "sequential", "#042333,#0F326B,#40349F,#684396,#8B538D,#B05F82,#D66C6B,#F2814D,#FCA63C,#F7CF45,#E8FA5B"),
  haline: c("haline", "sequential", "#2A186C,#2828A2,#0D4E96,#18668C,#2D7C89,#3B9287,#4AAA81,#64C072,#94D35D,#CFE06C,#FDEF9A"),
  solar: c("solar", "sequential", "#331418,#531E22,#732724,#8F341E,#A54A17,#B66313,#C47F15,#CF9B1D,#D8BA2A,#DEDA39,#E1FD4B"),
  ice: c("ice", "sequential", "#040613,#1B1B37,#302F5F,#3D4389,#3E5EA9,#427AB7,#5296C1,#6AB0CB,#8CCBD6,#BBE3E6,#EAFDFD"),
  gray: c("gray", "sequential", "#000000,#131212,#2B2B2B,#424241,#5A5959,#717070,#8A8989,#A3A3A2,#C0BFBE,#DDDDDC,#FFFFFD"),
  oxy: c("oxy", "sequential", "#400505,#6A060F,#504F4F,#676666,#81807F,#9A9A99,#B7B7B6,#D4D4D3,#F8FE69,#E7D72C,#DDAF19"),
  deep: c("deep", "sequential", "#FDFECC,#C9EAB1,#92D8A4,#65C2A4,#52A8A3,#488E9E,#407498,#3E5A92,#41407B,#382D51,#281A2C"),
  dense: c("dense", "sequential", "#E6F1F1,#BBDBE5,#96C5E2,#7BACE4,#7390E3,#7771D5,#7953BA,#743A98,#682471,#531547,#360E24"),
  algae: c("algae", "sequential", "#D7F9D0,#B7E2AB,#96CD8A,#71BA6B,#44A855,#129450,#097C4A,#156641,#1A5034,#183A25,#122414"),
  matter: c("matter", "sequential", "#FEEDB0,#FAC98F,#F5A773,#EE835D,#E26253,#CE4356,#B22D5F,#932063,#721A60,#501652,#2F0F3E"),
  turbid: c("turbid", "sequential", "#E9F6AB,#DBD886,#CFBC66,#C3A04D,#B58740,#A1703B,#895D3A,#704D37,#563E30,#3B2F27,#221F1B"),
  speed: c("speed", "sequential", "#FFFDCD,#EDDE97,#D8C55F,#B7B12D,#8EA20B,#60920B,#317F1F,#0F6B2B,#10542C,#193B23,#172313"),
  amp: c("amp", "sequential", "#F1EDEC,#E5CEC8,#DCB1A3,#D3947E,#CA775B,#C0583B,#B23726,#9D1926,#7F0E29,#5C0E21,#3C0912"),
  tempo: c("tempo", "sequential", "#FFF6F4,#DBDECF,#B6CBAF,#8BB896,#5DA786,#2B937F,#117C79,#18656E,#1C4D61,#1A3651,#151D44"),
  rain: c("rain", "sequential", "#EEEDF3,#DDD2C8,#CBBA98,#9FAC82,#739D75,#3E8E6E,#0B7A6E,#07636B,#1E4B5F,#25334B,#221B38"),
  phase: c("phase", "cyclic", "#A8780D,#C85D37,#DC3C6D,#D826BA,#B64BED,#7E71F0,#3A8CCA,#169596,#199A5E,#708F15,#A8780D"),
  topo: c("topo", "diverging", "#281A2C,#41407B,#407598,#51A8A3,#92D8A4,#83916F,#27511E,#6C703C,#B3913F,#D7C289,#F9FDE4"),
  balance: c("balance", "diverging", "#181C43,#293E98,#1670BC,#5A9CBB,#AAC2CB,#F1ECEB,#DBB1A3,#CA775B,#B33826,#7F0E29,#3C0912"),
  delta: c("delta", "diverging", "#112040,#234397,#2378A3,#4EA8AF,#ACCEC6,#FEFCD9,#D8C55F,#8EA20B,#32801E,#10542C,#172313"),
  curl: c("curl", "diverging", "#151D44,#1C4D61,#117D79,#5DA786,#B6CBAF,#FEF6F4,#E6B7A2,#D4776A,#AE4060,#76195D,#340D35"),
  diff: c("diff", "diverging", "#082340,#224E6A,#5A7487,#8E9DA8,#C6CACF,#F6F1F0,#CDC6B7,#A19679,#7A6D41,#4C471C,#1C2207"),
  tarn: c("tarn", "diverging", "#17230E,#3D4D0D,#846A25,#CB854A,#E3BFA3,#FCF7F6,#CACBA9,#7DA490,#2E7E7E,#15506A,#101E4F"),
  gebco: { label: "GEBCO", family: "oce", kind: "sequential", stops: "#0F7CAB,#1F8FB4,#33A2BC,#48B4C6,#5DC5CF,#75D5D9,#8EE2E0,#A9EBE6,#C5F4EE,#E3FCF7,#F5FEFC".split(",") },
};
export const RAMP_IDS = Object.keys(RAMPS);
export const DEFAULT_RAMP = "viridis";
/** base id + reversed flag from a ramp id (`thermal`, `thermal_r`); an unknown id is viridis */
export function parseRamp(id: string | null | undefined): { base: string; reversed: boolean } {
  const s = id ?? DEFAULT_RAMP, rev = s.endsWith("_r"), base = rev ? s.slice(0, -2) : s;
  return RAMPS[base] ? { base, reversed: rev } : { base: DEFAULT_RAMP, reversed: false };
}
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const cache = new Map<string, [number, number, number][]>();
export function rampColors(id: string | null | undefined): [number, number, number][] {
  const { base, reversed } = parseRamp(id), key = `${base}${reversed ? "_r" : ""}`;
  let v = cache.get(key);
  if (!v) { v = RAMPS[base].stops.map(hex); if (reversed) v = v.slice().reverse(); cache.set(key, v); }
  return v;
}
export const rampCss = (id: string | null | undefined) => `linear-gradient(90deg, ${rampColors(id).map((c) => `rgb(${c.join(",")})`).join(",")})`;
/** cmocean's conventions by variable, when the URL names no ramp */
export function defaultRamp(realm: "bio" | "env", variable: string, anomaly = false): string {
  if (anomaly) return "balance";
  if (realm === "bio") return DEFAULT_RAMP;
  const v = variable.toLowerCase();
  if (/temp|theta/.test(v)) return "thermal";
  if (/salin|salt/.test(v)) return "haline";
  if (/oxy/.test(v)) return "ice"; // not cmocean's oxy: its red/grey/yellow breaks assume fixed 0–10 ml/L limits, and the legend is a 5–95 % window
  if (/chl|fluor|phyto|algae|prochl|synech/.test(v)) return "algae";
  if (/sigma|dens/.test(v)) return "dense";
  if (/nitr|phos|silic|ammon|nutri/.test(v)) return "tempo";
  if (/par\b|light|irrad|rad/.test(v)) return "solar";
  if (/ph\b|alkal|dic|carbon|pco2/.test(v)) return "matter";
  if (/depth|bathy/.test(v)) return "deep";
  if (/wind|speed|current/.test(v)) return "speed";
  return DEFAULT_RAMP;
}
