import type { gsap as GSAP } from 'gsap';
import { makeLoop } from './loop';

/**
 * Selected work: a slow, endless, draggable strip of mixed-ratio cards.
 * The card nearest the centre is "selected"; the caption below follows it.
 */
export interface Reel {
  /** Advance by dt seconds (call once per frame). */
  tick(dt: number): void;
  /** Scroll velocity from Lenis: briefly speeds the drift up. */
  boost(v: number): void;
  measure(): void;
}

interface Options {
  reduce: boolean;
  /** Pass gsap when motion is enabled; without it everything still works, just without tweens. */
  gsap: typeof GSAP | null;
}

const BASE_SPEED = 34; // px per second
const HOVER_FACTOR = 0.3;

export function initReel({ reduce, gsap }: Options): Reel | null {
  const reelEl = document.getElementById('reel');
  const track = document.getElementById('reelTrack');
  if (!reelEl || !track || !track.children.length) return null;

  const loop = makeLoop(reelEl, track);
  const originals = (Array.from(track.children) as HTMLElement[]).filter((c) => !c.hasAttribute('aria-hidden'));
  const N = originals.length;
  const capNum = document.getElementById('capNum');
  const capName = document.getElementById('capName');
  const capType = document.getElementById('capType');
  const capLink = document.getElementById('capLink') as HTMLAnchorElement | null;
  const pad2 = (n: number) => String(n).padStart(2, '0');

  let selected = 0;
  let selEl: HTMLElement | null = null;
  const drift = { base: reduce ? 0 : BASE_SPEED, hover: 1, boost: 0, vx: 0, hold: false, tweening: false };
  let tween: ReturnType<typeof GSAP.to> | null = null;
  const drag = { on: false, moved: 0, lastX: 0, lastT: 0 };

  function setCaption(i: number, animate: boolean) {
    const c = originals[i];
    if (!c || !capNum || !capName || !capType || !capLink) return;
    capNum.textContent = `${pad2(i + 1)}/${pad2(N)}`;
    capName.textContent = c.dataset.name ?? '';
    capType.textContent = c.dataset.type ?? '';
    capLink.textContent = c.dataset.cta ?? 'View project';
    capLink.href = c.getAttribute('href') ?? '#';
    // Mirror how the card opens (e.g. a new tab), so the caption link behaves the same
    capLink.target = c.getAttribute('target') ?? '';
    capLink.rel = c.getAttribute('rel') ?? '';
    if (animate && gsap) {
      gsap.fromTo([capNum, capName, capType], { yPercent: 100 }, { yPercent: 0, duration: 0.7, ease: 'rimba.out', stagger: 0.04, overwrite: true });
    }
  }

  function pickSelected() {
    const off = loop.offset();
    const mid = reelEl!.clientWidth / 2;
    let best = null as (ReturnType<typeof loop.items>[number] | null);
    let bestD = Infinity;
    for (const it of loop.items()) {
      const d = Math.abs(off + it.left + it.w / 2 - mid);
      if (d < bestD) { bestD = d; best = it; }
    }
    if (!best) return;
    if (best.el !== selEl) {
      selEl?.classList.remove('is-selected');
      best.el.classList.add('is-selected');
      selEl = best.el;
    }
    if (best.i !== selected) { selected = best.i; setCaption(selected, true); }
  }

  function centerOn(i: number) {
    const off = loop.offset();
    const mid = reelEl!.clientWidth / 2;
    let bestD: number | null = null;
    for (const it of loop.items()) {
      if (it.i !== i) continue;
      const d = mid - (off + it.left + it.w / 2);
      if (bestD === null || Math.abs(d) < Math.abs(bestD)) bestD = d;
    }
    if (bestD === null) return;
    tween?.kill();
    drift.vx = 0;
    if (!gsap || reduce) { loop.x += bestD; loop.render(); pickSelected(); return; }
    const p = { v: loop.x };
    drift.tweening = true;
    tween = gsap.to(p, {
      v: loop.x + bestD, duration: 1.1, ease: 'rimba.inOut',
      onUpdate: () => { loop.x = p.v; },
      onComplete: () => { drift.tweening = false; tween = null; },
    });
  }

  document.getElementById('reelNext')?.addEventListener('click', () => centerOn((selected + 1) % N));
  document.getElementById('reelPrev')?.addEventListener('click', () => centerOn((selected - 1 + N) % N));

  reelEl.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') drift.hover = HOVER_FACTOR; });
  reelEl.addEventListener('pointerleave', () => { drift.hover = 1; });
  reelEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag.on = true; drag.moved = 0; drag.lastX = e.clientX; drag.lastT = performance.now(); drift.vx = 0;
    if (tween) { tween.kill(); tween = null; drift.tweening = false; }
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag.on) return;
    const now = performance.now();
    const dx = e.clientX - drag.lastX;
    const dt = Math.max(1, now - drag.lastT);
    drag.moved += Math.abs(dx);
    if (drag.moved > 6) reelEl.classList.add('is-dragging');
    loop.x += dx;
    drift.vx = (dx / dt) * 1000;
    drag.lastX = e.clientX; drag.lastT = now;
  }, { passive: true });
  const endDrag = () => { if (!drag.on) return; drag.on = false; reelEl.classList.remove('is-dragging'); };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  // A drag is not a click
  reelEl.addEventListener('click', (e) => { if (drag.moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
  reelEl.addEventListener('dragstart', (e) => e.preventDefault());
  // Keyboard: focusing a card centres it and pauses the drift
  originals.forEach((c, i) => {
    c.addEventListener('focus', () => { drift.hold = true; centerOn(i); });
    c.addEventListener('blur', () => { drift.hold = false; });
  });
  // Focus must never scroll the clipped strip itself; position is ours alone
  reelEl.addEventListener('scroll', () => { reelEl.scrollLeft = 0; });
  // Trackpads: sideways swipes move the reel, vertical ones still scroll the page
  reelEl.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    loop.x -= e.deltaX;
    drift.vx = 0;
  }, { passive: false });

  // Start with the first card centred
  const f = originals[0];
  loop.x = reelEl.clientWidth / 2 - (f.offsetLeft + f.offsetWidth / 2) - loop.setW;
  setCaption(0, false);


  return {
    tick(dt) {
      if (!drag.on && !drift.hold && !drift.tweening) {
        if (Math.abs(drift.vx) > 5) { loop.x += drift.vx * dt; drift.vx *= Math.exp(-dt * 4); }
        else drift.vx = 0;
        loop.x -= (drift.base + (reduce ? 0 : drift.boost)) * drift.hover * dt;
      }
      drift.boost *= Math.exp(-dt * 2.5);
      loop.render();
      pickSelected();
    },
    boost(v) { drift.boost = Math.min(420, Math.max(drift.boost, Math.abs(v) * 9)); },
    measure() { loop.measure(); },
  };
}
