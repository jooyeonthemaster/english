"use client";

import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { dispatchGenerateTourClearSampleText, dispatchGenerateTourMilestone, dispatchGenerateTourSampleTextByIndex, GENERATE_TOUR_MILESTONE_EVENT, GENERATE_TOUR_OPEN_EVENT, GENERATE_TOUR_SAMPLE_FILE_DRAG_TYPE, GENERATE_TOUR_SAMPLE_FILE_NAME, type GenerateTourMilestoneDetail } from "@/lib/generate-tour-demo";
import { TOUR_ACTION_GLOW_CLASS, TOUR_AUTO_ADVANCE_DELAY_MS, TOUR_CURSOR_ENTRY_DELAY_MS, TOUR_HIDDEN_KEY } from "./tour-constants";
import type { PointerPoint, TargetRect, TourMode, TourStep, VirtualCropSelectionState, VirtualCursorState, VirtualDragGhostState } from "./tour-types";
import { DIRECT_TOUR_STEPS, TOUR_STEPS_BY_MODE } from "./tour-steps";
import { approachPoint, centerPoint, clamp, firstAvailableTarget, getCardPosition, isTourCardTarget, queryTourTarget, readRect, visibleTourTargets } from "./tour-geometry";
import { TourStyles } from "./tour-styles";
import { ActionGlowOverlay, CropSelectionOverlay, DragGhostOverlay, TargetRectOverlay, VirtualCursorOverlay } from "./tour-overlays";
import { TourCard } from "./tour-card";


