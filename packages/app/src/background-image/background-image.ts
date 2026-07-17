import type { Theme } from "@/styles/theme";

export const DEFAULT_BACKGROUND_IMAGE_OPACITY = 0.2;

export interface BackgroundImage {
  uri: string;
  fileName: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }
  if ([...trimmed].some((char) => char.charCodeAt(0) <= 0x1f)) {
    return null;
  }
  return trimmed;
}

export function normalizeBackgroundImage(value: unknown): BackgroundImage | null {
  if (!isRecord(value)) {
    return null;
  }
  const uri = cleanString(value.uri, 512);
  const fileName = cleanString(value.fileName, 200);
  if (!uri || !fileName) {
    return null;
  }

  try {
    const parsed = new URL(uri);
    if (
      parsed.protocol !== "paseo:" ||
      parsed.hostname !== "background-images" ||
      !/^\/background-[0-9a-f-]{36}\.(?:png|jpe?g|webp|gif|avif)$/i.test(parsed.pathname)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { uri, fileName };
}

export function parseBackgroundImageOpacity(value: unknown): number | null {
  let parsed = Number.NaN;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string" && value.trim().length > 0) {
    parsed = Number(value);
  }
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(1, Math.max(0, parsed));
}

export function applyBackgroundImageCanvas<TTheme extends Theme>(
  theme: TTheme,
  enabled: boolean,
): TTheme {
  if (!enabled) {
    return theme;
  }
  return {
    ...theme,
    colors: {
      ...theme.colors,
      surface0: "transparent",
      surfaceWorkspace: "transparent",
      background: "transparent",
    },
  } as TTheme;
}
