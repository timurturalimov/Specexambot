// Проверка банка вопросов: node scripts/validate.js
import { QUESTIONS, TOPICS } from '../data/questions.js';

const errors = [];
const ids = new Set();
const date = /^\d{4}-\d{2}-\d{2}$/;

for (const q of QUESTIONS) {
  const at = q.id || '(без id)';
  const err = (m) => errors.push(`${at}: ${m}`);
  if (!/^q\d{3}$/.test(q.id || '')) err('id должен быть вида q001');
  if (ids.has(q.id)) err('дублирующийся id');
  ids.add(q.id);
  if (!TOPICS[q.topic]) err(`неизвестная тема "${q.topic}"`);
  if (!q.q || q.q.length < 10) err('пустой вопрос');
  if (!Array.isArray(q.options) || q.options.length < 3 || q.options.length > 4) err('нужно 3–4 варианта');
  else {
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) err('correct вне диапазона');
    if (new Set(q.options).size !== q.options.length) err('повторяющиеся варианты');
  }
  if (!q.why || q.why.length < 40) err('нет содержательного объяснения (why)');
  if (typeof q.verified !== 'boolean') err('verified должен быть boolean');
  if (q.verified && !q.ref && q.kind !== 'principle') err('verified:true требует ref (пункт ПДД) или kind:"principle"');
  for (const f of ['from', 'until']) if (q[f] && !date.test(q[f])) err(`${f}: формат YYYY-MM-DD`);
  if (q.from && q.until && q.from > q.until) err('from позже until');
}

const verified = QUESTIONS.filter((q) => q.verified).length;
console.log(`Вопросов: ${QUESTIONS.length}, проверено по ПДД: ${verified}, в черновике: ${QUESTIONS.length - verified}`);
const byTopic = {};
for (const q of QUESTIONS) byTopic[q.topic] = (byTopic[q.topic] || 0) + 1;
console.log('По темам:', byTopic);

if (errors.length) {
  console.error('\nОШИБКИ:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK');
