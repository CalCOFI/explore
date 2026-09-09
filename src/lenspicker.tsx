// the lens picker (Ben, 2026-09-07: "seeing all six at once causes visual/mental friction"): the active lens reads
// full size — its icon, its name, one plain line under it — and the other five are icon-only slivers beside it.
// A sliver switches to that lens at once AND opens the six as rows with their help text, the new one selected
// (Ben, 2026-09-09: a click that only opened the list read as a switch that did not happen); the name opens the
// list alone; choosing a row closes it. Esc and a click outside close it too. One control, the same six ids the
// sentence's chip menu lists.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { LENSES, LENS_SHORT, LENS_DESC, LENS_ICON, LENS_TITLE, type Lens } from "./state";

export function LensPicker(p: { lens: Lens; onLens: (l: Lens) => void; "data-tour"?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); e.stopPropagation(); } };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", key, true); };
  }, [open]);
  const pick = (l: Lens) => { setOpen(false); if (l !== p.lens) p.onLens(l); };
  const others = LENSES.filter((l) => l !== p.lens);
  return (
    <div ref={ref} className={`lenspick${open ? " open" : ""}`} data-tour={p["data-tour"]}>
      {!open ? (
        <div className="lenspick-row">
          <button type="button" className="lenspick-active" aria-haspopup="listbox" aria-expanded={false} onClick={() => setOpen(true)} title="View as — the six ways to lay the data out">
            <Icon name={LENS_ICON[p.lens]} /><span className="nm">{LENS_SHORT[p.lens]}</span><Icon name="ui-down" className="car" size="0.9em" />
          </button>
          <div className="lenspick-slivers" role="group" aria-label="other lenses">
            {others.map((l) => <button key={l} type="button" className="sliver" aria-label={LENS_SHORT[l]} title={`${LENS_SHORT[l]} — ${LENS_DESC[l]}`} onClick={() => { p.onLens(l); setOpen(true); }}><Icon name={LENS_ICON[l]} /></button>)}
          </div>
        </div>
      ) : (
        <div className="lenspick-list" role="listbox" aria-label="view as">
          {LENSES.map((l) => (
            <button key={l} type="button" role="option" aria-selected={l === p.lens} className={`lenspick-item${l === p.lens ? " on" : ""}`} onClick={() => pick(l)} title={LENS_TITLE[l]}>
              <Icon name={LENS_ICON[l]} /><span className="txt"><b>{LENS_SHORT[l]}</b><span className="hint">{LENS_DESC[l]}</span></span>
            </button>))}
        </div>
      )}
      <div className="hint lenspick-desc">{LENS_DESC[p.lens]}</div>
    </div>
  );
}
