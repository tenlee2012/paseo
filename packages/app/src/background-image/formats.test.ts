import { describe, expect, it } from "vitest";
import {
  BACKGROUND_IMAGE_FILE_EXTENSIONS,
  isSupportedBackgroundImageMimeType,
  isSupportedBackgroundImagePath,
} from "./formats";

describe("background image formats", () => {
  it("only accepts JPEG and PNG formats", () => {
    expect(BACKGROUND_IMAGE_FILE_EXTENSIONS).toEqual(["png", "jpg", "jpeg"]);
    expect(isSupportedBackgroundImageMimeType("image/png")).toBe(true);
    expect(isSupportedBackgroundImageMimeType("image/jpeg")).toBe(true);
    expect(isSupportedBackgroundImageMimeType("image/heic")).toBe(false);
    expect(isSupportedBackgroundImageMimeType("image/tiff")).toBe(false);
    expect(isSupportedBackgroundImagePath("/tmp/background.JPEG")).toBe(true);
    expect(isSupportedBackgroundImagePath("/tmp/background.heic")).toBe(false);
  });
});
