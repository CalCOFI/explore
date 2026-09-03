// the feedback dialog (plan D17): the view is captured (capture.ts), shown as a thumbnail with edit (the
// annotator) / retake, and posted with the text, the view URL, release, viewport and theme to the Apps Script
// endpoint calcofi4r::cc_feedback_script() generates — which writes the image to Drive, the row to the Sheet,
// mails the recipients tab and files a public issue in CalCOFI/explore without the email. The plain sentence
// says exactly that. "Open as GitHub issue myself" is the zero-backend path for developers.
//
// WS-A3 adds a SECOND KIND through the same pipe: **Register a product** — "I used CalCOFI data in …" with a
// title, a link or DOI and the datasets in view prefilled, labelled `derived-product`. Q3 (2026-09-03) may yet
// move the sink to a Google Form Erin owns; the entry point and the payload stay, only `post()` changes.
import { useEffect, useState } from "react";
import { Modal } from "./help";
import { Icon } from "./icons";
import { Annotator } from "./annotate";
import { fitBytes } from "./capture";
import { track } from "./track";

/** the endpoint: the build's VITE_FEEDBACK_URL (a Pages repository variable), else a localStorage override (tests, a staging deploy) */
export function feedbackEndpoint(): string | null {
  const env = (import.meta.env.VITE_FEEDBACK_URL as string | undefined)?.trim();
  if (env && /^https?:\/\//.test(env)) return env;
  try { const v = localStorage.getItem("explore.feedback_url"); if (v && /^https?:\/\//.test(v)) return v; } catch { /* private mode */ }
  return null;
}

export type FeedbackKind = "feedback" | "product";
/** the GitHub label each kind files under; the Apps Script reads `label` from the payload, and the
 *  zero-backend fallback puts it straight in the issue URL */
export const KIND_LABEL: Record<FeedbackKind, string> = { feedback: "feedback", product: "derived-product" };

export function FeedbackDialog(p: { url: string; release: string; kind?: FeedbackKind; datasets?: string[]; onClose: () => void; capture: () => Promise<HTMLCanvasElement> }) {
  const kind: FeedbackKind = p.kind ?? "feedback";
  const product = kind === "product";
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(true);
  const [annotating, setAnnotating] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [email, setEmail] = useState("");
  const [include, setInclude] = useState(!product);   // a product registration is about the paper, not the view
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; issue_url?: string; id?: string; error?: string; opaque?: boolean } | null>(null);
  const endpoint = feedbackEndpoint();
  const take = async () => { setCapturing(true); try { const c = await p.capture(); setShot(c); setThumb(c.toDataURL("image/jpeg", 0.7)); } catch (e: any) { setShot(null); setThumb(null); setResult({ ok: false, error: `capture failed: ${e.message}` }); } setCapturing(false); };
  useEffect(() => { take(); }, []);
  const viewport = `${innerWidth}×${innerHeight}`, theme = document.documentElement.dataset.theme ?? "dark";
  const datasets = p.datasets ?? [];
  // the product's text is composed from its fields, so the Sheet row and the issue body read the same
  const body = product
    ? [title.trim() && `**${title.trim()}**`, link.trim() && `Link / DOI: ${link.trim()}`, text.trim(), datasets.length && `Datasets used (from the view): ${datasets.join(", ")}`].filter(Boolean).join("\n\n")
    : text.trim();
  const ready = product ? !!title.trim() : !!text.trim();
  const issueBody = `**View:** ${p.url}\n**Release:** ${p.release} · ${viewport} · ${theme}\n${datasets.length ? `**Datasets:** ${datasets.join(", ")}\n` : ""}\n${body || (product ? "_What did you make, and where can we read it?_" : "_What happened / what did you expect?_")}\n\n`;
  const issueUrl = `https://github.com/CalCOFI/explore/issues/new?labels=${KIND_LABEL[kind]}&title=${encodeURIComponent(product && title.trim() ? title.trim() : "")}&body=${encodeURIComponent(issueBody)}`;
  const send = async () => {
    if (!endpoint || !ready) return;
    setSending(true); setResult(null);
    try {
      let image: string | undefined;
      if (include && shot) { const { blob } = await fitBytes(shot, 3e6); image = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); }); }
      const payload = { app: "explore", kind, label: KIND_LABEL[kind], title: product ? title.trim() : "", link: product ? link.trim() : "", datasets: datasets.join(","),
        url: p.url, release: p.release, viewport, theme, text: body, email: email.trim(), image, website: "", user_agent: navigator.userAgent };
      const res = await fetch(endpoint, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain;charset=UTF-8" }, redirect: "follow" });
      let j: any = null; try { j = await res.json(); } catch { /* an opaque or non-JSON answer: sent, not confirmed */ }
      if (j && j.ok === false) setResult({ ok: false, error: j.error ?? "the endpoint refused it" });
      else setResult({ ok: true, issue_url: j?.issue_url, id: j?.id, opaque: !j });
      track(product ? "product" : "feedback", { sent: true, image: !!image });
    } catch (e: any) { setResult({ ok: false, error: e.message }); }
    setSending(false);
  };
  const copyImage = async () => { if (!shot) return; try { await navigator.clipboard.write([new ClipboardItem({ "image/png": await new Promise<Blob>((ok) => shot.toBlob((b) => ok(b!), "image/png")) })]); } catch { /* blocked */ } };

  if (annotating && shot) return (
    <Modal id="feedback" title="Mark up the screenshot" icon="ui-pen" onClose={() => setAnnotating(false)} wide>
      <Annotator image={shot} onDone={(c) => { setShot(c); setThumb(c.toDataURL("image/jpeg", 0.7)); setAnnotating(false); }} onCancel={() => setAnnotating(false)} />
    </Modal>);
  if (result?.ok) return (
    <Modal id="feedback" title="Thank you" icon="ui-check" onClose={p.onClose} actions={<button type="button" className="btn primary" onClick={p.onClose}>Close</button>}>
      <p>{result.opaque ? "Sent." : "Received."} The team gets it by mail{result.issue_url ? <> and it is public issue <a href={result.issue_url} target="_blank" rel="noopener">{result.issue_url.replace(/^https?:\/\/github\.com\//, "")}</a></> : ""}{result.id ? <span className="hint"> · id {result.id}</span> : null}.</p>
      {product && <p className="hint">Thank you for telling us — a registered product is how the program shows what six decades of sampling is for.</p>}
    </Modal>);
  return (
    <Modal id="feedback" title={product ? "Register a product" : "Feedback"} icon={product ? "ui-product" : "ui-feedback"} onClose={p.onClose} wide
      actions={<>
        <a className="btn" href={issueUrl} target="_blank" rel="noopener" onClick={copyImage} title={`for developers: a prefilled public issue (label ${KIND_LABEL[kind]}); the screenshot is copied to your clipboard to paste`}><Icon name="ui-github" /> Open as GitHub issue myself</a>
        <button type="button" className="btn primary" disabled={!endpoint || !ready || sending || capturing} onClick={send} data-tour="feedback-send"><Icon name="ui-send" /> {sending ? "Sending…" : product ? "Register" : "Send"}</button>
      </>}>
      {product ? <>
        <p>Used CalCOFI data in a paper, a thesis, a model, a map, a class? Tell us — it becomes a public issue the team reads, and it
          is how the program shows what the time series is for. Nothing here is verified or endorsed; it is a record that the data were used.</p>
        <label className="f">Title <span className="hint">(the paper, product or project)</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Larval sardine distribution shifts, 1951–2024" autoFocus data-tour="product-title" /></label>
        <label className="f">Link or DOI <span className="hint">(optional)</span>
          <input type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://doi.org/10.1234/abcd" data-tour="product-link" /></label>
        <label className="f">Anything else we should know? <span className="hint">(optional)</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="uses the per-10 m² larval densities, 1985–2020, lines 80–93 …" data-tour="feedback-text" /></label>
        <div className="row f-datasets" data-tour="product-datasets">
          <span className="hint">Datasets in this view</span>
          {datasets.length ? datasets.map((d) => <span key={d} className="chip tiny">{d}</span>) : <span className="hint">— none in view</span>}
        </div>
      </> : (
        <label className="f">What happened / what did you expect?
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="that spike at 1,144 m looks wrong — the station shows 2.2 ml/L in 1955 …" autoFocus data-tour="feedback-text" /></label>
      )}
      <div className="row feedback-row">
        <label className="f" style={{ flex: 1 }}>email <span className="hint">(optional — you get a copy of this report and any reply; never public)</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.org" /></label>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, width: 1, height: 1 }} aria-hidden="true" />
      </div>
      <div className="feedback-shot" data-tour="feedback-shot">
        {capturing ? <div className="hint pad">capturing the view…</div> : thumb ? <img src={thumb} alt="the captured view" className={include ? "" : "off"} /> : <div className="hint pad">no screenshot</div>}
        <div className="row">
          <label className="row"><input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} /> include screenshot</label>
          <button type="button" className="pill act" disabled={!shot || capturing} onClick={() => setAnnotating(true)} data-tour="feedback-edit"><Icon name="ui-pen" /> edit</button>
          <button type="button" className="pill act" disabled={capturing} onClick={take}><Icon name="ui-capture" /> retake</button>
        </div>
      </div>
      <p className="hint">What is sent: your {product ? "entry" : "text"}, this view's URL, the release ({p.release}){datasets.length ? `, the datasets in view (${datasets.join(", ")})` : ""}, the viewport ({viewport}) and theme ({theme}), and the screenshot{include ? "" : " (off)"} — nothing else.
        It goes to the team by mail and lands in a Sheet they read and, <b>without your email</b>, as a public issue in <code>CalCOFI/explore</code> labelled <code>{KIND_LABEL[kind]}</code>; with an email you get the same report back.</p>
      {!endpoint && <p className="hint warn">This build has no feedback endpoint yet — use <i>Open as GitHub issue myself</i> (it copies the screenshot for you to paste).</p>}
      {result && !result.ok && <p className="hint warn">Not sent: {result.error}. Try again, or open the issue yourself.</p>}
    </Modal>);
}
