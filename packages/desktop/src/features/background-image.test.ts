import { access, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  importDesktopBackgroundImage,
  pruneDesktopBackgroundImages,
  resolveDesktopBackgroundImageAssetPath,
  resolveDesktopBackgroundImageContentType,
} from "./background-image";

async function makeTempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "paseo-background-image-"));
}

describe("desktop background images", () => {
  it("imports a supported image into managed background storage", async () => {
    const dir = await makeTempDir();
    const userDataPath = path.join(dir, "user-data");
    const sourcePath = path.join(dir, "dream.png");
    await writeFile(
      sourcePath,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    );

    const result = await importDesktopBackgroundImage({
      path: sourcePath,
      userDataPath,
    });

    expect(result.fileName).toBe("dream.png");
    expect(result.uri).toMatch(/^paseo:\/\/background-images\/background-[0-9a-f-]{36}\.png$/);
    const pathname = new URL(result.uri).pathname;
    const managedPath = resolveDesktopBackgroundImageAssetPath({ userDataPath, pathname });
    expect(managedPath).not.toBeNull();
    await expect(access(managedPath!)).resolves.toBeUndefined();
  });

  it("rejects files whose bytes are not a supported image", async () => {
    const dir = await makeTempDir();
    const sourcePath = path.join(dir, "fake.png");
    await writeFile(sourcePath, "not an image", "utf8");

    await expect(
      importDesktopBackgroundImage({
        path: sourcePath,
        userDataPath: path.join(dir, "user-data"),
      }),
    ).rejects.toThrow("does not contain a supported image");
  });

  it("prunes old managed backgrounds while retaining the active image", async () => {
    const dir = await makeTempDir();
    const userDataPath = path.join(dir, "user-data");
    const sourcePath = path.join(dir, "dream.png");
    await writeFile(
      sourcePath,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    );

    const first = await importDesktopBackgroundImage({ path: sourcePath, userDataPath });
    const second = await importDesktopBackgroundImage({ path: sourcePath, userDataPath });
    await pruneDesktopBackgroundImages({ userDataPath, keepUri: second.uri });

    expect(await readdir(path.join(userDataPath, "background-images"))).toEqual([
      path.basename(new URL(second.uri).pathname),
    ]);
    expect(first.uri).not.toBe(second.uri);
  });

  it("rejects traversal and unknown asset paths", () => {
    expect(
      resolveDesktopBackgroundImageAssetPath({
        userDataPath: "/tmp/paseo",
        pathname: "/../background-123e4567-e89b-12d3-a456-426614174000.png",
      }),
    ).toBeNull();
    expect(
      resolveDesktopBackgroundImageAssetPath({
        userDataPath: "/tmp/paseo",
        pathname: "/other.png",
      }),
    ).toBeNull();
  });

  it("resolves content types only for managed background image paths", () => {
    expect(
      resolveDesktopBackgroundImageContentType(
        "/background-123e4567-e89b-12d3-a456-426614174000.png",
      ),
    ).toBe("image/png");
    expect(
      resolveDesktopBackgroundImageContentType(
        "/background-123e4567-e89b-12d3-a456-426614174000.jpeg",
      ),
    ).toBe("image/jpeg");
    expect(resolveDesktopBackgroundImageContentType("/other.png")).toBeNull();
    expect(
      resolveDesktopBackgroundImageContentType(
        "/../background-123e4567-e89b-12d3-a456-426614174000.png",
      ),
    ).toBeNull();
  });
});
