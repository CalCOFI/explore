// the Layers card (plan 2026-08-31, D25 — the Sea-floor half; the boundary layers arrive with slice 3)
import { BATHY_PARTS, type BathyPart, type Sel } from "./state";
import { bathyDefaultOpacity } from "./basemap";

const LABELS: Record<BathyPart, string> = { relief: "shaded relief", depth: "depth colour", contours: "contours" };

export function LayersCard(p: { sel: Sel; setSel: (s: Partial<Sel>) => void; theme: "dark" | "light" }) {
  const parts = p.sel.bathy ?? [...BATHY_PARTS];
  const on = parts.length > 0;
  const def = bathyDefaultOpacity(p.theme);
  const o = p.sel.bathyo ?? def;
  const set = (next: BathyPart[]) => p.setSel({ bathy: next.length === BATHY_PARTS.length ? null : next }); // the default (all three) stays out of the URL
  const toggle = (x: BathyPart) => set(BATHY_PARTS.filter((v) => (v === x ? !parts.includes(v) : parts.includes(v))));
  return (
    <div className="layers-body">
      <label className="layers-row layers-main">
        <input type="checkbox" checked={on} onChange={() => set(on ? [] : [...BATHY_PARTS])} />
        <b>Sea floor</b> <span className="hint">GEBCO 2025</span>
      </label>
      {BATHY_PARTS.map((x) => (
        <label key={x} className="layers-row layers-sub">
          <input type="checkbox" disabled={!on} checked={parts.includes(x)} onChange={() => toggle(x)} />
          {LABELS[x]}
        </label>
      ))}
      <label className="layers-row layers-opacity">
        <span className="hint">opacity</span>
        <input type="range" min={0.1} max={1} step={0.05} disabled={!on} value={o}
          onChange={(e) => { const v = Math.round(+e.target.value * 100) / 100; p.setSel({ bathyo: v === def ? null : v }); }} />
        <span className="hint">{o.toFixed(2)}</span>
      </label>
      <p className="hint layers-note">Boundary layers (EEZ, sanctuaries, MPAs …) arrive next.</p>
    </div>
  );
}
