import products from '../data/products.json';

// ВАЖНО: замените на реальный домен сайта после подключения (или на текущий *.vercel.app адрес).
// Этот же адрес нужно вписать в public/robots.txt в строке Sitemap:
const SITE_URL = 'https://melon-site-indol.vercel.app';

export const prerender = true;

export async function GET() {
  const staticPages = [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/catalog/', changefreq: 'daily', priority: '0.9' },
    { path: '/repair/', changefreq: 'monthly', priority: '0.7' },
    { path: '/contacts/', changefreq: 'monthly', priority: '0.5' },
    { path: '/cart/', changefreq: 'monthly', priority: '0.3' },
  ];

  const productPages = products.map((p) => ({
    path: `/catalog/${p.slug}/`,
    changefreq: 'weekly',
    priority: '0.6',
  }));

  const allPages = [...staticPages, ...productPages];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (p) => `  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
