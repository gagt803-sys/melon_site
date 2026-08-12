// Подтягивает товары из опубликованной Google Таблицы (CSV) в src/data/products.json.
// Если ссылка на таблицу не задана — молча пропускает шаг и оставляет текущий products.json как есть,
// чтобы сборка сайта никогда не ломалась из-за отсутствия таблицы.

import { parse } from 'csv-parse/sync';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// подхватываем .env локально, если он есть (на Vercel переменная берётся из настроек проекта)
try {
  process.loadEnvFile(path.join(__dirname, '../.env'));
} catch {
  // файла нет — это нормально, например на Vercel переменная уже в process.env
}

const PRODUCTS_PATH = path.join(__dirname, '../src/data/products.json');
const CATEGORIES_PATH = path.join(__dirname, '../src/data/categories.json');

const SHEET_CSV_URL = process.env.PRODUCTS_SHEET_URL || '';

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ь: '', ъ: '', ы: 'y', э: 'e', ю: 'iu', я: 'ia', "'": '', '’': '',
};

function translit(str) {
  return str
    .toLowerCase()
    .split('')
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join('');
}

function slugify(str, used) {
  let s = translit(str)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  const base = s || 'item';
  let slug = base;
  let i = 2;
  while (used.has(slug)) {
    slug = `${base}-${i}`;
    i += 1;
  }
  used.add(slug);
  return slug;
}

const AVAIL_MAP = {
  'в наявності': 'in',
  'в наявности': 'in',
  'наявний': 'in',
  'під замовлення': 'order',
  'под заказ': 'order',
  'немає': 'out',
  'нема': 'out',
  'відсутній': 'out',
};

const CONDITION_MAP = {
  'нове': 'new',
  'нова': 'new',
  'новий': 'new',
  'б/у': 'used',
  'бу': 'used',
};

async function main() {
  if (!SHEET_CSV_URL) {
    console.log('[sync-products] PRODUCTS_SHEET_URL не задано — пропускаю синхронизацию, использую текущий products.json.');
    return;
  }

  console.log('[sync-products] Тягну таблицу:', SHEET_CSV_URL);
  const res = await fetch(SHEET_CSV_URL);
  if (!res.ok) {
    console.error('[sync-products] Не вдалося завантажити таблицю, код:', res.status, '— залишаю попередній products.json.');
    return;
  }
  const csvText = await res.text();
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

  const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf-8'));
  const labelToId = new Map(categories.map((c) => [c.label.trim().toLowerCase(), c.id]));

  const usedSlugs = new Set();
  const products = [];
  let skipped = 0;

  rows.forEach((row, idx) => {
    const name = (row['Назва'] || '').trim();
    if (!name) {
      skipped += 1;
      return;
    }
    const priceRaw = (row['Ціна'] || '').replace(',', '.').trim();
    const priceOnRequest = priceRaw === '';
    const price = priceOnRequest ? 0 : Math.round(parseFloat(priceRaw));
    if (!priceOnRequest && Number.isNaN(price)) {
      skipped += 1;
      return;
    }

    const categoryLabel = (row['Категорія'] || '').trim().toLowerCase();
    const categoryId = labelToId.get(categoryLabel) || categories[0]?.id || 'inshe';

    const availRaw = (row['Наявність'] || '').trim().toLowerCase();
    const availability = AVAIL_MAP[availRaw] || 'order';

    const condRaw = (row['Стан'] || '').trim().toLowerCase();
    const condition = CONDITION_MAP[condRaw] || 'new';

    const brand = (row['Бренд'] || '').trim();
    const warranty = (row['Гарантія'] || '').trim() || null;

    const photoFile = (row["Фото (ім'я файлу або посилання)"] || row["Фото (ім'я файлу)"] || row['Фото'] || '').trim();
    const image = /^https?:\/\//i.test(photoFile)
      ? photoFile
      : photoFile
        ? `/products/${photoFile}`
        : '/products/placeholder.svg';

    const description = (row['Опис'] || '').trim() || name;

    products.push({
      id: String(idx + 1),
      slug: slugify(name, usedSlugs),
      name,
      category: categoryId,
      subcategory: '',
      brand,
      condition,
      price,
      priceOnRequest,
      availability,
      warranty,
      image,
      description,
    });
  });

  fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`[sync-products] Готово: ${products.length} товарів записано, пропущено рядків без назви/ціни: ${skipped}.`);
}

main().catch((err) => {
  console.error('[sync-products] Помилка синхронізації, залишаю попередній products.json:', err.message);
});
