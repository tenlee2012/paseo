import type { AttachmentMetadata, AttachmentStore } from "@/attachments/types";
import { isElectronRuntime } from "@/desktop/host";
import { isWeb } from "@/constants/platform";
import {
  isSupportedBackgroundImageMimeType,
  isSupportedBackgroundImagePath,
} from "@/background-image/formats";

let backgroundImageStorePromise: Promise<AttachmentStore> | null = null;

async function createBackgroundImageStore(): Promise<AttachmentStore> {
  if (isWeb) {
    if (isElectronRuntime()) {
      const { createDesktopBackgroundImageStore } = await import("./desktop-store");
      return createDesktopBackgroundImageStore();
    }

    const { createIndexedDbAttachmentStore } =
      await import("../attachments/web/indexeddb-attachment-store");
    return createIndexedDbAttachmentStore({
      databaseName: "paseo-background-images",
      storeName: "images",
    });
  }

  const { createNativeBackgroundImageStore } = await import("./native-store");
  return createNativeBackgroundImageStore();
}

export async function getBackgroundImageStore(): Promise<AttachmentStore> {
  if (!backgroundImageStorePromise) {
    backgroundImageStorePromise = createBackgroundImageStore();
  }
  return await backgroundImageStorePromise;
}

export async function persistBackgroundImage(input: {
  source: { kind: "file_uri"; uri: string } | { kind: "blob"; blob: Blob };
  mimeType?: string | null;
  fileName?: string | null;
}): Promise<AttachmentMetadata> {
  const sourceMimeType = input.source.kind === "blob" ? input.source.blob.type : null;
  const mimeType = input.mimeType ?? sourceMimeType;
  if (!isSupportedBackgroundImageMimeType(mimeType)) {
    throw new Error("Background images must be JPEG or PNG.");
  }
  if (input.source.kind === "file_uri" && !isSupportedBackgroundImagePath(input.source.uri)) {
    throw new Error("Background images must use a .jpg, .jpeg, or .png extension.");
  }
  const store = await getBackgroundImageStore();
  return await store.save({
    mimeType: mimeType ?? undefined,
    fileName: input.fileName ?? null,
    source: input.source,
  });
}

export async function resolveBackgroundImageUrl(
  backgroundImage: AttachmentMetadata,
): Promise<string> {
  const store = await getBackgroundImageStore();
  return await store.resolvePreviewUrl({ attachment: backgroundImage });
}

export async function releaseBackgroundImageUrl(input: {
  backgroundImage: AttachmentMetadata;
  url: string;
}): Promise<void> {
  const store = await getBackgroundImageStore();
  if (!store.releasePreviewUrl) {
    return;
  }
  await store.releasePreviewUrl({ attachment: input.backgroundImage, url: input.url });
}

export async function deleteBackgroundImage(backgroundImage: AttachmentMetadata): Promise<void> {
  const store = await getBackgroundImageStore();
  await store.delete({ attachment: backgroundImage });
}

export async function garbageCollectBackgroundImages(
  activeBackgroundImage: AttachmentMetadata | null,
): Promise<void> {
  const store = await getBackgroundImageStore();
  const referencedIds = new Set<string>();
  if (activeBackgroundImage) {
    referencedIds.add(activeBackgroundImage.id);
  }
  await store.garbageCollect({ referencedIds });
}

export function __setBackgroundImageStoreForTests(store: AttachmentStore | null): void {
  backgroundImageStorePromise = store ? Promise.resolve(store) : null;
}
