import type { AttachmentMetadata } from "@/attachments/types";

export interface BackgroundImageMetadata extends AttachmentMetadata {}

export function isBackgroundImageMetadata(value: unknown): value is BackgroundImageMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.storageType === "string" &&
    typeof record.storageKey === "string" &&
    typeof record.createdAt === "number"
  );
}
