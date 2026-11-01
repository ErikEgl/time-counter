import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newState,changeDay,ensureMonth,summary,yearSummary,serviceYear,yearMonths,dateKey,asDate,shiftMonth,daysInMonth,validDate,formatTime,parseTime,validateState,timerSeconds,applyTimer,closeMonth,reportText} from '../app/core.mjs';
import {createBackup,readBackup} from '../app/backup.mjs';

test('Время складывается минутами, не десятичными часами',()=>{
  assert.equal(parseTime('2:30'),150);assert.equal(formatTime(parseTime('0:59')+parseTime('0:02')),'1:01');
  for(const bad of ['1:60','-1','1.5','xx','1:2'])assert.throws(()=>parseTime(bad));
});
test('Календарные даты и границы служебного года',()=>{
  assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2025-02-29'),false);
  assert.equal(dateKey(asDate('2024-03-01')),'2024-03-01');assert.equal(daysInMonth('2024-02'),29);
  assert.equal(shiftMonth('2024-12',1),'2025-01');assert.equal(serviceYear('2025-08'),2024);assert.equal(serviceYear('2025-09'),2025);
  assert.equal(yearMonths(2024)[11],'2025-08');
});
test('Месяц складывает дни, изучения считает уникально',()=>{
  const s=newState();s.studies.a={id:'a',name:'Пример А',notes:'',active:true};s.studies.b={id:'b',name:'Пример Б',notes:'',active:true};
  changeDay(s,'2024-01-03',d=>Object.assign(d,{minutes:59,studyIds:['a'],manualStudies:1}));
  changeDay(s,'2024-01-04',d=>Object.assign(d,{minutes:62,studyIds:['a','b'],manualStudies:2}));
  const sum=summary(s,'2024-01');assert.equal(sum.minutes,121);assert.equal(sum.studies,4);assert.equal(sum.activeDays,2);
  s.studies.a.active=false;assert.equal(summary(s,'2024-01').studies,4);validateState(s);
});
test('Закрытие не удаляет детализацию, повторное открытие разрешает правку',()=>{
  const s=newState();changeDay(s,'2024-01-03',d=>{d.minutes=150;});closeMonth(s,'2024-01','2024-02-01');
  assert.equal(s.days['2024-01-03'].minutes,150);assert.equal(s.months['2024-01'].closedTotal.minutes,150);
  assert.throws(()=>changeDay(s,'2024-01-03',d=>{d.minutes=90;}));
  s.months['2024-01'].closed=false;changeDay(s,'2024-01-03',d=>{d.minutes=90;});assert.equal(summary(s,'2024-01').minutes,90);
  assert.throws(()=>closeMonth(s,'2024-02','2024-02-01'));
});
test('Ручной месяц учитывается один раз и не принимает дневные записи',()=>{
  const s=newState();const month=ensureMonth(s,'2024-01');month.source='manual';month.manual={publications:1,videos:2,minutes:400,visits:3,otherMinutes:20,studies:2};
  assert.equal(yearSummary(s,2023,'2024-09-01').minutes,400);assert.throws(()=>changeDay(s,'2024-01-03',()=>{}));validateState(s);
});
test('Исторические цели и назначение не переписываются общими настройками',()=>{
  const s=newState();ensureMonth(s,'2024-01');s.settings.role='Другое';s.settings.monthlyGoalHours=10;ensureMonth(s,'2024-02');
  assert.equal(s.months['2024-01'].goalMinutes,4200);assert.equal(s.months['2024-01'].role,'Общий пионер');assert.equal(s.months['2024-02'].goalMinutes,600);
});
test('Пауза, восстановление, предел секундомера и однократное применение',()=>{
  const s=newState();s.timer={id:'one',date:'2024-01-03',running:true,startedAt:100000,accumulatedSeconds:61,capSeconds:3600};
  assert.equal(timerSeconds(s.timer,160000),121);assert.equal(timerSeconds(s.timer,99999999),3600);assert.equal(timerSeconds(s.timer,1),61);
  s.timer.running=false;assert.equal(timerSeconds(s.timer,99999999),61);s.timer.running=true;
  assert.equal(applyTimer(s,'one',160000),true);assert.equal(s.days['2024-01-03'].minutes,2);assert.equal(applyTimer(s,'one',160000),false);assert.equal(s.days['2024-01-03'].minutes,2);
});
test('Отчёт без минут сохраняет точные минуты в базе',()=>{
  const s=newState();changeDay(s,'2024-01-03',d=>{d.minutes=150;});s.settings.wholeHours=true;
  assert.match(reportText(s,'2024-01'),/Часы: 2\n/);assert.equal(s.days['2024-01-03'].minutes,150);
});
test('Многолетний архив восстанавливает все сущности и повторно не дублирует записи',async()=>{
  const s=newState();s.studies.example={id:'example',name:'Тестовое изучение',notes:'Вымышленная запись',active:false};
  for(let y=2015;y<=2025;y++)for(let m=1;m<=12;m++)changeDay(s,`${y}-${String(m).padStart(2,'0')}-05`,d=>{d.minutes=y%120+35;d.studyIds=['example'];d.notes='Тест';});
  s.settings.theme='light';s.timer={id:'test-timer',date:'2025-12-05',running:false,startedAt:100000,accumulatedSeconds:123,capSeconds:3600};
  const file=await createBackup(s);const restored=(await readBackup(file)).state;assert.deepEqual(restored,s);assert.equal(Object.keys(restored.days).length,132);
  assert.deepEqual((await readBackup(await createBackup(restored))).state,s);
});
test('Повреждённый архив и неподдерживаемая версия отклоняются',async()=>{
  const s=newState();const original=await createBackup(s);const bad=JSON.parse(original);bad.payload.settings.theme='light';
  await assert.rejects(()=>readBackup(JSON.stringify(bad)),/Контрольная сумма/);bad.version=999;await assert.rejects(()=>readBackup(JSON.stringify(bad)),/Версия архива/);
  await assert.rejects(()=>readBackup('not json'),/JSON/);await assert.rejects(()=>readBackup('{}'),/не архив/);
});
test('Сломанные связи и недопустимые значения не проходят проверку',()=>{
  const s=newState();changeDay(s,'2024-01-03',d=>{d.studyIds=['missing'];});assert.throws(()=>validateState(s),/связи/);
  s.days['2024-01-03'].studyIds=[];s.days['2024-01-03'].minutes=-1;assert.throws(()=>validateState(s),/показатель/);
});
