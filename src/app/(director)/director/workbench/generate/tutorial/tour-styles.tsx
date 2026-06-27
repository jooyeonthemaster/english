"use client";

import { TOUR_ACTION_GLOW_CLASS } from "./tour-constants";

export function TourStyles() {
  return (
    <style>{`
      .smoat-generate-tour-neon-frame {
        pointer-events: none;
        z-index: 1;
        border: 2px solid rgba(96, 165, 250, 0.58);
        background: rgba(96, 165, 250, 0.035);
        opacity: 0.58;
        box-shadow:
          0 0 4px rgba(147, 197, 253, 0.38),
          0 0 14px rgba(96, 165, 250, 0.24),
          0 0 26px rgba(37, 99, 235, 0.12),
          inset 0 0 8px rgba(147, 197, 253, 0.12);
        animation: smoat-generate-tour-neon-frame 1.9s ease-in-out infinite;
      }

      .${TOUR_ACTION_GLOW_CLASS} {
        position: relative;
        outline: 1.5px solid rgba(96, 165, 250, 0.58) !important;
        outline-offset: 3px;
        box-shadow:
          0 0 4px rgba(147, 197, 253, 0.32),
          0 0 12px rgba(96, 165, 250, 0.2),
          0 0 22px rgba(37, 99, 235, 0.1) !important;
        animation: smoat-generate-tour-action-neon 1.9s ease-in-out infinite;
      }

      .smoat-generate-tour-virtual-cursor {
        pointer-events: none;
        transform: translate(-4px, -4px) scale(1);
        opacity: 0.96;
        transition:
          left 760ms cubic-bezier(0.2, 0.86, 0.24, 1),
          top 760ms cubic-bezier(0.2, 0.86, 0.24, 1),
          transform 140ms ease,
          opacity 180ms ease;
      }

      .smoat-generate-tour-virtual-cursor-pressed {
        transform: translate(-4px, -4px) scale(0.88);
      }

      .smoat-generate-tour-file-ghost {
        pointer-events: none;
        opacity: 0.96;
        transform: translate3d(0, 0, 0) scale(1);
        transition:
          left 940ms cubic-bezier(0.2, 0.86, 0.24, 1),
          top 940ms cubic-bezier(0.2, 0.86, 0.24, 1),
          transform 180ms ease,
          opacity 180ms ease,
          box-shadow 180ms ease;
      }

      .smoat-generate-tour-file-ghost-lifted {
        transform: translate3d(0, -6px, 0) scale(1.035) rotate(-1deg);
        box-shadow:
          0 18px 34px rgba(37, 99, 235, 0.22),
          0 0 0 1px rgba(147, 197, 253, 0.55);
      }

      .smoat-generate-tour-file-ghost-dropping {
        opacity: 0.18;
        transform: translate3d(0, 6px, 0) scale(0.82);
      }

      .smoat-generate-tour-crop-selection {
        pointer-events: none;
        border: 2px solid rgba(37, 99, 235, 0.9);
        background:
          linear-gradient(
            135deg,
            rgba(37, 99, 235, 0.18),
            rgba(96, 165, 250, 0.08)
          );
        box-shadow:
          0 0 0 9999px rgba(15, 23, 42, 0.04),
          0 0 0 4px rgba(147, 197, 253, 0.28),
          0 12px 30px rgba(37, 99, 235, 0.18),
          inset 0 0 20px rgba(219, 234, 254, 0.3);
        transition:
          left 900ms cubic-bezier(0.2, 0.86, 0.24, 1),
          top 900ms cubic-bezier(0.2, 0.86, 0.24, 1),
          width 900ms cubic-bezier(0.2, 0.86, 0.24, 1),
          height 900ms cubic-bezier(0.2, 0.86, 0.24, 1),
          opacity 180ms ease;
      }

      .smoat-generate-tour-crop-selection-active {
        animation: smoat-generate-tour-crop-pulse 1.15s ease-in-out infinite;
      }

      @keyframes smoat-generate-tour-neon-frame {
        0%,
        100% {
          opacity: 0.44;
          border-color: rgba(96, 165, 250, 0.42);
          box-shadow:
            0 0 3px rgba(147, 197, 253, 0.22),
            0 0 10px rgba(96, 165, 250, 0.14),
            0 0 18px rgba(37, 99, 235, 0.07),
            inset 0 0 6px rgba(147, 197, 253, 0.08);
        }
        50% {
          opacity: 0.92;
          border-color: rgba(147, 197, 253, 0.92);
          box-shadow:
            0 0 5px rgba(219, 234, 254, 0.76),
            0 0 18px rgba(96, 165, 250, 0.46),
            0 0 34px rgba(37, 99, 235, 0.22),
            inset 0 0 12px rgba(147, 197, 253, 0.18);
        }
      }

      @keyframes smoat-generate-tour-action-neon {
        0%,
        100% {
          outline-color: rgba(96, 165, 250, 0.38);
          box-shadow:
            0 0 3px rgba(147, 197, 253, 0.18),
            0 0 10px rgba(96, 165, 250, 0.12),
            0 0 18px rgba(37, 99, 235, 0.06) !important;
        }
        50% {
          outline-color: rgba(147, 197, 253, 0.9);
          box-shadow:
            0 0 5px rgba(219, 234, 254, 0.7),
            0 0 16px rgba(96, 165, 250, 0.38),
            0 0 30px rgba(37, 99, 235, 0.16) !important;
        }
      }

      @keyframes smoat-generate-tour-crop-pulse {
        0%,
        100% {
          border-color: rgba(37, 99, 235, 0.74);
          box-shadow:
            0 0 0 9999px rgba(15, 23, 42, 0.04),
            0 0 0 3px rgba(147, 197, 253, 0.22),
            0 10px 24px rgba(37, 99, 235, 0.14),
            inset 0 0 16px rgba(219, 234, 254, 0.26);
        }
        50% {
          border-color: rgba(59, 130, 246, 1);
          box-shadow:
            0 0 0 9999px rgba(15, 23, 42, 0.05),
            0 0 0 6px rgba(147, 197, 253, 0.34),
            0 14px 34px rgba(37, 99, 235, 0.22),
            inset 0 0 24px rgba(219, 234, 254, 0.36);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .${TOUR_ACTION_GLOW_CLASS},
        .smoat-generate-tour-neon-frame,
        .smoat-generate-tour-virtual-cursor,
        .smoat-generate-tour-file-ghost,
        .smoat-generate-tour-crop-selection {
          animation: none;
          transition: none;
        }
      }
    `}</style>
  );
}
