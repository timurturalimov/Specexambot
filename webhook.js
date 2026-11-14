import { handleUpdate } from '../lib/bot.js';
import { makeTelegram } from '../lib/telegram.js';

// Vercel serverless-функция: сюда Telegram присылает обновления (webhook).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).send('unauthorized');
  }

  try {
    await handleUpdate(req.body, makeTelegram(process.env.BOT_TOKEN));
  } catch (e) {
    console.error('update failed', e);
  }
  // Всегда 200, иначе Telegram будет бесконечно повторять доставку.
  res.status(200).send('ok');
}
