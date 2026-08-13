// Мелон — надсилання подій в Google Analytics (GA4) для ключових дій:
// клік по телефону, успішна заявка з форми, додавання в кошик.
// Працює тільки якщо на сторінці підключений gtag.js (site.json -> gaId).
(function () {
  function send(name, params) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', name, params || {});
  }

  // 1) Клік по будь-якому tel: посиланню (шапка, кнопка дзвінка,
  //    плаваюча кнопка, CTA-блоки) — рахуємо як конверсію "дзвінок".
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (!link) return;
    send('phone_click', {
      link_text: (link.textContent || '').trim().slice(0, 60),
      page_path: location.pathname,
    });
  });

  // 2) Додавання товару в кошик — вже є подія 'cart:added' від cart.js.
  document.addEventListener('cart:added', function (e) {
    var item = (e.detail && e.detail.item) || {};
    send('add_to_cart', {
      currency: 'UAH',
      value: item.priceOnRequest ? 0 : (Number(item.price) || 0) * (e.detail.qty || 1),
      items: [{
        item_id: item.slug || '',
        item_name: item.name || '',
        price: Number(item.price) || 0,
        quantity: e.detail.qty || 1,
      }],
    });
  });

  // 3) Успішна відправка заявки на ремонт (форма на /repair/) —
  //    сторінка сама диспатчить цю подію після успішного fetch().
  document.addEventListener('lead:submitted', function (e) {
    send('generate_lead', {
      form_id: 'repair-request',
      page_path: location.pathname,
    });
  });
})();
