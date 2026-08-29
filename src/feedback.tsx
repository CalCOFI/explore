// the feedback dialog (plan D17): the view is captured (capture.ts), shown as a thumbnail with edit (the
// annotator) / retake, and posted with the text, the view URL, release, viewport and theme to the Apps Script
// endpoint calcofi4r::cc_feedback_script() generates — which writes the image to Drive, the row to the Sheet,
// mails the recipients tab and files a public issue in CalCOFI/explore without the email. The plain sentence
// says exactly that. "Open as GitHub issue myself" is the zero-backend path for developers.
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

export function FeedbackDialog(p: { url: string; release: string; onClose: () => void; capture: () => Promise<HTMLCanvasElement> }) {
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(true);
  const [annotating, setAnnotating] = useState(false);
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [include, setInclude] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; issue_url?: string; id?: string; error?: string; opaque?: boolean } | null>(null);
  const endpoint = feedbackEndpoint();
  const take = async () => { setCapturing(true); try { const c = await p.capture(); setShot(c); setThumb(c.toDataURL("image/jpeg", 0.7)); } catch (e: any) { setShot(null); setThumb(null); setResult({ ok: false, error: `capture failed: ${e.message}` }); } setCapturing(false); };
  useEffect(() => { take(); }, []);
  const viewport = `${innerWidth}×${innerHeight}`, theme = document.documentElement.dataset.theme ?? "dark";
  const issueBody = `**View:** ${p.url}\n**Release:** ${p.release} · ${viewport} · ${theme}\n\n${text || "_What happened / what did you expect?_"}\n\n`;
  const issueUrl = `https://github.com/CalCOFI/explore/issues/new?labels=feedback&body=${encodeURIComponent(issueBody)}`;
  const send = async () => {
    if (!endpoint || !text.trim()) return;
    setSending(true); setResult(null);
    try {
      let image: string | undefined;
      if (include && shot) { const { blob } = await fitBytes(shot, 3e6); image = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); }); }
      const payload = { app: "explore", url: p.url, release: p.release, viewport, theme, text: text.trim(), email: email.trim(), image, website: "", user_agent: navigator.userAgent };
      const res = await fetch(endpoint, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain;charset=UTF-8" }, redirect: "follow" });
      let j: any = null; try { j = await res.json(); } catch { /* an opaque or non-JSON answer: sent, not confirmed */ }
      if (j && j.ok === false) setResult({ ok: false, error: j.error ?? "the endpoint refused it" });
      else setResult({ ok: true, issue_url: j?.issue_url, id: j?.id, opaque: !j });
      track("feedback", { sent: true, image: !!image });
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
    </Modal>);
  return (
    <Modal id="feedback" title="Feedback" icon="ui-feedback" onClose={p.onClose} wide
      actions={<>
        <a className="btn" href={issueUrl} target="_blank" rel="noopener" onClick={copyImage} title="for developers: a prefilled public issue; the screenshot is copied to your clipboard to paste"><Icon name="ui-github" /> Open as GitHub issue myself</a>
        <button type="button" className="btn primary" disabled={!endpoint || !text.trim() || sending || capturing} onClick={send} data-tour="feedback-send"><Icon name="ui-send" /> {sending ? "Sending…" : "Send"}</button>
      </>}>
      <label className="f">What happened / what did you expect?
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="that spike at 1,144 m looks wrong — the station shows 2.2 ml/L in 1955 …" autoFocus data-tour="feedback-text" /></label>
      <div className="row feedback-row">
        <label className="f" style={{ flex: 1 }}>email <span className="hint">(optional — for a reply; never public)</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.org" /></label>
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
      <p className="hint">What is sent: your text, this view's URL, the release ({p.release}), the viewport ({viewport}) and theme ({theme}), and the screenshot — nothing else.
        It lands in a Sheet the team reads and, <b>without your email</b>, as a public issue in <code>CalCOFI/explore</code>.</p>
      {!endpoint && <p className="hint warn">This build has no feedback endpoint yet — use <i>Open as GitHub issue myself</i> (it copies the screenshot for you to paste).</p>}
      {result && !result.ok && <p className="hint warn">Not sent: {result.error}. Try again, or open the issue yourself.</p>}
    </Modal>);
}
