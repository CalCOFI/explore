// the guided tour (plan D16, Appendix B): driver.js over `data-tour` anchors — stable attributes,
// independent of class names — with `before()` hooks that put the app in the state a step needs (the
// Lenses step plays the morph, the Depth step opens the panel, the phone steps move the sheet) and a
// restore at the end, so the tour leaves the view as it found it. `?tour=off` never starts it.
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import type { Lens, PanelId } from "./state";

export interface TourActions {
  phone: boolean; reducedMotion: boolean;
  getLens: () => Lens; setLens: (l: Lens) => void;
  isFolded: (id: PanelId) => boolean; unfold: (id: PanelId) => void;
  sheet: (panel: PanelId, detent: "peek" | "half" | "full") => void;
  snapshot: () => void; restore: () => void;
  openFeedback: () => void;
  expand: (what: "filters" | "export" | "denominator") => void; // the Refine tab, the Share tab, or More options — opened for its step
}
export interface TourStep {
  id: string; element: string | (() => Element | null); title: string; description: string;
  side?: "left" | "right" | "top" | "bottom"; align?: "start" | "center" | "end";
  before?: (a: TourActions) => void; after?: (a: TourActions) => void; wait?: number;
}
// the first VISIBLE match: a hidden node comes first in DOM order
const q = (sel: string) => () => [...document.querySelectorAll<HTMLElement>(sel)].find((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; }) ?? null;
const rail = (a: TourActions, id: PanelId) => { if (a.phone) a.sheet("select", "half"); else if (a.isFolded(id)) a.unfold(id); };

export const TOUR_STEPS: TourStep[] = [
  { id: "welcome", element: '[data-tour="release"]', side: "bottom", align: "end", title: "One database, one frozen release",
    description: "Every value here comes from this release of the integrated CalCOFI database — sixteen datasets projected into one core and frozen, so a link you share draws the same picture next year. The map is the CalCOFI station grid, 1949 to now." },
  // the phone has no title sentence (the sheet's summary line says the same), so the step anchors there
  { id: "sentence", element: q('[data-tour="sentence"], .sheet-summary'), side: "bottom", title: "What you are looking at",
    description: "The title says what the map shows, in plain words, with the colour scale beside it. Its ▾ opens the same choices as the Select panel, as a sentence — change any part and the map follows.", before: (a) => { if (a.phone) a.sheet("select", "peek"); } },
  { id: "lenses", element: q('[data-tour="lenses"]'), side: "right", align: "start", title: "Five ways to view it",
    description: "Stations, Hexagons, Cruises, Regions and Sections are five shapes of the same data. Switch, and the station dots travel to their new place — hexagon centres, region centroids, the ship's track — so you can see which stations feed which summary.",
    before: (a) => { rail(a, "select"); if (!a.reducedMotion && a.getLens() === "station") a.setLens("hex"); }, wait: 400 },
  { id: "realm", element: q('[data-tour="realm"]'), side: "right", title: "Biology or Environment",
    description: "One organism (a taxon — a species, a genus, a family) or one ocean variable at a time. Biology reads the net tows and censuses; Environment the bottle, CTD, carbonate and weather series.", before: (a) => rail(a, "select") },
  { id: "picker", element: q('[data-tour="picker"]'), side: "right", title: "Browse by category, or search",
    description: "The list opens folded by category — each with its glyph, how many items and how much data (log-scale bars) — with the current pick shown under its own category and \"… N more\" for the rest. Type a common or scientific name to search within it; the Search tab is the flat A–Z list with sort and group.", before: (a) => rail(a, "select") },
  { id: "denominator", element: q('[data-tour="denominator"]'), side: "right", title: "What is pooled, and what never is",
    description: "More options holds the summary statistic, how counts are standardized (per 10 m² · per 1000 m³ · raw count), whether sampled tows with no catch count as zeros, and one pill per dataset × stage. A statistic is averaged across datasets that share this life stage and standardization; never across them — eggs are never merged with larvae, counts never with densities. The Sources line names every dataset the average pools, because each of them has to be cited.", before: (a) => { rail(a, "select"); a.expand("denominator"); } },
  { id: "depth", element: q('[data-tour="depth"]'), side: "left", title: "The water column",
    description: "Median and interquartile range per 10 m over the current selection. Drag a band to slice the map to those depths. The panel starts folded to a pill on the right edge and lights up when a pick is sampled at depth — it never opens by itself. A depth-integrated net tow has no profile — the pill says so instead of moving.",
    before: (a) => { if (a.phone) a.sheet("select", "peek"); else if (a.isFolded("depth")) a.unfold("depth"); }, wait: 400 },
  { id: "years", element: q('[data-tour="years"]'), side: "top", title: "The years",
    description: "Observations per year, or the mean ± standard error as a time series. Drag to filter the map to a span of years; the strip keeps the whole record for context. Fold any panel into a pill when you want the map; drag it by its bar, resize it from its edges.",
    before: (a) => { if (a.phone) a.sheet("select", "peek"); else if (a.isFolded("years")) a.unfold("years"); }, wait: 400 },
  { id: "map", element: '[data-tour="map"]', side: "left", align: "start", title: "The map",
    description: "Hover a dot for its summary; click a station for its coverage card (every dataset measured there, by year and by month). The legend's 5–95 % window colours the dots.",
    before: (a) => { if (a.phone) a.sheet("select", "peek"); } },
  { id: "layers", element: q('[data-tour="layers"]'), side: "left", align: "end", title: "Layers — the sea floor, and the boundaries you can draw on top",
    description: "The sea floor is GEBCO 2025 — shaded relief, depth colour and isobaths — and the registry's boundary layers (EEZ, sanctuaries, MPAs, counties …) stack over it in the order you set. Every choice lands in the URL, so a shared link reopens the same map." },
  { id: "share", element: q('[data-tour="share"]'), side: "right", align: "end", title: "Share",
    description: "Download data hands over the bytes, the exact SQL against the release's object URLs, citations and reproduce.R / .py. Copy code gives that SQL, or R or Python that runs it. Cite this data copies the citations for the datasets in view plus the integrated database (BibTeX too). Copy link — the URL is the whole view, map extent included. Every figure and CSV names its datasets.", before: (a) => { rail(a, "select"); a.expand("export"); }, wait: 300 },
  { id: "feedback", element: q('[data-tour="feedback"]'), side: "bottom", align: "end", title: "Tell us what you see",
    description: "Feedback sends this view's URL to the team as a public issue — so \"that spike is weird\" is reproducible by whoever opens the link. Help has the datasets, credits, keyboard shortcuts and this tour; ? replays it.", before: () => {} },
];

