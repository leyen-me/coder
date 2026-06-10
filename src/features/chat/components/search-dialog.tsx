import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { paths } from "@/app/paths";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { useChatSearch } from "@/features/chat/hooks/use-chat-search";
import { formatRelativeTime, type ChatSearchResult } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";

type SearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SearchResultItem({ result }: { result: ChatSearchResult }) {
  const { t } = useTranslation();
  const relativeTime = formatRelativeTime(result.updatedAt, Date.now(), {
    justNow: t("time.justNow"),
    minutesAgo: (count) => t("time.minutesAgo", { count }),
    hoursAgo: (count) => t("time.hoursAgo", { count }),
    daysAgo: (count) => t("time.daysAgo", { count }),
    weeksAgo: (count) => t("time.weeksAgo", { count }),
    monthsAgo: (count) => t("time.monthsAgo", { count }),
  });

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{result.title}</span>
        {result.snippet ? (
          <span className="truncate text-xs text-muted-foreground">
            {result.snippet}
          </span>
        ) : null}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {relativeTime}
      </span>
    </>
  );
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { results, loading, error } = useChatSearch(query, open);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const handleSelect = (sessionId: string) => {
    onOpenChange(false);
    navigate(paths.chat(sessionId));
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("search.title")}
      description={t("search.hint")}
      className="sm:max-w-2xl"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder={t("search.placeholder")}
          value={query}
          onValueChange={setQuery}
        />

        <CommandList className="max-h-80">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              <span>{t("search.loading")}</span>
            </div>
          ) : error ? (
            <p className="px-5 py-8 text-sm text-destructive">{error}</p>
          ) : (
            <>
              <CommandEmpty>{t("search.empty")}</CommandEmpty>

              <CommandGroup
                heading={hasQuery ? t("search.results") : t("search.recent")}
              >
                {results.map((result) => (
                  <CommandItem
                    key={
                      result.kind === "message"
                        ? `message-${result.messageId}`
                        : `session-${result.sessionId}`
                    }
                    value={`${result.kind}-${result.sessionId}-${result.messageId ?? ""}`}
                    onSelect={() => {
                      handleSelect(result.sessionId);
                    }}
                  >
                    <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                    <SearchResultItem result={result} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
