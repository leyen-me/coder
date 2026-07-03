import type { AttachmentData } from "@/components/ai-elements/attachments";
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
  getAttachmentLabel,
  getMediaCategory,
} from "@/components/ai-elements/attachments";
import {
  PromptInputHeader,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { memo, useCallback } from "react";

type ComposerAttachmentItemProps = {
  attachment: AttachmentData;
  onRemove: (id: string) => void;
  removeLabel: string;
};

const ComposerAttachmentItem = memo(
  ({ attachment, onRemove, removeLabel }: ComposerAttachmentItemProps) => {
    const handleRemove = useCallback(
      () => onRemove(attachment.id),
      [onRemove, attachment.id]
    );
    const mediaCategory = getMediaCategory(attachment);
    const label = getAttachmentLabel(attachment);

    return (
      <AttachmentHoverCard>
        <AttachmentHoverCardTrigger asChild>
          <Attachment data={attachment} onRemove={handleRemove}>
            <div className="relative size-5 shrink-0">
              <div className="absolute inset-0 transition-opacity group-hover:opacity-0">
                <AttachmentPreview />
              </div>
              <AttachmentRemove
                className="absolute inset-0"
                label={removeLabel}
              />
            </div>
            <AttachmentInfo />
          </Attachment>
        </AttachmentHoverCardTrigger>
        <AttachmentHoverCardContent>
          <div className="space-y-3">
            {mediaCategory === "image" &&
              attachment.type === "file" &&
              attachment.url && (
                <div className="flex max-h-96 w-80 items-center justify-center overflow-hidden rounded-md border">
                  <img
                    alt={label}
                    className="max-h-full max-w-full object-contain"
                    height={384}
                    src={attachment.url}
                    width={320}
                  />
                </div>
              )}
            <div className="space-y-1 px-0.5">
              <h4 className="font-semibold text-sm leading-none">{label}</h4>
              {attachment.mediaType && (
                <p className="font-mono text-muted-foreground text-xs">
                  {attachment.mediaType}
                </p>
              )}
            </div>
          </div>
        </AttachmentHoverCardContent>
      </AttachmentHoverCard>
    );
  }
);

ComposerAttachmentItem.displayName = "ComposerAttachmentItem";

export function PromptComposerAttachmentsHeader() {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();

  const handleRemove = useCallback(
    (id: string) => attachments.remove(id),
    [attachments]
  );

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <PromptInputHeader className="border-b border-border/60 bg-card px-3 py-2">
      <Attachments className="gap-1.5" variant="inline">
        {attachments.files.map((file) => (
          <ComposerAttachmentItem
            attachment={file}
            key={file.id}
            onRemove={handleRemove}
            removeLabel={t("chat.removeAttachment")}
          />
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}
