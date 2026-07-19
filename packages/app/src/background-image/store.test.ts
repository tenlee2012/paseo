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
});
