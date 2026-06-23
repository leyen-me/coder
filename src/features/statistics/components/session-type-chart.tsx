import { useTranslation } from "@/lib/i18n/locale-provider";
import type { AutonomyModeCount, SessionTypeCount } from "@/lib/db/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Props = {
  sessionKind: SessionTypeCount[];
  autonomyMode: AutonomyModeCount[];
};

export function SessionTypeChart({ sessionKind, autonomyMode }: Props) {
  const { t } = useTranslation();

  const kindData = sessionKind.length > 0 ? sessionKind : [{ sessionKind: "—", count: 0 }];
  const modeData = autonomyMode.length > 0 ? autonomyMode : [{ autonomyMode: "—", count: 0 }];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t("statistics.sessionType")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kindData.map((d) => ({ name: d.sessionKind, count: d.count }))}>
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t("statistics.autonomyMode")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modeData.map((d) => ({ name: d.autonomyMode, count: d.count }))}>
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
