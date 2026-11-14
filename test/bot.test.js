import test from 'node:test';
import assert from 'node:assert/strict';
import { handleUpdate } from '../lib/bot.js';
import { pickQuestions, optionOrder, parseCb, cb, activeQuestions, wrongIndexes, setBit } from '../lib/quiz.js';

const before = new Date('2026-11-14T12:00:00Z'); // до изменений 20.11
const after = new Date('2026-11-21T12:00:00Z');

function fakeTg() {
  const sent = [];
  return {
    sent,
    sendMessage: async (chat, text, kb) => sent.push({ type: 'send', text, kb }),
    editMessageText: async (chat, id, text, kb) => sent.push({ type: 'edit', text, kb }),
    answerCallbackQuery: async () => {},
  };
}

test('выбор вопросов детерминирован и без повторов', () => {
  const a = pickQuestions(12345, 'e', before).map((q) => q.id);
  const b = pickQuestions(12345, 'e', before).map((q) => q.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test('вопросы с from/until переключаются по дате', () => {
  const idsBefore = activeQuestions(before).map((q) => q.id);
  const idsAfter = activeQuestions(after).map((q) => q.id);
  assert.ok(idsBefore.includes('q004') && !idsBefore.includes('q005'));
  assert.ok(!idsAfter.includes('q004') && idsAfter.includes('q005'));
  assert.ok(!idsBefore.includes('q032') && idsAfter.includes('q032'));
});

test('callback_data умещается в 64 байта и разбирается обратно', () => {
  const data = cb.answer('e', 36 ** 5 - 1, 39, 2 ** 40 - 1, 3);
  assert.ok(Buffer.byteLength(data) <= 64, data);
  const p = parseCb(data);
  assert.equal(p.i, 39);
  assert.equal(p.mask, 2 ** 40 - 1);
  assert.equal(p.choice, 3);
  assert.equal(parseCb('garbage'), null);
});

test('порядок вариантов — перестановка', () => {
  const q = pickQuestions(7, 'p', before)[0];
  const order = optionOrder(7, 0, q);
  assert.deepEqual([...order].sort(), q.options.map((_, i) => i));
});

test('полный прохождение: правильные и неправильные ответы, итог', async () => {
  const tg = fakeTg();
  await handleUpdate({ message: { chat: { id: 1 }, text: '/practice' } }, tg, before);
  let view = tg.sent.at(-1);
  assert.equal(view.type, 'send');
  const n = 10;
  let expectedWrong = 0;

  for (let i = 0; i < n; i++) {
    // seed берём из callback_data самого сообщения
    const first = parseCb(view.kb.inline_keyboard[0][0].callback_data);
    const qs = pickQuestions(first.seed, 'p', before);
    const order = optionOrder(first.seed, i, qs[i]);
    const correctBtn = order.indexOf(qs[i].correct);
    const wrongBtn = (correctBtn + 1) % order.length;
    const pickWrong = i % 3 === 0; // каждый третий — ошибка
    if (pickWrong) expectedWrong++;
    const btn = view.kb.inline_keyboard[0][pickWrong ? wrongBtn : correctBtn];

    await handleUpdate({ callback_query: { id: 'x', data: btn.callback_data, message: { chat: { id: 1 }, message_id: 5 } } }, tg, before);
    view = tg.sent.at(-1);
    assert.match(view.text, pickWrong ? /Неверно/ : /Верно/);

    const nextBtn = view.kb.inline_keyboard[0][0];
    await handleUpdate({ callback_query: { id: 'x', data: nextBtn.callback_data, message: { chat: { id: 1 }, message_id: 5 } } }, tg, before);
    view = tg.sent.at(-1);
  }
  assert.match(view.text, new RegExp(`${n - expectedWrong} из ${n}`));
});

test('маска ошибок считается корректно', () => {
  let m = 0;
  m = setBit(m, 0); m = setBit(m, 5); m = setBit(m, 39); m = setBit(m, 5);
  assert.deepEqual(wrongIndexes(m, 40), [0, 5, 39]);
});

test('мусорный callback не роняет бота', async () => {
  const tg = fakeTg();
  await handleUpdate({ callback_query: { id: 'x', data: 'zzz', message: { chat: { id: 1 }, message_id: 1 } } }, tg, before);
  assert.equal(tg.sent.length, 0);
});
