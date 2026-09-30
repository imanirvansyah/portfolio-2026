import { makeLoop } from './loop';

/** Footer ticker: a steady marquee that speeds up with scroll. */
export interface Ticker {
  tick(dt: number): void;
  boost(v: number): void;
  measure(): void;
}

const SPEED = 60; // px per second

export function initTicker(reduce: boolean): Ticker | null {
  const viewport = document.querySelector<HTMLElement>('.ticker');
  const track = document.getElementById('tickerTrack');
  if (!viewport || !track) return null;
  const loop = makeLoop(viewport, track);
  let boost = 0;
  return {
    tick(dt) {
      if (!reduce) loop.x -= (SPEED + boost) * dt;
      boost *= Math.exp(-dt * 2.5);
      loop.render();
    },
    boost(v) { boost = Math.min(900, Math.max(boost, Math.abs(v) * 18)); },
    measure() { loop.measure(); },
  };
}
