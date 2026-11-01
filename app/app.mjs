import {VERSION, ROLES, METRICS, DEFAULT_SETTINGS, dateKey, validDate, monthKey, shiftMonth, serviceYear, yearMonths, daysInMonth, asDate, monthLabel, dayLabel, formatTime, parseTime, integer, emptyDay, ensureMonth, studyCount, summary, yearSummary, canEdit, changeDay, closeMonth, timerSeconds, applyTimer, reportText} from './core.mjs';
import {openStore, loadState, updateState, storageStatus, requestPersistence} from './storage.mjs';
import {createBackup, readBackup} from './backup.mjs';

const root = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toastElement = document.querySelector('#toast');
const paths = {
  day: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16m-10 4h4m-2 0v4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h1m3 0h1m3 0h1M8 17h1m3 0h1m3 0h1"/>',
  archive: '<path d="M5 20v-6m5 6V9m5 11V5m5 15V2M3 10l6-4 5 1 6-5"/>',
  book: '<path d="M3 5q5-2 9 1 4-3 9-1v15q-5-2-9 1-4-3-9-1zM12 6v15"/>',
  studies: '<circle cx="12" cy="5" r="3"/><path d="M3 11q5-2 9 1 4-3 9-1v10q-5-2-9 1-4-3-9-1zM12 12v10"/>',
  settings: '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3z"/><circle cx="12" cy="11" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
  timer: '<circle cx="12" cy="14" r="8"/><path d="M12 2v4M9 2h6m3 5 2-2M12 10v5"/>',
  video: '<rect x="3" y="4" width="12" height="15" rx="2"/><rect x="16" y="9" width="5" height="12" rx="1"/><path d="m8 8 4 3-4 3z"/>',
  people: '<circle cx="7" cy="5" r="2"/><circle cx="17" cy="5" r="2"/><path d="M3 20v-9q4-3 8 1l2 1 2-1q3-3 6-1v9M7 12v9m10-9v9"/>',
  left: '<path d="m15 5-7 7 7 7"/>', right: '<path d="m9 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  shield: '<path d="m12 3 8 3v6q-1 6-8 9-7-3-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  note: '<path d="M16 21H5V3h14v11M8 7h8M8 11h5m1 10 1-4 5-5 3 3-5 5z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  share: '<path d="M12 15V2m-4 4 4-4 4 4M7 8H4v14h16V8h-3"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  edit: '<path d="m4 16-1 5 5-1L21 7l-4-4zM14 6l4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.info}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const plural = (n, one, few, many) => n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;
const dayCount = n => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
const monthCount = n => `${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`;
const button = (action, label, symbol, attrs = '') => `<button class="icon-button" data-action="${action}" aria-label="${esc(label)}" ${attrs}>${icon(symbol)}</button>`;
let state, view = 'day', selectedDate = dateKey(), period = monthKey(), archiveYear = serviceYear(monthKey());
let draft = null, showArchived = false, toastTimeout, pendingImport = null, pendingFile = null, fileURL = null;
let offlineReady = false, waitingWorker = null, updating = false, storage = {persistent: false, usage: 0};
let savePending = 0, lastSaveFailed = false;

function toast(message) { clearTimeout(toastTimeout); toastElement.textContent = message; toastElement.classList.add('visible'); toastTimeout = setTimeout(() => toastElement.classList.remove('visible'), 3500); }
function errorMessage(error) {
  console.error(error?.name || 'Error', error?.message || 'Operation failed');
  const message = error?.message || 'Не удалось выполнить действие.';
  if (dialog.open) { let node = dialog.querySelector('.dialog-error'); if (!node) { node = document.createElement('p'); node.className = 'dialog-error'; node.setAttribute('role', 'alert'); dialog.append(node); } node.textContent = message; }
  else showDialog('Не удалось сохранить', `<p class="dialog-copy">${esc(message)}</p><p class="settings-caption">Записи на устройстве не удалены. Повторите действие после устранения причины.</p>`);
}
async function commit(mutator, options) {
  savePending++;
  try { state = await updateState(mutator, options); lastSaveFailed = false; render(); return state; }
  catch (error) { lastSaveFailed = true; render(); throw error; }
  finally { savePending--; }
}
function currentDay() { return draft?.date === selectedDate ? draft : state.days[selectedDate] ?? emptyDay(selectedDate); }
async function editDay(apply) {
  if (state.settings.autosave) await commit(s => { changeDay(s, selectedDate, apply); });
  else {
    canEdit(state, selectedDate); draft ??= structuredClone(state.days[selectedDate] ?? emptyDay(selectedDate)); apply(draft); render();
  }
}
function canNavigate() { if (draft) { toast('Сначала сохраните или отмените изменения дня.'); return false; } return true; }
function navigate(nextView) { if (!canNavigate()) return; view = nextView; if (view === 'month') period = monthKey(selectedDate); if (view === 'archive') archiveYear = serviceYear(period); render(); window.scrollTo({top: 0}); }
function showDialog(title, body, footer = '') {
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2>${button('closeDialog', 'Закрыть окно', 'close')}</div>${body}${footer}`;
  if (!dialog.open) dialog.showModal();
}
function closeDialog() { dialog.close(); dialog.innerHTML = ''; }
function field(label, name, value, type = 'text', extra = '') { return `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`; }
function footerSave(label = 'Сохранить') { return `<p class="dialog-error" role="alert"></p><div class="button-row"><button type="button" class="secondary" data-action="closeDialog">Отмена</button><button class="primary" type="submit">${label}</button></div>`; }
function totalStrip(total) {
  const items = [[`${total.studies}`, 'изучения'], ...(state.settings.legacyMetrics ? [[`${total.visits}`, 'повторные'], [`${total.videos}`, 'видео']] : [[formatTime(total.otherMinutes), 'другие часы']])];
  return `<div class="summary-grid">${items.map(([number, label]) => `<div class="summary-stat"><strong>${number}</strong><span>${label}</span></div>`).join('')}</div>`;
}
function progress(total, goal) {
  const pct = goal > 0 ? Math.min(100, Math.round(total / goal * 100)) : 0;
  return `<div class="progress" role="progressbar" aria-label="Выполнение цели" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div><div class="progress-caption"><span>Цель ${formatTime(goal)}</span><span>${goal ? `${pct}%` : 'Без цели'}</span></div>`;
}
function render() {
  if (!state) return;
  const s = state.settings;
  document.documentElement.dataset.theme = s.theme;
  document.body.className = [s.leftHand && 'left-hand', s.threeD && 'three-d', !s.dividers && 'no-dividers', s.bigTimer && 'big-timer'].filter(Boolean).join(' ');
  const body = ({day: renderDay, calendar: renderCalendar, month: renderMonth, archive: renderArchive, studies: renderStudies, settings: renderSettings}[view] ?? renderDay)();
  const active = view === 'calendar' ? 'day' : view;
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = `<div class="shell"><header class="topbar"><div class="wordmark"><span class="brand-mark">М</span>Мой отчёт</div><div class="local-badge">${icon('shield')}На этом устройстве</div></header>${waitingWorker ? `<div class="update-banner"><span>Доступна новая версия</span><button class="text-button" data-action="updateApp">Обновить</button></div>` : ''}${body}</div><nav class="bottom-nav" aria-label="Основные разделы"><div class="nav-inner">${[['day','День','day'],['month','Месяц','calendar'],['archive','Архив','archive'],['studies','Изучения','studies'],['settings','Настройки','settings']].map(([key,label,symbol]) => `<button class="nav-item ${active === key ? 'active' : ''}" data-action="nav" data-view="${key}" ${active === key ? 'aria-current="page"' : ''}><span class="nav-symbol">${icon(symbol)}</span><span>${label}</span></button>`).join('')}</div></nav>`;
}
function heading(title, subtitle, actions = '', eyebrow = '') { return `<div class="heading"><div>${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h1>${esc(title)}</h1>${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ''}</div><div class="actions">${actions}</div></div>`; }
function renderDay() {
  const d = currentDay(); const total = summary(state, monthKey(selectedDate)); const m = state.months[monthKey(selectedDate)];
  const names = d.studyIds.map(id => state.studies[id]?.name).filter(Boolean);
  const today = selectedDate === dateKey();
  const saved = draft ? 'Есть несохранённые изменения' : lastSaveFailed ? 'Последнее изменение не сохранено' : 'Изменения сохраняются на устройстве';
  return `${heading(today ? 'Сегодня' : asDate(selectedDate).toLocaleDateString('ru-RU',{day:'numeric',month:'long'}), today ? dayLabel(selectedDate) : asDate(selectedDate).toLocaleDateString('ru-RU',{year:'numeric',weekday:'long'}), button('openCalendar', 'Открыть календарь', 'calendar'), 'Ваш день')}
    <div class="date-strip">${button('prevDay','Предыдущий день','left')}<button class="date-main" data-action="chooseDate">${icon('calendar')}${esc(selectedDate === dateKey() ? 'Сегодня' : selectedDate)}${m?.closed ? icon('lock') : ''}</button>${button('nextDay','Следующий день','right')}</div>
    ${m?.closed || m?.source === 'manual' ? `<div class="notice warning">${m.closed ? 'Месяц закрыт. История сохранена.' : 'Месяц внесён общим итогом.'} <button class="text-button" data-action="nav" data-view="month">Открыть месяц</button></div>` : ''}
    <div class="day-layout"><section><div class="card hero"><div class="card-label">${icon('clock')}Время в служении</div><div class="time-control"><button class="round" data-action="bump" data-field="minutes" data-dir="-1" aria-label="Уменьшить время">${icon('minus')}</button><div class="time-value"><button data-action="amount" data-field="minutes" aria-label="Изменить время">${formatTime(d.minutes)}</button></div><button class="round" data-action="bump" data-field="minutes" data-dir="1" aria-label="Увеличить время">${icon('plus')}</button></div><div class="summary-caption">Шаг ${safenum(state.settings.step)} мин · нажмите на время для ввода</div><button class="timer-link ${state.timer?.running ? 'running' : ''}" data-action="timer">${icon('timer')}<span id="timer-pill">${state.timer ? `Секундомер · ${formatTime(Math.floor(timerSeconds(state.timer) / 60))}` : 'Начать секундомер'}</span></button></div>
    ${state.settings.legacyMetrics ? `<div class="counter-grid">${[['publications','Публикации','book'],['videos','Видео','video'],['visits','Повторные','people']].map(([key,label,symbol]) => `<div class="counter-card"><div class="metric-icon">${icon(symbol)}</div><div class="counter-title">${label}</div><button class="counter-number" data-action="amount" data-field="${key}" aria-label="Изменить ${label.toLowerCase()}">${d[key]}</button><div class="mini-controls"><button data-action="bump" data-field="${key}" data-dir="-1" aria-label="Уменьшить ${label.toLowerCase()}">${icon('minus')}</button><button data-action="bump" data-field="${key}" data-dir="1" aria-label="Увеличить ${label.toLowerCase()}">${icon('plus')}</button></div></div>`).join('')}</div>` : ''}</section>
    <section><div class="section-line"><h2>Изучения</h2><small>За выбранный день</small></div><div class="card study-card"><div class="study-symbol">${icon('studies')}</div><div class="grow"><h3>${studyCount(d) ? 'Проведённые изучения' : 'Добавьте изучение'}</h3><p class="study-names">${esc(names.length ? names.join(', ') : d.manualStudies ? 'Без указания имени' : 'Выберите человека из списка')}</p></div><span class="count-badge">${studyCount(d)}</span><button class="text-button" data-action="dayStudies" aria-label="Выбрать изучения">${icon('plus')}</button></div><div class="card"><div class="detail-row"><span class="detail-label">${icon('clock')}Другие часы</span><button class="value" data-action="amount" data-field="otherMinutes" aria-label="Изменить другие часы">${formatTime(d.otherMinutes)}</button></div><div class="detail-row"><button class="notes-button" data-action="notes">${icon('note')}<span>${esc(d.notes || 'Добавить заметку')}</span></button></div></div>
    <div class="section-line"><h2>В этом месяце</h2><button class="text-button" data-action="nav" data-view="month">Подробнее</button></div><div class="card"><div class="detail-row"><span class="muted">${esc(monthLabel(monthKey(selectedDate)))}</span><strong class="row-value">${formatTime(total.minutes)}</strong></div>${progress(total.minutes,m?.goalMinutes ?? state.settings.monthlyGoalHours*60)}</div></section></div>
    ${draft ? `<div class="button-row save-manual"><button class="secondary" data-action="discardDraft">Отменить</button><button class="primary" data-action="saveDraft">Сохранить день</button></div>` : ''}<div class="save-state">${icon(draft || lastSaveFailed ? 'info' : 'check')}${saved}</div>${backupReminder()}`;
}
function safenum(n) { return Number.isFinite(n) ? n : 0; }
function backupReminder() {
  if (!Object.keys(state.days).length && !Object.keys(state.months).length) return '';
  const age = state.meta.lastArchiveAt ? Date.now() - Date.parse(state.meta.lastArchiveAt) : Infinity;
  return age > 7*86400000 ? `<button class="backup-link" data-action="export">Сохранить копию всей истории ${'→'}</button>` : '';
}
function renderCalendar() {
  const first = asDate(`${period}-01`); const offset = (first.getDay() - state.settings.weekStart + 7) % 7;
  const weekdays = state.settings.weekStart === 1 ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] : ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  return `${heading('Календарь','Выберите день',button('chooseMonth','Выбрать месяц','calendar'))}<div class="date-strip">${button('prevMonth','Предыдущий месяц','left')}<button data-action="chooseMonth">${esc(monthLabel(period))}</button>${button('nextMonth','Следующий месяц','right')}</div><div class="card calendar"><div class="calendar-head">${weekdays.map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-grid">${'<span></span>'.repeat(offset)}${Array.from({length:daysInMonth(period)},(_,i)=>{
    const key = `${period}-${String(i+1).padStart(2,'0')}`; const day = state.days[key]; const weekend = [0,6].includes(asDate(key).getDay());
    return `<button class="calendar-day ${weekend?'weekend':''} ${key===dateKey()?'today':''} ${key===selectedDate?'selected':''}" data-action="selectDay" data-date="${key}" aria-label="${esc(dayLabel(key))}${day?`, ${formatTime(day.minutes)}`:''}"><span>${i+1}</span>${day ? `<span class="hours">${formatTime(day.minutes)}</span>` : ''}</button>`;
  }).join('')}</div></div><button class="secondary full" data-action="today">Вернуться на сегодня</button><p class="footer-note">Выходные выделены синим · время показано в часах и минутах</p>`;
}
function renderMonth() {
  const total = summary(state,period); const m = state.months[period]; const goal = m?.goalMinutes ?? state.settings.monthlyGoalHours*60;
  const days = Object.values(state.days).filter(d=>monthKey(d.date)===period).sort((a,b)=>state.settings.sortDesc?b.date.localeCompare(a.date):a.date.localeCompare(b.date));
  const remaining = Math.max(0,goal-total.minutes);
  const remainingDays = period === monthKey(dateKey()) ? daysInMonth(period)-new Date().getDate()+1 : period > monthKey(dateKey()) ? daysInMonth(period) : 0;
  return `${heading('Месяц',m?.role ?? state.settings.role,button('report','Подготовить отчёт','share')+button('monthEdit','Параметры месяца','edit'))}<div class="date-strip">${button('prevMonth','Предыдущий месяц','left')}<button data-action="chooseMonth">${esc(monthLabel(period))}</button>${button('nextMonth','Следующий месяц','right')}</div><div class="page-grid"><section><div class="card hero"><div class="card-label">${icon('clock')}Итого за месяц ${m?.closed?'<span class="pill">Закрыт</span>':''}</div><div class="summary-time">${formatTime(total.minutes)}</div>${progress(total.minutes,goal)}${totalStrip(total)}</div>${state.settings.monthStats?`<div class="card"><div class="detail-row"><span class="muted">До цели</span><strong>${formatTime(remaining)}</strong></div><div class="detail-row"><span class="muted">Среднее за активный день</span><strong>${total.activeDays?formatTime(Math.floor(total.minutes/total.activeDays)):'—'}</strong></div><div class="detail-row"><span class="muted">Нужно в день</span><strong>${remainingDays?formatTime(Math.ceil(remaining/remainingDays)):'—'}</strong></div>${total.otherMinutes?`<div class="detail-row"><span class="muted">Другие часы отдельно</span><strong>${formatTime(total.otherMinutes)}</strong></div>`:''}</div>`:''}<div class="button-row"><button class="secondary" data-action="report">${icon('share')}Отчёт</button><button class="${m?.closed?'secondary':'text-button'}" data-action="${m?.closed?'reopenMonth':'closeMonth'}" ${period>=monthKey(dateKey())&&!m?.closed?'disabled title="Месяц ещё не завершён"':''}>${icon('lock')}${m?.closed?'Открыть месяц':'Закрыть месяц'}</button></div></section><section><div class="section-line"><h2>${m?.source==='manual'?'Исторический итог':'Записи по дням'}</h2><button class="text-button" data-action="openCalendar" aria-label="Открыть календарь">${icon('calendar')}</button></div><div class="card list-card">${m?.source==='manual'?`<div class="empty">${icon('archive')}<h3>Месяц внесён итогом</h3><p>Все показатели сохранены. Дневные записи для этого месяца не добавлялись.</p><button class="text-button" data-action="monthEdit">Изменить итог</button></div>`:days.length?days.map(d=>`<button class="day-row" data-action="selectDay" data-date="${d.date}"><span class="day-num">${Number(d.date.slice(-2))}</span><span class="grow"><span class="row-title">${esc(asDate(d.date).toLocaleDateString('ru-RU',{weekday:'long'}))}</span><span class="row-sub">${studyCount(d)} изуч. ${state.settings.legacyMetrics?`· ${d.visits} повт.`:''}${d.notes?' · заметка':''}</span></span><strong class="row-value">${formatTime(d.minutes)}</strong></button>`).join(''):`<div class="empty">${icon('calendar')}<h3>Месяц начинается с дня</h3><p>Выберите дату в календаре и добавьте первую запись.</p><button class="text-button" data-action="openCalendar">Открыть календарь</button></div>`}</div><p class="settings-caption">Изучения за месяц: уникальные люди; безымянные — максимум за один день. Закрытие месяца сохраняет всю дневную историю.</p></section></div>`;
}
function renderArchive() {
  const totals = yearSummary(state,archiveYear); const months = yearMonths(archiveYear).filter(key=>state.months[key]);
  if (state.settings.sortDesc) months.reverse();
  return `${heading('Архив','Вся история, год за годом',button('newMonth','Добавить исторический месяц','plus'))}<div class="date-strip">${button('prevYear','Предыдущий служебный год','left')}<span>${archiveYear} — ${archiveYear+1}</span>${button('nextYear','Следующий служебный год','right')}</div><div class="page-grid"><section><div class="card hero"><div class="card-label">${icon('archive')}Служебный год · сентябрь — август</div><div class="summary-time">${formatTime(totals.minutes)}</div>${progress(totals.minutes,totals.goal)}${totalStrip(totals)}</div>${state.settings.yearStats?`<div class="card"><div class="detail-row"><span class="muted">До годовой цели</span><strong>${formatTime(totals.remaining)}</strong></div><div class="detail-row"><span class="muted">Среднее за месяц</span><strong>${formatTime(totals.average)}</strong></div><div class="detail-row"><span class="muted">Нужно в оставшийся месяц</span><strong>${totals.remainingMonths?formatTime(Math.ceil(totals.remaining/totals.remainingMonths)):'—'}</strong></div></div>`:''}<button class="secondary full" data-action="export">${icon('download')}Сохранить все данные</button></section><section><div class="section-line"><h2>Месяцы</h2><small>${months.length} из 12</small></div><div class="card list-card">${months.length?months.map(key=>{const m=state.months[key];const total=summary(state,key);return `<button class="archive-row" data-action="selectMonth" data-month="${key}"><span class="grow"><span class="row-title archive-title">${esc(monthLabel(key))}${m.closed?icon('lock','lock'):''}</span><span class="row-sub">${esc(m.role)}${m.source==='manual'?' · внесён итогом':''}</span></span><strong class="row-value">${formatTime(total.minutes)}</strong>${icon('right')}</button>`;}).join(''):`<div class="empty">${icon('archive')}<h3>Ваша история впереди</h3><p>Записи появятся здесь автоматически. Прошлые месяцы можно добавить общими итогами.</p></div>`}</div></section></div>`;
}
function renderStudies() {
  const active = Object.values(state.studies).filter(s=>s.active); const list=Object.values(state.studies).filter(s=>showArchived||s.active).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  return `${heading('Изучения',`${active.length} активных`,button('addStudy','Добавить изучение','plus'))}<div class="card list-card">${list.length?list.map(s=>`<button class="person-row" data-action="editStudy" data-id="${esc(s.id)}"><span class="person-avatar">${esc([...s.name][0].toUpperCase())}</span><span class="grow"><span class="row-title">${esc(s.name)}</span><span class="row-sub">${s.active?'Активное изучение':'В архиве'}${s.notes?' · есть заметка':''}</span></span>${icon('right')}</button>`).join(''):`<div class="empty">${icon('studies')}<h3>Каждому — своё время</h3><p>Добавьте человека, чтобы отмечать изучения в дневных записях.</p><button class="text-button" data-action="addStudy">Добавить изучение</button></div>`}</div><button class="text-button" data-action="toggleArchived">${showArchived?'Скрыть архивные':'Показать архивные'}</button><p class="settings-caption">Имена и заметки сохраняются только на этом устройстве. Архивирование человека сохраняет его участие в прошлых днях.</p>`;
}
function toggle(label,key,sub='') { return `<label class="check-row"><span>${label}${sub?`<small>${sub}</small>`:''}</span><input type="checkbox" data-setting="${key}" ${state.settings[key]?'checked':''}></label>`; }
function selectSetting(label,key,options) { return `<label class="setting-row"><span>${label}</span><select data-setting="${key}">${options.map(([value,text])=>`<option value="${esc(value)}" ${String(state.settings[key])===String(value)?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`; }
function renderSettings() {
  const m = state.meta.lastArchiveAt; const archiveText = m ? new Date(m).toLocaleString('ru-RU') : 'Ещё не готовили';
  return `${heading('Настройки','Удобно именно вам',button('help','Справка','info'))}<div class="section-line"><h2>Данные и перенос</h2>${icon('shield')}</div><div class="card"><div class="detail-row"><span class="detail-label">База на устройстве</span><strong>${dayCount(Object.keys(state.days).length)}</strong></div><div class="detail-row"><span class="muted">Последний архив подготовлен</span><small>${esc(archiveText)}</small></div><div class="button-row"><button class="primary" data-action="export">${icon('download')}Сохранить всё</button><button class="secondary" data-action="import">${icon('upload')}Восстановить</button></div><button class="backup-link" data-action="recovery">Предыдущая база после восстановления</button></div><p class="settings-caption">Архив содержит все годы, изучения и настройки. Сохраните файл в «Файлы» / iCloud Drive или на компьютер. Автосохранение на телефоне не создаёт внешнюю копию.</p><div class="card settings-group"><div class="detail-row"><span class="detail-label">Работа без интернета</span><small>${offlineReady?'Файлы готовы':'Подготовка файлов…'}</small></div><div class="detail-row"><span class="detail-label">Хранение WebKit</span><small>${storage.persistent?'Постоянное разрешено':'Обычный режим'}</small></div><button class="backup-link" data-action="persistence">Запросить постоянное хранение</button></div>
    <div class="section-line"><h2>Оформление</h2></div><div class="card settings-group">${selectSetting('Тема','theme',[['dark','Тёмная'],['light','Светлая'],['midnight','Ночная']])}${toggle('Левша','leftHand')}${toggle('Объёмные кнопки','threeD')}${toggle('Разделительные линии','dividers')}${toggle('Большая кнопка секундомера','bigTimer')}${toggle('Публикации, видео, повторные','legacyMetrics','Скрытие счётчиков сохраняет все записи.')}</div>
    <div class="section-line"><h2>Ввод и календарь</h2></div><div class="card settings-group">${selectSetting('Начало недели','weekStart',[[1,'Понедельник'],[0,'Воскресенье']])}${selectSetting('Шаг времени','step',[1,2,5,10,15,20,30].map(n=>[n,`${n} мин`]))}${toggle('Быстрый калькулятор','quickInput','Кнопки открывают ввод с операцией прибавления или вычитания.')}${toggle('Автосохранение дня','autosave')}${toggle('Новые записи сверху','sortDesc')}${toggle('Защитить прошлые месяцы','protected')}${selectSetting('Предел секундомера','timerCapHours',[1,2,4,8,12,15,24,48,72].map(n=>[n,`${n} ч`]))}</div>
    <div class="section-line"><h2>Цели и отчёт</h2></div><div class="card settings-group">${selectSetting('Назначение для новых месяцев','role',[...new Set([...ROLES,state.settings.role])].map(n=>[n,n]))}<label class="setting-row"><span>Месячная цель, часы</span><input type="number" min="0" max="100000" data-setting="monthlyGoalHours" value="${state.settings.monthlyGoalHours}" aria-label="Месячная цель, часы"></label><label class="setting-row"><span>Годовая цель, часы</span><input type="number" min="0" max="100000" data-setting="annualGoalHours" value="${state.settings.annualGoalHours}" aria-label="Годовая цель, часы"></label>${toggle('Статистика месяца','monthStats')}${toggle('Статистика года','yearStats')}${toggle('Отчёт без минут','wholeHours','Только текст отчёта: минуты отбрасываются, в базе остаются.')}</div><p class="settings-caption">Общие цели и назначение применяются к новым периодам. Параметры уже начатого месяца меняются в разделе «Месяц» через значок карандаша. Другие часы учитываются отдельно.</p><button class="secondary full" data-action="help">${icon('info')}Установка и помощь</button><div class="version">Мой отчёт · ${VERSION}<br>Без аккаунта · без передачи ваших записей</div>`;
}

function showAmount(fieldName, operation='set') {
  canEdit(state,selectedDate); const timed=['minutes','otherMinutes'].includes(fieldName);
  const names={minutes:'Время в служении',otherMinutes:'Другие часы',publications:'Публикации',videos:'Видео',visits:'Повторные посещения'};
  const value=operation==='set'?currentDay()[fieldName]:0;
  showDialog(names[fieldName],`<form data-form="amount" data-field="${fieldName}"><label class="field"><span>Действие</span><select name="operation"><option value="set" ${operation==='set'?'selected':''}>Заменить значение</option><option value="add" ${operation==='add'?'selected':''}>Прибавить</option><option value="subtract" ${operation==='subtract'?'selected':''}>Вычесть</option></select></label>${field(timed?'Часы:минуты или количество минут':'Количество','value',timed?formatTime(value):value,'text',`inputmode="${timed?'text':'numeric'}" required maxlength="12"`)}<p class="dialog-copy">${timed?'Например: 2:30 — два часа тридцать минут. Другие часы хранятся отдельно.':'Количество сохраняется целым числом.'}</p>${footerSave()}</form>`);
}
function showDateChooser() { showDialog('Выберите день',`<form data-form="date">${field('Дата','date',selectedDate,'date','min="1900-01-01" max="2200-12-31" required')}${footerSave('Открыть')}</form>`); }
function showMonthChooser() { showDialog('Выберите месяц',`<form data-form="period">${field('Месяц','period',period,'month','min="1900-01" max="2200-12" required')}${footerSave('Открыть')}</form>`); }
function showDayStudies() {
  canEdit(state,selectedDate); const d=currentDay(); const list=Object.values(state.studies).filter(s=>s.active||d.studyIds.includes(s.id));
  showDialog('Изучения за день',`<form data-form="day-studies">${list.length?list.map(s=>`<label class="check-row"><span>${esc(s.name)}${s.active?'':' <small>В архиве</small>'}</span><input type="checkbox" name="study" value="${esc(s.id)}" ${d.studyIds.includes(s.id)?'checked':''}></label>`).join(''):'<p class="dialog-copy">Список пока пуст. Имена можно добавить в разделе «Изучения», либо указать количество без имён.</p>'}${field('Дополнительно без имён','manual',d.manualStudies,'number','min="0" max="1000000" required')}${footerSave()}</form>`);
}
function showStudy(id) {
  const study=state.studies[id]??{name:'',notes:'',active:true};
  showDialog(id?'Изменить изучение':'Новое изучение',`<form data-form="study" data-id="${esc(id??'')}">${field('Имя или условное обозначение','name',study.name,'text','maxlength="200" required autocomplete="off"')}<label class="field"><span>Заметка</span><textarea name="notes" maxlength="10000">${esc(study.notes)}</textarea></label><label class="check-row"><span>Активное изучение<small>Выключение сохранит все прошлые записи.</small></span><input name="active" type="checkbox" ${study.active?'checked':''}></label>${footerSave()}</form>`);
}
function showMonthForm(isNew=false) {
  const key=isNew?shiftMonth(monthKey(),-1):period; const m=isNew?null:state.months[key];
  if(m?.closed) throw new Error('Сначала откройте месяц для редактирования.');
  const hasDays=Object.keys(state.days).some(date=>monthKey(date)===key);
  const manual=isNew||m?.source==='manual'; const total=summary(state,key);
  showDialog(isNew?'Добавить прошлый месяц':'Параметры месяца',`<form data-form="month" data-new="${isNew}" data-manual="${manual}">${field('Месяц','key',key,'month',`${isNew?'':'readonly'} min="1900-01" max="2200-12" required`)}${field('Назначение в этом месяце','role',m?.role??state.settings.role,'text','maxlength="200" required')}<div class="two-col">${field('Цель месяца, часов','goal',Math.floor((m?.goalMinutes??state.settings.monthlyGoalHours*60)/60),'number','min="0" max="100000" required')}${field('Цель служебного года, часов','yearGoal',Math.floor((state.years[serviceYear(key)]?.goalMinutes??state.settings.annualGoalHours*60)/60),'number','min="0" max="100000" required')}</div>${manual?`<p class="dialog-copy">Общий итог без записей по дням. Такой месяц учитывается в архиве один раз.</p><div class="two-col">${field('Часы:минуты','minutes',isNew?'0:00':formatTime(total.minutes),'text','required')}${field('Изучения','studies',isNew?0:total.studies,'number','min="0" required')}${field('Публикации','publications',isNew?0:total.publications,'number','min="0" required')}${field('Видео','videos',isNew?0:total.videos,'number','min="0" required')}${field('Повторные посещения','visits',isNew?0:total.visits,'number','min="0" required')}${field('Другие часы','otherMinutes',isNew?'0:00':formatTime(total.otherMinutes),'text','required')}</div>`:`<p class="dialog-copy">${hasDays?'Итог рассчитывается из сохранённых дней.':'Показатели будут рассчитываться по дням.'} Изменение назначения сохраняется только в этом месяце.</p>`}${footerSave()}</form>`);
}
function showTimer() {
  const t=state.timer;
  showDialog('Секундомер',`<p class="dialog-copy">${t?`Запись за ${esc(dayLabel(t.date))}.`:'После остановки время можно добавить в выбранный день.'}</p><div class="timer-display" id="timer-display">${secondsLabel(timerSeconds(t))}</div><p class="dialog-copy" id="timer-status">${timerStatus()}</p><div class="button-row">${!t?'<button class="primary" data-action="timerStart">Начать</button>':`<button class="secondary" data-action="timerPause">${t.running?'Пауза':'Продолжить'}</button><button class="primary" data-action="timerApply">Добавить время</button>`}</div>${t?'<div class="button-row"><button class="text-button" data-action="timerDiscard">Сбросить секундомер</button></div>':''}<p class="settings-caption">Время относится к дате начала. При добавлении неполная минута отбрасывается. Предел одного измерения — ${state.settings.timerCapHours} ч.</p>`);
}
function secondsLabel(seconds) { return `${formatTime(Math.floor(seconds/60))}:${String(seconds%60).padStart(2,'0')}`; }
function timerStatus() { const t=state.timer; if(!t) return 'Готов к началу'; if(timerSeconds(t)>=t.capSeconds) return 'Достигнут предел автоостановки'; return t.running?'Идёт измерение · можно блокировать экран':'На паузе'; }
function tick() { const display=document.querySelector('#timer-display'); if(display) display.textContent=secondsLabel(timerSeconds(state?.timer)); const status=document.querySelector('#timer-status'); if(status&&state)status.textContent=timerStatus(); const pill=document.querySelector('#timer-pill'); if(pill&&state?.timer) pill.textContent=`Секундомер · ${formatTime(Math.floor(timerSeconds(state.timer)/60))}`; }
function showReport() { showDialog('Отчёт за месяц',`<label class="field"><span>${esc(monthLabel(period))}</span><textarea id="report-text" readonly rows="8">${esc(reportText(state,period))}</textarea></label><div class="button-row"><button class="secondary" data-action="copyReport">Копировать</button><button class="primary" data-action="shareReport">${icon('share')}Поделиться</button></div><p class="settings-caption">Отправка выполняется только по вашему действию через системное меню.</p>`); }
function showHelp() {
  showDialog('Как всё устроено',`<h3>Установка на iPhone</h3><p class="dialog-copy">Откройте ссылку в Safari → «Поделиться» → «На экран Домой». Оставьте включённым открытие как веб-приложения. Запускайте через новую иконку. Дождитесь статуса «Файлы готовы» в настройках.</p><br><h3>Где лежат данные</h3><p class="dialog-copy">В IndexedDB на этом устройстве. Сайт выдаёт программу, но не получает ваши записи. Другой посетитель начинает со своей пустой базы. Данные не синхронизируются между устройствами автоматически.</p><br><h3>Как перенести историю</h3><p class="dialog-copy">«Настройки» → «Сохранить всё» → сохраните JSON-файл в «Файлы» / iCloud Drive или на компьютер. На новом телефоне установите приложение и выберите «Восстановить». Вернутся все данные из выбранного архива. Если телефон потерян, поможет только ранее сохранённый внешний файл.</p><br><h3>Секундомер и календарь</h3><p class="dialog-copy">Секундомер восстанавливает время по моменту начала, даже после блокировки. Время добавляется к дате начала только один раз. Месяцы сохраняют дневную историю после закрытия. Служебный год начинается в сентябре.</p><br><h3>Обновления и хранение</h3><p class="dialog-copy">Обновляйте по кнопке в приложении. Рабочая база сохраняется. iOS может очищать веб-хранилища; запрос постоянного хранения не заменяет внешнего архива. При изменении адреса сайта переносите данные через файл.</p><div class="button-row"><button class="primary" data-action="closeDialog">Понятно</button></div>`);
}

async function prepareBackup() {
  if(!canNavigate())return;
  const timestamp=new Date().toISOString();const copy=structuredClone(state);copy.meta.lastArchiveAt=timestamp;
  const text=await createBackup(copy);
  if(fileURL)URL.revokeObjectURL(fileURL);
  pendingFile=new File([text],`my-report-backup-${dateKey()}-${timestamp.slice(11,19).replaceAll(':','')}.json`,{type:'application/json'});
  fileURL=URL.createObjectURL(pendingFile);
  await commit(s=>{s.meta.lastArchiveAt=timestamp;});
  showDialog('Архив подготовлен',`<p class="dialog-copy">Вся история, изучения и настройки — в одном файле. Теперь сохраните его вне приложения.</p><div class="backup-result"><strong>${dayCount(Object.keys(state.days).length)} · ${monthCount(Object.keys(state.months).length)}</strong><p class="settings-caption">${esc(pendingFile.name)}</p><a class="primary full" href="${fileURL}" download="${esc(pendingFile.name)}">${icon('download')}Скачать архив</a>${navigator.canShare?.({files:[pendingFile]})?'<button class="secondary full" data-action="shareFile">Сохранить через меню «Поделиться»</button>':''}</div><p class="settings-caption">В iPhone через «Поделиться» выберите «Сохранить в Файлы». Дата подготовки архива не подтверждает, что файл уже сохранён в iCloud.</p>`);
}
async function confirmImport(file) {
  if(file.size>20*1024*1024)throw new Error('Архив больше 20 МБ.');
  pendingImport=await readBackup(await file.text());
  const s=pendingImport.state;const dates=Object.keys(s.days).sort();
  showDialog('Восстановить всю историю?',`<p class="dialog-copy">Архив заменит текущую базу. Предыдущая база останется восстановительной копией на этом устройстве.</p><div class="card"><p>${dayCount(Object.keys(s.days).length)} · ${monthCount(Object.keys(s.months).length)}</p><p>${Object.keys(s.studies).length} изучений</p>${dates.length?`<p class="settings-caption">${esc(dates[0])} — ${esc(dates.at(-1))}</p>`:''}</div><div class="button-row"><button class="secondary" data-action="closeDialog">Отмена</button><button class="primary" data-action="restoreConfirm">Восстановить</button></div>`);
}

const actions={
  closeDialog, nav: el=>navigate(el.dataset.view),
  today:()=>{if(!canNavigate())return;selectedDate=dateKey();period=monthKey();view='day';render();},
  prevDay:()=>moveDay(-1),nextDay:()=>moveDay(1),
  prevMonth:()=>moveMonth(-1),nextMonth:()=>moveMonth(1),
  prevYear:()=>{if(archiveYear<=1900)return;archiveYear--;render();},nextYear:()=>{if(archiveYear>=2199)return;archiveYear++;render();},
  chooseDate:showDateChooser, chooseMonth:showMonthChooser,
  openCalendar:()=>{if(!canNavigate())return;if(view==='day')period=monthKey(selectedDate);view='calendar';render();},
  selectDay:el=>{if(!canNavigate())return;selectedDate=el.dataset.date;period=monthKey(selectedDate);view='day';render();window.scrollTo({top:0});},
  selectMonth:el=>{period=el.dataset.month;view='month';render();window.scrollTo({top:0});},
  amount:el=>showAmount(el.dataset.field),
  bump:async el=>{const field=el.dataset.field;const dir=Number(el.dataset.dir);if(state.settings.quickInput){showAmount(field,dir>0?'add':'subtract');return;}await editDay(d=>{d[field]=Math.max(0,d[field]+dir*(field==='minutes'?state.settings.step:1));});},
  saveDraft:async()=>{if(!draft)return;const value=structuredClone(draft);await commit(s=>{changeDay(s,value.date,d=>Object.assign(d,value));});draft=null;render();toast('День сохранён');},
  discardDraft:()=>{draft=null;render();},
  notes:()=>{canEdit(state,selectedDate);showDialog('Заметка за день',`<form data-form="notes"><label class="field"><span>Заметка</span><textarea name="notes" maxlength="10000" rows="5">${esc(currentDay().notes)}</textarea></label>${footerSave()}</form>`);},
  dayStudies:showDayStudies,addStudy:()=>showStudy(),editStudy:el=>showStudy(el.dataset.id),toggleArchived:()=>{showArchived=!showArchived;render();},
  monthEdit:()=>showMonthForm(),newMonth:()=>showMonthForm(true),
  closeMonth:()=>{showDialog('Закрыть месяц?',`<p class="dialog-copy">${esc(monthLabel(period))}: ${formatTime(summary(state,period).minutes)}. Все записи по дням останутся в истории. Для изменения месяц можно будет открыть снова.</p><div class="button-row"><button class="secondary" data-action="closeDialog">Отмена</button><button class="primary" data-action="confirmCloseMonth">Закрыть месяц</button></div>`);},
  confirmCloseMonth:async()=>{await commit(s=>closeMonth(s,period));closeDialog();toast('Месяц закрыт. Дневная история сохранена.');},
  reopenMonth:()=>showDialog('Открыть месяц?',`<p class="dialog-copy">Данные ${esc(monthLabel(period))} снова станут доступны для редактирования. Все записи сохранятся.</p><div class="button-row"><button class="secondary" data-action="closeDialog">Отмена</button><button class="primary" data-action="confirmReopenMonth">Открыть</button></div>`),
  confirmReopenMonth:async()=>{await commit(s=>{const m=ensureMonth(s,period);m.closed=false;m.closedTotal=null;});closeDialog();},
  timer:showTimer,
  timerStart:async()=>{if(!canNavigate())return;await commit(s=>{canEdit(s,selectedDate);if(s.timer)throw new Error('Секундомер уже запущен.');s.timer={id:crypto.randomUUID(),date:selectedDate,running:true,startedAt:Date.now(),accumulatedSeconds:0,capSeconds:s.settings.timerCapHours*3600};});showTimer();},
  timerPause:async()=>{await commit(s=>{const t=s.timer;if(!t)return;const elapsed=timerSeconds(t);t.accumulatedSeconds=elapsed;t.startedAt=Date.now();t.running=elapsed<t.capSeconds?!t.running:false;});showTimer();},
  timerApply:async()=>{if(!canNavigate())return;const id=state.timer?.id;if(!id)return;await commit(s=>{applyTimer(s,id);});closeDialog();toast('Время секундомера добавлено в день начала');},
  timerDiscard:()=>showDialog('Сбросить измерение?',`<p class="dialog-copy">Измеренное время не будет добавлено в день. Уже сохранённые дневные записи останутся.</p><div class="button-row"><button class="secondary" data-action="timer">Вернуться</button><button class="danger" data-action="confirmTimerDiscard">Сбросить</button></div>`),
  confirmTimerDiscard:async()=>{await commit(s=>{s.timer=null;});showTimer();},
  report:showReport,
  copyReport:async()=>{await navigator.clipboard.writeText(reportText(state,period));toast('Отчёт скопирован');},
  shareReport:async()=>{if(navigator.share)await navigator.share({title:`Отчёт — ${monthLabel(period)}`,text:reportText(state,period)});else{await navigator.clipboard.writeText(reportText(state,period));toast('Отчёт скопирован');}},
  export:prepareBackup,import:()=>{if(!canNavigate())return;document.querySelector('#import-file').click();},
  shareFile:async()=>{if(pendingFile)await navigator.share({files:[pendingFile]});},
  restoreConfirm:async()=>{if(!pendingImport)return;const restored=structuredClone(pendingImport.state);await commit(()=>restored,{recovery:true});pendingImport=null;draft=null;closeDialog();view='day';selectedDate=dateKey();render();toast('Вся история восстановлена');},
  recovery:async()=>{const previous=await loadState('recovery');if(!previous){toast('Восстановления ещё не было. Предыдущей базы нет.');return;}pendingImport={state:previous};showDialog('Вернуть предыдущую базу?',`<p class="dialog-copy">${dayCount(Object.keys(previous.days).length)}, ${monthCount(Object.keys(previous.months).length)}. Текущая база станет восстановительной копией.</p><div class="button-row"><button class="secondary" data-action="closeDialog">Отмена</button><button class="primary" data-action="restoreConfirm">Вернуть базу</button></div>`);},
  persistence:async()=>{const allowed=await requestPersistence();storage=await storageStatus();render();toast(allowed?'Постоянное хранение разрешено':'iOS не предоставила постоянный режим. Сохраняйте внешний архив.');},
  help:showHelp,
  updateApp:()=>{if(!canNavigate()||savePending){toast('Дождитесь сохранения изменений.');return;}updating=true;waitingWorker?.postMessage({type:'SKIP_WAITING'});},
};
function moveDay(delta) {if(!canNavigate())return;const d=asDate(selectedDate);d.setDate(d.getDate()+delta);const next=dateKey(d);if(!validDate(next))return;selectedDate=next;period=monthKey(next);render();}
function moveMonth(delta) {const next=shiftMonth(period,delta);if(!validDate(`${next}-01`))return;period=next;render();}

document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
  const handler=actions[el.dataset.action];if(!handler)return;
  event.preventDefault();
  try{await handler(el);}catch(error){if(error.name!=='AbortError')errorMessage(error);}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.dataset.form)return;event.preventDefault();const fd=new FormData(form);
  try{
    switch(form.dataset.form){
      case 'amount':{const name=form.dataset.field;if(!METRICS.includes(name))throw new Error('Неизвестный показатель.');const value=['minutes','otherMinutes'].includes(name)?parseTime(fd.get('value')):integer(fd.get('value'));const op=fd.get('operation');await editDay(d=>{d[name]=op==='add'?d[name]+value:op==='subtract'?Math.max(0,d[name]-value):value;});break;}
      case 'date':{if(!canNavigate())return;const key=fd.get('date');if(!validDate(key))throw new Error('Выберите дату.');selectedDate=key;period=monthKey(key);view='day';render();break;}
      case 'period':{const key=fd.get('period');if(!validDate(`${key}-01`))throw new Error('Выберите месяц.');period=key;render();break;}
      case 'notes':{const value=String(fd.get('notes')).trim();await editDay(d=>{d.notes=value;});break;}
      case 'day-studies':{const ids=fd.getAll('study');const manual=integer(fd.get('manual'));await editDay(d=>{d.studyIds=ids;d.manualStudies=manual;});break;}
      case 'study':{const id=form.dataset.id||crypto.randomUUID();const name=String(fd.get('name')).trim();if(!name)throw new Error('Укажите имя или условное обозначение.');await commit(s=>{s.studies[id]={id,name,notes:String(fd.get('notes')).trim(),active:fd.has('active')};});break;}
      case 'month':{const key=String(fd.get('key'));const isNew=form.dataset.new==='true';const isManual=form.dataset.manual==='true';const role=String(fd.get('role')).trim();if(!role)throw new Error('Укажите назначение.');const goal=integer(fd.get('goal'),100000)*60;const yearGoal=integer(fd.get('yearGoal'),100000)*60;let manual=null;if(isManual){manual={};for(const name of [...METRICS,'studies'])manual[name]=['minutes','otherMinutes'].includes(name)?parseTime(fd.get(name)):integer(fd.get(name));}
        await commit(s=>{if(isNew&&s.months[key])throw new Error('Этот месяц уже есть в архиве. Откройте его для изменения.');if(s.months[key]?.closed)throw new Error('Месяц закрыт.');if(isManual&&Object.keys(s.days).some(date=>monthKey(date)===key))throw new Error('В месяце уже есть дневные записи.');const m=ensureMonth(s,key);m.role=role;m.goalMinutes=goal;if(isManual){m.source='manual';m.manual=manual;}s.years[serviceYear(key)]={goalMinutes:yearGoal};});period=key;archiveYear=serviceYear(key);view='month';render();break;}
    }
    closeDialog();
  }catch(error){errorMessage(error);}
});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.id==='import-file'){
    const file=el.files?.[0];el.value='';if(!file)return;try{await confirmImport(file);}catch(error){errorMessage(error);}return;
  }
  const key=el.dataset.setting;if(!key||!Object.hasOwn(DEFAULT_SETTINGS,key))return;
  const type=typeof DEFAULT_SETTINGS[key];let value;
  try{value=type==='boolean'?el.checked:type==='number'?integer(el.value,100000):el.value;await commit(s=>{s.settings[key]=value;});}catch(error){errorMessage(error);}
});
window.addEventListener('beforeunload',event=>{if(draft||savePending){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&state&&!draft){try{state=await loadState();render();tick();}catch(error){errorMessage(error);}}});
window.addEventListener('pageshow',async event=>{if(event.persisted&&state&&!draft){state=await loadState();render();}});

async function prepareOffline() {
  if(!('serviceWorker' in navigator))return;
  try{
    const registration=await navigator.serviceWorker.register(new URL('./sw.js',import.meta.url),{scope:'./',updateViaCache:'none'});
    const found=()=>{if(registration.waiting&&navigator.serviceWorker.controller){waitingWorker=registration.waiting;render();}};
    found();registration.addEventListener('updatefound',()=>{registration.installing?.addEventListener('statechange',found);});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updating)location.reload();});
    await navigator.serviceWorker.ready;offlineReady=true;render();
  }catch{toast('Офлайн-файлы пока не загружены. Проверьте соединение.');}
}
try{
  state=await openStore(async reason=>{if(reason==='versionchange'){toast('База обновилась. Перезапустите приложение.');return;}if(!draft){try{state=await loadState();render();}catch(error){errorMessage(error);}}});
  storage=await storageStatus();render();setInterval(tick,1000);prepareOffline();
}catch(error){root.setAttribute('aria-busy','false');root.innerHTML=`<main class="shell"><h1>База недоступна</h1><p class="inline-error">${esc(error.message)}</p><p>Откройте приложение в обычном режиме Safari и проверьте доступное место. Если есть архив, сохраните его до очистки данных браузера.</p></main>`;}
