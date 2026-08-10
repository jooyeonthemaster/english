"use client";

// ============================================================================
// 자료 초안 상태 훅 — 넣기 · 판독 · 빼기의 수명 전부를 여기서 소유한다.
//
// AuthoringBoard 에서 떼어낸 이유는 두 가지다.
//   1) 보드는 400줄 규약을 지켜야 하고, 자료 판독은 그 자체로 "수명 관리"라는
//      독립된 관심사다(AbortController·동시성 큐·개수 상한).
//   2) 판독은 무료지만 원가가 드는 서버 콜을 태운다 — 어디서 시작되고 어디서
//      끊기는지가 한 파일 안에서 다 보여야 회귀를 잡을 수 있다.
//
// 회귀 방지 계약
//  · **판독은 반드시 끊을 수 있어야 한다.** 자료를 빼거나 화면을 떠나면 그 파일의
//    AbortController 를 abort 한다. 안 그러면 20쪽 PDF 를 잘못 올렸다가 뺀 뒤에도
//    남은 배치 콜이 계속 나가 학원당 레이트리밋(60초/60장·20콜)을 유령 요청이
//    먹어치우고, 곧바로 다시 올린 진짜 자료가 429 로 실패한다.
//    (원본 페이지 업로드도 같은 규칙이다 — 별도 컨트롤러 맵으로 함께 끊는다.)
//  · **동시 판독은 2건까지.** 드롭한 파일을 전부 병렬로 태우면 파일 3개(PDF)만으로
//    1분 안에 60장을 넘겨 자기 자신의 레이트리밋에 걸린다. 나머지는 큐에서 기다린다.
//  · **자료는 12개까지.** 서버 계약(authoringRequestSchema.materials.max(12))을
//    클라이언트에서 먼저 막는다. 넘겨서 보내면 zod 영문 메시지가 그대로 토스트에
//    떠 사용자가 무엇을 지워야 할지 알 수 없다.
//    ⚠️ 이 상한은 **동기 카운터(countRef)** 로 센다. 예전에는 렌더 시점의
//    materials.length 를 클로저로 읽어서, 같은 틱에 드롭 + 붙여넣기가 겹치면 둘 다
//    "아직 자리가 있다"고 판단해 13개가 만들어졌고, 그대로 실행하면 서버 zod 가
//    영문으로 튕겨 크레딧은 안 나가지만 사용자는 이유를 알 수 없었다.
//  · AbortError 는 FAILED 로 기록하지 않는다 — 사용자가 스스로 뺀 자료다.
//  · **역할 자동분류는 roleLocked 를 절대 이기지 않는다.** 그 위에서만
//    판독 라우트의 [[ROLE=…]] > 파일명·본문 휴리스틱 순으로 결정한다
//    (material-intake.resolveMaterialRole).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  canSendPages,
  uploadMaterialPageImages,
} from "@/lib/passage-authoring/material-readers";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import type { MaterialSourceKind } from "@/lib/passage-authoring/schema";

import {
  createFileDraft,
  createTextDraft,
  defaultSendPages,
  isMaterialReadAborted,
  readMaterialDraft,
  resolveMaterialRole,
  sendablePageCount,
  suggestVariationRole,
  type MaterialDraft,
} from "./material-intake";

/** 자료 개수 상한 — schema.authoringRequestSchema.materials.max(12) 의 사본. */
export const MAX_AUTHORING_MATERIALS = 12;

/** 동시 판독 상한. 브라우저 pdfjs 렌더 부하와 서버 레이트리밋 사이의 타협점. */
const READ_CONCURRENCY = 2;

export interface MaterialDraftsApi {
  materials: MaterialDraft[];
  /** 서버로 보낼 수 있는 자료(본문이 있거나, 원본 페이지가 올라가 있거나). */
  readyMaterials: MaterialDraft[];
  /** 지금 보내면 통째로 빠지는 자료 수 — CTA 예약 판정에 쓴다(판독 중 ≠ 이 값). */
  pendingCount: number;
  /** 상한에 도달했는가 — 드롭존 안내·차단 사유에 쓴다. */
  atCapacity: boolean;
  patchMaterial: (id: string, patch: Partial<MaterialDraft>) => void;
  handleFiles: (files: File[]) => void;
  handlePasteText: (text: string) => void;
  handleRetry: (id: string) => void;
  handleRemove: (id: string) => void;
  /**
   * 지시문이 "변형해 주세요"라고 말하면 참고 지문을 '변형할 지문'으로 올린다.
   * 보드가 지시문 확정 시점(실행 직전·blur)에 부른다. roleLocked 자료는 불변.
   */
  applyInstructionSignal: (instruction: string) => void;
}

