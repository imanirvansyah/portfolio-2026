import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/**
 * Motion system (same family as the Rimba study).
 * - One pair of eases for everything: rimba.out for entrances, rimba.inOut for things that travel.
 * - Text enters through masks (.m > .mi), line by line, with overlapping steps.
 * - Only transform, opacity and clip-path are animated.
 */
export const EASE = { out: 'rimba.out', inOut: 'rimba.inOut' } as const;
export const DUR = { reveal: 1.2, fast: 0.8, stagger: 0.08 } as const;

/** When text inside a solid panel starts revealing (later than elsewhere, so the mask leads). */
export const PANEL_TEXT_START = 'top 70%';

export interface Motion {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
  SplitText: typeof SplitText;
  lenis: Lenis;
}

export function setupMotion(): Motion {
  gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);
  CustomEase.create(EASE.out, '.16,1,.3,1');
  CustomEase.create(EASE.inOut, '.76,0,.24,1');
  gsap.defaults({ ease: EASE.out, duration: DUR.reveal });

  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Same-page anchors scroll smoothly through Lenis
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname) return;
    a.addEventListener('click', (e) => {
      const target = url.hash ? document.querySelector<HTMLElement>(url.hash) : null;
      if (url.hash && !target) return;
      e.preventDefault();
      lenis.scrollTo(target ?? 0, { offset: target ? -24 : 0, duration: 1.6, easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)) });
      history.replaceState(null, '', url.hash || location.pathname);
    });
  });

  return { gsap, ScrollTrigger, SplitText, lenis };
}

/** Scroll reveals driven by data attributes, shared by every page. */
export function scrollReveals({ gsap, SplitText }: Motion, root: ParentNode = document) {
  // Inside a solid panel, text waits until the panel's mask has mostly opened around it
  const onEnter = (el: Element, start = 'top 85%') => ({
    trigger: el,
    start: el.closest('[data-panel]') ? PANEL_TEXT_START : start,
    toggleActions: 'play none none none',
  });

  gsap.utils.toArray<HTMLElement>('[data-fade]', root).forEach((el) => {
    gsap.from(el, { autoAlpha: 0, y: 12, duration: DUR.fast, scrollTrigger: onEnter(el, 'top 92%') });
  });

  gsap.utils.toArray<HTMLElement>('[data-mask]', root).forEach((el) => {
    gsap.from(el.querySelectorAll('.mi'), { yPercent: 110, stagger: DUR.stagger, scrollTrigger: onEnter(el) });
  });

  // Paragraphs split into masked lines; the split is reverted afterwards so text reflows normally on resize
  gsap.utils.toArray<HTMLElement>('[data-lines]', root).forEach((el) => {
    const split = SplitText.create(el, { type: 'lines', mask: 'lines', aria: 'auto' });
    gsap.from(split.lines, { yPercent: 110, duration: 1, stagger: 0.06, scrollTrigger: onEnter(el, 'top 90%'), onComplete: () => split.revert() });
  });

  // Lists: rules draw and names rise together, row by row
  gsap.utils.toArray<HTMLElement>('[data-rows]', root).forEach((list) => {
    const rows = Array.from(list.children) as HTMLElement[];
    const rules = rows.map((r) => r.querySelector('.rule')).filter(Boolean);
    const names = rows.map((r) => r.querySelector('.m .mi')).filter(Boolean);
    const meta = rows.flatMap((r) => Array.from(r.querySelectorAll('[data-row-meta]')));
    gsap.timeline({ scrollTrigger: onEnter(list, 'top 82%') })
      .from(rules, { scaleX: 0, duration: 1.1, ease: EASE.inOut, stagger: DUR.stagger }, 0)
      .from(names, { yPercent: 110, stagger: DUR.stagger }, 0.15)
      .from(meta, { autoAlpha: 0, y: 10, duration: DUR.fast, stagger: 0.05 }, 0.3);
  });

  // Underline rules that draw in
  gsap.utils.toArray<HTMLElement>('[data-draw]', root).forEach((el) => {
    gsap.from(el, { scaleX: 0, duration: 1.2, ease: EASE.inOut, scrollTrigger: onEnter(el, 'top 95%') });
  });
}

/**
 * Solid panels for heavy-text sections ([data-panel]).
 * Entrance: the panel starts as a rounded card inset from the edges and opens to full bleed as it
 * scrolls up (scrubbed), so the solid colour arrives before any text. Its text then reveals line by
 * line (see PANEL_TEXT_START). Exit: it narrows back into a card, handing the screen back to the smoke.
 */
export function panels({ gsap }: Motion) {
  const open = 'inset(0px 0% 0px 0% round 0px)';
  gsap.utils.toArray<HTMLElement>('[data-panel]').forEach((panel) => {
    gsap.fromTo(panel, { clipPath: 'inset(180px 6% 0px 6% round 48px)' }, {
      clipPath: open, ease: 'none',
      scrollTrigger: { trigger: panel, start: 'top bottom', end: 'top 15%', scrub: true },
    });
    gsap.fromTo(panel, { clipPath: open }, {
      clipPath: 'inset(0px 6% 140px 6% round 48px)', ease: 'none', immediateRender: false,
      scrollTrigger: { trigger: panel, start: 'bottom 85%', end: 'bottom 5%', scrub: true },
    });
  });
}
