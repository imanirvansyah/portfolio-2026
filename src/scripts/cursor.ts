import type { gsap as GSAP } from 'gsap';

/**
 * Custom cursor: a ring that follows the mouse.
 *   scroll  default, carets up/down, label "Scroll"
 *   drag    over [data-cursor="drag"], carets rotate 90° to left/right, label "Drag"
 *   link    over links and buttons: the ring shrinks, label and carets step away
 * Label changes mask out upward and the next word masks in from below.
 * Each moving part has one owner: .cursor = position, .ring = scale, .carets = rotation, .word = yPercent.
 */
type State = 'scroll' | 'drag' | 'link';

const DRAG = '[data-cursor="drag"]';
const LINK = 'a, button, [role="button"], label, summary, input, select, textarea';

export function initCursor(gsap: typeof GSAP | null, reduce: boolean) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const el = document.querySelector<HTMLElement>('.cursor');
  if (!el) return;
  const ring = el.querySelector<HTMLElement>('.ring')!;
  const carets = el.querySelector<HTMLElement>('.carets')!;
  const words = {
    scroll: el.querySelector<HTMLElement>('[data-word="scroll"]')!,
    drag: el.querySelector<HTMLElement>('[data-word="drag"]')!,
  };

  document.documentElement.classList.add('has-cursor');
  if (gsap) gsap.set(words.drag, { yPercent: 110 });
  else words.drag.style.transform = 'translateY(110%)';

  const follow = reduce || !gsap ? 0 : 0.35;
  const xTo = gsap ? gsap.quickTo(el, 'x', { duration: follow, ease: 'power3' }) : null;
  const yTo = gsap ? gsap.quickTo(el, 'y', { duration: follow, ease: 'power3' }) : null;
  const move = (x: number, y: number) => {
    if (xTo && yTo) { xTo(x); yTo(y); }
    else el.style.transform = `translate3d(${x}px,${y}px,0)`;
  };
  const place = (x: number, y: number) => {
    if (gsap) gsap.set(el, { x, y });
    else el.style.transform = `translate3d(${x}px,${y}px,0)`;
  };

  let state: State = 'scroll';
  let shown = false;
  const dur = reduce ? 0 : 0.5;
  // Which label is currently in view; each word is driven to its own target, so fast state changes can't strand one
  const visible: Record<'scroll' | 'drag', boolean> = { scroll: true, drag: false };

  function setWord(w: 'scroll' | 'drag', on: boolean) {
    if (visible[w] === on || !gsap) return;
    visible[w] = on;
    if (on) gsap.fromTo(words[w], { yPercent: 110 }, { yPercent: 0, duration: dur, ease: 'rimba.out', delay: reduce ? 0 : 0.08, overwrite: true });
    else gsap.to(words[w], { yPercent: -110, duration: dur, ease: 'rimba.inOut', overwrite: true });
  }

  function setState(next: State) {
    if (next === state) return;
    state = next;
    if (!gsap) {
      words.scroll.style.transform = `translateY(${next === 'scroll' ? 0 : 110}%)`;
      words.drag.style.transform = `translateY(${next === 'drag' ? 0 : 110}%)`;
      carets.style.transform = `rotate(${next === 'drag' ? -90 : 0}deg)`;
      carets.style.opacity = next === 'link' ? '0' : '1';
      ring.style.transform = `scale(${next === 'link' ? 0.45 : 1})`;
      return;
    }
    // Words: the outgoing one masks out upward, the incoming one masks in from below (none over links)
    setWord('scroll', next === 'scroll');
    setWord('drag', next === 'drag');
    // Carets: rotate a quarter turn between scroll (up/down) and drag (left/right)
    gsap.to(carets, { rotation: next === 'drag' ? -90 : 0, autoAlpha: next === 'link' ? 0 : 1, duration: dur, ease: 'rimba.inOut', overwrite: true });
    // Ring: shrinks over links and buttons
    gsap.to(ring, { scale: next === 'link' ? 0.45 : 1, duration: reduce ? 0 : 0.45, ease: 'rimba.out', overwrite: true });
  }

  function stateFor(target: EventTarget | null): State {
    const t = target instanceof Element ? target : null;
    if (t?.closest(DRAG)) return 'drag';
    if (t?.closest(LINK)) return 'link';
    return 'scroll';
  }

  const show = (v: boolean) => {
    if (v === shown) return;
    shown = v;
    if (gsap) gsap.to(el, { autoAlpha: v ? 1 : 0, duration: reduce ? 0 : 0.25, overwrite: 'auto' });
    else { el.style.opacity = v ? '1' : '0'; el.style.visibility = v ? 'visible' : 'hidden'; }
  };

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!shown) { place(e.clientX, e.clientY); show(true); }
    move(e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') setState(stateFor(e.target)); }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => show(false));

  // Press feedback on the ring (skipped over links, where it is already small)
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || !gsap || state === 'link') return;
    gsap.to(ring, { scale: 0.86, duration: 0.2, ease: 'rimba.out', overwrite: true });
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse' || !gsap || state === 'link') return;
    gsap.to(ring, { scale: 1, duration: 0.45, ease: 'rimba.out', overwrite: true });
  });
}
