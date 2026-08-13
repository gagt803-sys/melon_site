// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // TODO: замени на свой домен, когда подключишь его (сейчас — адрес на Vercel)
  site: 'https://melon-site-indol.vercel.app',
  integrations: [sitemap()],
});
