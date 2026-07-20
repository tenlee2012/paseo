import { useAppSettings } from "@/hooks/use-settings";
import {
  isBackgroundImageVisible,
  useBackgroundImageRuntimeStore,
} from "@/background-image/runtime-store";

export function useIsBackgroundImageVisible(): boolean {
  const { settings } = useAppSettings();
  const imageId = useBackgroundImageRuntimeStore((state) => state.imageId);
  const loadStatus = useBackgroundImageRuntimeStore((state) => state.loadStatus);
  const previewOpacity = useBackgroundImageRuntimeStore((state) => state.previewOpacity);

  return isBackgroundImageVisible({
    configuredImageId: settings.backgroundImage?.id ?? null,
    runtimeImageId: imageId,
    loadStatus,
    opacity: previewOpacity ?? settings.backgroundImageOpacity,
  });
}
