import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { MessageTrendItem } from "@/lib/db/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Props = { data: MessageTrendItem[] };

export function MessageTrendChart({ data }: Props) {
  const { t } = useTranslation();

  const chartData = useMemo(
    () =>
      data.length > 0
        ? data
        : [{ date: "—", userCount: 0, assistantCount: 0 }],
    [data]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t("statistics.messageTrend")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="userCount"
                name="User"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="assistantCount"
                name="Assistant"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
