import { useTranslation } from "@/lib/i18n/locale-provider";
import type { ActiveSessionItem } from "@/lib/db/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = { data: ActiveSessionItem[] };

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActiveSessionsTable({ data }: Props) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t("statistics.activeSessions")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("statistics.noData")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t("statistics.activeSessions")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("statistics.sessions")}</TableHead>
              <TableHead className="text-right">{t("statistics.messages")}</TableHead>
              <TableHead className="text-right">{t("statistics.tokens")}</TableHead>
              <TableHead className="text-right">{t("time.justNow")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s, i) => (
              <TableRow key={i}>
                <TableCell className="max-w-[200px] truncate font-medium">
                  {s.title}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.messageCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.totalTokens.toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatTime(s.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
