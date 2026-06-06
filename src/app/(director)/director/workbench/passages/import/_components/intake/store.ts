"use client";

// ============================================================================
// useIntakeStore — 적응형 인테이크 셸 전용 상태(Zustand). 본 추출 前 단계만 담당.
// 페이지 코어의 useExtractionStore와 의도적으로 분리해 코어를 오염시키지 않는다.
// plan-locked 시점에 IntakePlan을 직렬화해 코어 startUpload로 인계한다(D1).
// ============================================================================

import { create } from "zustand";
import { revokeSlotUrls } from "@/lib/extraction/pdf-splitter";
import type {
  ClientPageSlot,
  IntakeInputType,
  IntakePlan,
  IntakeSegment,
  IntakeState,
  IntakeSurface,
} from "@/lib/extraction/types";

interface IntakeStoreState {
  state: IntakeState;
  inputType: IntakeInputType | null;
  surface: IntakeSurface | null;
  slots: ClientPageSlot[];
  plan: IntakePlan | null;
  segments: IntakeSegment[];
  /** 크롭 오버레이가 열린 대상 슬롯 인덱스 (cropping 서브상태). */
  cropSlotIndex: number | null;
  error: string | null;

  setState: (s: IntakeState) => void;
  setInputType: (t: IntakeInputType | null) => void;
  setSurface: (s: IntakeSurface | null) => void;
  setSlots: (slots: ClientPageSlot[]) => void;
  appendSlots: (slots: ClientPageSlot[]) => void;
  removeSlot: (index: number) => void;
  reorderSlots: (fromIndex: number, toIndex: number) => void;
  setPlan: (plan: IntakePlan | null) => void;
  setSegments: (segments: IntakeSegment[]) => void;
  updateSegment: (id: string, patch: Partial<IntakeSegment>) => void;
  setCropSlotIndex: (index: number | null) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

const reindex = (slots: ClientPageSlot[]) =>
  slots.map((slot, i) => ({ ...slot, pageIndex: i }));

export const useIntakeStore = create<IntakeStoreState>((set, get) => ({
  state: "empty",
  inputType: null,
  surface: null,
  slots: [],
  plan: null,
  segments: [],
  cropSlotIndex: null,
  error: null,

  setState: (state) => set({ state }),
  setInputType: (inputType) => set({ inputType }),
  setSurface: (surface) => set({ surface }),

  setSlots: (slots) => {
    const prev = get().slots;
    if (prev !== slots && prev.length > 0) {
      const nextUrls = new Set(slots.map((s) => s.previewUrl));
      revokeSlotUrls(prev.filter((s) => !nextUrls.has(s.previewUrl)));
    }
    set({ slots });
  },

  appendSlots: (incoming) => {
    set({ slots: reindex([...get().slots, ...incoming]) });
  },

  removeSlot: (index) => {
    const prev = get().slots;
    if (index < 0 || index >= prev.length) return;
    const removed = prev[index];
    if (removed) revokeSlotUrls([removed]);
    set({ slots: reindex(prev.filter((_, i) => i !== index)) });
  },

  reorderSlots: (fromIndex, toIndex) => {
    const prev = get().slots;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= prev.length) return;
    if (toIndex < 0 || toIndex >= prev.length) return;
    const next = [...prev];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    set({ slots: reindex(next) });
  },

  setPlan: (plan) => set({ plan }),
  setSegments: (segments) => set({ segments }),
  updateSegment: (id, patch) =>
    set({
      segments: get().segments.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    }),
  setCropSlotIndex: (cropSlotIndex) => set({ cropSlotIndex }),
  setError: (error) => set({ error }),

  reset: () => {
    const prev = get().slots;
    if (prev.length > 0) revokeSlotUrls(prev);
    set({
      state: "empty",
      inputType: null,
      surface: null,
      slots: [],
      plan: null,
      segments: [],
      cropSlotIndex: null,
      error: null,
    });
  },
}));
