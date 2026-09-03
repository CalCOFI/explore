// the guided tour (plan D16, Appendix B): driver.js over `data-tour` anchors — stable attributes,
// independent of class names — with `before()` hooks that put the app in the state a step needs (the
// Lenses step plays the morph, the Depth step unfolds the rail, the phone steps move the sheet) and a
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
  expand: (what: "filters" | "export" | "denominator") => void; // a folded group or the folded denominator, opened for its step
}
export interface TourStep {
  id: string; element: string | (() => Element | null); title: string; description: string;
  side?: "left" | "right" | "top" | "bottom"; align?: "start" | "center" | "end";
  before?: (a: TourActions) => void; after?: (a: TourActions) => void; wait?: number;
}
// the first VISIBLE match: the phone hides the header's about/feedback buttons behind ⋯, and a hidden node comes first in DOM order
const q = (sel: string) => () => [...document.querySelectorAll<HTMLElement>(sel)].find((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; }) ?? null;
const rail = (a: TourActions, id: PanelId) => { if (a.phone) a.sheet("select", "half"); else if (a.isFolded(id)) a.unfold(id); };

export const TOUR_STEPS: TourStep[] = [
  { id: "welcome", element: '[data-tour="release"]', side: "bottom", align: "end", title: "One database, one frozen release",
    description: "Every value here comes from this release of the integrated CalCOFI database — sixteen datasets projected into one core and frozen, so a link you share draws the same picture next year. The map is the CalCOFI station grid, 1949 to now." },
  { id: "lenses", element: q('[data-tour="lenses"]'), side: "right", align: "start", title: "Five lenses",
    description: "Stations, Hexagons, Cruises, Regions and Sections are five shapes of the same data. Switch, and the station dots travel to their new place — hexagon centres, region centroids, the ship's track — so you can see which stations feed which summary.",
    before: (a) => { rail(a, "select"); if (!a.reducedMotion && a.getLens() === "station") a.setLens("hex"); }, wait: 400 },
  { id: "realm", element: q('[data-tour="realm"]'), side: "right", title: "Biology or Environment",
    description: "One organism (a taxon — a species, a genus, a family) or one ocean variable at a time. Biology reads the net tows and censuses; Environment the bottle, CTD, carbonate and weather series.", before: (a) => rail(a, "select") },
  { id: "picker", element: q('[data-tour="picker"]'), side: "right", title: "Browse by category, or search",
    description: "The list opens folded by category — each with its glyph, how many items and how much data (log-scale bars) — with the current pick shown under its own category and \"… N more\" for the rest. Type a common or scientific name to search within it; the Search tab is the flat A–Z list with sort and group.", before: (a) => rail(a, "select") },
  { id: "denominator", element: q('[data-tour="denominator"]'), side: "right", title: "What is pooled, and what never is",
    description: "Life stage, denominator (per 10 m² · per 1000 m³ · raw count) and one pill per dataset × stage. A statistic is averaged across datasets that share this life stage and denominator; never across denominators or life stages — eggs are never merged with larvae, counts never with densities. The ⚠ pill is a raw count with no effort in the release, and the Sources line under the pills names every dataset the average pools, because each of them has to be cited.", before: (a) => { rail(a, "select"); a.expand("denominator"); } },
  { id: "depth", element: q('[data-tour="depth"]'), side: "left", title: "The water column",
    description: "Median and interquartile range per 10 m over the current selection. Drag a band to slice the map to those depths. A depth-integrated net tow has no profile — the panel says so instead of moving.",
    before: (a) => { if (a.phone) a.sheet("select", "peek"); else if (a.isFolded("depth")) a.unfold("depth"); }, wait: 400 },
  { id: "years", element: q('[data-tour="years"]'), side: "top", title: "The years",
    description: "Observations per year, or the mean ± standard error as a time series. Drag to filter the map to a span of years; the strip keeps the whole record for context. Fold either strip into a pill when you want the map.",
    before: (a) => { if (a.phone) a.sheet("select", "peek"); else if (a.isFolded("years")) a.unfold("years"); }, wait: 400 },
  { id: "map", element: '[data-tour="map"]', side: "left", align: "start", title: "The map",
    description: "Hover a dot for its summary; click a station for its coverage card (every dataset measured there, by year and by month). Cards minimize to pills, drag, and maximize; the legend's 5–95 % window colours the dots.",
    before: (a) => { if (a.phone) a.sheet("select", "peek"); } },
  { id: "layers", element: q('[data-tour="layers"]'), side: "bottom", align: "end", title: "Layers — the sea floor, and the boundaries you can draw on top",
    description: "The sea floor is GEBCO 2025 — shaded relief, depth colour and isobaths — and the registry's boundary layers (EEZ, sanctuaries, MPAs, counties …) stack over it in the order you set. Every choice lands in the URL, so a shared link reopens the same map." },
  { id: "export", element: q('[data-tour="export"]'), side: "right", align: "end", title: "Take it with you",
    description: "Download data hands over the bytes, the exact SQL against the release's object URLs, citations and reproduce.R / .py. Copy code gives that SQL, or R or Python that runs it. Cite this data copies the citations for the datasets in view plus the integrated database (BibTeX too), and opens Data Sources & Attribution. Share copies the link — the URL is the whole view, map extent included. Every figure and CSV names its datasets.", before: (a) => { rail(a, "select"); a.expand("export"); }, wait: 300 },
  { id: "feedback", element: q('[data-tour="feedback"], [data-tour="more"]'), side: "bottom", align: "end", title: "Tell us what you see",
    description: "Feedback sends this view's URL to the team as a public issue — so \"that spike is weird\" is reproducible by whoever opens the link. ⓘ has the datasets, credits and keyboard shortcuts; ? replays this tour.", before: () => {} },
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
