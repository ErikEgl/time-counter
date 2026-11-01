export const VERSION = '1.0.0';
export const SCHEMA = 1;
export const METRICS = ['publications', 'videos', 'minutes', 'visits', 'otherMinutes'];
export const ROLES = ['Возвещатель', 'Подсобный пионер', 'Общий пионер', 'Другое'];
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'dark', leftHand: false, threeD: false, dividers: true, weekStart: 1,
  step: 30, quickInput: false, bigTimer: false, wholeHours: false, sortDesc: false,
  protected: false, autosave: true, timerCapHours: 15, role: 'Общий пионер',
  monthStats: true, yearStats: true, monthlyGoalHours: 70, annualGoalHours: 840,
  legacyMetrics: true,
});
export function dateKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1900 || y > 2200) return false;
  const check = new Date(y, m - 1, d, 12);
  return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d;
}
export function validMonth(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && validDate(`${value}-01`); }
export function asDate(key) { const [y, m, d = 1] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); }
export function monthKey(key = dateKey()) { return key.slice(0, 7); }
export function shiftMonth(key, delta) { const d = asDate(`${key}-01`); d.setMonth(d.getMonth() + delta); return monthKey(dateKey(d)); }
export function serviceYear(key) { const y = Number(key.slice(0, 4)); return Number(key.slice(5, 7)) < 9 ? y - 1 : y; }
export function yearMonths(year) { return Array.from({length: 12}, (_, i) => shiftMonth(`${year}-09`, i)); }
export function daysInMonth(key) { const d = asDate(`${key}-01`); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
export function monthLabel(key) { return asDate(`${key}-01`).toLocaleDateString('ru-RU', {month: 'long', year: 'numeric'}).replace(' г.', ''); }
export function dayLabel(key) { return asDate(key).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', weekday: 'long'}); }
export function formatTime(value) { const n = Math.max(0, Math.floor(Number(value) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
export function parseTime(raw) {
  const text = String(raw).trim();
  if (/^\d{1,5}:\d{2}$/.test(text)) {
    const [h, m] = text.split(':').map(Number);
    if (m < 60 && h * 60 + m <= 1000000) return h * 60 + m;
  }
  if (/^\d{1,7}$/.test(text) && Number(text) <= 1000000) return Number(text);
  throw new Error('Введите часы:минуты, например 2:30, или целое количество минут.');
}
export function integer(raw, max = 1000000) {
  const s = String(raw).trim();
  if (!/^\d+$/.test(s) || Number(s) > max) throw new Error('Введите целое неотрицательное число.');
  return Number(s);
}
export function emptyDay(date) {
  return {date, publications: 0, videos: 0, minutes: 0, visits: 0, otherMinutes: 0, studyIds: [], manualStudies: 0, notes: ''};
}
export function newState() {
  return {schemaVersion: SCHEMA, revision: 0, updatedAt: new Date().toISOString(), days: {}, studies: {}, months: {}, years: {}, settings: {...DEFAULT_SETTINGS}, timer: null, meta: {lastArchiveAt: null}};
}
export function ensureMonth(state, key) {
  if (!validMonth(key)) throw new Error('Неверный месяц.');
  state.months[key] ??= {key, source: 'daily', closed: false, role: state.settings.role, goalMinutes: state.settings.monthlyGoalHours * 60, manual: null, closedTotal: null};
  const year = serviceYear(key);
  state.years[year] ??= {goalMinutes: state.settings.annualGoalHours * 60};
  return state.months[key];
}
export function studyCount(day) { return day.studyIds.length + day.manualStudies; }
export function summary(state, key) {
  const month = state.months[key];
  if (month?.source === 'manual') return {...month.manual, activeDays: 0, uniqueStudyIds: []};
  const total = {publications: 0, videos: 0, minutes: 0, visits: 0, otherMinutes: 0, studies: 0, activeDays: 0, uniqueStudyIds: []};
  const ids = new Set(); let unnamed = 0;
  for (const day of Object.values(state.days)) {
    if (monthKey(day.date) !== key) continue;
    for (const field of METRICS) total[field] += day[field];
    if (METRICS.some(field => day[field] > 0) || studyCount(day) > 0 || day.notes) total.activeDays++;
    day.studyIds.forEach(id => ids.add(id)); unnamed = Math.max(unnamed, day.manualStudies);
  }
  total.studies = ids.size + unnamed; total.uniqueStudyIds = [...ids];
  return total;
}
export function yearSummary(state, year, today = dateKey()) {
  const months = yearMonths(year);
  const total = {minutes: 0, otherMinutes: 0, publications: 0, videos: 0, visits: 0, studies: 0};
  for (const key of months) {
    const s = summary(state, key);
    for (const field of Object.keys(total)) total[field] += s[field];
  }
  const elapsed = months.filter(key => key <= monthKey(today)).length;
  const remainingMonths = months.filter(key => key >= monthKey(today)).length;
  const goal = state.years[year]?.goalMinutes ?? state.settings.annualGoalHours * 60;
  return {...total, elapsed, remainingMonths, goal, remaining: Math.max(0, goal - total.minutes), average: elapsed ? Math.floor(total.minutes / elapsed) : 0};
}
export function canEdit(state, date, today = dateKey()) {
  const m = state.months[monthKey(date)];
  if (m?.closed) throw new Error('Месяц закрыт. Сначала откройте его для редактирования в архиве.');
  if (m?.source === 'manual') throw new Error('Этот месяц внесён общим итогом. Измените его в архиве.');
  if (state.settings.protected && monthKey(date) < monthKey(today)) throw new Error('Изменение прошлых месяцев защищено. Переключатель находится в настройках.');
}
export function changeDay(state, date, apply, today = dateKey()) {
  if (!validDate(date)) throw new Error('Неверная дата.');
  canEdit(state, date, today); ensureMonth(state, monthKey(date));
  const day = structuredClone(state.days[date] ?? emptyDay(date));
  apply(day); state.days[date] = day; return day;
}
export function closeMonth(state, key, today = dateKey()) {
  if (key >= monthKey(today)) throw new Error('Закрыть можно только завершённый месяц.');
  const m = ensureMonth(state, key); m.closedTotal = summary(state, key); m.closed = true;
}
export function timerSeconds(timer, now = Date.now()) {
  if (!timer) return 0;
  const running = timer.running ? Math.max(0, Math.floor((now - timer.startedAt) / 1000)) : 0;
  return Math.min(timer.capSeconds, timer.accumulatedSeconds + running);
}
export function applyTimer(state, id, now = Date.now()) {
  const timer = state.timer;
  if (!timer || timer.id !== id) return false;
  const minutes = Math.floor(timerSeconds(timer, now) / 60);
  changeDay(state, timer.date, day => { day.minutes += minutes; });
  state.timer = null; return true;
}
function check(ok, message) { if (!ok) throw new Error(message); }
function record(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function safeCount(v, max = 1000000) { return Number.isSafeInteger(v) && v >= 0 && v <= max; }
export function validateState(state) {
  check(record(state) && state.schemaVersion === SCHEMA, 'Неподдерживаемая версия базы.');
  for (const key of ['days', 'studies', 'months', 'years', 'settings', 'meta']) check(record(state[key]), `Повреждён раздел ${key}.`);
  check(safeCount(state.revision, Number.MAX_SAFE_INTEGER), 'Неверная версия записи.');
  const settings = state.settings;
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    check(typeof settings[key] === typeof value, `Неверная настройка ${key}.`);
  }
  check(['dark', 'light', 'midnight'].includes(settings.theme), 'Неизвестная тема.');
  check([0, 1].includes(settings.weekStart) && [1, 2, 5, 10, 15, 20, 30].includes(settings.step), 'Неверный шаг или начало недели.');
  for (const key of ['monthlyGoalHours', 'annualGoalHours']) check(safeCount(settings[key], 100000), 'Неверная цель.');
  check(safeCount(settings.timerCapHours, 72) && settings.timerCapHours > 0, 'Неверный предел секундомера.');
  check(settings.role.length <= 200, 'Слишком длинное назначение.');
  check(Object.keys(state.days).length <= 120000 && Object.keys(state.studies).length <= 20000, 'Слишком много записей.');
  for (const [id, study] of Object.entries(state.studies)) {
    check(/^[a-zA-Z0-9_-]{1,100}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id), 'Неверный идентификатор изучения.');
    check(record(study) && study.id === id && typeof study.name === 'string' && study.name.trim().length > 0 && study.name.length <= 200 && typeof study.notes === 'string' && study.notes.length <= 10000 && typeof study.active === 'boolean', 'Повреждено изучение.');
  }
  for (const [key, day] of Object.entries(state.days)) {
    check(validDate(key) && record(day) && day.date === key, 'Повреждена дата дня.');
    for (const field of [...METRICS, 'manualStudies']) check(safeCount(day[field]), 'Неверный показатель дня.');
    check(Array.isArray(day.studyIds) && new Set(day.studyIds).size === day.studyIds.length && day.studyIds.every(id => Object.hasOwn(state.studies, id)), 'Повреждены связи изучений.');
    check(typeof day.notes === 'string' && day.notes.length <= 10000, 'Повреждена заметка.');
    check(state.months[monthKey(key)]?.source === 'daily', 'У дня отсутствует месяц или месяц внесён итогом.');
  }
  for (const [key, month] of Object.entries(state.months)) {
    check(validMonth(key) && record(month) && month.key === key && ['daily', 'manual'].includes(month.source) && typeof month.closed === 'boolean', 'Повреждён месяц.');
    check(typeof month.role === 'string' && month.role.length <= 200 && safeCount(month.goalMinutes, 10000000), 'Неверные параметры месяца.');
    if (month.source === 'manual') {
      check(record(month.manual), 'Отсутствует ручной итог.');
      for (const field of [...METRICS, 'studies']) check(safeCount(month.manual[field]), 'Неверный ручной итог.');
    }
  }
  for (const [year, value] of Object.entries(state.years)) check(/^\d{4}$/.test(year) && Number(year) >= 1899 && Number(year) <= 2200 && record(value) && safeCount(value.goalMinutes, 10000000), 'Неверная годовая цель.');
  if (state.timer !== null) {
    const t = state.timer;
    check(record(t) && typeof t.id === 'string' && t.id.length <= 100 && validDate(t.date) && typeof t.running === 'boolean' && Number.isFinite(t.startedAt) && t.startedAt >= 0 && safeCount(t.capSeconds, 259200) && t.capSeconds > 0 && safeCount(t.accumulatedSeconds, t.capSeconds), 'Повреждён секундомер.');
  }
  return state;
}
export function reportText(state, key) {
  const total = summary(state, key); const m = state.months[key];
  const rows = [monthLabel(key), m?.role ?? state.settings.role, `Часы: ${state.settings.wholeHours ? Math.floor(total.minutes / 60) : formatTime(total.minutes)}`, `Изучения: ${total.studies}`];
  if (state.settings.legacyMetrics) rows.push(`Публикации: ${total.publications}`, `Видео: ${total.videos}`, `Повторные посещения: ${total.visits}`);
  if (total.otherMinutes) rows.push(`Другие часы: ${formatTime(total.otherMinutes)}`);
  return rows.join('\n');
}
