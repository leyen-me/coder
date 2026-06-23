import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  className?: string;
};

export function StatCard({ label, value, icon, className }: StatCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="flex items-center gap-3 p-4">
        {icon && <div className="shrink-0 text-muted-foreground">{icon}</div>}
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
