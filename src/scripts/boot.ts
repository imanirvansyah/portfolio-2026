import { createSmoke, SMOKE, type SmokeApi } from './smoke';
import { initReel, type Reel } from './reel';
import { initTicker, type Ticker } from './ticker';
import { initCursor } from './cursor';
import { watchVideos } from './media';
import { setupMotion, scrollReveals, panels, EASE, PANEL_TEXT_START, type Motion } from './motion';

/**
 * Page boot. Two entry points:
 *   bootHome()  index page: curtain intro, hero, reel, reveals, ticker
 *   bootPage()  inner pages (case studies, 404): reveals and ticker, no curtain
 * Without motion (reduced motion or a failed load) the page is fully usable and static.
 */

const root = document.documentElement;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function startSmoke(reduce: boolean): SmokeApi | null {
  const canvas = document.getElementById('smoke') as HTMLCanvasElement | null;
  let smoke: SmokeApi | null = null;
  if (canvas && !reduce) {
    try { smoke = createSmoke(canvas); } catch { smoke = null; }
  }
  if (!smoke) {
    root.classList.add('no-smoke');
    if (canvas) canvas.style.display = 'none';
    return null;
  }
  let last: [number, number] | null = null;
  window.addEventListener('pointermove', (e) => {
    const x = e.clientX / window.innerWidth, y = e.clientY / window.innerHeight;
    const speed = last ? Math.hypot(x - last[0], y - last[1]) : 0;
    smoke!.stroke('pointer', x, y, SMOKE.POINTER.base + Math.min(SMOKE.POINTER.max, speed * SMOKE.POINTER.gain));
    smoke!.touched();
    smoke!.lean(x, y);
    last = [x, y];
  }, { passive: true });
  const lift = () => { smoke!.lift('pointer'); last = null; };
  window.addEventListener('pointerdown', lift, { passive: true });
  root.addEventListener('pointerleave', lift);
  // Smoke steps back once the hero has scrolled away (SMOKE.CONTENT), and stops entirely
  // while a solid panel covers the whole screen: nobody can see it, so it costs nothing.
  const solid = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'));
  const onScroll = () => {
    const vh = window.innerHeight;
    smoke!.depth(window.scrollY / (vh * 0.8));
    smoke!.pause(solid.some((p) => { const r = p.getBoundingClientRect(); return r.top <= 0 && r.bottom >= vh; }));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
  return smoke;
}

function whenFontsReady(fn: () => void) {
  let done = false;
  const go = () => { if (!done) { done = true; fn(); } };
  (document.fonts?.ready ?? Promise.resolve()).then(go);
  setTimeout(go, 1500);
}

function loops(reel: Reel | null, ticker: Ticker | null) {
  const reduce = reduceMotion();
  watchVideos(reduce);
  const measure = () => { reel?.measure(); ticker?.measure(); watchVideos(reduce); };
  window.addEventListener('resize', measure);
  document.fonts?.ready.then(measure);
  return (dt: number) => { reel?.tick(dt); ticker?.tick(dt); };
}

function rafLoop(step: (dt: number) => void) {
  let last = performance.now();
  const frame = (now: number) => {
    step(Math.min(0.05, (now - last) / 1000));
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function motionAvailable(reduce: boolean) {
  if (reduce) { root.classList.remove('motion', 'motion-wait'); return false; }
  return true;
}

/* ------------------------------------------------------------------ */

export function bootHome() {
  const reduce = reduceMotion();
  const smoke = startSmoke(reduce);

  if (!motionAvailable(reduce)) {
    initCursor(null, reduce);
    const step = loops(initReel({ reduce, gsap: null }), initTicker(reduce));
    rafLoop(step);
    return;
  }

  const m = setupMotion();
  const { gsap, lenis } = m;
  initCursor(gsap, reduce);
  const reel = initReel({ reduce, gsap });
  const ticker = initTicker(reduce);
  const step = loops(reel, ticker);
  let lastT = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now();
    step(Math.min(0.05, (now - lastT) / 1000));
    lastT = now;
  });
  lenis.on('scroll', (l: { velocity: number }) => { reel?.boost(l.velocity); ticker?.boost(l.velocity); });
  if (smoke) stirOnScroll(m, smoke);

  whenFontsReady(() => {
    root.classList.remove('motion-wait');
    intro(m, smoke);
    heroExit(m);
    panels(m);
    scrollReveals(m);
    reelReveal(m);
    m.ScrollTrigger.refresh();
  });
}

export function bootPage() {
  const reduce = reduceMotion();
  const smoke = startSmoke(reduce);
  const ticker = initTicker(reduce);

  if (!motionAvailable(reduce)) {
    initCursor(null, reduce);
    rafLoop(loops(null, ticker));
    return;
  }

  const m = setupMotion();
  initCursor(m.gsap, reduce);
  const step = loops(null, ticker);
  let lastT = performance.now();
  m.gsap.ticker.add(() => {
    const now = performance.now();
    step(Math.min(0.05, (now - lastT) / 1000));
    lastT = now;
  });
  m.lenis.on('scroll', (l: { velocity: number }) => ticker?.boost(l.velocity));
  if (smoke) stirOnScroll(m, smoke);

  whenFontsReady(() => {
    root.classList.remove('motion-wait');
    m.gsap.timeline({ defaults: { ease: EASE.out } })
      .fromTo('.nav', { yPercent: -140, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 1 }, 0)
      .fromTo('[data-page-title] .mi', { yPercent: 105 }, { yPercent: 0, duration: 1.3, stagger: 0.1 }, 0.1)
      .fromTo('[data-page-intro]', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.08 }, 0.45);
    panels(m);
    scrollReveals(m);
    // Case study body: each block rises in once the panel has opened around it
    m.gsap.utils.toArray<HTMLElement>('.prose > *').forEach((el) => {
      m.gsap.from(el, { autoAlpha: 0, y: 16, duration: 0.9, scrollTrigger: { trigger: el, start: 'top 72%', toggleActions: 'play none none none' } });
    });
    m.ScrollTrigger.refresh();
  });
}

