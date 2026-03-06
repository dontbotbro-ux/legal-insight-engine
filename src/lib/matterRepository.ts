export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MatterSummary = {
  id: string;
  fileName: string;
  fileSize: number;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
};

type MatterRecord = MatterSummary & {
  userId: string;
  pdfBlob: Blob;
  messages: StoredChatMessage[];
};

const DB_NAME = "lawyerbot-repository";
const DB_VERSION = 2;
const STORE = "matters";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("userId", "userId", { unique: false });
      } else {
        const tx = req.transaction;
        if (!tx) return;
        const store = tx.objectStore(STORE);
        if (!store.indexNames.contains("userId")) {
          store.createIndex("userId", "userId", { unique: false });
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open local repository"));
  });

const readAllRecords = async (): Promise<MatterRecord[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();

    req.onsuccess = () => resolve((req.result as MatterRecord[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("Failed to read matters"));
    tx.oncomplete = () => db.close();
  });
};

export const listMatters = async (userId: string): Promise<MatterSummary[]> => {
  const records = await readAllRecords();
  return records
    .filter((r) => r.userId === userId)
    .map(({ pdfBlob: _blob, messages, ...rest }) => ({
      ...rest,
      messageCount: messages.length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getMatter = async (id: string, userId: string): Promise<MatterRecord | null> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(id);

    req.onsuccess = () => {
      const record = (req.result as MatterRecord | undefined) ?? null;
      if (!record || record.userId !== userId) {
        resolve(null);
        return;
      }
      resolve(record);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to load matter"));
    tx.oncomplete = () => db.close();
  });
};

export const saveMatter = async (params: {
  id?: string;
  userId: string;
  file: File;
  messages: StoredChatMessage[];
}): Promise<string> => {
  const now = Date.now();
  const id = params.id ?? `matter-${now}`;
  const existing = params.id ? await getMatter(params.id, params.userId) : null;
  const record: MatterRecord = {
    id,
    userId: params.userId,
    fileName: params.file.name,
    fileSize: params.file.size,
    messageCount: params.messages.length,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    pdfBlob: params.file,
    messages: params.messages,
  };

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.put(record);

    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error ?? new Error("Failed to save matter"));
    tx.oncomplete = () => db.close();
  });
};

export const deleteMatter = async (id: string, userId: string): Promise<void> => {
  const existing = await getMatter(id, userId);
  if (!existing) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to delete matter"));
    tx.oncomplete = () => db.close();
  });
};
