import { useEffect, useMemo, useState } from "react";
import { Image, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useAppSettings } from "@/hooks/use-settings";
import { releaseBackgroundImageUrl, resolveBackgroundImageUrl } from "@/background-image/store";
import { useBackgroundImageRuntimeStore } from "@/background-image/runtime-store";

export function BackgroundImageLayer() {
  const { settings } = useAppSettings();
  const backgroundImage = settings.backgroundImage;
  const previewOpacity = useBackgroundImageRuntimeStore((state) => state.previewOpacity);
  const startLoading = useBackgroundImageRuntimeStore((state) => state.startLoading);
  const markReady = useBackgroundImageRuntimeStore((state) => state.markReady);
  const markError = useBackgroundImageRuntimeStore((state) => state.markError);
  const clearImage = useBackgroundImageRuntimeStore((state) => state.clearImage);
  const [url, setUrl] = useState<string | null>(null);
  const source = useMemo(() => ({ uri: url ?? "" }), [url]);
  const opacity = previewOpacity ?? settings.backgroundImageOpacity;
  const imageStyle = useMemo(() => [styles.image, { opacity: opacity / 100 }], [opacity]);

  useEffect(() => {
    let disposed = false;
    let resolvedUrl: string | null = null;

    if (!backgroundImage) {
      setUrl(null);
      clearImage();
      return;
    }
    const backgroundToResolve = backgroundImage;
    setUrl(null);
    startLoading(backgroundToResolve.id);

    async function resolveImage(): Promise<void> {
      try {
        const nextUrl = await resolveBackgroundImageUrl(backgroundToResolve);
        if (disposed) {
          await releaseBackgroundImageUrl({ backgroundImage: backgroundToResolve, url: nextUrl });
          return;
        }
        resolvedUrl = nextUrl;
        setUrl(nextUrl);
      } catch (error) {
        console.warn("[BackgroundImage] Failed to resolve background image", error);
        if (!disposed) {
          setUrl(null);
          markError(backgroundToResolve.id);
        }
      }
    }

    void resolveImage();

    return () => {
      disposed = true;
      if (!resolvedUrl) {
        return;
      }
      void releaseBackgroundImageUrl({
        backgroundImage: backgroundToResolve,
        url: resolvedUrl,
      });
    };
  }, [backgroundImage, clearImage, markError, startLoading]);

  const handleLoad = useMemo(
    () => (backgroundImage ? () => markReady(backgroundImage.id) : undefined),
    [backgroundImage, markReady],
  );
  const handleError = useMemo(
    () => (backgroundImage ? () => markError(backgroundImage.id) : undefined),
    [backgroundImage, markError],
  );

  if (!backgroundImage || !url) {
    return null;
  }

  return (
    <View testID="background-image-layer" pointerEvents="none" style={styles.layer}>
      <Image
        testID="background-image-layer-image"
        source={source}
        resizeMode="cover"
        style={imageStyle}
        onLoad={handleLoad}
        onError={handleError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
