import type { AttachmentMetadata, AttachmentStore, SaveAttachmentInput } from "@/attachments/types";
import {
  blobToBase64,
  fileUriToPath,
  generateAttachmentId,
  getFileExtensionFromName,
  normalizeMimeType,
  parseDataUrl,
} from "@/attachments/utils";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import { createBrowserObjectUrlMinter } from "@/desktop/attachments/desktop-preview-url";

const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/tiff": ".tiff",
  "image/bmp": ".bmp",
};

interface BackgroundImageFileResult {
  path: string;
  byteSize: number;
}

function extensionForBackgroundImage(input: {
  fileName: string | null;
  sourcePath?: string;
  mimeType: string;
}): string {
  return (
    getFileExtensionFromName(input.fileName) ||
    getFileExtensionFromName(input.sourcePath) ||
    IMAGE_EXTENSION_BY_MIME_TYPE[input.mimeType] ||
    ".img"
  );
}

function sourceMimeType(input: SaveAttachmentInput): string | undefined {
  if (input.source.kind === "data_url") {
    return parseDataUrl(input.source.dataUrl).mimeType;
  }
  if (input.source.kind === "blob") {
    return input.source.blob.type;
  }
  return undefined;
}

function toMetadata(input: {
  id: string;
  mimeType: string;
  fileName: string | null;
  result: BackgroundImageFileResult;
}): AttachmentMetadata {
  return {
    id: input.id,
    mimeType: input.mimeType,
    storageType: "desktop-file",
    storageKey: input.result.path,
    fileName: input.fileName,
    byteSize: input.result.byteSize,
    createdAt: Date.now(),
  };
}

async function writeBackgroundImageFromBase64(input: {
  id: string;
  base64: string;
  extension: string;
}): Promise<BackgroundImageFileResult> {
  return await invokeDesktopCommand<BackgroundImageFileResult>("write_background_image_base64", {
    backgroundImageId: input.id,
    base64: input.base64,
    extension: input.extension,
  });
}

async function copyBackgroundImageFile(input: {
  id: string;
  sourcePath: string;
  extension: string;
}): Promise<BackgroundImageFileResult> {
  return await invokeDesktopCommand<BackgroundImageFileResult>("copy_background_image_file", {
    backgroundImageId: input.id,
    sourcePath: input.sourcePath,
    extension: input.extension,
  });
}

async function sourceToBase64(
  source: Exclude<SaveAttachmentInput["source"], { kind: "file_uri" }>,
): Promise<string> {
  if (source.kind === "data_url") {
    return parseDataUrl(source.dataUrl).base64;
  }
  if (source.kind === "blob") {
    return await blobToBase64(source.blob);
  }
  if (source.kind === "bytes") {
    return bytesToBase64(source.bytes);
  }
  throw new Error("Unsupported background image source.");
}

export function createDesktopBackgroundImageStore(): AttachmentStore {
  const objectUrls = createBrowserObjectUrlMinter();
  const trackedUrls = new Set<string>();

  return {
    storageType: "desktop-file",

    async save(input): Promise<AttachmentMetadata> {
      const id = input.id ?? generateAttachmentId();
      const fileName = input.fileName ?? null;
      const mimeType = normalizeMimeType(input.mimeType ?? sourceMimeType(input));

      if (input.source.kind === "file_uri") {
        const sourcePath = fileUriToPath(input.source.uri);
        const result = await copyBackgroundImageFile({
          id,
          sourcePath,
          extension: extensionForBackgroundImage({ fileName, sourcePath, mimeType }),
        });
        return toMetadata({ id, mimeType, fileName, result });
      }

      const base64 = await sourceToBase64(input.source);
      const result = await writeBackgroundImageFromBase64({
        id,
        base64,
        extension: extensionForBackgroundImage({ fileName, mimeType }),
      });
      return toMetadata({ id, mimeType, fileName, result });
    },

    async encodeBase64({ attachment }): Promise<string> {
      return await invokeDesktopCommand<string>("read_background_image_base64", {
        path: attachment.storageKey,
      });
    },

    async resolvePreviewUrl({ attachment }): Promise<string> {
      const base64 = await invokeDesktopCommand<string>("read_background_image_base64", {
        path: attachment.storageKey,
      });
      const url = objectUrls.tryCreate({ mimeType: attachment.mimeType, base64 });
      if (url === null) {
        return `data:${attachment.mimeType};base64,${base64}`;
      }
      trackedUrls.add(url);
      return url;
    },

    async releasePreviewUrl({ url }): Promise<void> {
      if (!trackedUrls.has(url)) {
        return;
      }
      trackedUrls.delete(url);
      objectUrls.revoke(url);
    },

    async delete({ attachment }): Promise<void> {
      await invokeDesktopCommand("delete_background_image_file", { path: attachment.storageKey });
    },

    async garbageCollect({ referencedIds }): Promise<void> {
      await invokeDesktopCommand("garbage_collect_background_images", {
        referencedIds: Array.from(referencedIds),
      });
    },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
