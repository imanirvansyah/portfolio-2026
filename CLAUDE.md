# CLAUDE.md

Personal portfolio of **Iman Irvansyah**, a UI/UX designer with a frontend developer background.
The site sells design *and* build: every project has two sides, the design and how it gets built.
Priorities, in order: **fast and light**, **SEO-friendly**, **easy to update**, then expressive motion.

## Stack

- **Astro** (static output) + **TypeScript** (strict). No UI framework; interactivity is plain TS modules.
- **GSAP** (ScrollTrigger, SplitText, CustomEase) and **Lenis** for motion and smooth scroll.
- A custom **WebGL fluid "smoke"** background (`src/scripts/smoke.ts`), no three.js.
- Fonts are self-hosted through Fontsource: Big Shoulders (display, optical-size axis) and Noto Sans (body fallback).
- `@astrojs/sitemap` for the sitemap. Output is plain files in `dist/`, deployable to any static host.

## Commands

```bash
npm install
npm run dev       # http://localhost:4321
npm run check     # astro check (types + .astro diagnostics)
npm run build     # check, then build to dist/
npm run preview   # serve dist/
```

Always run `npm run build` before finishing a change; it type-checks first and must end with 0 errors.

## Structure

```
src/
  content.config.ts        work collection schema (zod, from 'astro/zod')
  content/work/*.md        one file per project (drives the reel and /work/[slug])
  data/site.ts             name, headline, intro, email, socials, ticker words
  data/services.ts         "What I do" rows (status: active | exploring)
  data/experience.ts       "Experience" rows
  layouts/Base.astro       <head>: title, description, canonical, OG, JSON-LD, fonts, motion bootstrap
  components/              Nav, Curtain, SmokeCanvas, Hero, WorkReel, WorkCard, Services, Experience, Contact, Footer
  scripts/boot.ts          entry points: bootHome() and bootPage()
  scripts/motion.ts        GSAP + Lenis setup, ease tokens, shared scroll reveals (data attributes)
  scripts/smoke.ts         fluid engine + SMOKE tuning constants
  scripts/reel.ts          selected-work carousel (drift, drag, wheel, keyboard, caption)
  scripts/ticker.ts        footer marquee
  scripts/loop.ts          endless strip used by reel and ticker
  styles/global.css        tokens and shared primitives
  pages/index.astro        home: hero, selected work, what I do, experience, contact + footer
  pages/work/[slug].astro  case study template
  pages/404.astro
public/                    og.png (1200×630), favicon.svg, robots.txt, media/ (videos)
```

## Page structure (home)

1. **Entrance curtain** (`Curtain.astro`): wordmark rises, counter runs to 100%, curtain lifts. The hero starts
   while the curtain is half-way up (label `hero` in the intro timeline).
2. **Hero**: centered headline + intro paragraph over the smoke and a warm-centre glow.
3. **Selected work**: slow, endless, draggable reel. Mixed ratios share one row height. From here on the
   page sits on one solid panel (sections 3–5), separated from the hero by a gap (`.panel-home` margin).
   The card nearest the centre is "selected"; the caption below follows it.
4. **What I do**: Design and Development are active; Motion design and 3D show as "Exploring".
5. **Experience**. (3, 4 and 5 share one solid panel; see "Solid panels".)
6. **Contact** + footer ticker.

## Content workflow

**Add a project:** create `src/content/work/<slug>.md`. Frontmatter is validated by `content.config.ts`:

| field | notes |
|---|---|
| `title`, `type`, `description` | `type` is the caption line; `description` is the meta description |
| `ratio` | `16:10` website, `9:16` app or reel, `4:5` social post, `1:1` square |
| `kind` | placeholder frame: `web`, `app`, `deck`, `reel`, `square` |
| `order` | reel position, lowest first |
| `media` | file in `public/media/work/<slug>/`: mp4, webm, mov, gif, png, jpg, webp, avif, svg. Wins over `cover` |
| `poster` | still frame in `public/` for `media`: shown before a video loads and instead of motion for reduced motion |
| `cover` | still image in `src/assets/work/`, optimised by Astro (AVIF/WebP, responsive). Best for screenshots |
| `links` | live sites; first one is used when `caseStudy: false` |
| `caseStudy` | `true` generates `/work/<slug>/` from the Markdown body |
| `draft` | hide without deleting |