/** start the tour; returns the driver so callers (and verify.mjs, via window.__tour) can step it */
export function startTour(a: TourActions): Driver {
  a.snapshot();
  const first = TOUR_STEPS[0];
  const d = driver({
    showProgress: true, allowClose: true, stagePadding: 6, popoverClass: "cc-tour", overlayColor: "rgba(0,0,0,0.55)",
    nextBtnText: "Next", prevBtnText: "Back", doneBtnText: "Done", progressText: "{{current}} of {{total}}",
    steps: TOUR_STEPS.map((s) => ({ element: s.element as any, popover: { title: s.title, description: s.description, side: s.side, align: s.align } })),
    onNextClick: (_el, _st, o) => {
      const i = o.driver.getActiveIndex() ?? 0;
      TOUR_STEPS[i]?.after?.(a);
      const next = TOUR_STEPS[i + 1];
      if (!next) { o.driver.destroy(); return; }
      next.before?.(a);
      setTimeout(() => o.driver.moveNext(), next.before ? next.wait ?? 250 : 0);
    },
    onPrevClick: (_el, _st, o) => {
      const i = o.driver.getActiveIndex() ?? 0;
      const prev = TOUR_STEPS[i - 1]; if (!prev) return;
      prev.before?.(a);
      setTimeout(() => o.driver.movePrevious(), prev.before ? prev.wait ?? 250 : 0);
    },
    onDestroyed: () => { a.restore(); (window as any).__tourDriver = null; },
  });
  first.before?.(a);
  setTimeout(() => d.drive(), first.before ? first.wait ?? 250 : 0);
  (window as any).__tourDriver = d;
  return d;
}
