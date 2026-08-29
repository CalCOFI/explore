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

export const WELCOME_KEY = "explore_welcome";
export const seenWelcome = () => { try { return localStorage.getItem(WELCOME_KEY) === "1"; } catch { return true; } };
export const markWelcome = () => { try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* private mode */ } };

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

export function Welcome(p: { release: string; onTour: () => void; onClose: () => void }) {
  return (
    <Modal id="welcome" title="CalCOFI Explorer" icon="realm-env" onClose={p.onClose}
      actions={<><button type="button" className="btn" onClick={p.onClose}>Explore</button><button type="button" className="btn primary" onClick={p.onTour} data-tour="welcome-tour"><Icon name="ui-help" /> Take the tour</button></>}>
      <p>One integrated database, one frozen release (<b className="mono">{p.release}</b>). Pick an <b>organism</b> or an <b>ocean variable</b>, and watch
        the 1949–present CalCOFI station grid regroup — by hexagon, cruise, region or section — with the water column and the years as brushes.
        Every view is a URL you can share, and every download carries the SQL that made it.</p>
      <p className="hint">Better on a computer; nothing should fail on a phone — if it does, the feedback button tells us.</p>
    </Modal>
  );
}

const provName: Record<string, string> = { calcofi: "CalCOFI", swfsc: "NOAA SWFSC", "cce-lter": "CCE LTER", sio: "Scripps Institution of Oceanography", farallon: "Farallon Institute", cdfw: "CDFW" };
export function About(p: { release: string; nTables?: number; datasets: Row[]; cov: Coverage | null; onClose: () => void; short: (dk: string) => string; onTour: () => void; onFeedback: () => void }) {
  const span = (dk: string) => { const d = p.cov?.datasets.find((x) => x.dataset_key === dk); return d ? (d.year_min != null ? `${d.year_min}–${d.year_max}` : "no dates (region-pooled)") : ""; };
  const nobs = (dk: string) => p.cov?.datasets.find((x) => x.dataset_key === dk)?.n_obs;
  const ds = p.datasets.slice().sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || String(a.dataset_name_short).localeCompare(String(b.dataset_name_short)));
  return (
    <Modal id="about" title="About the CalCOFI Explorer" icon="ui-about" onClose={p.onClose} wide
      actions={<><button type="button" className="btn" onClick={p.onFeedback}><Icon name="ui-feedback" /> Feedback</button><button type="button" className="btn" onClick={p.onTour}><Icon name="ui-help" /> Tour</button><button type="button" className="btn primary" onClick={p.onClose}>Close</button></>}>
      <p>The explorer is one browser-native app over the <a href="https://calcofi.io/docs/" target="_blank" rel="noopener">integrated CalCOFI database</a>: sixteen datasets —
        hydrography, ichthyoplankton, zooplankton, seabirds and mammals, carbonate chemistry, weather — projected into one <code>obs</code> / <code>sample</code>
        core and read here through five <b>lenses</b> (stations, hexagons, cruises, regions, sections). The SQL runs in your browser (DuckDB-WASM), so no server
        stands between you and the release.</p>
      <h5><Icon name="ui-data" /> The release — <a className="cc-release" href={`https://calcofi.io/db-schema/#erd?v=${p.release}`} target="_blank" rel="noopener">release <b>{p.release}</b></a>{p.nTables ? <span className="hint"> · {p.nTables} tables</span> : null}</h5>
      <p>Every value on the page comes from this one <b>frozen</b> release: content-addressed objects that never change, so a link you share today draws the
        same picture next year, and <code>calcofi4r</code> / <code>calcofi4py</code> read the very same bytes. A new release is a new version; the header
        chip picks one. Nothing is averaged across datasets, denominators or life stages — the pills say what is in view.</p>
      <h5><Icon name="ui-layers" /> Datasets</h5>
      <table className="about-datasets"><tbody>
        {ds.map((d) => <tr key={d.dataset_key}>
          <td><Icon name={categoryIcon(d.category)} title={d.category} /></td>
          <td><i className="dot" style={{ background: d.color ?? "var(--muted)" }} /> <b>{d.dataset_name_short ?? p.short(d.dataset_key)}</b><br /><span className="hint">{provName[d.provider] ?? d.provider}{span(d.dataset_key) ? ` · ${span(d.dataset_key)}` : ""}{nobs(d.dataset_key) ? ` · ${nobs(d.dataset_key)!.toLocaleString()} observations` : ""}</span></td>
          <td className="links">{d.link_calcofi_org && <a href={d.link_calcofi_org} target="_blank" rel="noopener">calcofi.org</a>}{d.link_data_source && <a href={d.link_data_source} target="_blank" rel="noopener">source</a>}{d.citation_main && <span className="hint" title={d.citation_main}>cite</span>}</td>
        </tr>)}
        {!ds.length && <tr><td colSpan={3} className="hint">the dataset table loads with the engine…</td></tr>}
      </tbody></table>
      <h5><Icon name="ui-keyboard" /> Keyboard</h5>
      <p className="hint"><kbd>?</kbd> tour · <kbd>Esc</kbd> closes a dialog or restores a maximized panel · <kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd> in the lists, <kbd>A</kbd>–<kbd>Z</kbd> strip to jump ·
        drag on the water column or the years to brush; a folded rail is a pill, click it to expand.</p>
      <h5><Icon name="ui-open" /> Credits</h5>
      <p className="hint">Data: CalCOFI (SIO, NOAA SWFSC, CDFW), CCE LTER, the Farallon Institute and the providers above, each with its own citation in the download bundle.
        Built by Ben Best (EcoQuants) for CalCOFI with MapLibre GL, deck.gl, DuckDB-WASM and Plotly; basemap © CARTO © OpenStreetMap contributors.
        Better on a computer — nothing should fail on a phone; if it does, the feedback button tells us.
        Source: <a href="https://github.com/CalCOFI/explore" target="_blank" rel="noopener">github.com/CalCOFI/explore</a> · <a href="https://calcofi.io/docs/" target="_blank" rel="noopener">docs</a> · <a href="https://calcofi.io/db-schema/" target="_blank" rel="noopener">schema</a> · <a href="https://calcofi.io/db-query/" target="_blank" rel="noopener">query</a>.</p>
    </Modal>
  );
}

