import { useTranslation } from "@/lib/i18n/locale-provider";
import type { ToolUsageItem } from "@/lib/db/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Props = { data: ToolUsageItem[] };

export function ToolRankingChart({ data }: Props) {
  const { t } = useTranslation();
  const chartData = data.length > 0 ? data : [{ name: "—", count: 0 }];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t("statistics.toolRanking")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={100}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
