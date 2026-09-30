// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Canonical URLs, the sitemap and Open Graph tags are built from this. Change it if the domain differs.
  site: 'https://imanirvansyah.com',
  integrations: [sitemap()],
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
});