/** until U4b: the view URL into a public issue (the "open as GitHub issue myself" half of D17) */
export function FeedbackStub(p: { url: string; release: string; onClose: () => void }) {
  const body = `**View:** ${p.url}\n**Release:** ${p.release} · ${innerWidth}×${innerHeight} · ${document.documentElement.dataset.theme}\n\n_What happened / what did you expect?_\n\n`;
  const issue = `https://github.com/CalCOFI/explore/issues/new?labels=feedback&body=${encodeURIComponent(body)}`;
  const copy = async () => { try { await navigator.clipboard.writeText(p.url); } catch { /* blocked */ } };
  return (
    <Modal id="feedback" title="Feedback" icon="ui-feedback" onClose={p.onClose}
      actions={<><button type="button" className="btn" onClick={copy}><Icon name="ui-link" /> Copy this view's link</button><a className="btn primary" href={issue} target="_blank" rel="noopener"><Icon name="ui-github" /> Open a GitHub issue</a></>}>
      <p>Tell us what you saw and what you expected. The issue opens <b>public</b> in <code>CalCOFI/explore</code> with this view's URL and the release already in it —
        so "that spike is weird" is reproducible by anyone who opens the link. Paste a screenshot into the issue if it helps.</p>
      <p className="hint">Coming next: a dialog that captures the view, lets you circle the spike, and sends it to the team without a GitHub account.</p>
      <pre className="hint" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{p.url}</pre>
    </Modal>
  );
}
