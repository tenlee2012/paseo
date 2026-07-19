import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolvePaseoHome } from "@getpaseo/server";

const BACKGROUND_IMAGES_DIRNAME = "desktop-background-images";
const BACKGROUND_IMAGE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const EXTENSION_PATTERN = /^\.[A-Za-z0-9]{1,16}$/;

interface BackgroundImageFileResult {
  path: string;
  byteSize: number;
}

function backgroundImagesDirPath(): string {
  return path.join(resolvePaseoHome(process.env), BACKGROUND_IMAGES_DIRNAME);
}

async function ensureBackgroundImagesDir(): Promise<string> {
  const directoryPath = backgroundImagesDirPath();
  await mkdir(directoryPath, { recursive: true });
  return directoryPath;
}

function normalizeBackgroundImageId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Background image id is required.");
  }
  const normalized = value.trim();
  if (!BACKGROUND_IMAGE_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid background image id: ${value}`);
  }
  return normalized;
}

function normalizeExtension(value: unknown): string {
  if (value == null || value === "") {
    return ".img";
  }
  if (typeof value !== "string") {
    throw new Error("Background image extension must be a string.");
  }
  const normalized = value.trim().toLowerCase();
  const extension = normalized.startsWith(".") ? normalized : `.${normalized}`;
  if (!EXTENSION_PATTERN.test(extension)) {
    throw new Error(`Invalid background image extension: ${value}`);
  }
  return extension;
}

async function buildBackgroundImagePath(input: {
  backgroundImageId: unknown;
  extension: unknown;
}): Promise<string> {
  const directoryPath = await ensureBackgroundImagesDir();
  const backgroundImageId = normalizeBackgroundImageId(input.backgroundImageId);
  const extension = normalizeExtension(input.extension);
  return path.join(directoryPath, `${backgroundImageId}${extension}`);
}

function resolveBackgroundImagePath(inputPath: unknown): string {
  if (typeof inputPath !== "string" || inputPath.trim().length === 0) {
    throw new Error("Background image path is required.");
  }
  const resolvedDirectory = `${path.resolve(backgroundImagesDirPath())}${path.sep}`;
  const resolvedPath = path.resolve(inputPath.trim());
  if (!resolvedPath.startsWith(resolvedDirectory)) {
    throw new Error("Background image path must stay within desktop-managed storage.");
  }
  return resolvedPath;
}

export async function writeBackgroundImageBase64(input: {
  backgroundImageId?: unknown;
  base64?: unknown;
  extension?: unknown;
}): Promise<BackgroundImageFileResult> {
  const base64 = typeof input.base64 === "string" ? input.base64.trim() : "";
  if (base64.length === 0) {
    throw new Error("Background image base64 payload is required.");
  }
  const targetPath = await buildBackgroundImagePath({
    backgroundImageId: input.backgroundImageId,
    extension: input.extension,
  });
  await writeFile(targetPath, Buffer.from(base64, "base64"));
  const fileInfo = await stat(targetPath);
  return { path: targetPath, byteSize: fileInfo.size };
}

export async function copyBackgroundImageFile(input: {
  backgroundImageId?: unknown;
  sourcePath?: unknown;
  extension?: unknown;
}): Promise<BackgroundImageFileResult> {
  if (typeof input.sourcePath !== "string" || input.sourcePath.trim().length === 0) {
    throw new Error("Background image source path is required.");
  }
  const sourcePath = path.resolve(input.sourcePath.trim());
  const targetPath = await buildBackgroundImagePath({
    backgroundImageId: input.backgroundImageId,
    extension: input.extension,
  });
  if (sourcePath !== targetPath) {
    await copyFile(sourcePath, targetPath);
  }
  const fileInfo = await stat(targetPath);
  return { path: targetPath, byteSize: fileInfo.size };
}

export async function readBackgroundImageBase64(input: { path?: unknown }): Promise<string> {
  const filePath = resolveBackgroundImagePath(input.path);
  return (await readFile(filePath)).toString("base64");
}

export async function deleteBackgroundImageFile(input: { path?: unknown }): Promise<boolean> {
  const filePath = resolveBackgroundImagePath(input.path);
  await rm(filePath, { force: true });
  return true;
}

export async function garbageCollectBackgroundImages(input: {
  referencedIds?: unknown;
}): Promise<number> {
  const directoryPath = await ensureBackgroundImagesDir();
  const referencedIds = Array.isArray(input.referencedIds)
    ? new Set(
        input.referencedIds
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => BACKGROUND_IMAGE_ID_PATTERN.test(value)),
      )
    : new Set<string>();
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const toDelete = entries.filter(
    (entry) => entry.isFile() && !referencedIds.has(path.parse(entry.name).name),
  );
  await Promise.all(
    toDelete.map((entry) => rm(path.join(directoryPath, entry.name), { force: true })),
  );
  return toDelete.length;
}
