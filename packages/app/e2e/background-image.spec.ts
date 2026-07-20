import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gotoAppShell, openSettings } from "./helpers/app";
import { openAgentRoute, seedMockAgentWorkspace } from "./helpers/mock-agent";
import { openSettingsSection } from "./helpers/settings";
import { TerminalE2EHarness } from "./helpers/terminal-dsl";

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

interface OpaqueCoveringAncestor {
  backgroundColor: string;
  className: string;
  testId: string | null;
}

async function findOpaqueConversationCoveringAncestors(
  page: Page,
): Promise<OpaqueCoveringAncestor[]> {
  return await page.evaluate(() => {
    const node = document.querySelector('[data-testid="agent-conversation-panel"]');
    if (!(node instanceof HTMLElement)) {
      return [{ backgroundColor: "missing", className: "", testId: null }];
    }
    const nodeRect = node.getBoundingClientRect();
    const coveringAncestors = [];
    let current: HTMLElement | null = node;
    while (current && current.id !== "root") {
      const rect = current.getBoundingClientRect();
      const backgroundColor = getComputedStyle(current).backgroundColor;
      const alphaMatch = backgroundColor.match(
        /^rgba?\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/,
      );
      const alpha = alphaMatch?.[1] === undefined ? 1 : Number(alphaMatch[1]);
      const coversNode =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.left <= nodeRect.left &&
        rect.top <= nodeRect.top &&
        rect.right >= nodeRect.right &&
        rect.bottom >= nodeRect.bottom;
      if (coversNode && alpha === 1) {
        coveringAncestors.push({
          backgroundColor,
          className: current.className,
          testId: current.dataset.testid ?? null,
        });
      }
      if (current.dataset.testid === "app-root-surface") {
        break;
      }
      current = current.parentElement;
    }
    return coveringAncestors;
  });
}

async function seedBackgroundImageInPage(input: {
  backgroundImage: typeof BACKGROUND_IMAGE;
  imageBase64: string;
  opacity?: number;
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
      theme: "dark",
      backgroundImage: input.backgroundImage,
      backgroundImageOpacity: input.opacity ?? 70,
    }),
  );
}