export function GeneratePageTour({
  onOpenChange,
  onResultHighlightCountChange,
  onFileTutorialStart,
}: {
  onOpenChange?: (open: boolean) => void;
  onResultHighlightCountChange?: (count: number) => void;
  onFileTutorialStart?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [tourMode, setTourMode] = useState<TourMode>("direct");
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [actionGlowRect, setActionGlowRect] = useState<TargetRect | null>(null);
  const [virtualCursor, setVirtualCursor] = useState<VirtualCursorState>({
    left: 0,
    top: 0,
    visible: false,
    pressed: false,
  });
  const [virtualDragGhost, setVirtualDragGhost] =
    useState<VirtualDragGhostState>({
      left: 0,
      top: 0,
      width: 220,
      height: 40,
      visible: false,
      lifted: false,
      dropping: false,
    });
  const [virtualCropSelection, setVirtualCropSelection] =
    useState<VirtualCropSelectionState>({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      visible: false,
      active: false,
    });
  const [completedStepIndexes, setCompletedStepIndexes] = useState<Set<number>>(
    () => new Set(),
  );
  const [startedStepIndexes, setStartedStepIndexes] = useState<Set<number>>(
    () => new Set(),
  );
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const lastPointerPointRef = useRef<PointerPoint | null>(null);

  const steps = TOUR_STEPS_BY_MODE[tourMode] ?? DIRECT_TOUR_STEPS;
  const currentStep = steps[stepIndex] ?? steps[0];
  const currentStepComplete =
    !currentStep?.required || completedStepIndexes.has(stepIndex);
  const currentStepStarted = startedStepIndexes.has(stepIndex);
  const currentTargets =
    currentStepStarted && currentStep?.required?.startedMilestone
      ? ["results-section"]
      : currentStep?.targets;
  const currentTargetKey = currentTargets?.join("|") ?? "";
  const cardPosition = useMemo(() => getCardPosition(targetRect), [targetRect]);
  const sampleTextStepIndex = useMemo(
    () => steps.findIndex((step) => step.demo?.type === "sample-text"),
    [steps],
  );
  const currentGlowTargets = useMemo(() => {
    if (!currentStep) return [];
    if (currentStep.required && (currentStepComplete || currentStepStarted)) {
      return [];
    }
    if (currentStep.glowTargets) return currentStep.glowTargets;
    return currentStep.required ? (currentStep.targets?.slice(0, 1) ?? []) : [];
  }, [currentStep, currentStepComplete, currentStepStarted]);
  const currentGlowTargetKey = currentGlowTargets.join("|");
  const visibleActionGlowRect =
    currentGlowTargets.length > 0 ? actionGlowRect : null;
  const currentCursorPath = currentStep?.cursorPath;
  const currentCursorPathKey = currentCursorPath
    ? `${currentCursorPath.from}|${currentCursorPath.to}|${currentCursorPath.kind}`
    : "";
  const showStepVideo = tourMode === "direct" && stepIndex === 0;
  const shouldPlayVirtualCue =
    Boolean(currentStep?.cropDemo) ||
    (!currentStepComplete && !currentStepStarted);
  const showVirtualCursor =
    visible && stepIndex > 0 && shouldPlayVirtualCue && virtualCursor.visible;
  const showVirtualDragGhost =
    showVirtualCursor && Boolean(currentCursorPath) && virtualDragGhost.visible;
  const virtualDragGhostLabel =
    currentCursorPath?.from === "passage-card-drag-handle"
      ? "지문 카드"
      : GENERATE_TOUR_SAMPLE_FILE_NAME;
  const showVirtualCropSelection =
    showVirtualCursor &&
    Boolean(currentStep?.cropDemo) &&
    virtualCropSelection.visible;

  // 자동오픈 금지 — 전 사용자에게 강제 풀스크린 오버레이가 뜨던 동작 제거.
  // "튜토리얼" 버튼이 openGenerateTour()로 이 이벤트를 쏠 때만 연다 (opt-in).
  useEffect(() => {
    const openTour = () => setVisible(true);
    window.addEventListener(GENERATE_TOUR_OPEN_EVENT, openTour);
    return () => window.removeEventListener(GENERATE_TOUR_OPEN_EVENT, openTour);
  }, []);

  useEffect(() => {
    const rememberPointer = (event: PointerEvent | MouseEvent) => {
      lastPointerPointRef.current = {
        left: event.clientX,
        top: event.clientY,
      };
    };

    window.addEventListener("pointermove", rememberPointer, {
      capture: true,
      passive: true,
    });
    window.addEventListener("mousemove", rememberPointer, {
      capture: true,
      passive: true,
    });
    window.addEventListener("pointerdown", rememberPointer, {
      capture: true,
      passive: true,
    });
    window.addEventListener("mousedown", rememberPointer, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("pointermove", rememberPointer, {
        capture: true,
      });
      window.removeEventListener("mousemove", rememberPointer, {
        capture: true,
      });
      window.removeEventListener("pointerdown", rememberPointer, {
        capture: true,
      });
      window.removeEventListener("mousedown", rememberPointer, {
        capture: true,
      });
    };
  }, []);

  useEffect(() => {
    onOpenChange?.(visible);
  }, [onOpenChange, visible]);

  useEffect(() => {
    if (
      !visible ||
      tourMode !== "generation-details" ||
      !currentStep?.activateGenerationMode
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      queryTourTarget(
        `generation-mode-${currentStep.activateGenerationMode}`,
      )?.click();
    }, 80);
    return () => window.clearTimeout(id);
  }, [currentStep?.activateGenerationMode, tourMode, visible]);

  useEffect(() => {
    if (
      !visible ||
      tourMode !== "generation-details" ||
      !currentStep?.activateOutputMode
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      queryTourTarget(`output-mode-${currentStep.activateOutputMode}`)?.click();
    }, 80);
    return () => window.clearTimeout(id);
  }, [currentStep?.activateOutputMode, tourMode, visible]);

  useEffect(() => {
    onResultHighlightCountChange?.(
      visible ? (currentStep?.resultHighlightCount ?? 0) : 0,
    );
  }, [
    currentStep?.resultHighlightCount,
    onResultHighlightCountChange,
    visible,
  ]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [stepIndex, visible]);

  useEffect(() => {
    if (!visible || !currentTargetKey) return;
    const targets = currentTargetKey.split("|").filter(Boolean);
    const el = firstAvailableTarget(targets);
    el?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
    const id = window.setTimeout(() => {
      setTargetRect(readRect(firstAvailableTarget(targets)));
    }, 260);
    return () => window.clearTimeout(id);
  }, [currentTargetKey, visible]);

  useEffect(() => {
    if (!visible) return;
    const targets = currentTargetKey.split("|").filter(Boolean);
    const measure = () => {
      if (targets.length === 0) {
        setTargetRect(null);
        return;
      }
      setTargetRect(readRect(firstAvailableTarget(targets)));
    };
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const id = window.setInterval(measure, 600);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.clearInterval(id);
    };
  }, [currentTargetKey, visible]);

  useEffect(() => {
    if (!visible || currentGlowTargets.length === 0) {
      return;
    }
    const measure = () => {
      setActionGlowRect(
        readRect(visibleTourTargets(currentGlowTargets)[0] ?? null),
      );
    };
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const id = window.setInterval(measure, 260);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.clearInterval(id);
    };
  }, [currentGlowTargetKey, currentGlowTargets, visible]);

  useEffect(() => {
    if (
      !visible ||
      stepIndex === 0 ||
      (!currentStep?.cropDemo && (currentStepComplete || currentStepStarted))
    )
      return;

    const timeouts: number[] = [];
    let interval: number | null = null;
    let raf = 0;

    const clearTimeouts = () => {
      timeouts.forEach((id) => window.clearTimeout(id));
      timeouts.length = 0;
    };

    const schedule = (callback: () => void, delay: number) => {
      timeouts.push(window.setTimeout(callback, delay));
    };

    const playClickCue = () => {
      const rect = readRect(visibleTourTargets(currentGlowTargets)[0] ?? null);
      if (!rect) {
        setVirtualCursor((prev) => ({ ...prev, visible: false }));
        return;
      }

      const targetName = currentGlowTargets[0];
      const start = isTourCardTarget(targetName)
        ? approachPoint(rect)
        : (lastPointerPointRef.current ?? approachPoint(rect));
      const end = centerPoint(rect);
      setVirtualCursor({
        left: start.left,
        top: start.top,
        visible: true,
        pressed: false,
      });
      schedule(
        () =>
          setVirtualCursor((prev) => ({
            ...prev,
            left: end.left,
            top: end.top,
          })),
        120,
      );
      schedule(
        () =>
          setVirtualCursor((prev) => ({
            ...prev,
            pressed: true,
          })),
        760,
      );
      schedule(
        () =>
          setVirtualCursor((prev) => ({
            ...prev,
            pressed: false,
          })),
        960,
      );
      schedule(
        () =>
          setVirtualCursor((prev) => ({
            ...prev,
            visible: false,
          })),
        1560,
      );
    };

    const playDragCue = (path: NonNullable<TourStep["cursorPath"]>) => {
      const fromRect = readRect(visibleTourTargets([path.from])[0] ?? null);
      const toRect = readRect(visibleTourTargets([path.to])[0] ?? null);
      if (!fromRect || !toRect) {
        setVirtualCursor((prev) => ({ ...prev, visible: false }));
        setVirtualDragGhost((prev) => ({ ...prev, visible: false }));
        return;
      }

      const from = isTourCardTarget(path.from)
        ? centerPoint(fromRect)
        : (lastPointerPointRef.current ?? centerPoint(fromRect));
      const to = centerPoint(toRect);
      const ghostWidth = clamp(fromRect.width, 190, 280);
      const ghostHeight = clamp(fromRect.height, 38, 46);
      const fromGhost = {
        left: Math.round(fromRect.left + fromRect.width / 2 - ghostWidth / 2),
        top: Math.round(fromRect.top + fromRect.height / 2 - ghostHeight / 2),
      };
      const toGhost = {
        left: Math.round(toRect.left + toRect.width / 2 - ghostWidth / 2),
        top: Math.round(toRect.top + toRect.height / 2 - ghostHeight / 2),
      };
      setVirtualCursor({
        left: from.left,
        top: from.top,
        visible: true,
        pressed: false,
      });
      setVirtualDragGhost({
        left: fromGhost.left,
        top: fromGhost.top,
        width: ghostWidth,
        height: ghostHeight,
        visible: true,
        lifted: false,
        dropping: false,
      });
      schedule(() => {
        setVirtualCursor((prev) => ({
          ...prev,
          pressed: true,
        }));
        setVirtualDragGhost((prev) => ({
          ...prev,
          lifted: true,
        }));
      }, 300);
      schedule(() => {
        setVirtualCursor((prev) => ({
          ...prev,
          left: to.left,
          top: to.top,
          pressed: true,
        }));
        setVirtualDragGhost((prev) => ({
          ...prev,
          left: toGhost.left,
          top: toGhost.top,
        }));
      }, 520);
      schedule(() => {
        setVirtualCursor((prev) => ({
          ...prev,
          pressed: false,
        }));
        setVirtualDragGhost((prev) => ({
          ...prev,
          lifted: false,
          dropping: true,
        }));
      }, 1560);
      schedule(() => {
        setVirtualCursor((prev) => ({
          ...prev,
          visible: false,
        }));
        setVirtualDragGhost((prev) => ({
          ...prev,
          visible: false,
          dropping: false,
        }));
      }, 2060);
    };

    const playCropCue = () => {
      const cropDemoKind = currentStep?.cropDemo;
      const workspaceEditorRect =
        cropDemoKind === "workspace-selection"
          ? readRect(visibleTourTargets(["workspace-editor"])[0] ?? null)
          : null;
      const boardRect =
        cropDemoKind === "workspace-selection"
          ? null
          : readRect(visibleTourTargets(["file-crop-board"])[0] ?? null);
      const pageRect =
        cropDemoKind === "workspace-selection"
          ? null
          : readRect(visibleTourTargets(["file-crop-page"])[0] ?? null);
      const extractRect =
        cropDemoKind === "workspace-selection"
          ? null
          : readRect(visibleTourTargets(["file-extract-button"])[0] ?? null);
      const cropBaseRect = workspaceEditorRect ?? pageRect ?? boardRect;
      if (!cropBaseRect) {
        setVirtualCursor((prev) => ({ ...prev, visible: false }));
        setVirtualCropSelection((prev) => ({ ...prev, visible: false }));
        return;
      }

      const cropRatios =
        cropDemoKind === "workspace-selection"
          ? { left: 0.08, top: 0.34, width: 0.72, height: 0.18 }
          : cropDemoKind === "first-column"
            ? { left: 0.14, top: 0.225, width: 0.34, height: 0.36 }
            : cropDemoKind === "second-column"
              ? { left: 0.53, top: 0.225, width: 0.34, height: 0.36 }
              : { left: 0.14, top: 0.225, width: 0.72, height: 0.38 };
      const cropLeft = Math.round(
        cropBaseRect.left + cropBaseRect.width * cropRatios.left,
      );
      const cropTop = Math.round(
        cropBaseRect.top + cropBaseRect.height * cropRatios.top,
      );
      const cropWidth = Math.round(cropBaseRect.width * cropRatios.width);
      const cropHeight = Math.round(cropBaseRect.height * cropRatios.height);
      const start = { left: cropLeft, top: cropTop };
      const end = {
        left: cropLeft + cropWidth,
        top: cropTop + cropHeight,
      };

      setVirtualCursor({
        left: start.left,
        top: start.top,
        visible: true,
        pressed: false,
      });
      setVirtualCropSelection({
        left: start.left,
        top: start.top,
        width: 2,
        height: 2,
        visible: false,
        active: false,
      });
      schedule(() => {
        setVirtualCursor((prev) => ({ ...prev, pressed: true }));
        setVirtualCropSelection((prev) => ({
          ...prev,
          visible: true,
          active: true,
        }));
      }, 260);
      schedule(() => {
        setVirtualCursor((prev) => ({
          ...prev,
          left: end.left,
          top: end.top,
          pressed: true,
        }));
        setVirtualCropSelection((prev) => ({
          ...prev,
          width: cropWidth,
          height: cropHeight,
        }));
      }, 520);
      schedule(() => {
        setVirtualCursor((prev) => ({ ...prev, pressed: false }));
        setVirtualCropSelection((prev) => ({ ...prev, active: false }));
      }, 1580);
      if (cropDemoKind === "single" && extractRect) {
        const extract = centerPoint(extractRect);
        schedule(() => {
          setVirtualCursor((prev) => ({
            ...prev,
            left: extract.left,
            top: extract.top,
          }));
        }, 1960);
        schedule(() => {
          setVirtualCursor((prev) => ({ ...prev, pressed: true }));
        }, 2660);
        schedule(() => {
          setVirtualCursor((prev) => ({ ...prev, pressed: false }));
        }, 2860);
      }
      schedule(
        () => {
          setVirtualCursor((prev) => ({ ...prev, visible: false }));
          setVirtualCropSelection((prev) => ({
            ...prev,
            visible: false,
            active: false,
          }));
        },
        cropDemoKind === "single" ? 3400 : 2300,
      );
    };

    const playCue = () => {
      clearTimeouts();
      if (currentStep?.cropDemo) {
        playCropCue();
        return;
      }
      if (currentCursorPath) {
        playDragCue(currentCursorPath);
        return;
      }
      playClickCue();
    };

    raf = window.requestAnimationFrame(() => {
      setVirtualCursor((prev) => ({
        ...prev,
        visible: false,
        pressed: false,
      }));
      setVirtualDragGhost((prev) => ({
        ...prev,
        visible: false,
        lifted: false,
        dropping: false,
      }));
      setVirtualCropSelection((prev) => ({
        ...prev,
        visible: false,
        active: false,
      }));
      schedule(() => {
        playCue();
        interval = window.setInterval(
          playCue,
          currentStep?.cropDemo ? 4400 : currentCursorPath ? 3400 : 2600,
        );
      }, TOUR_CURSOR_ENTRY_DELAY_MS);
    });

    return () => {
      window.cancelAnimationFrame(raf);
      if (interval !== null) window.clearInterval(interval);
      clearTimeouts();
    };
  }, [
    currentCursorPath,
    currentCursorPathKey,
    currentGlowTargetKey,
    currentGlowTargets,
    currentStep?.cropDemo,
    currentStepComplete,
    currentStepStarted,
    shouldPlayVirtualCue,
    stepIndex,
    visible,
  ]);

  useEffect(() => {
    if (!visible) return;
    const handleMilestone = (event: Event) => {
      const milestone = (event as CustomEvent<GenerateTourMilestoneDetail>)
        .detail?.milestone;
      if (!milestone || !currentStep?.required) return;
      if (currentStep.required.startedMilestone === milestone) {
        setStartedStepIndexes((prev) => {
          if (prev.has(stepIndex)) return prev;
          const next = new Set(prev);
          next.add(stepIndex);
          return next;
        });
        return;
      }
      if (currentStep.required.milestone !== milestone) return;
      setCompletedStepIndexes((prev) => {
        if (prev.has(stepIndex)) return prev;
        const next = new Set(prev);
        next.add(stepIndex);
        return next;
      });
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        setStepIndex((current) =>
          current === stepIndex && current < steps.length - 1
            ? current + 1
            : current,
        );
        autoAdvanceTimerRef.current = null;
      }, TOUR_AUTO_ADVANCE_DELAY_MS);
    };
    window.addEventListener(GENERATE_TOUR_MILESTONE_EVENT, handleMilestone);
    return () => {
      window.removeEventListener(
        GENERATE_TOUR_MILESTONE_EVENT,
        handleMilestone,
      );
    };
  }, [
    currentStep?.required,
    currentStep?.required?.milestone,
    currentStep?.required?.startedMilestone,
    stepIndex,
    steps.length,
    visible,
  ]);

  useEffect(() => {
    if (!visible || currentGlowTargets.length === 0) return;
    const applyGlow = () => {
      const elements = visibleTourTargets(currentGlowTargets);
      elements.forEach((el) => el.classList.add(TOUR_ACTION_GLOW_CLASS));
      return elements;
    };
    let activeElements = applyGlow();
    const id = window.setInterval(() => {
      activeElements.forEach((el) =>
        el.classList.remove(TOUR_ACTION_GLOW_CLASS),
      );
      activeElements = applyGlow();
    }, 700);
    return () => {
      window.clearInterval(id);
      activeElements.forEach((el) =>
        el.classList.remove(TOUR_ACTION_GLOW_CLASS),
      );
    };
  }, [currentGlowTargetKey, currentGlowTargets, visible]);

  const closeForSession = () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setVisible(false);
  };
  const hideForever = () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    try {
      window.localStorage.setItem(TOUR_HIDDEN_KEY, "1");
    } catch {
      // Ignore storage failures. The session close still works.
    }
    setVisible(false);
  };

  const clickTarget = (target: string) => {
    const el = queryTourTarget(target);
    if (!el) return;
    el.click();
    window.setTimeout(() => {
      const targets = currentTargetKey.split("|").filter(Boolean);
      setTargetRect(readRect(firstAvailableTarget(targets)));
    }, 240);
  };

  const fillSampleText = () => {
    clickTarget("intake-paste");
    window.setTimeout(() => {
      dispatchGenerateTourSampleTextByIndex(
        currentStep?.demo?.sampleIndex ?? 0,
      );
      dispatchGenerateTourMilestone("sample-text-filled");
      const targets = currentTargetKey.split("|").filter(Boolean);
      setTargetRect(readRect(firstAvailableTarget(targets)));
    }, 260);
  };

  const handleSampleFileDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(GENERATE_TOUR_SAMPLE_FILE_DRAG_TYPE, "1");
    event.dataTransfer.setData("text/plain", GENERATE_TOUR_SAMPLE_FILE_NAME);
  };

  const next = () => {
    if (!currentStepComplete) return;
    if (stepIndex >= steps.length - 1) {
      setVisible(false);
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const startLesson = (mode: TourMode) => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    onFileTutorialStart?.();
    setCompletedStepIndexes(new Set());
    setStartedStepIndexes(new Set());
    setTargetRect(null);
    setActionGlowRect(null);
    setVirtualCursor((prev) => ({
      ...prev,
      visible: false,
      pressed: false,
    }));
    setVirtualDragGhost((prev) => ({
      ...prev,
      visible: false,
      lifted: false,
      dropping: false,
    }));
    setVirtualCropSelection((prev) => ({
      ...prev,
      visible: false,
      active: false,
    }));
    if (mode === "generation-details") {
      window.setTimeout(() => queryTourTarget("intake-upload")?.click(), 60);
    }
    if (
      mode === "review-files" ||
      mode === "learning-materials" ||
      mode === "workspace-edit"
    ) {
      window.setTimeout(() => queryTourTarget("intake-library")?.click(), 60);
    }
    setTourMode(mode);
    setStepIndex(0);
  };

  const previous = () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    const nextIndex = Math.max(0, stepIndex - 1);
    if (sampleTextStepIndex >= 0 && nextIndex < sampleTextStepIndex) {
      dispatchGenerateTourClearSampleText();
      setCompletedStepIndexes((prev) => {
        const next = new Set<number>();
        prev.forEach((index) => {
          if (index < sampleTextStepIndex) next.add(index);
        });
        return next;
      });
    }
    setStartedStepIndexes((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      prev.forEach((index) => {
        if (index < nextIndex) next.add(index);
      });
      return next;
    });
    setStepIndex(nextIndex);
  };

  if (!visible) return null;

  const finalStep = stepIndex >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <TargetRectOverlay targetRect={targetRect} />
      <ActionGlowOverlay visibleActionGlowRect={visibleActionGlowRect} />
      <CropSelectionOverlay showVirtualCropSelection={showVirtualCropSelection} currentStep={currentStep} virtualCropSelection={virtualCropSelection} />
      <DragGhostOverlay showVirtualDragGhost={showVirtualDragGhost} currentCursorPath={currentCursorPath} virtualDragGhost={virtualDragGhost} virtualDragGhostLabel={virtualDragGhostLabel} />
      <VirtualCursorOverlay showVirtualCursor={showVirtualCursor} currentCursorPath={currentCursorPath} currentStep={currentStep} virtualCursor={virtualCursor} />
      <TourCard
            cardPosition={cardPosition}
            closeForSession={closeForSession}
            currentStep={currentStep}
            currentStepComplete={currentStepComplete}
            currentStepStarted={currentStepStarted}
            fillSampleText={fillSampleText}
            finalStep={finalStep}
            handleSampleFileDragStart={handleSampleFileDragStart}
            hideForever={hideForever}
            next={next}
            previous={previous}
            showStepVideo={showStepVideo}
            startLesson={startLesson}
            stepIndex={stepIndex}
            steps={steps}
            tourMode={tourMode}
          />
      <TourStyles />
    </div>
  );
}
