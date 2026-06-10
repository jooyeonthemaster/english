"use client";

import { Player } from "@remotion/player";

import {
  RESTORE_TUT_FPS,
  RESTORE_TUT_H,
  RESTORE_TUT_TOTAL,
  RESTORE_TUT_W,
  RestoreTutorialVideo,
} from "./restore-tutorial-video";

export function RestoreTutorialPlayer() {
  return (
    <Player
      component={RestoreTutorialVideo}
      durationInFrames={RESTORE_TUT_TOTAL}
      fps={RESTORE_TUT_FPS}
      compositionWidth={RESTORE_TUT_W}
      compositionHeight={RESTORE_TUT_H}
      loop
      autoPlay
      controls
      clickToPlay
      doubleClickToFullscreen
      initiallyMuted
      acknowledgeRemotionLicense
      style={{
        width: "100%",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
      }}
    />
  );
}

export default RestoreTutorialPlayer;
