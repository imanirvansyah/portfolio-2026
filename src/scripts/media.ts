/**
 * Videos marked data-autoplay play only while at least a quarter of them is on screen, and never for
 * reduced-motion visitors (they see the poster). Idempotent: call again after new videos appear
 * (e.g. the reel clones cards on resize).
 */
let observer: IntersectionObserver | null = null;

export function watchVideos(reduce: boolean) {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-autoplay]:not([data-watched])'));
  if (!videos.length) return;
  for (const v of videos) {
    v.dataset.watched = '';
    v.muted = true; // required for autoplay on mobile, even when the attribute is present
  }
  if (reduce || !('IntersectionObserver' in window)) return;
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting) v.play().catch(() => { /* autoplay refused: the poster stays */ });
      else v.pause();
    }
  }, { threshold: 0.25 });
  for (const v of videos) observer.observe(v);
}
