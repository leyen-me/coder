import { useCallback } from "react";
import {
  Plus,
  Search,
  Settings,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useMatch } from "react-router-dom";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import { paths } from "@/app/paths";
import { APP_SIDEBAR_WIDTH_PX } from "@/components/layout/constants";
import { TitleBarDragRegion } from "@/components/layout/title-bar-drag-region";
import { Separator } from "@/components/ui/separator";
import { useGeneratingSessionTitles } from "@/features/agent/session-title-store";
import { useRunningSessionIds } from "@/features/agent/store/agent-store";
import { useChatSessions } from "@/features/chat/hooks/use-chat-sessions";
import { deleteSession, getMessagesBySession, getSession, pinSession, unpinSession, updateSessionTitle } from "@/lib/db";
import { useLocale } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useSearchDialog } from "@/features/keyboard-shortcuts/search-dialog-context";

import { ChatHistoryList } from "./chat-history-list";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarThemeToggle } from "./sidebar-theme-toggle";

type AppSidebarProps = {
  open: boolean;
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().replace("T", " ").slice(0, 19);
}

function formatRole(role: string): string {
  return role === "user" ? "User" : "Assistant";
}

/** Strip characters that are invalid or undesirable in filenames. */
function sanitizeFilename(name: string): string {
  return name
    .replaceAll(/[/\\:*?"<>|…]/g, "") // remove OS-invalid filename chars & ellipsis
    .replaceAll(/\s+/g, " ") // collapse whitespace
    .trim();
}

async function exportSessionAsMarkdown(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) return false;

  const messages = await getMessagesBySession(sessionId);

  const lines: string[] = [];

  // Title
  lines.push(`# ${session.title}`);
  lines.push("");

  // Metadata
  lines.push(`- **Model**: ${session.model}`);
  lines.push(`- **Created**: ${formatDate(session.createdAt)}`);
  lines.push(`- **Messages**: ${messages.length}`);
  if (session.workspaceDir) {
    lines.push(`- **Workspace**: \`${session.workspaceDir}\``);
  }
  lines.push("");

  // Messages
  for (const message of messages) {
    lines.push("---");
    lines.push("");
    lines.push(`## ${formatRole(message.role)}`);
    lines.push("");

    if (message.content) {
      lines.push(message.content);
      lines.push("");
    }

    if (message.thinking) {
      lines.push("> **Thinking**");
      lines.push(">");
      lines.push(`> ${message.thinking.replace(/\n/g, "\n> ")}`);
      lines.push("");
    }

    if (message.toolInvocations && message.toolInvocations.length > 0) {
      lines.push("### Tool Calls");
      for (const tool of message.toolInvocations) {
        lines.push(`- \`${tool.name}\` (${tool.state})`);
      }
      lines.push("");
    }
  }

  const markdown = lines.join("\n");
  const cleanTitle = sanitizeFilename(session.title || "");
  const defaultName = cleanTitle ? `${cleanTitle}.md` : `${sessionId}.md`;

  const filePath = await save({
    defaultPath: defaultName,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!filePath) return false; // user cancelled

  await invoke("write_text_file", { targetPath: filePath, content: markdown });
  return true;
}

export function AppSidebar({ open }: AppSidebarProps) {
  const { t } = useLocale();
  const { sessions, refresh } = useChatSessions();
  const generatingTitleIds = useGeneratingSessionTitles();
  const runningSessionIds = useRunningSessionIds();
  const { open: openSearch } = useSearchDialog();

  const chatMatch = useMatch("/chat/:chatId");
  const selectedChatId =
    chatMatch?.params.chatId && chatMatch.params.chatId !== "new"
      ? chatMatch.params.chatId
      : null;

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      await refresh();
      toast.success(t("sidebar.deleteChatSuccess"));
    },
    [refresh, t]
  );

  const handleExportSession = useCallback(
    async (sessionId: string) => {
      try {
        const exported = await exportSessionAsMarkdown(sessionId);
        if (exported) {
          toast.success(t("sidebar.exportChatSuccess"));
        }
      } catch (error) {
        console.error("Failed to export session:", error);
      }
    },
    [t]
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      await updateSessionTitle(sessionId, title);
      await refresh();
    },
    [refresh]
  );

  const handlePinSession = useCallback(
    async (sessionId: string) => {
      await pinSession(sessionId);
      await refresh();
    },
    [refresh]
  );

  const handleUnpinSession = useCallback(
    async (sessionId: string) => {
      await unpinSession(sessionId);
      await refresh();
    },
    [refresh]
  );

  return (
    <>
      <div
        style={{ width: open ? APP_SIDEBAR_WIDTH_PX : 0 }}
        className={cn(
          "flex h-full shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width,border-color] duration-300 ease-in-out",
          !open && "border-transparent"
        )}
        aria-hidden={!open}
      >
        <aside
          style={{ width: APP_SIDEBAR_WIDTH_PX }}
          className={cn(
            "flex h-full flex-col text-sidebar-foreground transition-opacity duration-300 ease-in-out",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <TitleBarDragRegion className="h-11 w-full shrink-0 flex-none" />

          <nav className="flex shrink-0 flex-col gap-0.5 px-2 pb-2">
            <SidebarNavItem
              icon={Plus}
              label={t("sidebar.newChat")}
              shortcutActionId="global.newChat"
              to={paths.chatNew}
              end
            />
            <SidebarNavItem
              icon={Search}
              label={t("sidebar.search")}
              onClick={openSearch}
              shortcutActionId="global.search"
            />
            <SidebarNavItem
              icon={Sparkles}
              label={t("sidebar.skills")}
              shortcutActionId="global.skills"
              to={paths.skills}
            />
            <SidebarNavItem
              icon={Workflow}
              label={t("sidebar.automations")}
              shortcutActionId="global.automations"
              to={paths.automations}
            />
          </nav>

          <Separator className="bg-sidebar-border" />

          <ChatHistoryList
            items={sessions}
            selectedId={selectedChatId}
            generatingTitleIds={generatingTitleIds}
            runningSessionIds={runningSessionIds}
            onDeleteSession={handleDeleteSession}
            onExportSession={handleExportSession}
            onRenameSession={handleRenameSession}
            onPinSession={handlePinSession}
            onUnpinSession={handleUnpinSession}
          />

          <div className="flex shrink-0 flex-col gap-0.5 border-t border-sidebar-border p-2">
            <SidebarThemeToggle />
            <SidebarNavItem
              icon={Settings}
              label={t("sidebar.settings")}
              shortcutActionId="global.settings"
              to={paths.settings}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
