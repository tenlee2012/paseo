import { getDesktopHost } from "@/desktop/host";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import { normalizeBackgroundImage, type BackgroundImage } from "./background-image";

export async function importDesktopBackgroundImageFromFile(): Promise<BackgroundImage | null> {
  const filePath = await getDesktopHost()?.dialog?.open?.({
    title: "Import background image",
    filters: [
      {
        name: "Image",
        extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif"],
      },
    ],
  });

  if (typeof filePath !== "string" || filePath.length === 0) {
    return null;
  }

  const result = await invokeDesktopCommand<unknown>("import_desktop_background_image", {
    path: filePath,
  });
  const image = normalizeBackgroundImage(result);
  if (!image) {
    throw new Error("Desktop returned an invalid background image reference.");
  }
  return image;
}

export async function pruneImportedDesktopBackgroundImages(keepUri?: string): Promise<void> {
  await invokeDesktopCommand("prune_desktop_background_images", keepUri ? { keepUri } : undefined);
}
