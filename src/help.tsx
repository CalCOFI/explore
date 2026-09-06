// help (plan D16): one Modal component shared by the welcome card (first visit; `?tour=on` forces it,
// `?tour=off` suppresses it), the About modal (what it is · the release and why one frozen release · the
// datasets with category icons, provider, citation and links · keyboard · credits · "better on a computer",
// which is allowed as long as nothing fails on a phone) and — until U4b ships the annotated-screenshot
// dialog — a feedback dialog that hands the view URL to a public GitHub issue.
import { useEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { IconButton } from "./ui";
import { categoryIcon, categoryRank } from "./categories";
import type { Row } from "./engine";
import type { Coverage } from "./App";
import { citationOf, providerShort } from "./cite";

export const WELCOME_KEY = "explore_welcome";
export const seenWelcome = () => { try { return localStorage.getItem(WELCOME_KEY) === "1"; } catch { return true; } };
export const markWelcome = () => { try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* private mode */ } };
// the agreement (WS-A3, Q4 decided 2026-09-03): the welcome card's PRIMARY BUTTON is the promise to cite,
// not a hard gate — Esc, the close box and Take the tour all still enter the app. `explore_cite_ack` records
// that the promise was made, beside `explore_welcome`, which records that the card was seen.
export const CITE_ACK_KEY = "explore_cite_ack";
export const CITE_ACK_LABEL = "I will cite the datasets I use";
/** the line under the agreement button, in plain text (the card renders it with *Cite this data* in italics) */
export const CITE_ACK_NOTE = "Downloads and figures name their datasets; Cite this data gives you the citations.";
export const seenCiteAck = () => { try { return localStorage.getItem(CITE_ACK_KEY) === "1"; } catch { return false; } };
export const markCiteAck = () => { try { localStorage.setItem(CITE_ACK_KEY, "1"); } catch { /* private mode */ } };