export function useMaterialDrafts(): MaterialDraftsApi {
  const [materials, setMaterials] = useState<MaterialDraft[]>([]);

  /** 진행 중인 판독의 중단 핸들 — 자료 id 로 찾는다. */
  const abortersRef = useRef<Map<string, AbortController>>(new Map());
  /** 진행 중인 원본 페이지 업로드의 중단 핸들. 판독과 수명이 달라 맵을 나눈다. */
  const pageAbortersRef = useRef<Map<string, AbortController>>(new Map());
  /** 동시성 상한을 넘긴 대기열. */
  const queueRef = useRef<Array<{ id: string; file: File }>>([]);
  const activeRef = useRef(0);
  /**
   * materials.length 의 **동기** 사본. 같은 틱에 두 번 들어와도(드롭+붙여넣기)
   * 상한을 정확히 센다 — 렌더 클로저는 그 틱에 아직 갱신되지 않는다.
   */
  const countRef = useRef(0);
  /** materials 의 최신 스냅샷 — 콜백이 클로저를 다시 만들지 않게 한다. */
  const materialsRef = useRef<MaterialDraft[]>([]);

  useEffect(() => {
    // 커밋된 값이 언제나 정답이다. 위 두 ref 를 여기서 다시 맞춰 드리프트를 없앤다.
    materialsRef.current = materials;
    countRef.current = materials.length;
  }, [materials]);

  const patchDraft = useCallback(
    (id: string, patch: Partial<MaterialDraft>) => {
      setMaterials((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  // ── 원본 페이지 업로드(하이브리드) ────────────────────────────────────────
  //
  // 요청 본문에는 경로 문자열만 실어야 4.5MB 벽을 넘지 않는다. 그래서 켜는 순간
  // 서명 URL 로 미리 올려 두고 storagePath 만 들고 다닌다. 실패하면 스위치를 다시
  // 끈다 — 켜져 있는데 실제로는 아무것도 안 실리는 "거짓 스위치"가 최악이다.

  const cancelPageUpload = useCallback((id: string) => {
    const controller = pageAbortersRef.current.get(id);
    if (controller) {
      pageAbortersRef.current.delete(id);
      controller.abort();
    }
  }, []);

  /**
   * 원본 페이지를 스토리지에 올린다.
   *
   * ownsStatus: 이 업로드가 **자료의 수명 상태(READING/READY/FAILED)를 소유하는가.**
   *   · true  — 사진. 판독을 아예 돌리지 않으므로 상태를 움직일 주체가 여기뿐이다.
   *   · false — PDF 의 '원본도 함께 보냄' 토글. 그쪽은 판독이 상태를 소유하고 있어서
   *             업로드가 status 를 건드리면 판독 결과를 덮어쓴다.
   * 이 플래그가 없던 구조로 되돌리지 말 것 — 한쪽 경로가 반드시 조용히 깨진다.
   */
  const uploadPages = useCallback(
    async (
      id: string,
      file: File,
      sourceKind: MaterialSourceKind,
      opts: { ownsStatus?: boolean } = {},
    ) => {
      if (pageAbortersRef.current.has(id)) return;
      const controller = new AbortController();
      pageAbortersRef.current.set(id, controller);
      try {
        const upload = await uploadMaterialPageImages({
          materialId: id,
          file,
          sourceKind,
          onProgress: opts.ownsStatus
            ? (label) => patchDraft(id, { progressLabel: label })
            : undefined,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        patchDraft(id, {
          storagePath: upload.storagePath,
          pageCount: upload.pageCount,
          sendPages: true,
          ...(opts.ownsStatus
            ? { status: "READY" as const, progressLabel: undefined, error: undefined }
            : {}),
        });
      } catch (error) {
        if (isMaterialReadAborted(error) || controller.signal.aborted) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : AUTHORING_COPY.TOAST.pageUploadFailed;
        patchDraft(id, {
          sendPages: false,
          storagePath: undefined,
          // 상태를 소유할 때만 FAILED 로 내린다. 소유하지 않으면 자료 자체는
          // 판독본으로 멀쩡히 살아 있고, 실패한 것은 '원본 첨부'라는 부가 기능뿐이다.
          ...(opts.ownsStatus
            ? { status: "FAILED" as const, progressLabel: undefined, error: message }
            : {}),
        });
        toast.warning(message);
      } finally {
        if (pageAbortersRef.current.get(id) === controller) {
          pageAbortersRef.current.delete(id);
        }
      }
    },
    [patchDraft],
  );

  /**
   * 화면이 부르는 유일한 수정 경로. sendPages 토글만은 상태 변경으로 끝나지 않고
   * 업로드/중단이라는 부수효과를 낳으므로 여기서 한 번에 처리한다(화면이 업로드
   * 배관을 알 필요가 없다).
   */
  const patchMaterial = useCallback(
    (id: string, patch: Partial<MaterialDraft>) => {
      patchDraft(id, patch);
      if (patch.sendPages === true) {
        const target = materialsRef.current.find((item) => item.id === id);
        if (target?.file && canSendPages(target.sourceKind) && !target.storagePath) {
          void uploadPages(id, target.file, target.sourceKind);
        }
      } else if (patch.sendPages === false) {
        cancelPageUpload(id);
      }
    },
    [cancelPageUpload, patchDraft, uploadPages],
  );

  const runRead = useCallback(
    async (id: string, file: File) => {
      const controller = new AbortController();
      abortersRef.current.set(id, controller);
      try {
        const outcome = await readMaterialDraft(
          file,
          (label) => patchDraft(id, { progressLabel: label }),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        // 표·도해 지면이면 원본 페이지를 함께 보내는 쪽이 기본값이다(사용자가 끌 수 있다).
        const sendPages = defaultSendPages({
          layout: outcome.layout,
          sourceKind: outcome.sourceKind,
        });
        setMaterials((prev) =>
          prev.map((item) => {
            if (item.id !== id) return item;
            // 선생님이 이미 역할을 직접 골랐다면 자동분류도 판독 판정도 덮지 않는다.
            const decided = item.roleLocked
              ? { role: item.role, uncertain: false }
              : resolveMaterialRole({
                  name: item.name,
                  content: outcome.content,
                  sourceKind: outcome.sourceKind,
                  detectedRole: outcome.role,
                });
            return {
              ...item,
              content: outcome.content,
              sourceKind: outcome.sourceKind,
              role: decided.role,
              roleUncertain: decided.uncertain,
              layout: outcome.layout,
              pageCount: sendablePageCount(outcome.pageCount),
              sendPages: item.sendPages ?? sendPages,
              warning: outcome.truncated
                ? AUTHORING_COPY.WARN.truncatedRead
                : outcome.warning,
              status: "READY",
              progressLabel: undefined,
              error: undefined,
            };
          }),
        );
        if (outcome.warning) toast.warning(outcome.warning);
        if (outcome.truncated) {
          toast.warning(AUTHORING_COPY.TOAST.materialTooLong);
        }
        // 기본값으로 켜진 하이브리드는 여기서 곧바로 올려 둔다 — 실행 직전에
        // 올리면 CTA 를 누른 뒤 몇 초가 조용히 늘어난다.
        if (sendPages && canSendPages(outcome.sourceKind)) {
          void uploadPages(id, file, outcome.sourceKind);
        }
      } catch (error) {
        // 사용자가 뺀 자료의 중단은 실패가 아니다 — 카드도 이미 사라졌다.
        if (isMaterialReadAborted(error) || controller.signal.aborted) return;
        patchDraft(id, {
          status: "FAILED",
          progressLabel: undefined,
          error:
            error instanceof Error && error.message
              ? error.message
              : AUTHORING_COPY.TOAST.materialReadFailed,
        });
      } finally {
        if (abortersRef.current.get(id) === controller) {
          abortersRef.current.delete(id);
        }
      }
    },
    [patchDraft, uploadPages],
  );

  /** 대기열을 상한까지 채워 돌린다(자기 자신을 재귀 호출해 빈자리를 즉시 메운다). */
  const pump = useCallback(
    function drain(): void {
      while (activeRef.current < READ_CONCURRENCY) {
        const next = queueRef.current.shift();
        if (!next) return;
        activeRef.current += 1;
        void runRead(next.id, next.file).finally(() => {
          activeRef.current -= 1;
          drain();
        });
      }
    },
    [runRead],
  );

  const enqueueRead = useCallback(
    (entries: Array<{ id: string; file: File }>) => {
      queueRef.current.push(...entries);
      pump();
    },
    [pump],
  );

  const cancelRead = useCallback(
    (id: string) => {
      queueRef.current = queueRef.current.filter((entry) => entry.id !== id);
      const controller = abortersRef.current.get(id);
      if (controller) {
        abortersRef.current.delete(id);
        controller.abort();
      }
      cancelPageUpload(id);
    },
    [cancelPageUpload],
  );

  // 화면을 떠나면 남은 판독·업로드를 전부 끊는다(유령 요청·유령 원가 차단).
  useEffect(() => {
    const aborters = abortersRef.current;
    const pageAborters = pageAbortersRef.current;
    const queue = queueRef;
    return () => {
      for (const controller of aborters.values()) controller.abort();
      aborters.clear();
      for (const controller of pageAborters.values()) controller.abort();
      pageAborters.clear();
      queue.current = [];
    };
  }, []);

  /**
   * 상한까지 몇 개를 더 받을 수 있는지. 초과분은 잘라내고 이유를 알린다.
   * **렌더 클로저가 아니라 동기 카운터를 본다** — 같은 틱의 두 번째 투입도
   * 첫 번째가 이미 자리를 차지한 것을 안다. 자리를 차지하는 것도 여기서 한다.
   */
  const takeRoom = useCallback((incoming: number): number => {
    const room = Math.max(0, MAX_AUTHORING_MATERIALS - countRef.current);
    if (room <= 0) {
      toast.warning(
        AUTHORING_COPY.TOAST.materialLimitFull(MAX_AUTHORING_MATERIALS),
      );
      return 0;
    }
    const take = Math.min(incoming, room);
    if (take < incoming) {
      toast.warning(
        AUTHORING_COPY.TOAST.materialLimitPartial(MAX_AUTHORING_MATERIALS, take),
      );
    }
    countRef.current += take;
    return take;
  }, []);

  const handleFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const room = takeRoom(files.length);
      if (room === 0) return;
      const accepted = files.slice(0, room);
      const drafts = accepted.map((file) => createFileDraft(file));
      // 갱신 함수 안에서 한 번 더 자른다 — 카운터가 어긋나도 12개를 넘길 수 없다.
      setMaterials((prev) => {
        const space = Math.max(0, MAX_AUTHORING_MATERIALS - prev.length);
        return space === 0 ? prev : [...prev, ...drafts.slice(0, space)];
      });
      // ── 사진은 OCR 을 **아예 하지 않는다** (26-08-04 오너 결정) ─────────────
      //
      // 근거: 원본이 그대로 모델에 실리는 지금(defaultSendPages → 사진은 항상 ON),
      // OCR 콜은 같은 지면을 두 번 읽는 순수 중복이다. 사람이 챗에 사진을 붙일 때
      // 아무도 먼저 글자를 뽑지 않는 것과 같은 이유다 — 모델이 직접 본다.
      // 그 콜이 사라지면서 함께 사라지는 것: 대기 시간, 그 콜의 원가, 그리고
      // "사진에서 글자를 찾지 못했어요" 실패 모드.
      // 값을 치른 것 두 가지(정직하게): 검토 모달의 '읽어낸 내용' 칸이 비고,
      // 역할 자동분류가 파일명 휴리스틱까지만 간다. 둘 다 사람이 한 번에 고칠 수
      // 있는 표면이 이미 있다(역할 칩 · 본문 직접 입력).
      //
      // ⚠️ PDF 는 **그대로 판독한다.** 원본은 앞 4쪽까지만 실리는데(MAX_SEND_PAGES)
      //   판독은 20쪽을 덮으므로, 거기서 판독은 중복이 아니라 유일한 커버리지다.
      //   사진은 1장이 곧 지면 전체라 그 문제가 없다 — 이것이 두 형식을 가르는
      //   유일하고 실질적인 근거다(형식 취향이 아니다).
      const toRead: Array<{ id: string; file: File }> = [];
      for (const [index, draft] of drafts.entries()) {
        const file = accepted[index];
        if (draft.sourceKind === "FILE_IMAGE") {
          void uploadPages(draft.id, file, draft.sourceKind, { ownsStatus: true });
          continue;
        }
        toRead.push({ id: draft.id, file });
      }
      if (toRead.length > 0) enqueueRead(toRead);
    },
    [enqueueRead, takeRoom, uploadPages],
  );

  const handlePasteText = useCallback(
    (text: string) => {
      if (takeRoom(1) === 0) return;
      setMaterials((prev) =>
        prev.length >= MAX_AUTHORING_MATERIALS
          ? prev
          : [...prev, createTextDraft(text)],
      );
    },
    [takeRoom],
  );

  const handleRetry = useCallback(
    (id: string) => {
      const target = materialsRef.current.find((item) => item.id === id);
      if (!target) return;
      if (!target.file) {
        toast.warning(AUTHORING_COPY.TOAST.pastedRetry);
        return;
      }
      cancelRead(id);
      // 사진은 판독을 돌지 않으므로 '다시 읽기'가 곧 **원본 다시 올리기**다.
      // 여기서 enqueueRead 로 보내면 되살아난 OCR 콜이 조용히 다시 생긴다.
      if (target.sourceKind === "FILE_IMAGE") {
        patchDraft(id, {
          status: "READING",
          error: undefined,
          warning: undefined,
          progressLabel: AUTHORING_COPY.MATERIAL.preparingOriginal,
        });
        void uploadPages(id, target.file, target.sourceKind, { ownsStatus: true });
        return;
      }
      patchDraft(id, {
        status: "READING",
        error: undefined,
        warning: undefined,
        progressLabel: AUTHORING_COPY.MATERIAL.readingAgain,
      });
      enqueueRead([{ id, file: target.file }]);
    },
    [cancelRead, enqueueRead, patchDraft, uploadPages],
  );

  const handleRemove = useCallback(
    (id: string) => {
      cancelRead(id);
      // 뺀 자리는 **즉시** 비운다 — 같은 틱에 새 파일을 드롭해도 자리가 보여야 한다.
      countRef.current = Math.max(0, countRef.current - 1);
      setMaterials((prev) => prev.filter((item) => item.id !== id));
    },
    [cancelRead],
  );

  const applyInstructionSignal = useCallback((instruction: string) => {
    setMaterials((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const suggested = suggestVariationRole(item, instruction);
        if (!suggested || suggested === item.role) return item;
        changed = true;
        return { ...item, role: suggested };
      });
      return changed ? next : prev;
    });
  }, []);

  /**
   * 서버로 보낼 수 있는 자료 = **모델이 볼 것이 하나라도 있는** 자료.
   * 서버 계약(schema.authoringMaterialEntrySchema)의 refine 과 같은 판정이다.
   *
   * 판독 본문이 없어도 원본 페이지(storagePath)가 올라가 있으면 보낸다 — 사진이
   * 그 경로다. status 를 보지 않고 storagePath 를 보는 이유가 여기 있다:
   *  · READING 중이어도 업로드가 끝났으면 이미 실을 수 있다(사진의 무대기 경로).
   *  · **FAILED 여도 마찬가지다.** OCR 이 실패한 것과 사진이 못 쓸 것은 다른
   *    사실인데, 예전 계약은 글자를 못 읽었다는 이유로 멀쩡한 사진까지 버렸다.
   */
  const readyMaterials = useMemo(
    () =>
      materials.filter(
        (item) =>
          (item.status === "READY" && item.content.trim().length > 0) ||
          Boolean(item.storagePath),
      ),
    [materials],
  );
  /**
   * **실을 것이 아직 아무것도 없는** 자료 수 — CTA 예약 판정의 유일한 근거.
   *
   * ⚠️ "판독 중인 자료 수"가 아니다. 그 값을 쓰던 동안 사진은 원본이 이미 올라가
   * 실을 준비가 끝났는데도 OCR 이 끝날 때까지 발주가 대기했다. 여기 남는 것은
   * 지금 보내면 **정말로 통째로 빠지는** 자료뿐이다(= PDF·문서의 판독 대기).
   */
  const pendingCount = useMemo(
    () =>
      materials.filter((item) => {
        // 실패한 자료는 기다릴 것이 없다 — 이미 결말이 났고, 화면이 따로 알린다.
        if (item.status === "FAILED") return false;
        // ① 실을 것이 아직 아무것도 없다(사진 업로드 중 · 문서 판독 중).
        if (
          item.status === "READING" &&
          item.content.trim().length === 0 &&
          !item.storagePath
        ) {
          return true;
        }
        // ② 원본을 보내기로 한 자료인데 업로드가 아직 안 끝났다.
        //   판독본이 이미 있어 ①에는 안 걸리지만, 지금 보내면 **원본이 통째로
        //   빠진 채** 스위치만 켜진 상태로 크레딧이 나간다(스토어가 storagePath
        //   없는 sendPages 를 false 로 눕히므로 화면에도 흔적이 안 남는다).
        //   업로드 상한이 4→20 으로 늘어난 26-08-04 이후로는 이 창이 5배 넓다.
        if (item.sendPages === true && !item.storagePath) return true;
        return false;
      }).length,
    [materials],
  );

  return {
    materials,
    readyMaterials,
    pendingCount,
    atCapacity: materials.length >= MAX_AUTHORING_MATERIALS,
    patchMaterial,
    handleFiles,
    handlePasteText,
    handleRetry,
    handleRemove,
    applyInstructionSignal,
  };
}
