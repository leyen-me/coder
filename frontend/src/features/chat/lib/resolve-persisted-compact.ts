import type { MessageRecord } from "@/lib/db";

import { compactPreviewFromContent } from "../components/compact-separator";

export function compactPreviewFromMessage(message: MessageRecord): string {
  return compactPreviewFromContent(message.content);
}
