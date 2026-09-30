# Project media

One folder per project, named like its content file:

    public/media/work/hakovo/reel.mp4
    public/media/work/hakovo/poster.jpg

Then point to it from `src/content/work/hakovo.md` (paths start at /public, so drop "public"):

    media: /media/work/hakovo/reel.mp4
    poster: /media/work/hakovo/poster.jpg

- Video (mp4, webm, mov): plays muted and looped, only while on screen. Add a `poster` (first frame).
- GIF: works, but an MP4 of the same clip is usually 5–10× smaller. Prefer MP4 for anything longer than a few seconds.
- Still screenshots: put them in `src/assets/work/` and use `cover:` instead, so Astro converts them to AVIF/WebP in several sizes.

The build fails with "File not found in /public" if a path is wrong.