test.describe("Background image", () => {
  test("renders a persisted image through the app surfaces", async ({ page }) => {
    await gotoAppShell(page);
    await page.evaluate(seedBackgroundImageInPage, {
      backgroundImage: BACKGROUND_IMAGE,
      imageBase64: BACKGROUND_PNG_BASE64,
    });

    await page.reload();
    await expect(page.getByTestId("background-image-layer-image")).toBeVisible();
    await expect(page.getByTestId("app-root-surface")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(page.getByTestId("app-container")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(page.getByTestId("desktop-workspaces-sidebar")).toHaveCSS(
      "background-color",
      "rgba(20, 23, 22, 0.72)",
    );
    await openSettings(page);
    await openSettingsSection(page, "appearance");

    await expect(page.getByText("Background image", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Recommended: desktop 2560 × 1440 (16:9); phone 1440 × 2560 (9:16). Use JPG or PNG",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText("70%", { exact: true })).toBeVisible();

    const opacitySlider = page.getByRole("slider", { name: "Background image opacity" });
    const sliderBounds = await opacitySlider.boundingBox();
    if (!sliderBounds) {
      throw new Error("Background image opacity slider has no layout bounds");
    }
    const thumbRadius = 10;
    const usableWidth = sliderBounds.width - thumbRadius * 2;
    await opacitySlider.click({
      position: {
        x: thumbRadius + usableWidth * 0.35,
        y: sliderBounds.height / 2,
      },
    });
    await expect(page.getByText("35%", { exact: true })).toBeVisible();
    await expect(page.getByTestId("background-image-layer-image")).toHaveCSS("opacity", "0.35");
  });

  test("keeps app surfaces opaque when image opacity is zero", async ({ page }) => {
    await gotoAppShell(page);
    await page.evaluate(seedBackgroundImageInPage, {
      backgroundImage: BACKGROUND_IMAGE,
      imageBase64: BACKGROUND_PNG_BASE64,
      opacity: 0,
    });

    await page.reload();
    await expect(page.getByTestId("background-image-layer-image")).toBeVisible();
    await expect(page.getByTestId("background-image-layer-image")).toHaveCSS("opacity", "0");
    await expect(page.getByTestId("app-root-surface")).toHaveCSS(
      "background-color",
      "rgb(24, 27, 26)",
    );
    await expect(page.getByTestId("app-container")).toHaveCSS(
      "background-color",
      "rgb(24, 27, 26)",
    );
    await expect(page.getByTestId("desktop-workspaces-sidebar")).toHaveCSS(
      "background-color",
      "rgb(20, 23, 22)",
    );
  });

  test("keeps app surfaces opaque when the persisted image is missing", async ({ page }) => {
    await gotoAppShell(page);
    await page.evaluate((backgroundImage) => {
      localStorage.setItem(
        "@paseo:app-settings",
        JSON.stringify({
          theme: "dark",
          backgroundImage,
          backgroundImageOpacity: 70,
        }),
      );
    }, BACKGROUND_IMAGE);

    await page.reload();
    await expect(page.getByTestId("background-image-layer-image")).toHaveCount(0);
    await expect(page.getByTestId("app-root-surface")).toHaveCSS(
      "background-color",
      "rgb(24, 27, 26)",
    );
    await expect(page.getByTestId("app-container")).toHaveCSS(
      "background-color",
      "rgb(24, 27, 26)",
    );
  });

  test("keeps the active conversation surface transparent", async ({ page }) => {
    const agent = await seedMockAgentWorkspace({
      repoPrefix: "background-image-agent-",
      title: "Background image agent",
    });

    try {
      await gotoAppShell(page);
      await page.evaluate(seedBackgroundImageInPage, {
        backgroundImage: BACKGROUND_IMAGE,
        imageBase64: BACKGROUND_PNG_BASE64,
      });
      await page.reload();
      await expect(page.getByTestId("background-image-layer-image")).toBeVisible();

      await openAgentRoute(page, agent);
      await expect(page.getByTestId("background-image-layer-image")).toBeVisible();
      await expect(page.getByTestId("workspace-split-pane")).toBeVisible();
      await expect(page.getByTestId("workspace-center-content")).toBeVisible();
      await expect(page.getByTestId("agent-conversation-panel")).toBeVisible();
      await expect(page.getByTestId("agent-conversation-stream")).toBeVisible();
      await expect.poll(() => findOpaqueConversationCoveringAncestors(page)).toEqual([]);
      await expect(page.getByTestId("workspace-split-pane")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(page.getByTestId("workspace-center-content")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(page.getByTestId("agent-conversation-panel")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(page.getByTestId("agent-conversation-stream")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
    } finally {
      await agent.cleanup();
    }
  });

  test("keeps a new draft conversation surface transparent", async ({ page, withWorkspace }) => {
    const workspace = await withWorkspace({ prefix: "background-image-draft-" });

    await gotoAppShell(page);
    await page.evaluate(seedBackgroundImageInPage, {
      backgroundImage: BACKGROUND_IMAGE,
      imageBase64: BACKGROUND_PNG_BASE64,
    });
    await page.reload();
    await expect(page.getByTestId("background-image-layer-image")).toBeVisible();

    await workspace.navigateTo();
    await expect(page.getByTestId("workspace-split-pane")).toBeVisible();
    await expect(page.getByTestId("draft-conversation-panel")).toBeVisible();
    await expect(page.getByTestId("workspace-split-pane")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(page.getByTestId("draft-conversation-panel")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  });

  test("keeps the terminal renderer transparent", async ({ page }) => {
    const harness = await TerminalE2EHarness.create({
      tempPrefix: "background-image-terminal-",
    });
    const terminal = await harness.createTerminal({ name: "background-image" });

    try {
      await gotoAppShell(page);
      await page.evaluate(seedBackgroundImageInPage, {
        backgroundImage: BACKGROUND_IMAGE,
        imageBase64: BACKGROUND_PNG_BASE64,
      });
      await page.reload();
      await expect(page.getByTestId("background-image-layer-image")).toBeVisible();

      await harness.openTerminal(page, { terminalId: terminal.id });
      await expect(harness.terminalSurface(page)).toBeVisible();
      await expect(page.getByTestId("terminal-output-container")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(harness.terminalSurface(page)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    } finally {
      await harness.killTerminal(terminal.id);
      await harness.cleanup();
    }
  });
});
