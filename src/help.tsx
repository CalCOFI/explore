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

export function Welcome(p: { release: string; onTour: () => void; onAgree: () => void; onClose: () => void }) {
  return (
    <Modal id="welcome" title="CalCOFI Explorer" icon="realm-env" onClose={p.onClose}
      actions={<><button type="button" className="btn" onClick={p.onTour} data-tour="welcome-tour"><Icon name="ui-help" /> Take the tour</button><button type="button" className="btn primary" onClick={p.onAgree} data-tour="welcome-cite"><Icon name="ui-cite" /> {CITE_ACK_LABEL}</button></>}>
      <p>One integrated database, one frozen release (<b className="mono">{p.release}</b>). Pick an <b>organism</b> or an <b>ocean variable</b>, and watch
        the 1949–present CalCOFI station grid regroup — by hexagon, cruise, region or section — with the water column and the years as brushes.
        Every view is a URL you can share, and every download carries the SQL that made it.</p>
      <p>These data were collected and curated by people who depend on being cited for it — sixteen datasets from CalCOFI, NOAA SWFSC,
        CCE LTER, Scripps, the Farallon Institute and CDFW. A view usually pools several of them, so one number can rest on several
        citations. <b>Please cite the datasets you use, and the integrated database.</b></p>
      <p className="hint cite-note">Downloads and figures name their datasets; <i>Cite this data</i> gives you the citations.</p>
      <p className="hint">Better on a computer; nothing should fail on a phone — if it does, the feedback button tells us.</p>
    </Modal>
  );
}

export function About(p: { release: string; nTables?: number; datasets: Row[]; cov: Coverage | null; onClose: () => void; short: (dk: string) => string; onTour: () => void; onFeedback: () => void; onSources: () => void; providerTable?: Map<string, string> | null }) {
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
      <h5><Icon name="ui-map-layers" /> Map layers</h5>
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
      <h5><Icon name="ui-layers" /> Datasets</h5>
      <p className="hint">Citations, licences, DOIs and how to reach each dataset's curators are in <button type="button" className="linkish" onClick={p.onSources}>Data Sources &amp; Attribution</button>.</p>
      <table className="about-datasets"><tbody>
        {ds.map((d) => <tr key={d.dataset_key}>
          <td><Icon name={categoryIcon(d.category)} title={d.category} /></td>
          <td><i className="dot" style={{ background: d.color ?? "var(--muted)" }} /> <b>{d.dataset_name_short ?? p.short(d.dataset_key)}</b><br /><span className="hint">{providerShort(d.provider, p.providerTable)}{span(d.dataset_key) ? ` · ${span(d.dataset_key)}` : ""}{nobs(d.dataset_key) ? ` · ${nobs(d.dataset_key)!.toLocaleString()} observations` : ""}</span></td>
          <td className="links">{d.link_calcofi_org && <a href={d.link_calcofi_org} target="_blank" rel="noopener">calcofi.org</a>}{d.link_data_source && <a href={d.link_data_source} target="_blank" rel="noopener">source</a>}{citationOf(d) && <button type="button" className="linkish" title={citationOf(d)} onClick={p.onSources}>cite</button>}</td>
        </tr>)}
        {!ds.length && <tr><td colSpan={3} className="hint">the dataset table loads with the engine…</td></tr>}
      </tbody></table>
      <h5><Icon name="ui-keyboard" /> Keyboard</h5>
      <p className="hint"><kbd>?</kbd> tour · <kbd>Esc</kbd> closes a dialog or restores a maximized panel · <kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd> in the lists, <kbd>A</kbd>–<kbd>Z</kbd> strip to jump ·
        drag on the water column or the years to brush; a folded rail is a pill, click it to expand.</p>
      <h5><Icon name="ui-open" /> Credits</h5>
      <p className="hint">Data: CalCOFI (SIO, NOAA SWFSC, CDFW), CCE LTER, the Farallon Institute and the providers above, each with its own citation in <button type="button" className="linkish" onClick={p.onSources}>Data Sources &amp; Attribution</button> and in the download bundle.
        Built by Ben Best (EcoQuants) for CalCOFI with MapLibre GL, deck.gl, DuckDB-WASM and Plotly; basemap © CARTO © OpenStreetMap contributors.
        Better on a computer — nothing should fail on a phone; if it does, the feedback button tells us.
        Source: <a href="https://github.com/CalCOFI/explore" target="_blank" rel="noopener">github.com/CalCOFI/explore</a> · <a href="https://calcofi.io/docs/" target="_blank" rel="noopener">docs</a> · <a href="https://calcofi.io/db-schema/" target="_blank" rel="noopener">schema</a> · <a href="https://calcofi.io/db-query/" target="_blank" rel="noopener">query</a>.</p>
    </Modal>
  );
}
