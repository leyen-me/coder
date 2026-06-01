import type { ReactNode } from "react";

type SettingRowProps = {
  label: string;
  description?: string;
  control: ReactNode;
};

export function SettingRow({ label, description, control }: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-8 py-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{label}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
