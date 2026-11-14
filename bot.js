import { TOPICS } from '../data/questions.js';
import {
  MODES, pickQuestions, optionOrder, cb, parseCb, setBit, bit, wrongIndexes,
} from './quiz.js';

const LETTERS = ['А', 'Б', 'В', 'Г'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MENU = {
  inline_keyboard: [
    [{ text: '📝 Экзамен (40 вопросов)', callback_data: cb.start('e') }],
    [{ text: '🎯 Тренировка (10 вопросов)', callback_data: cb.start('p') }],
  ],
};

const WELCOME =
  '🚗 <b>ПДД РК: понимать, а не зубрить</b>\n\n' +
  'Вопросы в формате теста ЦОН. После каждого ответа — разбор: <i>почему</i> правило устроено именно так. ' +
  'Когда понимаешь логику, запоминать не нужно.\n\n' +
  '⚠️ Бот учебный. В спорных случаях ориентируйся на официальный текст ПДД РК.';

// ---------- Рендер ----------

function renderQuestion({ mode, seed, i, mask }, qs) {
  const q = qs[i];
  const order = optionOrder(seed, i, q);
  const lines = order.map((orig, k) => `${LETTERS[k]}) ${esc(q.options[orig])}`);
  const text =
    `<b>${MODES[mode].name}</b> · вопрос ${i + 1} из ${qs.length} · ${TOPICS[q.topic]}\n\n` +
    `<b>${esc(q.q)}</b>\n\n${lines.join('\n')}`;
  const keyboard = {
    inline_keyboard: [order.map((_, k) => ({ text: LETTERS[k], callback_data: cb.answer(mode, seed, i, mask, k) }))],
  };
  return { text, keyboard };
}

function renderAnswer({ mode, seed, i, mask, choice }, qs) {
  const q = qs[i];
  const order = optionOrder(seed, i, q);
  const chosenOrig = order[choice];
  const ok = chosenOrig === q.correct;
  const newMask = ok ? mask : setBit(mask, i);

  const lines = order.map((orig, k) => {
    const mark = orig === q.correct ? '✅' : k === choice ? '❌' : '▫️';
    return `${mark} ${LETTERS[k]}) ${esc(q.options[orig])}`;
  });
  let text =
    `<b>${MODES[mode].name}</b> · вопрос ${i + 1} из ${qs.length}\n\n` +
    `<b>${esc(q.q)}</b>\n\n${lines.join('\n')}\n\n` +
    `${ok ? '✅ <b>Верно!</b>' : '❌ <b>Неверно.</b>'}\n\n💡 ${esc(q.why)}`;
  if (q.ref) text += `\n\n📖 <i>${esc(q.ref)}</i>`;
  if (!q.verified) text += '\n\n<i>Формулировка в проверке.</i>';

  const last = i + 1 >= qs.length;
  const keyboard = {
    inline_keyboard: [[{
      text: last ? '🏁 Результат' : 'Дальше ▶',
      callback_data: cb.next(mode, seed, i + 1, newMask),
    }]],
  };
  return { text, keyboard };
}

function renderResult({ mode, mask }, qs) {
  const n = qs.length;
  const wrong = wrongIndexes(mask, n);
  const score = n - wrong.length;
  const pct = Math.round((score / n) * 100);

  let text = `🏁 <b>${MODES[mode].name} завершён</b>\n\nПравильных ответов: <b>${score} из ${n}</b> (${pct}%)`;
  if (wrong.length) {
    const byTopic = {};
    for (const i of wrong) byTopic[qs[i].topic] = (byTopic[qs[i].topic] || 0) + 1;
    const rows = Object.entries(byTopic)
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `• ${TOPICS[t]} — ошибок: ${c}`);
    text += `\n\nНад чем стоит поработать:\n${rows.join('\n')}`;
  } else {
    text += '\n\nБез единой ошибки. Отлично! 👏';
  }
  text += '\n\nНе спеши запоминать ответы: если что-то вызвало сомнение — вернись к объяснению и разберись, почему так.';
  return { text, keyboard: MENU };
}

// ---------- Обработчики ----------

function newSeed() {
  return 1 + Math.floor(Math.random() * 36 ** 5); // до 5 символов в base36
}

async function startSession(tg, chatId, mode, now) {
  const seed = newSeed();
  const qs = pickQuestions(seed, mode, now);
  if (!qs.length) return tg.sendMessage(chatId, 'Банк вопросов пуст.');
  const { text, keyboard } = renderQuestion({ mode, seed, i: 0, mask: 0 }, qs);
  return tg.sendMessage(chatId, text, keyboard);
}

async function onMessage(msg, tg, now) {
  const chatId = msg.chat.id;
  const cmd = (msg.text || '').split(/[\s@]/)[0].toLowerCase();
  if (cmd === '/exam') return startSession(tg, chatId, 'e', now);
  if (cmd === '/practice') return startSession(tg, chatId, 'p', now);
  return tg.sendMessage(chatId, WELCOME, MENU); // /start, /help и всё остальное
}

async function onCallback(q, tg, now) {
  const chatId = q.message?.chat?.id;
  const messageId = q.message?.message_id;
  const p = parseCb(q.data);
  if (!p || !chatId) return tg.answerCallbackQuery(q.id);
  await tg.answerCallbackQuery(q.id);

  if (p.kind === 's') return startSession(tg, chatId, p.mode, now);

  const qs = pickQuestions(p.seed, p.mode, now);
  if (p.kind === 'a') {
    if (!qs[p.i] || p.choice < 0 || p.choice >= qs[p.i].options.length) return;
    const { text, keyboard } = renderAnswer(p, qs);
    return tg.editMessageText(chatId, messageId, text, keyboard);
  }
  // kind === 'n'
  const view = p.i >= qs.length ? renderResult(p, qs) : renderQuestion(p, qs);
  return tg.editMessageText(chatId, messageId, view.text, view.keyboard);
}

export async function handleUpdate(update, tg, now = new Date()) {
  if (update?.callback_query) return onCallback(update.callback_query, tg, now);
  if (update?.message?.text) return onMessage(update.message, tg, now);
}

export { renderQuestion, renderAnswer, renderResult, bit };
