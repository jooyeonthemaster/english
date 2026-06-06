"use client";

import { Player } from "@remotion/player";

import {
  TEXT_TUT_FPS,
  TEXT_TUT_H,
  TEXT_TUT_TOTAL,
  TEXT_TUT_W,
  TextTutorialVideo,
} from "./text-tutorial-video";

export function TextTutorialPlayer({
  mode = "verbatim",
}: {
  mode?: "verbatim" | "restored";
}) {
  return (
    <Player
      component={TextTutorialVideo}
      inputProps={{ mode }}
      durationInFrames={TEXT_TUT_TOTAL}
      fps={TEXT_TUT_FPS}
      compositionWidth={TEXT_TUT_W}
      compositionHeight={TEXT_TUT_H}
      loop
      autoPlay
      controls
      clickToPlay
      doubleClickToFullscreen
      initiallyMuted
      style={{
        width: "100%",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
      }}
    />
  );
}

export default TextTutorialPlayer;
