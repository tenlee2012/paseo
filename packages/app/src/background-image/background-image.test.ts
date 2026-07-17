import { describe, expect, it } from "vitest";
import type { Theme } from "@/styles/theme";
import {
  applyBackgroundImageCanvas,
  normalizeBackgroundImage,
  parseBackgroundImageOpacity,
} from "./background-image";

describe("desktop background image settings", () => {
  it("accepts only managed desktop background image URLs", () => {
    expect(
      normalizeBackgroundImage({
        uri: "paseo://background-images/background-123e4567-e89b-12d3-a456-426614174000.png",
        fileName: "wallpaper.png",
      }),
    ).toEqual({
      uri: "paseo://background-images/background-123e4567-e89b-12d3-a456-426614174000.png",
      fileName: "wallpaper.png",
    });
    expect(
      normalizeBackgroundImage({
        uri: "file:///tmp/wallpaper.png",
        fileName: "wallpaper.png",
      }),
    ).toBeNull();
  });

  it("clamps background image opacity", () => {
    expect(parseBackgroundImageOpacity(-1)).toBe(0);
    expect(parseBackgroundImageOpacity("0.35")).toBe(0.35);
    expect(parseBackgroundImageOpacity(2)).toBe(1);
    expect(parseBackgroundImageOpacity("bad")).toBeNull();
  });

  it("makes only the main canvas transparent for a background image", () => {
    const theme = {
      colors: {
        surface0: "#ffffff",
        surface1: "#fafafa",
        surfaceWorkspace: "#ffffff",
        background: "#ffffff",
      },
    } as unknown as Theme;

    const themed = applyBackgroundImageCanvas(theme, true);

    expect(themed.colors.surface0).toBe("transparent");
    expect(themed.colors.surfaceWorkspace).toBe("transparent");
    expect(themed.colors.background).toBe("transparent");
    expect(themed.colors.surface1).toBe("#fafafa");
  });
});
