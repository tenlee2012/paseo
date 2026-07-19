import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIndexedDbAttachmentStore } from "./indexeddb-attachment-store";

type Listener = () => void;

class FakeRequest {
  result!: unknown;
  error: Error | null = null;
  private listeners = new Map<string, Listener[]>();

  addEventListener(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  emit(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener();
    }
  }
}

class FakeObjectStore {
  constructor(
    private readonly onPut: (record: unknown) => void,
    private readonly finishTransaction: () => void,
  ) {}

  put(record: unknown): FakeRequest {
    this.onPut(record);
    const request = new FakeRequest();
    queueMicrotask(() => {
      request.emit("success");
      this.finishTransaction();
    });
    return request;
  }
}

class FakeTransaction {
  error: Error | null = null;
  private listeners = new Map<string, Listener[]>();
  private readonly store: FakeObjectStore;

  constructor(
    onPut: (record: unknown) => void,
    private readonly outcome: "complete" | "abort",
  ) {
    this.store = new FakeObjectStore(onPut, () => {
      if (this.outcome === "abort") {
        this.error = new Error("quota exceeded");
      }
      this.emit(this.outcome);
    });
  }

  objectStore(): FakeObjectStore {
    return this.store;
  }

  addEventListener(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  emit(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener();
    }
  }
}

class FakeDatabase {
  readonly objectStoreNames = {
    contains: () => true,
  };

  constructor(
    private readonly onPut: (record: unknown) => void,
    private readonly outcome: "complete" | "abort",
  ) {}

  createObjectStore(): void {}

  transaction(): FakeTransaction {
    return new FakeTransaction(this.onPut, this.outcome);
  }

  close(): void {}
}

describe("indexeddb attachment store", () => {
  let storedRecord: unknown;
  let openedDatabaseNames: string[];
  let transactionOutcome: "complete" | "abort";

  beforeEach(() => {
    storedRecord = null;
    openedDatabaseNames = [];
    transactionOutcome = "complete";
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        open: (name: string) => {
          openedDatabaseNames.push(name);
          const request = new FakeRequest();
          request.result = new FakeDatabase((record) => {
            storedRecord = record;
          }, transactionOutcome);
          queueMicrotask(() => request.emit("success"));
          return request;
        },
      } as unknown as IDBFactory,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "indexedDB");
  });

  it("stores raw byte sources as a Blob", async () => {
    const store = createIndexedDbAttachmentStore();
    const bytes = new Uint8Array([0, 1, 2, 3]);

    const attachment = await store.save({
      id: "att_bytes",
      mimeType: "image/png",
      fileName: "image.png",
      source: { kind: "bytes", bytes },
    });

    expect(storedRecord).toEqual({
      id: "att_bytes",
      blob: new Blob([bytes], { type: "image/png" }),
      createdAt: expect.any(Number),
      fileName: "image.png",
    });
    expect(attachment).toMatchObject({
      id: "att_bytes",
      mimeType: "image/png",
      storageType: "web-indexeddb",
      storageKey: "att_bytes",
      fileName: "image.png",
      byteSize: 4,
    });
  });

  it("uses a caller-provided database name for independent binary storage", async () => {
    const store = createIndexedDbAttachmentStore({
      databaseName: "paseo-background-images",
      storeName: "images",
    });

    await store.save({
      id: "background_1",
      mimeType: "image/png",
      source: { kind: "bytes", bytes: new Uint8Array([0]) },
    });

    expect(openedDatabaseNames).toEqual(["paseo-background-images"]);
  });

  it("rejects when the transaction aborts after the put request succeeds", async () => {
    transactionOutcome = "abort";
    const store = createIndexedDbAttachmentStore();

    await expect(
      store.save({
        id: "att_aborted",
        mimeType: "image/png",
        source: { kind: "bytes", bytes: new Uint8Array([0]) },
      }),
    ).rejects.toThrow("quota exceeded");
  });
});
