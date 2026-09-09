const DB_NAME = 'document-builder-assets';
const DB_VERSION = 1;
const STORE_NAME = 'images';

export const IMAGE_ASSET_EVENT = 'document-builder:image-assets-changed';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open image asset database.'));
  });
}

export async function saveImageAsset(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const id = crypto.randomUUID();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to save image asset.'));
    tx.onabort = () => reject(tx.error ?? new Error('Image asset save was aborted.'));
  });
  db.close();
  window.dispatchEvent(new Event(IMAGE_ASSET_EVENT));
  return id;
}

export async function loadImageAsset(id: string): Promise<Blob | null> {
  if (!id) return null;
  const db = await openDb();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error('Unable to read image asset.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteImageAsset(id: string): Promise<void> {
  if (!id) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to delete image asset.'));
  });
  db.close();
  window.dispatchEvent(new Event(IMAGE_ASSET_EVENT));
}
