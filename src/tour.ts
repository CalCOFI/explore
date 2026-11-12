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
  openWhat: (open: boolean) => void;   // the lean panel's What picker (categories, search, datasets)
  viewMenu: (open: boolean) => void;   // the header's view list
  statPick: (open: boolean) => void;   // the Summary dropdown under View as
  expand: (what: "filters" | "export" | "denominator") => void; // the Refine tab, the Share tab, or More options — opened for its step
}
export interface TourStep {
  id: string; element: string | (() => Element | null); title: string; description: string;
  side?: "left" | "right" | "top" | "bottom" | "over"; align?: "start" | "center" | "end";
  before?: (a: TourActions) => void; after?: (a: TourActions) => void; wait?: number;
  ui?: { what?: boolean; menu?: boolean; dl?: boolean; stat?: boolean }; // what the lean panel shows for this step; anything not listed is closed
}
// put the lean panel's pieces in the state a step needs: the What picker, the header's view list, the Download ▾ menu
const setUi = (a: TourActions, o: { what?: boolean; menu?: boolean; dl?: boolean; stat?: boolean } = {}) => {
  a.openWhat(!!o.what); a.viewMenu(!!o.menu); a.statPick(!!o.stat);
  const b = document.querySelector<HTMLElement>(".dl-more .menu-btn");
  if (b && (b.getAttribute("aria-expanded") === "true") !== !!o.dl) b.click();
};
const prep = (s: TourStep, a: TourActions) => { if (!a.phone) setUi(a, s.ui); s.before?.(a); };
// the first VISIBLE match: a hidden node comes first in DOM order
const q = (sel: string) => () => [...document.querySelectorAll<HTMLElement>(sel)].find((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; }) ?? null;
// the first visible match of the FIRST selector that has one — querySelectorAll("a, b") returns document order,
// not selector order, so a preference between two anchors has to be spelled out
const qFirst = (...sels: string[]) => () => { for (const s of sels) { const el = q(s)(); if (el) return el; } return null; };
const rail = (a: TourActions, id: PanelId) => { if (a.phone) a.sheet("select", "half"); else if (a.isFolded(id)) a.unfold(id); };