export function Modal(p: { id: string; title: ReactNode; icon?: IconName; onClose: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); p.onClose(); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div ref={ref} className={`modal modal-${p.id}${p.wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={`${p.id}-title`} tabIndex={-1}>
        <header className="rail-head modal-head">{p.icon && <Icon name={p.icon} />}<b id={`${p.id}-title`}>{p.title}</b><span className="spacer" /><IconButton icon="ui-close" label="Close (Esc)" className="sm" onClick={p.onClose} /></header>
        <div className="modal-body">{p.children}</div>
        {p.actions && <div className="modal-actions">{p.actions}</div>}
      </div>
    </div>
  );
}

/** a welcome question: a real view, as the URL query the app already understands */
export interface WelcomeQuestion { q: string; how: string; icon: IconName; query: (yearMax: number) => string }
export const QUESTIONS: WelcomeQuestion[] = [
  { q: "How did the water along line 90 compare with normal on the latest cruise?", how: "Sections · temperature · line 90 · the newest cruise · vs the 1993–2013 normal", icon: "lens-sections",
    query: () => "lens=section&var=temperature&line=90&anom=1" },
  { q: "Where do sardine larvae turn up in spring?", how: "Hexagons · Pacific sardine · larvae · April–June · all years", icon: "lens-hexagons",
    query: () => "lens=hex&res=5&taxon=worms:217452&stage=larva&den=per_10m2&q=2" },
  { q: "Has oxygen at 300 m changed since the 1950s?", how: "Stations · dissolved oxygen · 250–350 m · the years as mean ± se", icon: "lens-stations",
    query: () => "lens=station&var=oxygen_ml_l&depth=250-350&strip=mean" },
  { q: "Which cruises went out last year, and where did they go?", how: "Cruises · last year · the year × month calendar", icon: "lens-cruises",
    query: (yearMax) => `lens=cruise&years=${yearMax - 1}-${yearMax - 1}&strip=cruises` },
];
const fmtN = (v: number) => v.toLocaleString();
/** the welcome (2026-09-06): a card floating over the live map, no dim — two doors, four real questions, one primary
 *  action. The citation norm is one sentence with a link: by continuing, a visitor accepts it (no checkbox, no
 *  promise-as-button). Esc, × and every door out enter the app; Help → Start here brings the card back. */
export function Welcome(p: { release: string; yearMax: number; nOrganisms: number; nVariables: number; onStart: () => void; onTour: () => void; onDoor: (realm: "bio" | "env") => void; onQuestion: (query: string) => void; onCite: () => void; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); p.onClose(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return (
    <section ref={ref} className="welcome modal-welcome" role="dialog" aria-labelledby="welcome-title" tabIndex={-1} data-tour="welcome">
      <IconButton icon="ui-close" label="Close (Esc) — I know my way around" className="welcome-x" onClick={p.onClose} />
      <div className="eyebrow">CalCOFI Explorer · 16 datasets · 1949–{p.yearMax} · release {p.release}</div>
      <h1 id="welcome-title">What would you like to explore?</h1>
      <p className="lede">{p.yearMax - 1949} years of the California Current, one organism or one ocean variable at a time.</p>
      <div className="doors">
        <button type="button" className="door" onClick={() => p.onDoor("bio")} data-tour="welcome-bio"><Icon name="realm-bio" /><span><b>An organism</b><span className="b">Fish eggs and larvae, krill, plankton, seabirds and mammals — from the net tows and the censuses.</span><span className="go">Browse {p.nOrganisms ? fmtN(p.nOrganisms) : "the"} organisms <Icon name="ui-arrow-right" /></span></span></button>
        <button type="button" className="door" onClick={() => p.onDoor("env")} data-tour="welcome-env"><Icon name="realm-env" /><span><b>An ocean variable</b><span className="b">Temperature, salinity, oxygen, nutrients, carbon and weather — from the bottle, CTD and underway series.</span><span className="go">Browse {p.nVariables ? fmtN(p.nVariables) : "the"} variables <Icon name="ui-arrow-right" /></span></span></button>
      </div>
      <div className="lab">Or start from a question</div>
      <div className="qs">
        {QUESTIONS.map((q) => <button key={q.q} type="button" className="q" onClick={() => p.onQuestion(q.query(p.yearMax))}><span className="t">{q.q}</span><span className="o"><Icon name={q.icon} />{q.how}</span></button>)}
      </div>
      <div className="foot">
        <button type="button" className="btn cta" onClick={p.onStart} data-tour="welcome-start">Start exploring <Icon name="ui-arrow-right" /></button>
        <button type="button" className="btn quiet" onClick={p.onTour} data-tour="welcome-tour"><Icon name="ui-play" /> Take the tour</button>
        <p className="norm">These data are free to use and are cited when used: every view names its datasets, and <button type="button" className="linkish" onClick={p.onCite}>Share → Cite</button> writes the citation for you.</p>
      </div>
    </section>
  );
}

export function About(p: { release: string; nTables?: number; datasets: Row[]; cov: Coverage | null; onClose: () => void; short: (dk: string) => string; onTour: () => void; onFeedback: () => void; onSources: () => void; providerTable?: Map<string, string> | null; at?: string | null }) {
  // Help ▾ → Keyboard opens the modal on that section
  useEffect(() => { if (p.at) setTimeout(() => document.getElementById(`about-${p.at}`)?.scrollIntoView({ block: "start" }), 0); }, []);
  const span = (dk: string) => { const d = p.cov?.datasets.find((x) => x.dataset_key === dk); return d ? (d.year_min != null ? `${d.year_min}–${d.year_max}` : "no dates (region-pooled)") : ""; };
  const nobs = (dk: string) => p.cov?.datasets.find((x) => x.dataset_key === dk)?.n_obs;
  const ds = p.datasets.slice().sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || String(a.dataset_name_short).localeCompare(String(b.dataset_name_short)));
  return (
    <Modal id="about" title="About the CalCOFI Explorer" icon="ui-about" onClose={p.onClose} wide
      actions={<><button type="button" className="btn" onClick={p.onFeedback}><Icon name="ui-feedback" /> Feedback</button><button type="button" className="btn" onClick={p.onSources} data-tour="about-sources"><Icon name="ui-cite" /> Data Sources &amp; Attribution</button><button type="button" className="btn" onClick={p.onTour}><Icon name="ui-help" /> Tour</button><button type="button" className="btn primary" onClick={p.onClose}>Close</button></>}>
      <p>The explorer is one browser-native app over the <a href="https://calcofi.io/docs/" target="_blank" rel="noopener">integrated CalCOFI database</a>: sixteen datasets —
        hydrography, ichthyoplankton, zooplankton, seabirds and mammals, carbonate chemistry, weather — projected into one <code>obs</code> / <code>sample</code>
        core and read here through five <b>lenses</b> (stations, hexagons, cruises, regions, sections). The SQL runs in your browser (DuckDB-WASM), so no server
        stands between you and the release.</p>
      <h5 id="about-layers"><Icon name="ui-map-layers" /> Map layers</h5>
      <p>The sea floor under every lens is <a href="https://www.gebco.net/" target="_blank" rel="noopener">GEBCO 2025</a> — shaded
        relief, depth colour and isobaths, rendered in your browser from terrain tiles at
        <code> storage.calcofi.io/calcofi-db/bathymetry/</code> (GEBCO Compilation Group (2025) GEBCO 2025 Grid,
        doi:10.5285/37c52e96-24ea-67ce-e063-7086abc05f29 · public domain). The layers button on the map toggles and
        restyles it; <code>?bathy=off</code> in a link reproduces the plain basemap.</p>
      <h5><Icon name="ui-data" /> The release — <a className="cc-release" href={`https://calcofi.io/db-schema/#erd?v=${p.release}`} target="_blank" rel="noopener">release <b>{p.release}</b></a>{p.nTables ? <span className="hint"> · {p.nTables} tables</span> : null}</h5>
      <p>Every value on the page comes from this one <b>frozen</b> release: content-addressed objects that never change, so a link you share today draws the
        same picture next year, and <code>calcofi4r</code> / <code>calcofi4py</code> read the very same bytes. A new release is a new version; the header
        chip picks one. A statistic is <b>averaged across datasets that share this life stage and denominator; never across denominators
        or life stages</b> — the pills say which datasets are in view, and the <b>Sources</b> line under them says who to cite for each.</p>
      <h5 id="about-datasets"><Icon name="ui-layers" /> Datasets</h5>
      <p className="hint">Citations, licences, DOIs and how to reach each dataset's curators are in <button type="button" className="linkish" onClick={p.onSources}>Data Sources &amp; Attribution</button>.</p>
      <table className="about-datasets"><tbody>
        {ds.map((d) => <tr key={d.dataset_key}>
          <td><Icon name={categoryIcon(d.category)} title={d.category} /></td>
          <td><i className="dot" style={{ background: d.color ?? "var(--muted)" }} /> <b>{d.dataset_name_short ?? p.short(d.dataset_key)}</b><br /><span className="hint">{providerShort(d.provider, p.providerTable)}{span(d.dataset_key) ? ` · ${span(d.dataset_key)}` : ""}{nobs(d.dataset_key) ? ` · ${nobs(d.dataset_key)!.toLocaleString()} observations` : ""}</span></td>
          <td className="links">{d.link_calcofi_org && <a href={d.link_calcofi_org} target="_blank" rel="noopener">calcofi.org</a>}{d.link_data_source && <a href={d.link_data_source} target="_blank" rel="noopener">source</a>}{citationOf(d) && <button type="button" className="linkish" title={citationOf(d)} onClick={p.onSources}>cite</button>}</td>
        </tr>)}
        {!ds.length && <tr><td colSpan={3} className="hint">the dataset table loads with the engine…</td></tr>}
      </tbody></table>
      <h5 id="about-keyboard"><Icon name="ui-keyboard" /> Keyboard</h5>
      <p className="hint"><kbd>?</kbd> tour · <kbd>Esc</kbd> closes a dialog, the welcome or a chip's popover, or restores an expanded panel · <kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd> in the lists, <kbd>A</kbd>–<kbd>Z</kbd> strip to jump ·
        drag on the water column or the years to brush · every panel moves by its bar (double-click sends it home), collapses to a pill on the map's edge, expands to fill the map and resizes from its edges.</p>
      <h5 id="about-credits"><Icon name="ui-open" /> Credits</h5>
      <p className="hint">Data: CalCOFI (SIO, NOAA SWFSC, CDFW), CCE LTER, the Farallon Institute and the providers above, each with its own citation in <button type="button" className="linkish" onClick={p.onSources}>Data Sources &amp; Attribution</button> and in the download bundle.
        Built by Ben Best (EcoQuants) for CalCOFI with MapLibre GL, deck.gl, DuckDB-WASM and Plotly; basemap © CARTO © OpenStreetMap contributors.
        Better on a computer — nothing should fail on a phone; if it does, the feedback button tells us.
        Source: <a href="https://github.com/CalCOFI/explore" target="_blank" rel="noopener">github.com/CalCOFI/explore</a> · <a href="https://calcofi.io/docs/" target="_blank" rel="noopener">docs</a> · <a href="https://calcofi.io/db-schema/" target="_blank" rel="noopener">schema</a> · <a href="https://calcofi.io/db-query/" target="_blank" rel="noopener">query</a>.</p>
    </Modal>
  );
}
