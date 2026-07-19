import { Directory, File, Paths } from "expo-file-system";
import type { AttachmentMetadata, AttachmentStore, SaveAttachmentInput } from "@/attachments/types";
import {
  fileUriToPath,
  generateAttachmentId,
  getFileExtensionFromName,
  normalizeMimeType,
  parseDataUrl,
  pathToFileUri,
} from "@/attachments/utils";

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

function extensionForBackgroundImage(input: { fileName: string | null; mimeType: string }): string {
  return (
    getFileExtensionFromName(input.fileName) ||
    IMAGE_EXTENSION_BY_MIME_TYPE[input.mimeType] ||
    ".img"
  );
}

function backgroundImagesDirectory(): Directory {
  return new Directory(Paths.document, "background-images");
}

function ensureBackgroundImagesDirectory(): Directory {
  const directory = backgroundImagesDirectory();
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

async function sourceToBytes(source: SaveAttachmentInput["source"]): Promise<Uint8Array> {
  if (source.kind === "bytes") {
    return source.bytes;
  }
  if (source.kind === "blob") {
    return new Uint8Array(await source.blob.arrayBuffer());
  }
  const response = await fetch(source.kind === "data_url" ? source.dataUrl : source.uri);
  return new Uint8Array(await response.arrayBuffer());
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

export function createNativeBackgroundImageStore(): AttachmentStore {
  return {
    storageType: "native-file",

    async save(input): Promise<AttachmentMetadata> {
      const directory = ensureBackgroundImagesDirectory();
      const id = input.id ?? generateAttachmentId();
      const fileName = input.fileName ?? null;
      const mimeType = normalizeMimeType(input.mimeType ?? sourceMimeType(input));
      const extension = extensionForBackgroundImage({ fileName, mimeType });
      const file = new File(directory, `${id}${extension}`);

      if (input.source.kind === "file_uri") {
        new File(pathToFileUri(input.source.uri)).copy(file);
      } else {
        file.write(await sourceToBytes(input.source));
      }

      return {
        id,
        mimeType,
        storageType: "native-file",
        storageKey: fileUriToPath(file.uri),
        fileName,
        byteSize: file.size,
        createdAt: Date.now(),
      };
    },

    async encodeBase64({ attachment }): Promise<string> {
      return await new File(pathToFileUri(attachment.storageKey)).base64();
    },

    async resolvePreviewUrl({ attachment }): Promise<string> {
      return pathToFileUri(attachment.storageKey);
    },

    async delete({ attachment }): Promise<void> {
      new File(pathToFileUri(attachment.storageKey)).delete();
    },

    async garbageCollect({ referencedIds }): Promise<void> {
      const directory = backgroundImagesDirectory();
      if (!directory.exists) {
        return;
      }
      for (const entry of directory.list()) {
        if (!(entry instanceof File)) {
          continue;
        }
        const id = entry.name.slice(0, -entry.extension.length);
        if (!referencedIds.has(id)) {
          entry.delete();
        }
      }
    },
  };
}
