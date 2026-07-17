import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_BACKGROUND_IMAGE_BYTES = 25 * 1024 * 1024;
const BACKGROUND_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const BACKGROUND_IMAGE_ASSETS_DIRNAME = "background-images";
const BACKGROUND_IMAGE_BASENAME = "background";
const BACKGROUND_IMAGE_PREFIX = `${BACKGROUND_IMAGE_BASENAME}-`;
const BACKGROUND_IMAGE_FILENAME_PATTERN =
  /^background-[0-9a-f-]{36}\.(?:png|jpe?g|webp|gif|avif)$/i;
const BACKGROUND_IMAGE_CONTENT_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".avif", "image/avif"],
]);

export interface DesktopBackgroundImageResult {
  uri: string;
  fileName: string;
}

function normalizeBackgroundImagePath(value: unknown): {
  filePath: string;
  fileName: string;
} {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Background image path is required.");
  }
  const filePath = path.resolve(value.trim());
  const extension = path.extname(filePath).toLowerCase();
  if (!BACKGROUND_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error("Background image must be a PNG, JPEG, WebP, GIF, or AVIF image.");
  }
  return {
    filePath,
    fileName: path.basename(filePath),
  };
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[index] === value);
}

function detectBackgroundImageExtension(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return ".png";
  }
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return ".jpg";
  }
  const header = Buffer.from(bytes.subarray(0, 16));
  const asciiHeader = header.toString("ascii");
  if (asciiHeader.startsWith("GIF87a") || asciiHeader.startsWith("GIF89a")) {
    return ".gif";
  }
  if (asciiHeader.startsWith("RIFF") && asciiHeader.slice(8, 12) === "WEBP") {
    return ".webp";
  }
  if (
    bytes.length >= 12 &&
    asciiHeader.slice(4, 8) === "ftyp" &&
    (asciiHeader.slice(8, 12) === "avif" || asciiHeader.slice(8, 12) === "avis")
  ) {
    return ".avif";
  }
  return null;
}

function backgroundImageAssetsDir(userDataPath: string): string {
  return path.join(userDataPath, BACKGROUND_IMAGE_ASSETS_DIRNAME);
}

export function resolveDesktopBackgroundImageAssetPath(input: {
  userDataPath: string;
  pathname: string;
}): string | null {
  const fileName = path.basename(input.pathname);
  if (input.pathname !== `/${fileName}` || !BACKGROUND_IMAGE_FILENAME_PATTERN.test(fileName)) {
    return null;
  }
  const assetsDir = backgroundImageAssetsDir(input.userDataPath);
  const filePath = path.join(assetsDir, fileName);
  const relativePath = path.relative(assetsDir, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }
  return filePath;
}

export function resolveDesktopBackgroundImageContentType(pathname: string): string | null {
  const fileName = path.basename(pathname);
  if (pathname !== `/${fileName}` || !BACKGROUND_IMAGE_FILENAME_PATTERN.test(fileName)) {
    return null;
  }
  return BACKGROUND_IMAGE_CONTENT_TYPES.get(path.extname(fileName).toLowerCase()) ?? null;
}

function backgroundImageNameFromUri(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "paseo:" || parsed.hostname !== "background-images") {
      return null;
    }
    const fileName = path.basename(parsed.pathname);
    return parsed.pathname === `/${fileName}` && BACKGROUND_IMAGE_FILENAME_PATTERN.test(fileName)
      ? fileName
      : null;
  } catch {
    return null;
  }
}

async function removeDesktopBackgroundImageFiles(
  userDataPath: string,
  keepName?: string | null,
): Promise<void> {
  const assetsDir = backgroundImageAssetsDir(userDataPath);
  let entries;
  try {
    entries = await readdir(assetsDir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name !== keepName &&
          entry.name.startsWith(BACKGROUND_IMAGE_PREFIX) &&
          BACKGROUND_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
      )
      .map((entry) => rm(path.join(assetsDir, entry.name), { force: true })),
  );
}

export async function importDesktopBackgroundImage(input: {
  path?: unknown;
  userDataPath: string;
}): Promise<DesktopBackgroundImageResult> {
  const source = normalizeBackgroundImagePath(input.path);
  const fileInfo = await stat(source.filePath);
  if (!fileInfo.isFile()) {
    throw new Error("Background image path must point to a file.");
  }
  if (fileInfo.size > MAX_BACKGROUND_IMAGE_BYTES) {
    throw new Error("Background image is too large.");
  }
  const bytes = await readFile(source.filePath);
  const extension = detectBackgroundImageExtension(bytes);
  if (!extension) {
    throw new Error("Background image file does not contain a supported image.");
  }

  const assetsDir = backgroundImageAssetsDir(input.userDataPath);
  await mkdir(assetsDir, { recursive: true });
  const targetName = `${BACKGROUND_IMAGE_PREFIX}${randomUUID()}${extension}`;
  const targetPath = path.join(assetsDir, targetName);
  const temporaryPath = `${targetPath}.tmp.${process.pid}`;
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, targetPath);

  return {
    uri: `paseo://background-images/${targetName}`,
    fileName: source.fileName,
  };
}

export async function pruneDesktopBackgroundImages(input: {
  userDataPath: string;
  keepUri?: unknown;
}): Promise<boolean> {
  await removeDesktopBackgroundImageFiles(
    input.userDataPath,
    backgroundImageNameFromUri(input.keepUri),
  );
  return true;
}
