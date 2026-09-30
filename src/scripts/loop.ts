/**
 * An endless horizontal strip (work reel and footer ticker).
 * One set of children is cloned until the strip is always full; the position wraps by
 * the width of one set, so it never jumps. Clones are hidden from assistive tech and focus.
 */
export interface LoopItem {
  el: HTMLElement;
  left: number;
  w: number;
  /** Index of the original this element represents. */
  i: number;
}

export interface Loop {
  x: number;
  readonly setW: number;
  items(): LoopItem[];
  /** Re-measure after resize or font load (adds clones if needed). */
  measure(): void;
  /** Current wrapped offset in px (always in (-setW, 0]). */
  offset(): number;
  render(): void;
}

export function makeLoop(viewport: HTMLElement, track: HTMLElement): Loop {
  const originals = Array.from(track.children) as HTMLElement[];
  originals.forEach((n, i) => { n.dataset.i = String(i); });
  let setW = 1;
  let items: LoopItem[] = [];
  let x = 0;

  function cloneSet() {
    for (const n of originals) {
      const c = n.cloneNode(true) as HTMLElement;
      c.setAttribute('aria-hidden', 'true');
      if (c.matches('a, button')) c.tabIndex = -1;
      c.querySelectorAll<HTMLElement>('a, button').forEach((a) => { a.tabIndex = -1; });
      track.appendChild(c);
    }
  }

  function measure() {
    if (!originals.length) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const first = originals[0];
    const last = originals[originals.length - 1];
    setW = Math.max(1, last.offsetLeft + last.offsetWidth - first.offsetLeft + gap);
    const need = Math.ceil((viewport.clientWidth * 2) / setW) + 2;
    const have = track.children.length / originals.length;
    for (let k = have; k < need; k++) cloneSet();
    items = (Array.from(track.children) as HTMLElement[]).map((el) => ({
      el, left: el.offsetLeft, w: el.offsetWidth, i: Number(el.dataset.i),
    }));
  }

  const wrap = (v: number) => { const r = v % setW; return r > 0 ? r - setW : r; };

  measure();
  return {
    get x() { return x; },
    set x(v: number) { x = v; },
    get setW() { return setW; },
    items: () => items,
    measure,
    offset: () => wrap(x),
    render() { track.style.transform = `translate3d(${wrap(x).toFixed(2)}px,0,0)`; },
  };
}
