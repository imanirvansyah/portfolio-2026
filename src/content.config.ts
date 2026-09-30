import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Files served as-is from /public. Videos and GIFs go here (they are not re-encoded by Astro). */
const MEDIA_EXT = /\.(mp4|webm|mov|gif|png|jpe?g|webp|avif|svg)$/i;
const IMAGE_EXT = /\.(gif|png|jpe?g|webp|avif|svg)$/i;
const publicFile = (exts: RegExp, kind: string) =>
  z
    .string()
    .startsWith('/', { message: 'Use a path from /public, starting with "/", e.g. /media/work/hakovo/reel.mp4' })
    .regex(exts, { message: `Unsupported ${kind} type` })
    .refine((p) => existsSync(join(process.cwd(), 'public', p)), { message: 'File not found in /public' });

/**
 * One Markdown file per project in src/content/work/.
 * Cards in the home reel and the /work/[slug] case study pages are generated from these.
 */
const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Short line under the name in the reel caption, e.g. "Super app, UI/UX design". */
      type: z.string(),
      /** Meta description for the case study page. */
      description: z.string(),
      /** All cards share one row height; width follows the ratio. */
      ratio: z.enum(['16:10', '9:16', '4:5', '1:1']),
      /** Placeholder frame drawn while there is no cover: browser, phone, card, reel or square. */
      kind: z.enum(['web', 'app', 'deck', 'reel', 'square']),
      /** Position in the reel, lowest first. */
      order: z.number(),
      disciplines: z.array(z.enum(['design', 'development', 'motion', '3d'])).default([]),
      year: z.string().optional(),
      /** Base colour of the placeholder gradient. */
      tone: z.string().default('#4a1c22'),
      /** Label shown inside the placeholder frame, e.g. "[App screens]". */
      placeholder: z.string().optional(),
      /**
       * Moving or ready-made media from /public: mp4, webm, mov, gif, png, jpg, webp, avif, svg.
       * e.g. media: /media/work/hakovo/reel.mp4. Wins over `cover`. Videos play muted and looped, only while visible.
       */
      media: publicFile(MEDIA_EXT, 'media').optional(),
      /** Still frame from /public for `media`: shown before a video loads, and instead of motion for reduced-motion visitors. */
      poster: publicFile(IMAGE_EXT, 'poster').optional(),
      /** Still image in src/assets/work/, optimised by Astro (AVIF/WebP, responsive). Best for static screenshots. */
      cover: image().optional(),
      /** Live site(s). */
      links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
      /** false = no case study page; the card links to links[0] instead. */
      caseStudy: z.boolean().default(true),
      draft: z.boolean().default(false),
    }),
});

export const collections = { work };
