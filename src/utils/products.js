// Товар вважається "новим", якщо в products.json заповнене поле dateAdded
// (формат "YYYY-MM-DD") і від цієї дати пройшло не більше NEW_DAYS днів.
// Товари без dateAdded (весь поточний каталог) новими не вважаються —
// це чесно, бо реальної дати додавання для них немає.

export const NEW_DAYS = 10;

export function isNewProduct(product, now = new Date()) {
  if (!product.dateAdded) return false;
  const added = new Date(product.dateAdded + 'T00:00:00');
  if (Number.isNaN(added.getTime())) return false;
  const diffDays = (now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= NEW_DAYS;
}

// Повертає копію списку товарів, де нові (за NEW_DAYS) йдуть першими
// (найновіші — вище), а решта зберігає початковий порядок каталогу.
export function sortNewFirst(products, now = new Date()) {
  return [...products].sort((a, b) => {
    const aNew = isNewProduct(a, now);
    const bNew = isNewProduct(b, now);
    if (aNew && !bNew) return -1;
    if (!aNew && bNew) return 1;
    if (aNew && bNew) return (b.dateAdded || '').localeCompare(a.dateAdded || '');
    return 0; // стабільне сортування — інші товари лишаються в тому ж порядку
  });
}
