import { ChevronRightIcon } from "lucide-react";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import {
  collapseWorkspacePickerBreadcrumb,
  splitWorkspacePickerPath,
} from "./split-workspace-picker-path";

type WorkspacePickerBreadcrumbProps = {
  currentPath: string;
  isAtRootListing: boolean;
  locationsLabel: string;
  onNavigate: (path: string) => void;
};

export function WorkspacePickerBreadcrumb({
  currentPath,
  isAtRootListing,
  locationsLabel,
  onNavigate,
}: WorkspacePickerBreadcrumbProps) {
  const items = collapseWorkspacePickerBreadcrumb(splitWorkspacePickerPath(currentPath));

  return (
    <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border/70 px-3 py-2">
      <Breadcrumb className="min-w-max">
        <BreadcrumbList className="flex-nowrap">
          {isAtRootListing ? (
            <BreadcrumbItem>
              <BreadcrumbPage>{locationsLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          ) : (
            items.map((item, index) => {
              const isLast = index === items.length - 1;

              if (item.kind === "ellipsis") {
                return (
                  <Fragment key="ellipsis">
                    <BreadcrumbItem>
                      <BreadcrumbEllipsis />
                    </BreadcrumbItem>
                    <BreadcrumbSeparator>
                      <ChevronRightIcon />
                    </BreadcrumbSeparator>
                  </Fragment>
                );
              }

              return (
                <Fragment key={item.path}>
                  <BreadcrumbItem className="min-w-0">
                    {isLast ? (
                      <BreadcrumbPage className="max-w-40 truncate" title={item.label}>
                        {item.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        className="max-w-32 cursor-pointer truncate"
                        onClick={() => {
                          onNavigate(item.path);
                        }}
                        title={item.label}
                      >
                        {item.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast ? (
                    <BreadcrumbSeparator>
                      <ChevronRightIcon />
                    </BreadcrumbSeparator>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
