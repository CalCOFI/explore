// attribution surfaces (WS-A3, Erin 2026-09-02): the SELECT rail's **Sources** line and the
// **Data Sources & Attribution** modal. Both read the release's `dataset` rows through src/cite.ts —
// no fetch, no per-surface wording.
//
// The Sources line lists EVERY dataset the view pools, which is the attribution consequence of pooling:
// the statistics average across the datasets that share the chosen life stage and denominator, so each
// of those datasets is part of the number on the screen and each has to be cited.
import { useState } from "react";
import { Modal } from "./help";
import { Icon } from "./icons";
import { categoryIcon, categoryRank } from "./categories";
import type { Row } from "./engine";
import type { Catalog } from "./release";
import type { Coverage } from "./App";
import {
  CC_FRONT_DOOR, citationOf, citationText, contactHref, datasetPageUrl, doiUrl, dsLongName, dsName,
  licenseLabel, licenseUrl, NO_CITATION, providerShort, releaseCitation,
} from "./cite";

const copy = (text: string) => navigator.clipboard.writeText(text).then(() => true, () => false);

/** the licence as a chip; a link when the licence has a page, plain text when it only has a name.
 *  Nothing at all when the release does not state one — an absent licence is a fact, not a label. */
export function LicenseChip(p: { d: Row }) {
  const label = licenseLabel(p.d), url = licenseUrl(p.d);
  if (!label) return null;
  const title = `licence: ${label}${url ? ` — ${url}` : " (no licence page in this release)"}`;
  return url
    ? <a className="lic" href={url} target="_blank" rel="noopener" title={title} onClick={(e) => e.stopPropagation()}>{label}</a>
    : <span className="lic" title={title}>{label}</span>;
}

/** the SELECT rail's Sources line, directly under the dataset pills: one entry per dataset in view —
 *  `provider · dataset · licence` — that opens its own citation with a copy button. */
