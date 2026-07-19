import { beforeEach, describe, expect, it } from "vitest";
import { isBackgroundImageReady, useBackgroundImageRuntimeStore } from "./runtime-store";

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

  it("publishes and clears a live opacity preview", () => {
    useBackgroundImageRuntimeStore.getState().setPreviewOpacity(35);
    expect(useBackgroundImageRuntimeStore.getState().previewOpacity).toBe(35);

    useBackgroundImageRuntimeStore.getState().clearImage();
    expect(useBackgroundImageRuntimeStore.getState().previewOpacity).toBeNull();
  });
});
