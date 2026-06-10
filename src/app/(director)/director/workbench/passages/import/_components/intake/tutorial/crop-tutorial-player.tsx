"use client";

// @remotion/player로 CropTutorialVideo 컴포지션을 브라우저에서 재생(자동·반복).
import { Player } from "@remotion/player";

import {
  CropTutorialVideo,
  TUT_FPS,
  TUT_H,
  TUT_TOTAL,
  TUT_W,
} from "./crop-tutorial-video";

export function CropTutorialPlayer() {
  return (
    <Player
      component={CropTutorialVideo}
      durationInFrames={TUT_TOTAL}
      fps={TUT_FPS}
      compositionWidth={TUT_W}
      compositionHeight={TUT_H}
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

export default CropTutorialPlayer;
