import type { ReactNode } from "react";

type SkillSectionProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function SkillSection({
  title,
  description,
  action,
  children,
}: SkillSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-medium tracking-tight">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
