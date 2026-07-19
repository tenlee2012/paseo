import { expect, test } from "./fixtures";
import { gotoAppShell, openSettings } from "./helpers/app";
import { openSettingsSection } from "./helpers/settings";

const BACKGROUND_IMAGE = {
  id: "background_e2e",
  mimeType: "image/png",
  storageType: "web-indexeddb",
  storageKey: "background_e2e",
  fileName: "background.png",
  byteSize: 68,
  createdAt: 1,
};

const BACKGROUND_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function seedBackgroundImageInPage(input: {
  backgroundImage: typeof BACKGROUND_IMAGE;
  imageBase64: string;
}): Promise<void> {
  const openRequest = indexedDB.open("paseo-background-images", 1);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    openRequest.addEventListener("upgradeneeded", () => {
      openRequest.result.createObjectStore("images", { keyPath: "id" });
    });
    openRequest.addEventListener("success", () => resolve(openRequest.result), { once: true });
    openRequest.addEventListener("error", () => reject(openRequest.error), { once: true });
  });
  const transaction = database.transaction("images", "readwrite");
  const binary = atob(input.imageBase64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  transaction.objectStore("images").put({
    id: input.backgroundImage.id,
    blob: new Blob([bytes], { type: input.backgroundImage.mimeType }),
    createdAt: input.backgroundImage.createdAt,
    fileName: input.backgroundImage.fileName,
  });
  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
  database.close();
  localStorage.setItem(
    "@paseo:app-settings",
    JSON.stringify({
      backgroundImage: input.backgroundImage,
      backgroundImageOpacity: 70,
    }),
  );
}

test.describe("Background image", () => {
  test("renders a persisted image and applies opacity changes", async ({ page }) => {
    await gotoAppShell(page);
    await page.evaluate(seedBackgroundImageInPage, {
      backgroundImage: BACKGROUND_IMAGE,
      imageBase64: BACKGROUND_PNG_BASE64,
    });

    await page.reload();
    await expect(page.getByTestId("background-image-layer-image")).toBeVisible();
    await openSettings(page);
    await openSettingsSection(page, "appearance");

    await expect(page.getByText("Background image", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Recommended: desktop 2560 × 1440 (16:9); phone 1440 × 2560 (9:16). Use JPG or PNG",
        { exact: true },
      ),
    ).toBeVisible();

    const opacitySlider = page.getByRole("slider", { name: "Background image opacity" });
    await expect(opacitySlider).toHaveAttribute("aria-valuenow", "70");
    const sliderBounds = await opacitySlider.boundingBox();
    if (!sliderBounds) {
      throw new Error("Background image opacity slider has no layout bounds");
    }
    const thumbRadius = 10;
    const usableWidth = sliderBounds.width - thumbRadius * 2;
    const startX = sliderBounds.x + thumbRadius + usableWidth * 0.7;
    const targetX = sliderBounds.x + thumbRadius + usableWidth * 0.35;
    const centerY = sliderBounds.y + sliderBounds.height / 2;
    await page.mouse.move(startX, centerY);
    await page.mouse.down();
    await page.mouse.move(targetX, centerY, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText("35%", { exact: true })).toBeVisible();
    await expect(page.getByTestId("background-image-layer-image")).toHaveCSS("opacity", "0.35");
  });
});