Paths in `media`/`poster` start at /public (`/media/work/hakovo/reel.mp4`) and are checked at build time:
a wrong path fails the build with "File not found in /public".
`components/ProjectMedia.astro` renders all three (card and case study cover). Videos have no `autoplay`
attribute: `scripts/media.ts` plays them only while on screen and never for reduced motion. GIFs swap to
`poster` for reduced motion via `<picture>`. Prefer MP4 over GIF for anything longer than a few seconds.
In a case study body, images use Markdown (`![alt](../../assets/work/x.png)`) and videos use plain HTML
(`<figure><video src="/media/work/<slug>/x.mp4" muted loop playsinline preload="metadata" data-autoplay></video></figure>`;
`data-autoplay`, not `autoplay`, so it only plays on screen and respects reduced motion).

Motion design and 3D pieces are just more entries with `ratio: '9:16' | '4:5' | '1:1'` and a video `media`.
When the first one ships, flip that row in `data/services.ts` from `exploring` to `active`.

**Placeholders:** unknown facts are written in `[square brackets]` (years, companies, agency name, email,
one-line descriptions). Never invent them; ask Iman. Empty social `href`s are simply not rendered.
The agency builds (tosskin.com, ark.sg, fimma.org) were made as a freelancer for an agency: keep them credited
to the agency and confirm permission before publishing.

## Motion rules

- **Eases:** `rimba.out` = `cubic-bezier(.16,1,.3,1)` for entrances, `rimba.inOut` = `cubic-bezier(.76,0,.24,1)`
  for things that travel (curtain, rules, reel centring). Same curves exist as CSS vars `--ease-out` / `--ease-inout`.
- **Text enters through masks:** `.m` (overflow hidden) wraps `.mi` (the part that moves). Paragraphs use
  `SplitText` with `mask: 'lines'` and are **reverted** when the animation ends so they reflow on resize.
- **Overlap steps** in timelines with position parameters (`'<0.35'`, labels) instead of waiting for each to finish.
- **Only animate** `transform`, `opacity` and `clip-path`.
- **One owner per transform.** Never put a CSS `transition` on the transform of an element GSAP animates:
  GSAP reads the mid-transition value on refresh and the tween ends in the wrong place (this broke the work
  list once). Hover effects go on a wrapper, e.g. move `.m`, never `.mi`. The same goes for a *static* CSS
  transform used as a starting state: GSAP parses it into a pixel offset that stays after the tween (this broke
  the cursor label once). Set starting states with `gsap.set`, not CSS.
- Scroll reveals are opt-in via data attributes, handled in `motion.ts`:
  `data-fade`, `data-mask` (animates `.mi` inside), `data-lines`, `data-rows` (rules + names + `[data-row-meta]`),
  `data-draw` (scaleX a rule). Page intros use `data-page-title` / `data-page-intro`.
  Inside `[data-panel]` all of these start later (`PANEL_TEXT_START`) so the panel mask leads.
- **Reduced motion:** the head script skips the `motion` class; `boot.ts` then runs without GSAP/Lenis/smoke,
  the reel does not drift, videos are paused. Every page must remain complete and readable in that mode.
- `.motion-wait [data-intro]` hides the nav and hero until the intro starts; the head script clears it after
  3 s no matter what, and the curtain opens by itself via CSS if scripts never run.

## Smoke (`src/scripts/smoke.ts`)

