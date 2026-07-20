import { create } from "zustand";

type BackgroundImageLoadStatus = "idle" | "loading" | "ready" | "error";

interface BackgroundImageRuntimeState {
  imageId: string | null;
  loadStatus: BackgroundImageLoadStatus;
  previewOpacity: number | null;
  startLoading: (imageId: string) => void;
  markReady: (imageId: string) => void;
  markError: (imageId: string) => void;
  clearImage: () => void;
  setPreviewOpacity: (opacity: number | null) => void;
}

export const useBackgroundImageRuntimeStore = create<BackgroundImageRuntimeState>()((set) => ({
  imageId: null,
  loadStatus: "idle",
  previewOpacity: null,
  startLoading: (imageId) => set({ imageId, loadStatus: "loading" }),
  markReady: (imageId) =>
    set((state) => (state.imageId === imageId ? { loadStatus: "ready" } : state)),
  markError: (imageId) =>
    set((state) => (state.imageId === imageId ? { loadStatus: "error" } : state)),
  clearImage: () => set({ imageId: null, loadStatus: "idle", previewOpacity: null }),
  setPreviewOpacity: (previewOpacity) => set({ previewOpacity }),
}));

export function isBackgroundImageReady(input: {
  configuredImageId: string | null;
  runtimeImageId: string | null;
  loadStatus: BackgroundImageLoadStatus;
}): boolean {
  return (
    input.configuredImageId !== null &&
    input.runtimeImageId === input.configuredImageId &&
    input.loadStatus === "ready"
  );
}

export function isBackgroundImageVisible(
  input: Parameters<typeof isBackgroundImageReady>[0] & { opacity: number },
): boolean {
  return input.opacity > 0 && isBackgroundImageReady(input);
}
