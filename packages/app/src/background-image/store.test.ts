import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttachmentStore } from "@/attachments/types";
import { __setBackgroundImageStoreForTests, persistBackgroundImage } from "./store";

function createStore(): AttachmentStore {
  return {
    storageType: "web-indexeddb",
    save: vi.fn(),
    encodeBase64: vi.fn(),
    resolvePreviewUrl: vi.fn(),
    delete: vi.fn(),
    garbageCollect: vi.fn(),
  };
}

describe("background image store", () => {
  afterEach(() => {
    __setBackgroundImageStoreForTests(null);
  });

  it("rejects unsupported desktop image formats before writing bytes", async () => {
    const store = createStore();
    __setBackgroundImageStoreForTests(store);

    await expect(
      persistBackgroundImage({
        source: { kind: "file_uri", uri: "/tmp/background.heic" },
        mimeType: "image/heic",
      }),
    ).rejects.toThrow("JPEG or PNG");
    expect(store.save).not.toHaveBeenCalled();
  });

  it("accepts native content uris without extensions when the mime type is supported", async () => {
    const store = createStore();
    vi.mocked(store.save).mockResolvedValue({
      id: "background_1",
      mimeType: "image/png",
      storageType: "native-file",
      storageKey: "/background-images/background_1.png",
      createdAt: 1,
    });
    __setBackgroundImageStoreForTests(store);

    await expect(
      persistBackgroundImage({
        source: { kind: "file_uri", uri: "content://media/external/images/42" },
        mimeType: "image/png",
      }),
    ).resolves.toMatchObject({ id: "background_1" });
    expect(store.save).toHaveBeenCalledOnce();
  });
});
