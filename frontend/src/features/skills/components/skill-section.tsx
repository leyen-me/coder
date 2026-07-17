import type { ReactNode } from "react";

type SkillSectionProps = {
  title?: string;
  description?: ReactNode;
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
      {title || description || action ? (
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-medium tracking-tight">{title}</h2>
            {description ? (
              <div className="text-sm text-muted-foreground">{description}</div>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
