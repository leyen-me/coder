import type { ReactNode } from "react";

import { ContentTitleBar } from "./content-title-bar";

type MainColumnProps = {
  children: ReactNode;
};

/** Right-hand shell column: content title bar plus routed page content. */
export function MainColumn({ children }: MainColumnProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ContentTitleBar />
      {children}
    </div>
  );
}
