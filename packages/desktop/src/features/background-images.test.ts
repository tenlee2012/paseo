import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyBackgroundImageFile,
  deleteBackgroundImageFile,
  garbageCollectBackgroundImages,
  readBackgroundImageBase64,
  writeBackgroundImageBase64,
} from "./background-images";

const originalPaseoHome = process.env.PASEO_HOME;
let testHome: string | null = null;

async function useTempPaseoHome(): Promise<string> {
  testHome = await mkdtemp(path.join(os.tmpdir(), "paseo-desktop-background-images-"));
  process.env.PASEO_HOME = testHome;
  return testHome;
}

describe("desktop background images", () => {
  afterEach(async () => {
    if (originalPaseoHome === undefined) {
      delete process.env.PASEO_HOME;
    } else {
      process.env.PASEO_HOME = originalPaseoHome;
    }

    if (testHome) {
      await rm(testHome, { recursive: true, force: true });
      testHome = null;
    }
  });

  it("writes and reads images from storage isolated from attachments", async () => {
    const paseoHome = await useTempPaseoHome();

    const result = await writeBackgroundImageBase64({
      backgroundImageId: "background_1",
      base64: "AAECAw==",
      extension: ".png",
    });

    expect(result).toEqual({
      path: path.join(paseoHome, "desktop-background-images", "background_1.png"),
      byteSize: 4,
    });
    await expect(readBackgroundImageBase64({ path: result.path })).resolves.toBe("AAECAw==");
  });

  it("copies and deletes a selected image from managed storage", async () => {
    const paseoHome = await useTempPaseoHome();
    const sourcePath = path.join(paseoHome, "selected.jpg");
    await writeFile(sourcePath, "image");

    const result = await copyBackgroundImageFile({
      backgroundImageId: "background_2",
      sourcePath,
      extension: "jpg",
    });

    await expect(readFile(result.path, "utf8")).resolves.toBe("image");
    await expect(deleteBackgroundImageFile({ path: result.path })).resolves.toBe(true);
    await expect(readFile(result.path, "utf8")).rejects.toThrow();
  });

  it("garbage collects images that are no longer referenced", async () => {
    const paseoHome = await useTempPaseoHome();
    const keep = await writeBackgroundImageBase64({
      backgroundImageId: "background_keep",
      base64: "AA==",
      extension: ".png",
    });
    const remove = await writeBackgroundImageBase64({
      backgroundImageId: "background_remove",
      base64: "AQ==",
      extension: ".png",
    });

    await expect(
      garbageCollectBackgroundImages({ referencedIds: ["background_keep"] }),
    ).resolves.toBe(1);
    await expect(readFile(keep.path)).resolves.toBeDefined();
    await expect(readFile(remove.path)).rejects.toThrow();
    expect(keep.path).toBe(
      path.join(paseoHome, "desktop-background-images", "background_keep.png"),
    );
  });
});
