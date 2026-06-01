import type { ReactNode } from "react";

type SettingFieldProps = {
  label: string;
  description?: string;
  children: ReactNode;
};

export function SettingField({ label, description, children }: SettingFieldProps) {
  return (
    <div className="space-y-2 py-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
