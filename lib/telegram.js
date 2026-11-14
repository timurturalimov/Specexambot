// Минимальная обёртка над Telegram Bot API без зависимостей.

export function makeTelegram(token) {
  const call = async (method, body) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) console.error(`Telegram ${method} failed:`, json.description);
    return json;
  };

  return {
    sendMessage: (chat_id, text, reply_markup) =>
      call('sendMessage', { chat_id, text, parse_mode: 'HTML', reply_markup }),
    editMessageText: (chat_id, message_id, text, reply_markup) =>
      call('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', reply_markup }),
    answerCallbackQuery: (callback_query_id, text) =>
      call('answerCallbackQuery', { callback_query_id, text }),
  };
}
