import { cn } from "@/lib/utils";
import { FlaskConicalIcon } from "lucide-react";

type HandoffPreviewBannerProps = {
  hint: string;
  className?: string;
};

export function HandoffPreviewBanner({ hint, className }: HandoffPreviewBannerProps) {
  return (
    <div
      className={cn(
        "border-amber-500/30 border-b bg-amber-500/10 px-4 py-2 text-amber-950 dark:text-amber-100",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl items-start gap-2 text-sm">
        <FlaskConicalIcon className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">Handoff UI 预览（Mock）</p>
          <p className="text-amber-900/80 leading-relaxed dark:text-amber-100/80">
            {hint}。修改{" "}
            <code className="rounded bg-background/60 px-1 py-0.5 text-xs">
              src/features/chat/lib/handoff/mock-handoff-preview.ts
            </code>{" "}
            顶部常量即可切换或关闭。
          </p>
        </div>
      </div>
    </div>
  );
}
