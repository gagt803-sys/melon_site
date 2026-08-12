// Vercel Serverless Function — приймає оформлення покупки з кошика на сайті
// та надсилає заявку в Telegram через Bot API (той самий бот, що й заявки на ремонт).
// Токен і chat_id — зі змінних середовища Vercel (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).

const DELIVERY_LABELS = {
  pickup: 'Самовивіз з магазину',
  city: 'Доставка по місту (безкоштовно)',
  nova_poshta: 'Нова пошта в інше місто',
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const { name, phone, deliveryMethod, address, city, branch, comment, items, website } = request.body || {};

  // honeypot: якщо це поле заповнене — це бот, тихо ігноруємо
  if (website) {
    response.status(200).json({ ok: true });
    return;
  }

  if (!phone || typeof phone !== 'string' || phone.trim().length < 5) {
    response.status(400).json({ ok: false, error: 'Вкажіть телефон' });
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    response.status(400).json({ ok: false, error: 'Кошик порожній' });
    return;
  }

  if (!DELIVERY_LABELS[deliveryMethod]) {
    response.status(400).json({ ok: false, error: 'Оберіть спосіб отримання' });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN або TELEGRAM_CHAT_ID не задані у Vercel');
    response.status(500).json({ ok: false, error: 'Сервіс тимчасово недоступний, зателефонуйте напряму' });
    return;
  }

  const safeName = (name || 'Не вказано').toString().slice(0, 200);
  const safePhone = phone.toString().slice(0, 50);
  const safeComment = (comment || '').toString().slice(0, 500);
  const safeAddress = (address || '').toString().slice(0, 300);
  const safeCity = (city || '').toString().slice(0, 150);
  const safeBranch = (branch || '').toString().slice(0, 200);

  let itemsTotal = 0;
  let hasPriceOnRequest = false;

  const itemLines = items.slice(0, 50).map((raw, idx) => {
    const itemName = (raw?.name || 'Товар').toString().slice(0, 200);
    const qty = Math.max(1, Math.min(99, parseInt(raw?.qty, 10) || 1));
    const priceOnRequest = !!raw?.priceOnRequest;
    const price = Number(raw?.price) || 0;

    if (priceOnRequest) {
      hasPriceOnRequest = true;
      return `${idx + 1}. ${itemName} — ${qty} шт. (ціна за запитом)`;
    }

    const lineTotal = price * qty;
    itemsTotal += lineTotal;
    return `${idx + 1}. ${itemName} — ${qty} шт. × ${price} ₴ = ${lineTotal} ₴`;
  });

  let deliveryBlock = `Спосіб отримання: ${DELIVERY_LABELS[deliveryMethod]}`;
  if (deliveryMethod === 'city' && safeAddress) {
    deliveryBlock += `\nАдреса: ${safeAddress}`;
  }
  if (deliveryMethod === 'nova_poshta') {
    if (safeCity) deliveryBlock += `\nМісто: ${safeCity}`;
    if (safeBranch) deliveryBlock += `\nВідділення/адреса: ${safeBranch}`;
    deliveryBlock += `\n⚠️ Потрібна передоплата до відправки — узгодити з клієнтом особисто.`;
  }

  const totalLine = hasPriceOnRequest
    ? `Разом: ${itemsTotal} ₴ + позиції з ціною за запитом`
    : `Разом: ${itemsTotal} ₴`;

  const text =
    `🛒 Нове замовлення з сайту\n\n` +
    `Ім'я: ${safeName}\n` +
    `Телефон: ${safePhone}\n\n` +
    `Товари:\n${itemLines.join('\n')}\n\n` +
    `${totalLine}\n\n` +
    `${deliveryBlock}` +
    (safeComment ? `\n\nКоментар: ${safeComment}` : '');

  try {
    const tgResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!tgResponse.ok) {
      const errText = await tgResponse.text();
      console.error('Telegram API error:', errText);
      response.status(502).json({ ok: false, error: 'Не вдалося надіслати заявку' });
      return;
    }

    response.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-order error:', err);
    response.status(500).json({ ok: false, error: 'Не вдалося надіслати заявку' });
  }
}
