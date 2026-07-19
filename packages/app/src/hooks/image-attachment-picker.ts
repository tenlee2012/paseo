import type { DesktopDialogBridge } from "@/desktop/host";
import { RASTER_IMAGE_FILE_EXTENSIONS } from "@/attachments/file-types";
import { i18n } from "@/i18n/i18next";
import { isAbsolutePath } from "@/utils/path";

export type PickedImageSource = { kind: "file_uri"; uri: string } | { kind: "blob"; blob: Blob };

export interface PickedImageAttachmentInput {
  source: PickedImageSource;
  mimeType?: string | null;
  fileName?: string | null;
}

export interface ExpoImagePickerAssetLike {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  file?: File | null;
}

function shouldTreatAsFileUri(uri: string): boolean {
  return uri.startsWith("file://") || isAbsolutePath(uri);
}

async function blobFromUri(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to read picked image from '${uri}'.`);
  }
  return await response.blob();
}

export async function normalizePickedImageAssets(
  assets: readonly ExpoImagePickerAssetLike[],
): Promise<PickedImageAttachmentInput[]> {
  return await Promise.all(
    assets.map(async (asset) => {
      if (asset.file instanceof Blob) {
        return {
          source: { kind: "blob", blob: asset.file },
          mimeType: asset.mimeType ?? asset.file.type ?? null,
          fileName: asset.fileName ?? asset.file.name ?? null,
        };
      }

      if (shouldTreatAsFileUri(asset.uri)) {
        return {
          source: { kind: "file_uri", uri: asset.uri },
          mimeType: asset.mimeType ?? null,
          fileName: asset.fileName ?? null,
        };
      }

      return {
        source: { kind: "blob", blob: await blobFromUri(asset.uri) },
        mimeType: asset.mimeType ?? null,
        fileName: asset.fileName ?? null,
      };
    }),
  );
}

function normalizeDesktopDialogSelection(selection: string | string[] | null): string[] {
  if (!selection) {
    return [];
  }
  return Array.isArray(selection) ? selection : [selection];
}

export async function openImagePathsWithDesktopDialog(
  dialog: DesktopDialogBridge | null | undefined,
  input: {
    multiple?: boolean;
    title?: string;
    filterName?: string;
    extensions?: readonly string[];
  } = {},
): Promise<string[]> {
  const dialogOptions = {
    directory: false,
    multiple: input.multiple ?? true,
    filters: [
      {
        name: input.filterName ?? i18n.t("imageAttachmentPicker.dialogFilterName"),
        extensions: [...(input.extensions ?? RASTER_IMAGE_FILE_EXTENSIONS)],
      },
    ],
    title: input.title ?? i18n.t("imageAttachmentPicker.dialogTitle"),
  };

  const dialogOpen = dialog?.open;
  if (typeof dialogOpen !== "function") {
    throw new Error("Desktop dialog API is not available.");
  }

  return normalizeDesktopDialogSelection(await dialogOpen(dialogOptions));
}
