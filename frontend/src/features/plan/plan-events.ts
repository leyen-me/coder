export const PLAN_FILE_UPDATED_EVENT = "plan-file-updated";

export type PlanFileUpdatedDetail = {
  path: string;
  name: string;
  action: "created" | "updated" | "deleted";
};

export function emitPlanFileUpdated(detail: PlanFileUpdatedDetail): void {
  window.dispatchEvent(
    new CustomEvent<PlanFileUpdatedDetail>(PLAN_FILE_UPDATED_EVENT, { detail })
  );
}

export function subscribePlanFileUpdated(
  listener: (detail: PlanFileUpdatedDetail) => void
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<PlanFileUpdatedDetail>;
    if (customEvent.detail) {
      listener(customEvent.detail);
    }
  };

  window.addEventListener(PLAN_FILE_UPDATED_EVENT, handler);
  return () => {
    window.removeEventListener(PLAN_FILE_UPDATED_EVENT, handler);
  };
}
