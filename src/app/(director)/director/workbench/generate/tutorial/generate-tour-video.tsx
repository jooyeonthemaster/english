"use client";

import { useCurrentFrame } from "remotion";
import type { GenerateTourVariant } from "./generate-tour-video-constants";
import { PasteScene, UploadScene } from "./generate-tour-video-scenes-base";
import { LibraryScene, OverviewScene, PreciseScene, ResultsScene, WorkspaceScene } from "./generate-tour-video-scenes-flow";

export {
  GENERATE_TOUR_FPS,
  GENERATE_TOUR_H,
  GENERATE_TOUR_TOTAL,
  GENERATE_TOUR_W,
} from "./generate-tour-video-constants";
export type {
  GenerateTourVariant,
} from "./generate-tour-video-constants";
export function GenerateTourVideo({
  variant = "overview",
}: {
  variant?: GenerateTourVariant;
}) {
  const frame = useCurrentFrame();
  if (variant === "file") return <UploadScene frame={frame} />;
  if (variant === "paste") return <PasteScene frame={frame} />;
  if (variant === "workspace") return <WorkspaceScene frame={frame} />;
  if (variant === "precise") return <PreciseScene frame={frame} />;
  if (variant === "results") return <ResultsScene frame={frame} />;
  if (variant === "library") return <LibraryScene frame={frame} />;
  return <OverviewScene frame={frame} />;
}