export const TOUR_STEPS: TourStep[] = [
  { id: "welcome", element: '[data-tour="release"]', side: "bottom", align: "end", title: "One database, one frozen release",
    description: "Every value here comes from this release of the integrated CalCOFI database — sixteen datasets projected into one core and frozen, so a link you share draws the same picture next year. The map is the CalCOFI station grid, 1949 to now." },
  // the phone has no title sentence (the sheet's summary line says the same), so the step anchors there
  { id: "sentence", element: q('[data-tour="sentence"], .sheet-summary'), side: "bottom", title: "What you are looking at",
    description: "The title says what the map shows, in plain words, with the colour scale beside it. Source names the dataset behind it, and Attribution opens the citations.", before: (a) => { if (a.phone) a.sheet("select", "peek"); } },
  { id: "lenses", element: qFirst('[data-tour="viewlist"]', '[data-tour="lens"]'), side: "right", align: "start", title: "Six ways to view it",
    description: "Stations, Hexagon, By region, Contour, By cruise and Cross-section are six views of the same data. Each row says what it answers — pick one here, or from View as in the panel.",
    ui: { menu: true }, before: (a) => { if (a.phone) a.sheet("select", "half"); }, wait: 400 },
  { id: "realm", element: qFirst('[data-tour="what-list"]', '[data-tour="realm"]'), side: "right", align: "start", title: "Biological or Environmental",
    description: "Start with what you want to look at: an organism (Biological — the net tows and censuses) or an ocean measurement (Environmental — the bottle, CTD, carbonate and weather series). Each category opens to its items.",
    ui: { what: true }, before: (a) => rail(a, "select"), wait: 400 },
  { id: "picker", element: qFirst('[data-tour="what-find"]', '[data-tour="picker"]'), side: "right", align: "start", title: "Search, or browse by category or dataset",
    description: "Type a common or scientific name to search. Or browse By category, or switch to By dataset to see what each dataset measured.",
    ui: { what: true }, before: (a) => rail(a, "select"), wait: 400 },
  { id: "denominator", element: qFirst('[data-tour="summary"]', '[data-tour="denominator"]'), side: "right", title: "The summary, and what is pooled",
    description: "Each station shows the mean, median or number of observations. A statistic is averaged across datasets that share this life stage and standardization; never across them. For species, how counts are shown and whether empty tows count as zero sit under What.",
    ui: { stat: true }, before: (a) => { rail(a, "select"); if (a.phone) a.expand("denominator"); }, wait: 350 },
  { id: "depth", element: q('[data-tour="depth"]'), side: "left", title: "The water column",
    description: "Median and interquartile range per 10 m over the current selection. Drag a band to slice the map to those depths. The panel starts folded to a pill on the right edge and lights up when a pick is sampled at depth — it never opens by itself. A depth-integrated net tow has no profile — the pill says so instead of moving.",
    before: (a) => { if (a.phone) a.sheet("select", "peek"); else if (a.isFolded("depth")) a.unfold("depth"); }, wait: 400 },
  { id: "years", element: q('[data-tour="years"]'), side: "top", title: "Time",
    description: "Observations per year, or the mean ± standard error as a time series. Drag to filter the map to a span of years; the strip keeps the whole record for context. Fold any panel into a pill when you want the map; drag it by its bar, resize it from its edges.",
    before: (a) => { if (a.phone) a.sheet("select", "peek"); else if (a.isFolded("years")) a.unfold("years"); }, wait: 400 },
  { id: "map", element: '[data-tour="map"]', side: "over", align: "center", title: "The map",
    description: "Hover a dot for its summary; click a station for its coverage card (every dataset measured there, by year and by month). The legend's 5–95 % window colours the dots.",
    before: (a) => { if (a.phone) a.sheet("select", "peek"); } },
  { id: "layers", element: q('[data-tour="layers"]'), side: "left", align: "end", title: "Layers — the sea floor, and the boundaries you can draw on top",
    description: "The sea floor is GEBCO 2025 — shaded relief, depth colour and isobaths — under the OpenStreetMap coast, and the registry's boundary and reference layers (EEZ, sanctuaries, MPAs, counties, undersea feature names …) stack over it in the order you set. Every choice lands in the URL, so a shared link reopens the same map." },
  { id: "share", element: q('[data-tour="share"]'), side: "right", align: "end", title: "Download and share",
    description: "Download CSV gives the table behind the view. Zip beside it is the full package: the data, the citations, and the exact SQL, R and Python to reproduce it. Copy SQL, R or Python puts that code on your clipboard. How to cite opens the sources and citations; Copy link shares the whole view, map extent included.",
    before: (a) => { rail(a, "select"); if (a.phone) a.expand("export"); }, wait: 300 },
  // the anchor is the feedback button now that it has left the Help menu; Help ▾ sits immediately left of it, so the
  // popover covers both. `q()` falls back to Help if the button is ever hidden, so the step always has a real element.
  { id: "feedback", element: qFirst('[data-tour="feedback"]', '[data-tour="help"]'), side: "bottom", align: "end", title: "Tell us what you see, and where to read more",
    description: "The speech bubble beside the theme toggle sends feedback — this view's URL, a screenshot you can mark up and your note, as a public issue, so \"that spike is weird\" is reproducible by whoever opens the link. Help ▾ beside it holds this tour, the Explorer guide at calcofi.io/docs, the welcome, About (the datasets, credits and keyboard) and Data Sources & Attribution. ? replays the tour.", before: () => {} },
];

/** start the tour; returns the driver so callers (and verify.mjs, via window.__tour) can step it */
export function startTour(a: TourActions): Driver {
  a.snapshot();
  const first = TOUR_STEPS[0];
  const d = driver({
    showProgress: true, allowClose: true, stagePadding: 6, popoverClass: "cc-tour", overlayColor: "rgba(0,0,0,0.55)",
    nextBtnText: "Next", prevBtnText: "Back", doneBtnText: "Done", progressText: "{{current}} of {{total}}",
    steps: TOUR_STEPS.map((s) => ({ element: s.element as any, popover: { title: s.title, description: s.description, side: s.side as any, align: s.align } })),
    onNextClick: (_el, _st, o) => {
      const i = o.driver.getActiveIndex() ?? 0;
      TOUR_STEPS[i]?.after?.(a);
      const next = TOUR_STEPS[i + 1];
      if (!next) { o.driver.destroy(); return; }
      prep(next, a);
      setTimeout(() => o.driver.moveNext(), next.wait ?? 250);
    },
    onPrevClick: (_el, _st, o) => {
      const i = o.driver.getActiveIndex() ?? 0;
      const prev = TOUR_STEPS[i - 1]; if (!prev) return;
      prep(prev, a);
      setTimeout(() => o.driver.movePrevious(), prev.wait ?? 250);
    },
    onDestroyed: () => { if (!a.phone) setUi(a); a.restore(); (window as any).__tourDriver = null; },
  });
  prep(first, a);
  setTimeout(() => d.drive(), first.wait ?? 250);
  (window as any).__tourDriver = d;
  return d;
}