export function SourcesLine(p: { datasets: Row[]; providerTable?: Map<string, string> | null; onAll: () => void; loading?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const d = p.datasets.find((x) => x.dataset_key === open) ?? null;
  const cite = d ? citationOf(d) : "";
  return (
    <div className="sources" data-tour="sources">
      <div className="src-row">
        <span className="hint k"><Icon name="ui-cite" size="0.95rem" /> Sources</span>
        {p.datasets.map((x) => (
          <span key={x.dataset_key} className={`chip src${open === x.dataset_key ? " on" : ""}`}>
            <button type="button" className="src-btn" aria-expanded={open === x.dataset_key}
              title={`${citationOf(x) || NO_CITATION}\n\nclick for the citation`}
              onClick={() => setOpen(open === x.dataset_key ? null : x.dataset_key)}>
              <i className="dot" style={{ background: x.color ?? "var(--muted)" }} />
              {providerShort(x.provider, p.providerTable)} · {dsName(x)}
            </button>
            <LicenseChip d={x} />
          </span>
        ))}
        {!p.datasets.length && <span className="hint">{p.loading ?? "—"}</span>}
        <button type="button" className="linkish" onClick={p.onAll} title="every dataset in the release: citation, licence, DOI, PIs and how to reach them">all sources</button>
      </div>
      {d && <div className="src-cite">
        <div className="txt">{cite || NO_CITATION}</div>
        <div className="row">
          {cite && <button type="button" className="pill act" onClick={() => copy(citationText(d))}><Icon name="ui-copy" /> copy citation</button>}
          {doiUrl(d) && <a className="pill act" href={doiUrl(d)} target="_blank" rel="noopener"><Icon name="ui-open" /> DOI</a>}
          {d.link_data_source && <a className="pill act" href={d.link_data_source} target="_blank" rel="noopener"><Icon name="ui-open" /> source</a>}
          <a className="pill act" href={datasetPageUrl(String(d.dataset_key))} target="_blank" rel="noopener"><Icon name="ui-open" /> dataset page</a>
        </div>
      </div>}
    </div>
  );
}

/** the Data Sources & Attribution modal (`?modal=sources`, the header's ⋯ menu, and About): one row per
 *  DATASET — never per taxon or per variable, so the phytoplankton dataset is one row and not 393
 *  (Pooh Venrick, 2026-09-02) — with the release citation and one CalCOFI front door in the footer. */
export function SourcesModal(p: {
  release: string; catalog: Catalog | null; datasets: Row[]; cov: Coverage | null; inView: string[];
  providerTable?: Map<string, string> | null; short: (dk: string) => string;
  onClose: () => void; onRegister: () => void; onCite: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const say = (k: string) => { setCopied(k); setTimeout(() => setCopied((c) => (c === k ? null : c)), 1600); };
  const span = (dk: string) => { const d = p.cov?.datasets.find((x) => x.dataset_key === dk); return d ? (d.year_min != null ? `${d.year_min}–${d.year_max}` : "no dates (region-pooled)") : ""; };
  const nobs = (dk: string) => p.cov?.datasets.find((x) => x.dataset_key === dk)?.n_obs;
  const inView = new Set(p.inView);
  const ds = p.datasets.slice().sort((a, b) =>
    (inView.has(b.dataset_key) ? 1 : 0) - (inView.has(a.dataset_key) ? 1 : 0) ||
    categoryRank(a.category) - categoryRank(b.category) || String(dsName(a)).localeCompare(String(dsName(b))));
  const rel = releaseCitation(p.catalog, p.release);
  return (
    <Modal id="sources" title="Data Sources & Attribution" icon="ui-cite" onClose={p.onClose} wide
      actions={<>
        <button type="button" className="btn" onClick={p.onRegister}><Icon name="ui-product" /> Register a product</button>
        <button type="button" className="btn" onClick={p.onCite}><Icon name="ui-cite" /> Cite this data</button>
        <button type="button" className="btn primary" onClick={p.onClose}>Close</button>
      </>}>
      <p>Every value in the explorer comes from one of these datasets, collected and curated by the people named below and
        integrated into one frozen release. <b>Cite the dataset (or datasets) you used <i>and</i> the integrated database</b> —
        a view pools the datasets that share its life stage and denominator, so a single number can rest on several of them.
        The rows in view right now are listed first.</p>
      <table className="src-table"><tbody>
        {ds.map((d) => (
          <tr key={d.dataset_key} className={inView.has(d.dataset_key) ? "in-view" : ""}>
            <td className="ico"><Icon name={categoryIcon(d.category)} title={d.category} /></td>
            <td>
              <div className="nm"><i className="dot" style={{ background: d.color ?? "var(--muted)" }} />
                <b>{dsLongName(d)}</b> <code className="hint">{d.dataset_key}</code>
                {inView.has(d.dataset_key) && <span className="chip on tiny" title="this dataset is in the current view">in view</span>}</div>
              <div className="hint meta">{providerShort(d.provider, p.providerTable)}{span(d.dataset_key) ? ` · ${span(d.dataset_key)}` : ""}{nobs(d.dataset_key) ? ` · ${nobs(d.dataset_key)!.toLocaleString()} observations` : ""}</div>
              <div className={`cite${citationOf(d) ? "" : " none"}`}>{citationOf(d) || NO_CITATION}</div>
              {d.acknowledgement && <div className="hint ack">{d.acknowledgement}</div>}
              {d.pi_names && <div className="hint"><Icon name="ui-people" size="0.9rem" /> {d.pi_names}</div>}
            </td>
            <td className="links">
              {citationOf(d) && <button type="button" className="linkish" onClick={() => { copy(citationText(d)); say(d.dataset_key); }}>{copied === d.dataset_key ? "copied" : "copy citation"}</button>}
              <LicenseChip d={d} />
              {doiUrl(d) && <a href={doiUrl(d)} target="_blank" rel="noopener">DOI</a>}
              {contactHref(d) && <a href={contactHref(d)} target="_blank" rel="noopener">contact</a>}
              {d.link_calcofi_org && <a href={d.link_calcofi_org} target="_blank" rel="noopener">calcofi.org</a>}
              {d.link_data_source && <a href={d.link_data_source} target="_blank" rel="noopener">source</a>}
              <a href={datasetPageUrl(d.dataset_key)} target="_blank" rel="noopener">dataset page ↗</a>
            </td>
          </tr>
        ))}
        {!ds.length && <tr><td colSpan={3} className="hint">the dataset table loads with the engine…</td></tr>}
      </tbody></table>
      <h5><Icon name="ui-data" /> The integrated database</h5>
      <p className="cite">{rel}</p>
      <p><button type="button" className="pill act" onClick={() => { copy(rel); say("release"); }}><Icon name="ui-copy" /> {copied === "release" ? "copied" : "copy the release citation"}</button></p>
      <h5><Icon name="ui-people" /> Reaching the program, and telling us what you made</h5>
      <p>One front door for anything these pages do not answer — a question for a PI, a collaboration, a use of the data
        you would like reviewed: <a href={CC_FRONT_DOOR} target="_blank" rel="noopener">calcofi.io</a>. Where a dataset names
        its own <i>contact</i> above, that reaches its curators directly.</p>
      <p>Published something built on these data? <button type="button" className="linkish" onClick={p.onRegister}>Register a product</button> —
        it becomes a public issue the team reads, and helps the program show what the time series is for.</p>
    </Modal>
  );
}
