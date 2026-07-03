import { useEffect, useMemo, useState } from "react";
import { HashIcon, MessageSquareIcon, SearchXIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { paths } from "@/app/paths";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { HighlightText } from "@/components/ui/highlight-text";
import { Spinner } from "@/components/ui/spinner";
import { useChatSearch } from "@/features/chat/hooks/use-chat-search";
import { formatRelativeTime, type ChatSearchResult } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";

type SearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SearchResultSnippet({ text, query }: { text: string; query: string }) {
  return (
    <span className="truncate text-xs text-muted-foreground">
      <HighlightText text={text} query={query} />
    </span>
  );
}

function SearchResultItem({
  result,
  query,
}: {
  result: ChatSearchResult;
  query: string;
}) {
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
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
        <span className="truncate text-sm font-medium">
          <HighlightText text={result.title} query={query} />
        </span>
        {result.snippet ? (
          <SearchResultSnippet text={result.snippet} query={query} />
        ) : null}
      </div>
      <span className="shrink-0 self-start pt-0.5 text-[11px] text-muted-foreground">
        {relativeTime}
      </span>
    </>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <SearchXIcon className="size-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">
        {hasQuery ? t("search.empty") : t("search.hint")}
      </p>
    </div>
  );
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { results, loading, error } = useChatSearch(query, open);
  const hasQuery = query.trim().length > 0;

  // Split results into sessions and messages for grouped display
  const { sessionResults, messageResults } = useMemo(() => {
    const sessions: ChatSearchResult[] = [];
    const messages: ChatSearchResult[] = [];
    for (const r of results) {
      if (r.kind === "session") {
        sessions.push(r);
      } else {
        messages.push(r);
      }
    }
    return { sessionResults: sessions, messageResults: messages };
  }, [results]);

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

        <CommandList className="max-h-96 pb-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              <span>{t("search.loading")}</span>
            </div>
          ) : error ? (
            <p className="px-5 py-10 text-sm text-destructive">{error}</p>
          ) : results.length === 0 ? (
            <EmptyState hasQuery={hasQuery} />
          ) : (
            <>
              {sessionResults.length > 0 && (
                <CommandGroup heading={t("search.sessionResults")}>
                  {sessionResults.map((result) => (
                    <CommandItem
                      key={`session-${result.sessionId}`}
                      value={`session-${result.sessionId}`}
                      onSelect={() => handleSelect(result.sessionId)}
                      className="gap-3 px-4 py-2.5"
                    >
                      <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
                      <SearchResultItem result={result} query={query} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {messageResults.length > 0 && (
                <CommandGroup heading={t("search.messageResults")}>
                  {messageResults.map((result) => (
                    <CommandItem
                      key={`message-${result.sessionId}-${result.messageId}`}
                      value={`message-${result.sessionId}-${result.messageId ?? ""}`}
                      onSelect={() => handleSelect(result.sessionId)}
                      className="gap-3 px-4 py-2.5"
                    >
                      <HashIcon className="size-4 shrink-0 text-muted-foreground/60" />
                      <SearchResultItem result={result} query={query} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