/* ------------------------------------------------------------------ */

/** Fast scrolling pushes a puff of smoke in from the edge the content is coming from. */
function stirOnScroll({ lenis }: Motion, smoke: SmokeApi) {
  if (SMOKE.SCROLL <= 0) return;
  let lastPuff = 0;
  lenis.on('scroll', (l: { velocity: number }) => {
    const v = Math.abs(l.velocity), now = performance.now();
    if (v < 2 || now - lastPuff < 90) return;
    lastPuff = now;
    const dir = l.velocity > 0 ? 1 : -1;
    smoke.puff(0.15 + Math.random() * 0.7, dir > 0 ? 0.98 : 0.02, (Math.random() - 0.5) * 0.004, -dir * Math.min(v, 60) * 0.00018, SMOKE.SCROLL);
  });
}

/** Entrance frame → hero. The hero starts while the curtain is only half-way up. */
function intro({ gsap, SplitText, lenis }: Motion, smoke: SmokeApi | null) {
  const curtain = document.querySelector<HTMLElement>('.curtain');
  const countEl = document.getElementById('curtainCount');
  const lead = SplitText.create('#heroLead', { type: 'lines', mask: 'lines', aria: 'auto' });
  const count = { v: 0 };
  const sweep = { t: 0 };
  if (curtain) curtain.style.animation = 'none';

  const tl = gsap.timeline({ defaults: { ease: EASE.out }, onComplete: () => lead.revert() });
  tl.call(() => lenis.stop());
  if (curtain) {
    tl.set(curtain, { autoAlpha: 1, yPercent: 0 })
      .fromTo('.curtain .mi', { yPercent: 110 }, { yPercent: 0, duration: 0.9 })
      .fromTo('.curtain-meta', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, '<')
      .to(count, { v: 100, duration: 1.15, ease: 'power2.inOut', onUpdate: () => { if (countEl) countEl.textContent = `[${Math.round(count.v)}%]`; } }, '<')
      .to('.curtain .mi', { yPercent: -110, duration: 0.6, ease: 'power3.in' }, '+=0.1')
      .to('.curtain-meta', { autoAlpha: 0, duration: 0.3 }, '<')
      .to(curtain, { yPercent: -100, duration: 1.1, ease: EASE.inOut }, '<0.15')
      .addLabel('hero', '<0.45')
      .set(curtain, { autoAlpha: 0 }, 'hero+=0.7');
  } else {
    tl.addLabel('hero', 0);
  }
  tl.call(() => lenis.start(), [], 'hero+=0.3')
    // Smoke starts just before the curtain clears, so the hero is revealed already in motion
    .to(sweep, {
      t: 1, duration: 2.2, ease: EASE.inOut,
      onStart: () => smoke?.lift('intro'),
      onUpdate: () => {
        const t = sweep.t;
        smoke?.stroke('intro', -0.05 + t * 1.1, 0.8 - 0.3 * t + 0.08 * Math.sin(t * Math.PI * 2), SMOKE.SWEEP);
      },
      onComplete: () => smoke?.lift('intro'),
    }, 'hero-=0.35')
    .fromTo('.nav', { yPercent: -140, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 1 }, 'hero')
    .fromTo('.hero-title .mi', { yPercent: 105 }, { yPercent: 0, duration: 1.3, stagger: 0.1 }, 'hero')
    .from(lead.lines, { yPercent: 100, duration: 1.1, stagger: 0.06 }, 'hero+=0.35');
}

/** Hero drifts up slower than the page as it leaves. */
function heroExit({ gsap }: Motion) {
  gsap.to('.hero-inner', {
    yPercent: -22, autoAlpha: 0.15, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
}

/** Reel: frames open from the bottom one after another, then the caption settles in. */
function reelReveal({ gsap }: Motion) {
  if (!document.getElementById('reel')) return;
  const reel = document.getElementById('reel')!;
  const start = reel.closest('[data-panel]') ? PANEL_TEXT_START : 'top 85%';
  gsap.timeline({ scrollTrigger: { trigger: reel, start, toggleActions: 'play none none none' } })
    .fromTo('#reel .card-media', { clipPath: 'inset(100% 0% 0% 0% round 6px)' },
      { clipPath: 'inset(0% 0% 0% 0% round 6px)', duration: 1.4, ease: EASE.inOut, stagger: 0.06, clearProps: 'clipPath' }, 0)
    .from('.reel-caption .rule', { scaleX: 0, duration: 1.2, ease: EASE.inOut }, 0.3)
    .from(['#capNum', '#capName', '#capType'], { yPercent: 110, stagger: 0.05 }, 0.5)
    .from(['.cap-link', '.reel-ctrl'], { autoAlpha: 0, y: 10, duration: 0.8, stagger: 0.06 }, 0.6);
}
