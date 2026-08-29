// the screenshot annotator (plan D17): the captured view in a canvas with arrow · circle · rectangle · pen ·
// text, two colours that read on dark and light maps (the accent and the warn yellow), undo and clear. A
// shapes array redrawn over the image on every change; pointer events, so touch works. Hand-rolled — marker.js
// is commercial, fabric is 300 KB, tldraw is an app.
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";

type Tool = "arrow" | "circle" | "rect" | "pen" | "text";
interface Shape { tool: Tool; color: string; x0: number; y0: number; x1: number; y1: number; path?: [number, number][]; text?: string }
const TOOLS: { id: Tool; icon: IconName; label: string }[] = [
  { id: "arrow", icon: "ui-arrow", label: "arrow" }, { id: "circle", icon: "ui-circle", label: "circle" }, { id: "rect", icon: "ui-rect", label: "rectangle" },
  { id: "pen", icon: "ui-pen", label: "pen" }, { id: "text", icon: "ui-text", label: "text" },
];
const COLORS = { accent: "#4dabf7", warn: "#ffd60a" };

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, k: number) {
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 3 * k; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 2 * k;
  const { x0, y0, x1, y1 } = s;
  if (s.tool === "pen" && s.path) { ctx.beginPath(); s.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  else if (s.tool === "rect") ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  else if (s.tool === "circle") { ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.max(2, Math.abs(x1 - x0) / 2), Math.max(2, Math.abs(y1 - y0) / 2), 0, 0, Math.PI * 2); ctx.stroke(); }
  else if (s.tool === "arrow") {
    const a = Math.atan2(y1 - y0, x1 - x0), h = 14 * k;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45)); ctx.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
  } else if (s.tool === "text" && s.text) {
    ctx.font = `600 ${16 * k}px system-ui, sans-serif`; ctx.textBaseline = "top";
    const w = ctx.measureText(s.text).width + 10 * k;
    ctx.shadowBlur = 0; ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(x0 - 5 * k, y0 - 3 * k, w, 22 * k);
    ctx.fillStyle = s.color; ctx.fillText(s.text, x0, y0);
  }
  ctx.shadowBlur = 0;
}

export function Annotator(p: { image: HTMLCanvasElement; onDone: (canvas: HTMLCanvasElement) => void; onCancel: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState<string>(COLORS.warn);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [live, setLive] = useState<Shape | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const W = p.image.width, H = p.image.height;
  // the canvas is the image's size; CSS scales it to fit, so shapes are in image pixels
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!; ctx.clearRect(0, 0, W, H); ctx.drawImage(p.image, 0, 0);
    const k = Math.max(1, W / 1400);
    for (const s of shapes) drawShape(ctx, s, k);
    if (live) drawShape(ctx, live, k);
  }, [shapes, live, p.image]);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const down = (e: React.PointerEvent) => {
    const { x, y } = pos(e);
    if (tool === "text") { setTextAt({ x, y }); setText(""); return; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setLive({ tool, color, x0: x, y0: y, x1: x, y1: y, path: tool === "pen" ? [[x, y]] : undefined });
  };
  const move = (e: React.PointerEvent) => { if (!live) return; const { x, y } = pos(e); setLive({ ...live, x1: x, y1: y, path: live.path ? [...live.path, [x, y]] : undefined }); };
  const up = () => { if (!live) return; if (Math.abs(live.x1 - live.x0) + Math.abs(live.y1 - live.y0) > 3 || live.path) setShapes((s) => [...s, live]); setLive(null); };
  const commitText = () => { if (textAt && text.trim()) setShapes((s) => [...s, { tool: "text", color, x0: textAt.x, y0: textAt.y, x1: textAt.x, y1: textAt.y, text: text.trim() }]); setTextAt(null); setText(""); };
  const done = () => { const c = ref.current!; const out = document.createElement("canvas"); out.width = W; out.height = H; out.getContext("2d")!.drawImage(c, 0, 0); p.onDone(out); };
  return (
    <div className="annotator" data-tour="annotator">
      <div className="row annot-tools">
        <span className="seg" role="group" aria-label="tool">{TOOLS.map((t) => <button key={t.id} type="button" className={tool === t.id ? "on" : ""} title={t.label} aria-label={t.label} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}><Icon name={t.icon} /></button>)}</span>
        <span className="seg" role="group" aria-label="colour">
          <button type="button" className={color === COLORS.warn ? "on" : ""} aria-label="yellow" onClick={() => setColor(COLORS.warn)}><i className="dot" style={{ background: COLORS.warn, width: 12, height: 12 }} /></button>
          <button type="button" className={color === COLORS.accent ? "on" : ""} aria-label="blue" onClick={() => setColor(COLORS.accent)}><i className="dot" style={{ background: COLORS.accent, width: 12, height: 12 }} /></button>
        </span>
        <span className="seg"><button type="button" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length} title="undo"><Icon name="ui-undo" /> undo</button><button type="button" onClick={() => setShapes([])} disabled={!shapes.length} title="clear"><Icon name="ui-clear" /> clear</button></span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={p.onCancel}>Cancel</button>
        <button type="button" className="btn primary" onClick={done}><Icon name="ui-check" /> Done</button>
      </div>
      <div className="annot-stage">
        <canvas ref={ref} width={W} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ cursor: tool === "text" ? "text" : "crosshair", touchAction: "none" }} />
        {textAt && <input className="annot-text" autoFocus value={text} placeholder="type, then Enter" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextAt(null); }} onBlur={commitText}
          style={{ left: `${(textAt.x / W) * 100}%`, top: `${(textAt.y / H) * 100}%`, color }} />}
      </div>
      <div className="hint">draw on the picture: an arrow to the spike, a circle around the odd dot, a word or two · {shapes.length} mark{shapes.length === 1 ? "" : "s"}</div>
    </div>
  );
}
