"use client";

import { Player } from "@remotion/player";

import {
  GENERATE_TOUR_FPS,
  GENERATE_TOUR_H,
  GENERATE_TOUR_TOTAL,
  GENERATE_TOUR_W,
  GenerateTourVideo,
  type GenerateTourVariant,
} from "./generate-tour-video";

export function GenerateTourPlayer({
  variant = "overview",
}: {
  variant?: GenerateTourVariant;
}) {
  return (
    <Player
      component={GenerateTourVideo}
      inputProps={{ variant }}
      durationInFrames={GENERATE_TOUR_TOTAL}
      fps={GENERATE_TOUR_FPS}
      compositionWidth={GENERATE_TOUR_W}
      compositionHeight={GENERATE_TOUR_H}
      loop
      autoPlay
      clickToPlay
      initiallyMuted
      style={{
        width: "100%",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
      }}
    />
  );
}

export default GenerateTourPlayer;
