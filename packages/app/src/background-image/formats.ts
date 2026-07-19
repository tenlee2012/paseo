export const BACKGROUND_IMAGE_FILE_EXTENSIONS = ["png", "jpg", "jpeg"] as const;

const SUPPORTED_BACKGROUND_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);
const SUPPORTED_BACKGROUND_IMAGE_EXTENSIONS = new Set(
  BACKGROUND_IMAGE_FILE_EXTENSIONS.map((extension) => `.${extension}`),
);

export function isSupportedBackgroundImageMimeType(mimeType: string | null | undefined): boolean {
  const normalized = mimeType?.split(";", 1)[0]?.trim().toLowerCase();
  return Boolean(normalized && SUPPORTED_BACKGROUND_IMAGE_MIME_TYPES.has(normalized));
}

export function isSupportedBackgroundImagePath(path: string): boolean {
  const normalizedPath = path.split("#", 1)[0]?.split("?", 1)[0] ?? path;
  const extensionIndex = normalizedPath.lastIndexOf(".");
  if (extensionIndex < 0) {
    return false;
  }
  return SUPPORTED_BACKGROUND_IMAGE_EXTENSIONS.has(
    normalizedPath.slice(extensionIndex).toLowerCase(),
  );
}
