import {
  type AttachmentStore,
  type AttachmentMetadata,
  type SaveAttachmentInput,
} from "@/attachments/types";
import {
  blobToBase64,
  generateAttachmentId,
  normalizeMimeType,
  parseDataUrl,
} from "@/attachments/utils";

interface StoredBlobRecord {
  id: string;
  blob: Blob;
  createdAt: number;
  fileName: string | null;
}

const DB_NAME = "paseo-attachment-bytes";
const STORE_NAME = "attachments";
const DB_VERSION = 1;

export interface IndexedDbAttachmentStoreOptions {
  databaseName?: string;
  storeName?: string;
}

function ensureIndexedDb(): IDBFactory {
  const idb = globalThis.indexedDB;
  if (!idb) {
    throw new Error("IndexedDB is unavailable in this runtime.");
  }
  return idb;
}

function openAttachmentDb(input: {
  databaseName: string;
  storeName: string;
}): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = ensureIndexedDb().open(input.databaseName, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(input.storeName)) {
        db.createObjectStore(input.storeName, { keyPath: "id" });
      }
    };

    request.addEventListener("success", () => {
      resolve(request.result);
    });

    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Failed to open attachment IndexedDB."));
    });
  });
}

function runTx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  storeName: string,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = run(store);
    let result: T;

    request.addEventListener("success", () => {
      result = request.result;
    });

    request.addEventListener("error", () => {
      reject(request.error ?? new Error("IndexedDB transaction request failed."));
    });

    transaction.addEventListener("complete", () => {
      resolve(result);
    });

    transaction.addEventListener("error", () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    });

    transaction.addEventListener("abort", () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    });
  });
}

async function sourceToBlob(input: SaveAttachmentInput): Promise<{ blob: Blob; mimeType: string }> {
  const source = input.source;
  if (source.kind === "bytes") {
    const mimeType = normalizeMimeType(input.mimeType);
    const buffer = new ArrayBuffer(source.bytes.byteLength);
    new Uint8Array(buffer).set(source.bytes);
    return {
      blob: new Blob([buffer], { type: mimeType }),
      mimeType,
    };
  }

  if (source.kind === "blob") {
    const mimeType = normalizeMimeType(input.mimeType ?? source.blob.type);
    const blob =
      source.blob.type === mimeType
        ? source.blob
        : source.blob.slice(0, source.blob.size, mimeType);
    return { blob, mimeType };
  }

  if (source.kind === "data_url") {
    const parsed = parseDataUrl(source.dataUrl);
    const response = await fetch(source.dataUrl);
    const blob = await response.blob();
    const mimeType = normalizeMimeType(input.mimeType ?? parsed.mimeType ?? blob.type);
    return {
      blob: blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType),
      mimeType,
    };
  }

  const response = await fetch(source.uri);
  const blob = await response.blob();
  const mimeType = normalizeMimeType(input.mimeType ?? blob.type);
  return {
    blob: blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType),
    mimeType,
  };
}

async function loadBlob(input: { db: IDBDatabase; id: string; storeName: string }): Promise<Blob> {
  const record = await runTx<StoredBlobRecord | undefined>(
    input.db,
    "readonly",
    input.storeName,
    (store) => store.get(input.id),
  );
  if (!record?.blob) {
    throw new Error(`Attachment ${input.id} was not found in IndexedDB.`);
  }
  return record.blob;
}

export function createIndexedDbAttachmentStore(
  options: IndexedDbAttachmentStoreOptions = {},
): AttachmentStore {
  const databaseName = options.databaseName ?? DB_NAME;
  const storeName = options.storeName ?? STORE_NAME;

  return {
    storageType: "web-indexeddb",

    async save(input): Promise<AttachmentMetadata> {
      const id = input.id ?? generateAttachmentId();
      const createdAt = Date.now();
      const { blob, mimeType } = await sourceToBlob(input);
      const fileName = input.fileName ?? null;
      const db = await openAttachmentDb({ databaseName, storeName });

      try {
        await runTx(db, "readwrite", storeName, (store) =>
          store.put({ id, blob, createdAt, fileName } satisfies StoredBlobRecord),
        );
      } finally {
        db.close();
      }

      return {
        id,
        mimeType,
        storageType: "web-indexeddb",
        storageKey: id,
        fileName,
        byteSize: blob.size,
        createdAt,
      };
    },

    async encodeBase64({ attachment }): Promise<string> {
      const db = await openAttachmentDb({ databaseName, storeName });
      try {
        const blob = await loadBlob({ db, id: attachment.storageKey, storeName });
        return await blobToBase64(blob);
      } finally {
        db.close();
      }
    },

    async resolvePreviewUrl({ attachment }): Promise<string> {
      const db = await openAttachmentDb({ databaseName, storeName });
      try {
        const blob = await loadBlob({ db, id: attachment.storageKey, storeName });
        return URL.createObjectURL(blob);
      } finally {
        db.close();
      }
    },

    async releasePreviewUrl({ url }): Promise<void> {
      URL.revokeObjectURL(url);
    },

    async delete({ attachment }): Promise<void> {
      const db = await openAttachmentDb({ databaseName, storeName });
      try {
        await runTx(db, "readwrite", storeName, (store) => store.delete(attachment.storageKey));
      } finally {
        db.close();
      }
    },

    async garbageCollect({ referencedIds }): Promise<void> {
      const db = await openAttachmentDb({ databaseName, storeName });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, "readwrite");
          const store = tx.objectStore(storeName);
          const cursorRequest = store.openCursor();

          cursorRequest.addEventListener("error", () => {
            reject(
              cursorRequest.error ?? new Error("Failed to iterate IndexedDB attachment store."),
            );
          });

          cursorRequest.addEventListener("success", () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
              resolve();
              return;
            }

            const key = String(cursor.key);
            if (!referencedIds.has(key)) {
              cursor.delete();
            }
            cursor.continue();
          });

          tx.addEventListener("error", () => {
            reject(tx.error ?? new Error("Failed to garbage collect IndexedDB attachments."));
          });
        });
      } finally {
        db.close();
      }
    },
  };
}
