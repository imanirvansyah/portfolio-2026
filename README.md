# Iman Irvansyah, portfolio

Astro + TypeScript. Static, light and SEO-friendly.

## Run it

Requires Node 22.12 or newer.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # type-check, then build to dist/
npm run preview  # serve the build
```

## Update content

- **Projects:** one Markdown file per project in `src/content/work/`. Copy an existing one and change the frontmatter.
  Put images in `src/assets/work/` (field `cover`) and videos in `public/media/` (field `video`).
- **Name, headline, intro, email, socials:** `src/data/site.ts`
- **What I do:** `src/data/services.ts`
- **Experience:** `src/data/experience.ts`

Anything in `[square brackets]` is a placeholder waiting for a real value.

## Deploy

`npm run build` produces plain files in `dist/`. Any static host works (Cloudflare Pages, Netlify, Vercel):
build command `npm run build`, output directory `dist`. Update `site` in `astro.config.mjs` and the sitemap URL in
`public/robots.txt` if the domain is not `imanirvansyah.com`.

See `CLAUDE.md` for architecture, the motion rules and conventions.
