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
  const mine = ds.filter((d) => inView.has(d.dataset_key)), other = ds.filter((d) => !inView.has(d.dataset_key));
  // the small links, each URL once: a dataset whose calcofi.org page IS its original source shows one link, not two
  const minorLinks = (d: Row) => {
    const seen = new Set<string>(), out: { label: string; href: string; tip: string }[] = [];
    const add = (label: string, href: string | null | undefined, tip: string) => { if (href && !seen.has(href)) { seen.add(href); out.push({ label, href, tip }); } };
    add("CalCOFI.io dataset page ↗", datasetPageUrl(d.dataset_key), "CalCOFI's own page for this dataset (calcofi.io): what it holds, its variables, how it was processed");
    add("Original data source ↗", d.link_data_source, "the data provider's own copy of the original, unprocessed files");
    add("calcofi.org page ↗", d.link_calcofi_org, "this dataset's page on the CalCOFI program website, calcofi.org");
    add("DOI", doiUrl(d), "the dataset's DOI");
    add("Contact", contactHref(d), "write to the people who curate this dataset");
    return out;
  };
  const rows = (list: Row[]) => (
    <>
        {list.map((d) => (
          <tr key={d.dataset_key} className={inView.has(d.dataset_key) ? "in-view" : ""}>
            <td>
              <div className="nm"><span className="cat"><Icon name={categoryIcon(d.category)} title={d.category} /></span><i className="dot" style={{ background: d.color ?? "var(--muted)" }} />
                <b>{dsLongName(d)}</b> <code className="hint">{d.dataset_key}</code>
                {inView.has(d.dataset_key) && <span className="inview-badge" title="this dataset is in the current view"><Icon name="ui-check" size="0.85rem" /> In view</span>}</div>
              <div className="hint meta">{providerShort(d.provider, p.providerTable)}{span(d.dataset_key) ? ` · ${span(d.dataset_key)}` : ""}{nobs(d.dataset_key) ? ` · ${nobs(d.dataset_key)!.toLocaleString()} observations` : ""}</div>
              <div className={`cite${citationOf(d) ? "" : " none"}`}>{citationOf(d) || NO_CITATION}</div>
              {d.acknowledgement && <div className="hint ack">{d.acknowledgement}</div>}
              {d.pi_names && <div className="hint"><Icon name="ui-people" size="0.9rem" /> {d.pi_names}</div>}
            </td>
            <td className="links">
              <div className="src-act">
                {citationOf(d) && <button type="button" className="src-b1" onClick={() => { copy(citationText(d)); say(d.dataset_key); }}><Icon name="ui-copy" size="0.95rem" /> {copied === d.dataset_key ? "Copied" : "Copy citation"}</button>}
              </div>
              <div className="src-minor">
                <LicenseChip d={d} />
                {minorLinks(d).map((l) => <a key={l.label} href={l.href} target="_blank" rel="noopener" title={l.tip}>{l.label}</a>)}
              </div>
            </td>
          </tr>
        ))}
    </>
  );
  const rel = releaseCitation(p.catalog, p.release);
  return (
    <Modal id="sources" title="Data Sources & Attribution" icon="ui-cite" onClose={p.onClose} wide
      actions={<>
        <button type="button" className="btn" onClick={p.onRegister}><Icon name="ui-product" /> Register a product</button>
        <button type="button" className="btn" onClick={p.onCite}><Icon name="ui-cite" /> Cite this data</button>
        <button type="button" className="btn primary" onClick={p.onClose}>Close</button>
      </>}>
      <p className="src-intro">Every value comes from the datasets below. <b>Cite each dataset you used, plus the CalCOFI database.</b> One number can rest on several datasets.</p>
      {mine.length > 0 && <>
        <h5 className="src-h in"><Icon name="ui-check" size="0.95rem" /> Used in this view <span className="n">{mine.length}</span></h5>
        <table className="src-table in"><tbody>{rows(mine)}</tbody></table>
      </>}
      <details className="src-more" open={!mine.length || undefined}>
        <summary>{mine.length ? "Other CalCOFI datasets" : "All CalCOFI datasets"} <span className="n">{other.length}</span></summary>
        <table className="src-table"><tbody>{rows(other)}
        {!ds.length && <tr><td colSpan={3} className="hint">the dataset table loads with the engine…</td></tr>}
        </tbody></table>
      </details>
      <h5><Icon name="ui-data" /> CalCOFI database</h5>
      <p className="hint">Cite this too — it holds all the datasets together.</p>
      <p className="cite">{rel}</p>
      <p><button type="button" className="pill act" onClick={() => { copy(rel); say("release"); }}><Icon name="ui-copy" /> {copied === "release" ? "copied" : "Copy citation"}</button></p>
      <h5><Icon name="ui-people" /> Questions, or built something with this data?</h5>
      <p>For a question, a collaboration, or a use of the data you'd like reviewed, get in touch at <a href={CC_FRONT_DOOR} target="_blank" rel="noopener">calcofi.io</a>. A dataset's own <i>Contact</i> link reaches its curators directly.</p>
      <p>Published something built on these data? <button type="button" className="linkish" onClick={p.onRegister}>Register a product</button> — it becomes a public issue the team reads.</p>
    </Modal>
  );
}
