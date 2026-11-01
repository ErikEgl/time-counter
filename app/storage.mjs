import {newState, validateState} from './core.mjs';
const DB_NAME = 'my-service-report';
let db; let channel;
export async function openStore(onExternalChange) {
  db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Закройте другие вкладки приложения для обновления базы.'));
    request.onsuccess = () => resolve(request.result);
  });
  db.onversionchange = () => { db.close(); onExternalChange?.('versionchange'); };
  if ('BroadcastChannel' in globalThis) { channel = new BroadcastChannel('my-service-report'); channel.onmessage = () => onExternalChange?.('change'); }
  const state = await loadState();
  if (!state) return updateState(() => newState());
  return validateState(state);
}
export function loadState(key = 'current') {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly'); let value;
    const request = tx.objectStore('documents').get(key);
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(tx.error || new Error('Не удалось прочитать базу.'));
  });
}
export function updateState(mutator, {recovery = false} = {}) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite'); const store = tx.objectStore('documents'); let result; let failure;
    const request = store.get('current');
    request.onsuccess = () => {
      try {
        const original = request.result ?? newState();
        const draft = structuredClone(original);
        result = mutator(draft) ?? draft;
        result.revision = original.revision + 1; result.updatedAt = new Date().toISOString();
        validateState(result);
        if (recovery && request.result) store.put(original, 'recovery');
        store.put(result, 'current');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { channel?.postMessage('changed'); resolve(result); };
    tx.onabort = () => reject(failure || tx.error || new Error('Изменения не сохранены. Проверьте свободное место на телефоне.'));
  });
}
export async function storageStatus() {
  const persistent = await navigator.storage?.persisted?.().catch(() => false) ?? false;
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  return {persistent, usage: estimate?.usage ?? 0};
}
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
