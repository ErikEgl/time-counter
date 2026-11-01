import {SCHEMA, validateState} from './core.mjs';
export const BACKUP_FORMAT = 'time-counter-backup';
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
export async function createBackup(state) {
  validateState(state); const payload = structuredClone(state);
  return JSON.stringify({format: BACKUP_FORMAT, version: SCHEMA, createdAt: new Date().toISOString(), checksum: await hash(payload), payload}, null, 2);
}
export async function readBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 20 * 1024 * 1024) throw new Error('Размер архива превышает 20 МБ.');
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error('Не удалось прочитать JSON-архив.'); }
  if (!envelope || envelope.format !== BACKUP_FORMAT) throw new Error('Это не архив приложения «Мой отчёт».');
  if (envelope.version !== SCHEMA) throw new Error('Версия архива пока не поддерживается. Сначала обновите приложение.');
  if (typeof envelope.checksum !== 'string' || envelope.checksum !== await hash(envelope.payload)) throw new Error('Контрольная сумма не совпадает: архив изменён или повреждён.');
  validateState(envelope.payload);
  return {state: envelope.payload, createdAt: envelope.createdAt};
}
