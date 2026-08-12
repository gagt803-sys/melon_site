// Мелон — простий кошик на localStorage. Без бекенду, без фреймворків.
// Дані живуть тільки в браузері клієнта, аж до моменту оформлення заявки.
(function () {
  var KEY = 'melon-cart-v1';

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items : [];
    } catch (e) {
      return [];
    }
  }

  function write(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch (e) {
      /* localStorage недоступний (приватний режим тощо) — тихо ігноруємо */
    }
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: items } }));
    return items;
  }

  // item: { slug, name, price, priceOnRequest, image, availability }
  function add(item, qty) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    var items = read();
    var existing = items.filter(function (i) { return i.slug === item.slug; })[0];
    if (existing) {
      existing.qty = Math.min(99, existing.qty + qty);
    } else {
      items.push({
        slug: item.slug,
        name: item.name,
        price: item.price || 0,
        priceOnRequest: !!item.priceOnRequest,
        image: item.image || '',
        availability: item.availability || 'in',
        qty: Math.min(99, qty),
      });
    }
    return write(items);
  }

  function setQty(slug, qty) {
    qty = parseInt(qty, 10) || 0;
    var items = read();
    if (qty <= 0) {
      items = items.filter(function (i) { return i.slug !== slug; });
    } else {
      items.forEach(function (i) { if (i.slug === slug) i.qty = Math.min(99, qty); });
    }
    return write(items);
  }

  function remove(slug) {
    var items = read().filter(function (i) { return i.slug !== slug; });
    return write(items);
  }

  function clear() {
    return write([]);
  }

  function count(items) {
    return (items || read()).reduce(function (s, i) { return s + i.qty; }, 0);
  }

  function total(items) {
    return (items || read()).reduce(function (s, i) {
      return s + (i.priceOnRequest ? 0 : i.price * i.qty);
    }, 0);
  }

  function hasPriceOnRequest(items) {
    return (items || read()).some(function (i) { return i.priceOnRequest; });
  }

  window.MelonCart = {
    read: read,
    write: write,
    add: add,
    setQty: setQty,
    remove: remove,
    clear: clear,
    count: count,
    total: total,
    hasPriceOnRequest: hasPriceOnRequest,
  };
})();
