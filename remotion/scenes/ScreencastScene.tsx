/**
 * Plays a Playwright screen recording and overlays animations driven by the
 * timeline marks captured during recording (captions, zoom, highlight, chapter).
 *
 * The raw footage is full-res (1920x1080); "zoom" marks crop+scale the canvas
 * onto a target rect with a smooth spring, Ken-Burns style, so the final video
 * looks directed rather than like a flat screencast.
 */
import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { VIDEO_WIDTH, VIDEO_HEIGHT, COLORS, FONT_FAMILY } from "../utils/constants";
import type { GuideEntry, GuideMark } from "../guideManifest";

const ms2f = (ms: number, fps: number) => Math.round((ms / 1000) * fps);

type Rect = { x: number; y: number; width: number; height: number };

/** Resolve the active zoom rect (or null = full frame) for the current frame. */
function activeZoom(marks: GuideMark[], frame: number, fps: number): { rect: Rect; scale: number; sinceFrame: number } | null {
  let cur: { rect: Rect; scale: number; sinceFrame: number } | null = null;
  for (const m of marks) {
    const mf = ms2f(m.tMs, fps);
    if (mf > frame) break;
    if (m.type === "zoom") cur = { rect: m.rect, scale: m.scale ?? 1.8, sinceFrame: mf };
    else if (m.type === "zoom-out") cur = null;
  }
  return cur;
}

/** Resolve the active caption for the current frame. */
function activeCaption(marks: GuideMark[], frame: number, fps: number): { text: string; subtitle?: string; sinceFrame: number } | null {
  let cur: { text: string; subtitle?: string; sinceFrame: number } | null = null;
  for (const m of marks) {
    const mf = ms2f(m.tMs, fps);
    if (mf > frame) break;
    if (m.type === "caption") cur = { text: m.text, subtitle: m.subtitle, sinceFrame: mf };
    else if (m.type === "caption-clear" || m.type === "chapter") cur = null;
  }
  return cur;
}

function activeChapter(marks: GuideMark[], frame: number, fps: number): { text: string; sinceFrame: number } | null {
  // Chapter card shows for ~1.6s after a chapter mark.
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (m.type !== "chapter") continue;
    const mf = ms2f(m.tMs, fps);
    if (mf <= frame && frame < mf + Math.round(1.6 * fps)) return { text: m.text, sinceFrame: mf };
  }
  return null;
}

function activeHighlight(marks: GuideMark[], frame: number, fps: number): { rect: Rect; sinceFrame: number } | null {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (m.type !== "highlight") continue;
    const mf = ms2f(m.tMs, fps);
    if (mf <= frame && frame < mf + Math.round(1.8 * fps)) return { rect: m.rect, sinceFrame: mf };
  }
  return null;
}

export const ScreencastScene: React.FC<{ entry: GuideEntry }> = ({ entry }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const marks = entry.marks;

  // ── Zoom (Ken Burns) ──
  const zoom = activeZoom(marks, frame, fps);
  let scale = 1;
  let originX = 50;
  let originY = 50;
  if (zoom) {
    const t = spring({ frame: frame - zoom.sinceFrame, fps, config: { damping: 200, mass: 0.6 } });
    scale = interpolate(t, [0, 1], [1, zoom.scale]);
    originX = ((zoom.rect.x + zoom.rect.width / 2) / VIDEO_WIDTH) * 100;
    originY = ((zoom.rect.y + zoom.rect.height / 2) / VIDEO_HEIGHT) * 100;
  } else {
    // ease back toward full frame after a zoom-out
    scale = 1;
  }

  const caption = activeCaption(marks, frame, fps);
  const chapter = activeChapter(marks, frame, fps);
  const highlight = activeHighlight(marks, frame, fps);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.dark }}>
      {/* Footage with zoom transform */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${originX}% ${originY}%`,
        }}
      >
        <OffthreadVideo src={staticFile(entry.src)} style={{ width: "100%", height: "100%" }} />
      </AbsoluteFill>

      {/* Highlight box */}
      {highlight && (
        <HighlightBox rect={highlight.rect} sinceFrame={highlight.sinceFrame} frame={frame} fps={fps} scale={scale} originX={originX} originY={originY} />
      )}

      {/* Caption lower-third */}
      {caption && <Caption text={caption.text} subtitle={caption.subtitle} sinceFrame={caption.sinceFrame} frame={frame} fps={fps} />}

      {/* Chapter card */}
      {chapter && <ChapterCard text={chapter.text} sinceFrame={chapter.sinceFrame} frame={frame} fps={fps} />}
    </AbsoluteFill>
  );
};

const HighlightBox: React.FC<{ rect: Rect; sinceFrame: number; frame: number; fps: number; scale: number; originX: number; originY: number }> = ({ rect, sinceFrame, frame, fps }) => {
  const p = spring({ frame: frame - sinceFrame, fps, config: { damping: 18, mass: 0.5 } });
  const pad = 8;
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x - pad,
        top: rect.y - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        border: `3px solid ${COLORS.primary}`,
        borderRadius: 12,
        boxShadow: `0 0 0 6px rgba(59,130,246,0.25)`,
        transform: `scale(${interpolate(p, [0, 1], [1.15, 1])})`,
        opacity: interpolate(p, [0, 1], [0, 1]),
      }}
    />
  );
};

const Caption: React.FC<{ text: string; subtitle?: string; sinceFrame: number; frame: number; fps: number }> = ({ text, subtitle, sinceFrame, frame, fps }) => {
  const t = spring({ frame: frame - sinceFrame, fps, config: { damping: 20, mass: 0.5 } });
  const y = interpolate(t, [0, 1], [40, 0]);
  const opacity = interpolate(frame - sinceFrame, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        bottom: 64,
        maxWidth: 1100,
        transform: `translateY(${y}px)`,
        opacity,
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "18px 30px",
          borderRadius: 18,
          background: "rgba(15,23,42,0.82)",
          backdropFilter: "blur(8px)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
          borderLeft: `5px solid ${COLORS.primary}`,
        }}
      >
        <div style={{ color: "#fff", fontSize: 40, fontWeight: 800, letterSpacing: -0.5 }}>{text}</div>
        {subtitle && <div style={{ color: COLORS.primaryLight, fontSize: 26, fontWeight: 600, marginTop: 6 }}>{subtitle}</div>}
      </div>
    </div>
  );
};

const ChapterCard: React.FC<{ text: string; sinceFrame: number; frame: number; fps: number }> = ({ text, sinceFrame, frame, fps }) => {
  const rel = frame - sinceFrame;
  const dur = Math.round(1.6 * fps);
  const enter = interpolate(rel, [0, 8], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const exit = interpolate(rel, [dur - 8, dur], [1, 0], { extrapolateLeft: "clamp" });
  const opacity = Math.min(enter, exit);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT_FAMILY }}>
      <AbsoluteFill style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(3px)", opacity }} />
      <div
        style={{
          opacity,
          transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`,
          padding: "28px 56px",
          borderRadius: 22,
          background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
          color: "#fff",
          fontSize: 64,
          fontWeight: 900,
          letterSpacing: -1,
          boxShadow: "0 24px 60px rgba(37,99,235,0.45)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export default ScreencastScene;
