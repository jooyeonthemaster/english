"use client";

// "포인트 짚어주기"(교사 지정 출제 포인트) 픽커 클러스터 —
// generate-page-client.tsx 에서 추출. 픽커 열림/AI 제안 상태, 본문 해시
// staleness 무효화, 열기/닫기/완료 핸들러, 포인트 집계와 pointPickerNode JSX
// 를 담당한다. teacherPointsByPassage 상태 자체는 본체 소유로 남는다 —
// useGenerationHandlers/useWorkspaceGeneration 이 이 훅보다 먼저 소비하기
// 때문(훅은 값·세터를 파라미터로 받는다). 코드는 바이트 동일 이동(무회귀).

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { triggerHintGlowWithin } from "@/lib/hint-glow";
import { countPassageSentences } from "@/lib/passage-sentence-utils";
import {
  readSentenceInsertSlotCountSetting,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import { hashPassageText } from "./generate-page-client-lib";
import {
  resolvePointPickerMeta,
  type TeacherPoint,
} from "./generation-config-panel-parts/point-picker-config";
import {
  PassagePointPicker,
  type PointSuggestState,
} from "./workspace/passage-point-picker";
import { type WorkspaceRow } from "./workspace/workspace-types";
import { type WorkspaceRowsApi } from "./workspace/use-workspace-rows";

interface UsePointPickerParams {
  workspaceApi: WorkspaceRowsApi;
  teacherPointsByPassage: Record<string, Record<string, TeacherPoint[]>>;
  setTeacherPointsByPassage: Dispatch<
    SetStateAction<Record<string, Record<string, TeacherPoint[]>>>
  >;
  genModalOpen: boolean;
  activeRow: WorkspaceRow | null;
  panelQuestionTypeSettings: QuestionTypeGenerationSettings;
  panelTypeCounts: Record<string, number>;
  panelSetTypeCount: (id: string, count: number) => void;
}

export function usePointPicker({
  workspaceApi,
  teacherPointsByPassage,
  setTeacherPointsByPassage,
  genModalOpen,
  activeRow,
  panelQuestionTypeSettings,
  panelTypeCounts,
  panelSetTypeCount,
}: UsePointPickerParams) {
  // passageId → 포인트를 지정하던 시점의 본문 해시(hashPassageText).
  const teacherPointsHashRef = useRef<Record<string, string>>({});
  // 생성 모달 안에서 열린 픽커 대상 — null 이면 기존 설정 콘솔 단독(1컬럼).
  const [pickerOpen, setPickerOpen] = useState<{
    passageId: string;
    typeId: string;
  } | null>(null);
  // 픽커의 AI 제안 채널 — (passageId, typeId) 스코프. 픽커를 열거나 전환할
  // 때마다 idle 로 리셋하고, 낡은 응답은 시퀀스 가드로 폐기한다(실패 비차단).
  const [pointSuggestState, setPointSuggestState] =
    useState<PointSuggestState>({ status: "idle" });
  const pointSuggestSeqRef = useRef(0);

  // ── "포인트 짚어주기" 배선 (point-picker-design.md §1·§2·§5) ──
  // 본문이 지정 시점 해시와 어긋난 지문의 포인트를 무효화한다(1줄 안내). 워크
  // 스페이스에서 내려갔거나 변형본으로 재바인딩된 지문의 포인트는 조용히 정리
  // 한다 — 어느 쪽이든 낡은 오프셋·축자를 생성에 실어 보내지 않는다.
  useEffect(() => {
    const staleIds: string[] = [];
    const staleTitles: string[] = [];
    for (const passageId of Object.keys(teacherPointsByPassage)) {
      const row = workspaceApi.rows.find((r) => r.passageId === passageId);
      if (
        row &&
        hashPassageText(row.content) === teacherPointsHashRef.current[passageId]
      ) {
        continue;
      }
      staleIds.push(passageId);
      if (row) staleTitles.push(row.title);
    }
    if (staleIds.length === 0) return;
    setTeacherPointsByPassage((prev) => {
      const next = { ...prev };
      for (const id of staleIds) delete next[id];
      return next;
    });
    for (const id of staleIds) delete teacherPointsHashRef.current[id];
    for (const title of staleTitles) {
      toast.info(
        `"${title}" 본문이 수정되어 지정한 출제 포인트가 초기화됐습니다.`,
      );
    }
  }, [workspaceApi.rows, teacherPointsByPassage]);

  // 모달이 닫히면(어느 경로로든) 픽커도 닫는다 — 다음엔 설정 콘솔부터 연다.
  useEffect(() => {
    if (!genModalOpen && pickerOpen) setPickerOpen(null);
  }, [genModalOpen, pickerOpen]);

  // 유형 세부설정의 진입 행(type-numeric-detail)이 호출 — 활성 지문 스코프로
  // 픽커를 연다. 스코프가 바뀌므로 AI 제안 채널도 idle 로 갈아끼운다.
  const handleOpenPointPicker = (typeId: string) => {
    if (!activeRow) return;
    pointSuggestSeqRef.current += 1; // 이전 스코프의 늦은 응답 폐기
    setPointSuggestState({ status: "idle" });
    setPickerOpen({ passageId: activeRow.passageId, typeId });
  };

  // 픽커 닫기(설정 콘솔 복귀) — '선택 완료' 버튼과 모달 Esc 사다리 1단 공용.
  const closePointPicker = () => {
    pointSuggestSeqRef.current += 1;
    setPickerOpen(null);
  };

  // 렌더 가드 — 픽커 대상과 활성 행이 어긋나면(행 전환·변형 재바인딩 직후)
  // 렌더하지 않는다. 미등재 유형(메타 없음)도 방어적으로 걸러낸다.
  const pickerTarget =
    pickerOpen && activeRow && pickerOpen.passageId === activeRow.passageId
      ? pickerOpen
      : null;
  const pickerMeta = pickerTarget
    ? resolvePointPickerMeta(
        pickerTarget.typeId,
        // 캐스트 사유: 유형 id 는 동적 문자열이라 명명 키 인터페이스
        // (QuestionTypeGenerationSettings)를 string 으로 인덱싱할 수 없다.
        // resolvePointPickerMeta 의 typeSettings 파라미터는 unknown 이므로
        // 키 좁힘 캐스트만으로 안전하다(런타임 동작 동일).
        panelQuestionTypeSettings[
          pickerTarget.typeId as keyof QuestionTypeGenerationSettings
        ],
      )
    : undefined;

  // '선택 완료' 완료 닫기 — Esc(취소, closePointPicker)와 달리 "포인트만 찍고
  // 문항 수 0"인 헛수고 상태를 차단한다: 이 유형 문항 수가 0이면 1로 올리고,
  // 어떤 유형에 문항이 잡혔는지 해당 유형 타일을 힌트 글로우로 안내한다.
  // (SENTENCE_INSERT 는 패널의 짧은 지문 게이트와 같은 조건이면 올리지 않는다.)
  const completePointPicker = () => {
    const target = pickerTarget;
    closePointPicker();
    if (!target) return;
    if ((panelTypeCounts[target.typeId] ?? 0) > 0) return;
    if (target.typeId === "SENTENCE_INSERT" && activeRow) {
      const requiredSentences =
        readSentenceInsertSlotCountSetting(
          panelQuestionTypeSettings.SENTENCE_INSERT,
        ) + 1;
      const sentenceCount = countPassageSentences(activeRow.content);
      if (sentenceCount > 0 && sentenceCount < requiredSentences) return;
    }
    panelSetTypeCount(target.typeId, 1);
    // 픽커 닫힘·카운트 반영이 커밋된 뒤 해당 유형 타일만 글로우한다.
    window.setTimeout(() => {
      triggerHintGlowWithin(
        document.body,
        `[data-question-type-id="${target.typeId}"]`,
      );
    }, 120);
  };

  // ScanSearch 버튼 명시 호출 — POST /api/workbench/point-suggest (크레딧 0).
  // 실패는 완전 비차단(픽커가 안내만 표시, 수동 선택 계속). 시퀀스 가드로
  // 픽커 전환 뒤 도착한 낡은 응답을 폐기한다.
  const handleRequestPointSuggest = () => {
    if (!pickerTarget || !pickerMeta) return;
    if (pointSuggestState.status === "loading") return;
    const { passageId, typeId } = pickerTarget;
    const seq = (pointSuggestSeqRef.current += 1);
    setPointSuggestState({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch("/api/workbench/point-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            passageId,
            questionType: typeId,
            unit: pickerMeta.unit,
            // 후보는 항상 라우트 상한(8개)까지 받아 교사가 고르게 한다 —
            // 반영 상한(maxPoints)은 픽커가 승격 시점에 따로 강제한다.
            maxPoints: 8,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (pointSuggestSeqRef.current !== seq) return; // 픽커 전환 — 폐기
        if (!res.ok) {
          throw new Error(
            typeof data?.error === "string" && data.error
              ? data.error
              : "AI 포인트 제안에 실패했습니다.",
          );
        }
        setPointSuggestState({
          status: "done",
          suggestions: Array.isArray(data?.suggestions)
            ? data.suggestions
            : [],
          cached: data?.cached === true,
        });
      } catch (err) {
        if (pointSuggestSeqRef.current !== seq) return;
        setPointSuggestState({
          status: "error",
          message:
            err instanceof Error && err.message
              ? err.message
              : "AI 포인트 제안에 실패했습니다.",
        });
      }
    })();
  };

  // 픽커 onChange — 반환값은 이미 start 정렬 + 축자 검증 완료(픽커 계약).
  // 지정 시점의 본문 해시를 함께 기록해 위 무효화 effect 의 기준으로 삼는다.
  const handleTeacherPointsChange = (next: TeacherPoint[]) => {
    if (!pickerTarget || !activeRow) return;
    const { passageId, typeId } = pickerTarget;
    teacherPointsHashRef.current[passageId] = hashPassageText(
      activeRow.content,
    );
    setTeacherPointsByPassage((prev) => {
      const forPassage = { ...(prev[passageId] ?? {}) };
      if (next.length === 0) delete forPassage[typeId];
      else forPassage[typeId] = next;
      if (Object.keys(forPassage).length === 0) {
        const rest = { ...prev };
        delete rest[passageId];
        return rest;
      }
      return { ...prev, [passageId]: forPassage };
    });
  };

  // 활성 지문의 유형별 포인트 수 — 유형 타일 "포인트 N" 배지(패널)와 푸터
  // '포인트 N개 반영' 칩(모달)에 쓴다.
  const activeRowTeacherPoints: Record<string, TeacherPoint[]> = activeRow
    ? (teacherPointsByPassage[activeRow.passageId] ?? {})
    : {};
  const activeRowPointCounts: Record<string, number> = Object.fromEntries(
    Object.entries(activeRowTeacherPoints).map(([typeId, points]) => [
      typeId,
      points.length,
    ]),
  );
  const activeRowPointTotal = Object.values(activeRowPointCounts).reduce(
    (a, b) => a + b,
    0,
  );
  // 푸터 '포인트 N개 반영' 칩 — 포인트는 있는데 문항 수가 0인 유형이 있으면
  // '문항 수를 지정하세요' 보조 문구를 붙이고, 클릭 시 그 유형(없으면 첫 포인트
  // 유형)의 픽커로 재진입시킨다("포인트만 찍고 문항 수 0" 헛수고의 복구 동선).
  const pointTypeIds = Object.keys(activeRowPointCounts);
  const zeroCountPointTypeIds = pointTypeIds.filter(
    (typeId) => (panelTypeCounts[typeId] ?? 0) === 0,
  );
  const handlePointChipClick = () => {
    const targetTypeId = zeroCountPointTypeIds[0] ?? pointTypeIds[0];
    if (targetTypeId) handleOpenPointPicker(targetTypeId);
  };

  // 모달 좌컬럼 지문 무대 — key 리마운트로 지문/유형 전환 시 픽커 내부 제스처
  // 상태를 초기화한다(suggestState 는 handleOpenPointPicker 가 함께 리셋).
  const pointPickerNode =
    pickerTarget && pickerMeta && activeRow ? (
      <PassagePointPicker
        key={`${pickerTarget.passageId}:${pickerTarget.typeId}`}
        passageId={pickerTarget.passageId}
        passageText={activeRow.content}
        typeId={pickerTarget.typeId}
        typeLabel={
          QUESTION_TYPE_UI[pickerTarget.typeId]?.label ?? pickerTarget.typeId
        }
        meta={pickerMeta}
        points={
          teacherPointsByPassage[pickerTarget.passageId]?.[
            pickerTarget.typeId
          ] ?? []
        }
        onChange={handleTeacherPointsChange}
        maxPoints={pickerMeta.maxPoints}
        // '선택 완료' = 완료 닫기(문항 수 0이면 1로 보정) — Esc 취소 닫기
        // (onPickerClose=closePointPicker)와 의미를 분리한다.
        onClose={completePointPicker}
        suggestState={pointSuggestState}
        onRequestSuggest={handleRequestPointSuggest}
      />
    ) : null;

  return {
    handleOpenPointPicker,
    closePointPicker,
    activeRowPointCounts,
    activeRowPointTotal,
    zeroCountPointTypeIds,
    handlePointChipClick,
    pointPickerNode,
  };
}