Two presets live in `PRESETS`; the active one is `SMOKE`.
- `original` (active): the look of the reference video. Visible, swirling, soft relief shading; stirred by the
  cursor, the intro sweep, idle puffs and fast scrolling.
- `calm`: slow, blurred, dims behind content. Kept for reference; switch with `SMOKE = PRESETS.calm`.

Knobs: `CURL` (swirl; above ~8 looks like marble), `VEL_DISS` (how fast motion settles), `DENS_DISS` (fade),
`RADIUS`, `FORCE`, `TINT`/`GAIN` (visibility), `SHADE`, `BLUR`, `CONTENT` (strength once past the hero),
`POINTER`, `AMBIENT`, `SWEEP`, `SCROLL`.
The smoke is **paused** (no simulation, no drawing) whenever a solid panel covers the whole screen.

## Solid panels (heavy-text sections)

Full smoke and long reading do not mix, so heavy-text sections sit on a solid panel:
`<div class="panel" data-panel>…</div>` (colour `--panel`).
- Home: *Selected work*, *What I do* and *Experience* share one panel, with a gap after the hero so the entrance
  never meets the headline. Case studies: the Markdown body and "Next project".
- **Entrance mask before text:** `panels()` in `motion.ts` scrubs the panel's `clip-path` from a rounded,
  inset card (`inset(180px 6% 0 6% round 48px)`) to full bleed as it scrolls up. Text inside a panel reveals at
  `PANEL_TEXT_START` (`top 70%`), later than elsewhere, so the solid colour always arrives first.
- **Exit:** the panel narrows back into a rounded card, handing the screen back to the smoke.
- New text-heavy sections (about, long lists, articles) go inside a panel. The hero, contact and footer stay on
  the smoke.

## SEO and performance checklist

- Every page passes `title` and `description` to `Base.astro`; case studies also get CreativeWork JSON-LD.
- `site` in `astro.config.mjs` must match the real domain (canonical, OG and sitemap are built from it).
- Images go through `astro:assets` (`<Image>` with `widths`/`sizes`). No images in `public/` except OG/favicon.
- Keep JavaScript to what the page needs. Heavy libraries (e.g. three.js for future 3D) must be imported only on
  the pages that use them, and preferably started after first paint.
- Headline and intro are real HTML text (never canvas) so they index and render without JS.

## Custom cursor (`components/Cursor.astro`, `scripts/cursor.ts`)

Mouse and trackpad only (`(hover: hover) and (pointer: fine)`); the native cursor is hidden only after the script
starts (`html.has-cursor`). States: **scroll** (default: ring, carets up/down, "Scroll"), **drag** (over any
`[data-cursor="drag"]`, e.g. the work reel: carets rotate 90° to left/right, "Drag"), **link** (over links and
buttons: ring shrinks, label and carets step away). Labels mask out upward and the next masks in from below.
One owner per moving part: `.cursor` position, `.ring` scale, `.carets` rotation, `.word` yPercent.
Mark any new draggable area with `data-cursor="drag"`.

## Accessibility

- Touch targets at least 44px; visible `:focus-visible` outline (red).
- Reel clones are `aria-hidden` and not focusable; focusing an original card centres it and pauses the drift.
- Decorative elements (`canvas`, curtain, ticker, rules) are `aria-hidden`.

## Typography

- Display: Big Shoulders (700/800). Body: `"Segoe UI"` first. Segoe UI is a Windows system font and is **not**
  licensed for web embedding, so non-Windows visitors see Noto Sans. If identical rendering everywhere matters,
  switch `--body` to a free face.
- Copy is English. Headline: "I design what I know / can be built."

## Parked ideas

- 3D figure (procedural wooden mannequin with a cursor "x-ray" lens showing the wireframe) and a Newton's
  cradle GLB exist as prototypes. They are hidden for now; if they return, load them as a separate module only
  on the page that uses them and keep the smoke off while they run.
- Page transitions between home and case studies (Astro view transitions) once case studies have real content.
