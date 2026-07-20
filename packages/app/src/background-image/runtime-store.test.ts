import { beforeEach, describe, expect, it } from "vitest";
import {
  isBackgroundImageReady,
  isBackgroundImageVisible,
  useBackgroundImageRuntimeStore,
} from "./runtime-store";

describe("background image runtime store", () => {
  beforeEach(() => {
    useBackgroundImageRuntimeStore.setState({
      imageId: null,
      loadStatus: "idle",
      previewOpacity: null,
    });
  });

  it("only reports ready for the currently configured loaded image", () => {
    expect(
      isBackgroundImageReady({
        configuredImageId: "background_1",
        runtimeImageId: "background_1",
        loadStatus: "loading",
      }),
    ).toBe(false);
    expect(
      isBackgroundImageReady({
        configuredImageId: "background_1",
        runtimeImageId: "background_2",
        loadStatus: "ready",
      }),
    ).toBe(false);
    expect(
      isBackgroundImageReady({
        configuredImageId: "background_1",
        runtimeImageId: "background_1",
        loadStatus: "ready",
      }),
    ).toBe(true);
  });

  it("only reports visible when the loaded image has positive opacity", () => {
    const loadedImage = {
      configuredImageId: "background_1",
      runtimeImageId: "background_1",
      loadStatus: "ready" as const,
    };

    expect(isBackgroundImageVisible({ ...loadedImage, opacity: 70 })).toBe(true);
    expect(isBackgroundImageVisible({ ...loadedImage, opacity: 0 })).toBe(false);
    expect(
      isBackgroundImageVisible({
        ...loadedImage,
        runtimeImageId: "background_2",
        opacity: 70,
      }),
    ).toBe(false);
    expect(
      isBackgroundImageVisible({
        ...loadedImage,
        loadStatus: "error",
        opacity: 70,
      }),
    ).toBe(false);
  });

  it("publishes and clears a live opacity preview", () => {
    useBackgroundImageRuntimeStore.getState().setPreviewOpacity(35);
    expect(useBackgroundImageRuntimeStore.getState().previewOpacity).toBe(35);

    useBackgroundImageRuntimeStore.getState().clearImage();
    expect(useBackgroundImageRuntimeStore.getState().previewOpacity).toBeNull();
  });
});
