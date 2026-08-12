// Vercel Serverless Function — принимает заявку з форми на сайті
// та надсилає її в Telegram через Bot API.
// Токен бота і chat_id беруться зі змінних середовища Vercel (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID),
// в коді і в браузері вони ніколи не з'являються.

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const { name, phone, message, website } = request.body || {};

  // honeypot: якщо це поле заповнене — це бот, тихо ігноруємо
  if (website) {
    response.status(200).json({ ok: true });
    return;
  }

  if (!phone || typeof phone !== 'string' || phone.trim().length < 5) {
    response.status(400).json({ ok: false, error: 'Вкажіть телефон' });
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
  const safeMessage = (message || 'Без опису').toString().slice(0, 1000);

  const text =
    `🔧 Нова заявка з сайту\n\n` +
    `Ім'я: ${safeName}\n` +
    `Телефон: ${safePhone}\n` +
    `Опис: ${safeMessage}`;

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
    console.error('send-request error:', err);
    response.status(500).json({ ok: false, error: 'Не вдалося надіслати заявку' });
  }
}
