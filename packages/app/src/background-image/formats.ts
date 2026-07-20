export const BACKGROUND_IMAGE_FILE_EXTENSIONS = ["png", "jpg", "jpeg"] as const;

const SUPPORTED_BACKGROUND_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);
const SUPPORTED_BACKGROUND_IMAGE_EXTENSIONS = new Set(
  BACKGROUND_IMAGE_FILE_EXTENSIONS.map((extension) => `.${extension}`),
);

function backgroundImagePathExtension(path: string): string | null {
  const normalizedPath = path.split("#", 1)[0]?.split("?", 1)[0] ?? path;
  const fileNameStart = Math.max(normalizedPath.lastIndexOf("/"), normalizedPath.lastIndexOf("\\"));
  const extensionIndex = normalizedPath.lastIndexOf(".");
  if (extensionIndex <= fileNameStart) {
    return null;
  }
  return normalizedPath.slice(extensionIndex).toLowerCase();
}

export function isSupportedBackgroundImageMimeType(mimeType: string | null | undefined): boolean {
  const normalized = mimeType?.split(";", 1)[0]?.trim().toLowerCase();
  return Boolean(normalized && SUPPORTED_BACKGROUND_IMAGE_MIME_TYPES.has(normalized));
}

export function isSupportedBackgroundImagePath(path: string): boolean {
  const extension = backgroundImagePathExtension(path);
  return extension !== null && SUPPORTED_BACKGROUND_IMAGE_EXTENSIONS.has(extension);
}

export function hasUnsupportedBackgroundImagePathExtension(path: string): boolean {
  const extension = backgroundImagePathExtension(path);
  return extension !== null && !SUPPORTED_BACKGROUND_IMAGE_EXTENSIONS.has(extension);
}
