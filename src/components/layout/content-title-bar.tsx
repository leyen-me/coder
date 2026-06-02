import { TITLE_BAR_CLASS } from "./constants";
import { TitleBarDragRegion } from "./title-bar-drag-region";
import { WindowControls } from "./window-controls";

/** Drag region and window controls for the main content column. */
export function ContentTitleBar() {
  return (
    <div
      className={`flex ${TITLE_BAR_CLASS} shrink-0 items-stretch overflow-hidden`}
    >
      <TitleBarDragRegion />
      <WindowControls />
    </div>
  );
}
