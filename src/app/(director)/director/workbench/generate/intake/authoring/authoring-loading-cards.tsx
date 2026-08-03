"use client";

// ============================================================================
// AI 지문 만들기 — 실행(run) 밴드 목록 = "조판 결과" 층
//
// 이 화면이 지켜야 하는 UX 약속은 둘이다.
//   1) "생성은 백그라운드다." 진행 밴드는 (a) 몇 편이 끝났는지 (b) 얼마나
//      남았는지 (c) 자리를 비워도 된다는 사실을 동시에 말한다.
//   2) **"결과는 그 자리에서 읽고, 그 자리에서 넣는다."** (26-07-26 저녁 재설계,
//      오너 지시) 구 완료 밴드는 제목 나열 + "S1" 각주 + [결과 보기] 버튼뿐인
//      메타 목록이라 "디자인이 전혀 안 들어간 수준"이었다 — 산출물(지문)이 화면
//      어디에도 없었다. 지금은 완성된 편마다 **지문 카드**가 서고, 펼치면 본문이
//      읽기 조판(15px/1.75)으로 흐르고 그 아래 해석(한국어 요약+집필 근거)이
//      붙으며, 카드 안에서 바로 지문함에 넣는다. 모달은 "고치기" 전용 보조가 됐다.
//
// ── 지문 카드가 이 층에서 유일하게 허용되는 상자인 이유 ─────────────────────
// 발주 밴드·결과 모달이 상자를 걷어낸 근거는 "상자 중첩이 정렬선을 쪼갠다"였다.
// 그 원칙의 예외는 처음부터 하나였다 — **산출물 자체는 흰 상자로 떠오른다**(결과
// 모달의 본문 에디터가 그랬다). 지문 카드는 그 예외의 연장이다: 밴드(선+여백)
// 위에 상품(지문)만 테두리 있는 흰 카드로 서고, 카드 내부는 다시 상자를 만들지
// 않는다 — 구획은 전부 hairline 이 하고, 내부 가로 인셋은 px-4 하나다.
//
// 회귀 방지 계약
//  - **run.title 이 이 밴드의 정체성이다.** 완료됐다고 제목을 강등하지 않는다.
//    상태는 제목 아래 한 줄이 말한다.
//  - 1초 타이머는 "진행 중인 run 이 하나라도 있을 때만" 돈다.
//  - 진행률·ETA 는 authoring-types.ts 의 estimateRunProgress/formatRunEta 만 쓴다.
//  - 과금 문구는 **아는 것만** 말하고 **한 밴드에 하나만** 뜬다(creditNoticeFor
//    정본 — 사본 금지, 실제 사고 이력).
//  - 아직 지문함에 넣지 않은 완료 결과는 **경고 없이 버리지 않는다.**
//  - 실패 밴드는 죽은 배너가 아니다 — [다시 만들기]가 컴포저를 채운다(실행 안 함).
//  - 화면 문구는 전량 passage-authoring-glossary.ts 경유(게이트 ⑤).
//  - **실시간 미리보기 패널은 여기서 새로 만들지 않는다**(공유 stream-preview-pane).
//  - **본문을 자르지 않는다.** 카드가 접혀 있을 뿐, 펼친 본문에 max-h·line-clamp 를
//    걸지 않는다(스크롤 2개 계약 — 좌 컬럼 스크롤이 이미 있다).
//  - 지문 카드의 "지문함에 넣기"는 **한 편 단위**다. 등록 성공 여부·중복 방지는
//    보드(registeredItemIds)가 소유한다 — 이 파일은 상태를 그릴 뿐 판정하지 않는다.
//  - 복구된 실행(items 미적재)은 [결과 보기]가 **인라인 적재**를 한다(onEnsureItems).
//    모달을 열지 않는다 — 읽는 자리는 여기다.
// ============================================================================

import { useEffect, useState } from "react";
import { Check, TriangleAlert, X } from "lucide-react";

import { StatusPill } from "@/components/layout/page-frame";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import type { AuthoringResultItem } from "@/lib/passage-authoring/schema";
import { cn } from "@/lib/utils";

import { StreamPreviewPane } from "../../stream-preview-pane";
import {
  AuthoringPassageEditor,
  type AuthoringPassageEditorProps,
} from "./authoring-passage-editor";
import { AuthoringButton, Gauge, Kicker } from "./authoring-primitives";
// 밴드 자체는 배경을 갖지 않는다 — 상자는 지문 카드(산출물) 하나뿐이다(상단 근거).
import { DESK, HAIRLINE } from "./authoring-tokens";
import { creditNoticeFor } from "./authoring-store-io";
import {
  estimateRunProgress,
  formatRunEta,
  isRunActive,
  type AuthoringRun,
} from "./authoring-types";

// ── 타이머 ───────────────────────────────────────────────────────────────────

/**
 * active 인 동안에만 1초 간격으로 "지금(ms)"을 갱신한다. active 가 꺼지면
 * interval 을 즉시 해제해 완료 후 유휴 리렌더를 0으로 만든다.
 */
function useNowWhile(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // effect 본문에서 직접 setState 하지 않는다(react-hooks/set-state-in-effect =
    // 캐스케이딩 렌더). 대신 다음 프레임에 첫 틱을 예약해, 오래 유휴 상태였다가
    // 실행이 시작된 순간의 stale now 를 1초 기다리지 않고 즉시 털어낸다.
    const raf = window.requestAnimationFrame(() => setNow(Date.now()));
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(id);
    };
  }, [active]);
  return now;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

export interface AuthoringRunCardsProps {
  runs: AuthoringRun[];
  /** 실행 단위로 지문함에 넣은 것 — 무경고 닫기를 허용하는 근거. */
  registeredIds: ReadonlySet<string>;
  /** 편(item) 단위로 지문함에 넣은 것 — 카드 푸터의 상태 표식 근거. */
  registeredItemIds: ReadonlySet<string>;
  /** 지금 등록 요청이 진행 중인가 — 카드의 넣기 버튼을 잠근다. */
  registering: boolean;
  /** 복구된 실행의 본문을 인라인으로 적재한다(모달을 열지 않는다). */
  onEnsureItems: (localId: string) => Promise<void>;
  /**
   * 편 단위 등록. 성공 여부·중복 방지·토스트는 보드가 소유한다.
   * ⚠️ 넘기는 item 은 **편집본을 반영한 사본**이다(제목·본문). 원본 run.items 를
   *    그대로 넘기면 선생님이 고친 내용이 조용히 버려진다.
   */
  onRegisterItems: (
    run: AuthoringRun,
    items: AuthoringResultItem[],
  ) => Promise<boolean>;
  /**
   * 변형 지문을 저장하기 직전, 이 편의 **원본 Passage id** 를 확보한다
   * (아직 지문함에 없으면 그 순간 등록한다 — 26-08-04 오너 결정).
   */
  onEnsureRegisteredId: (
    run: AuthoringRun,
    item: AuthoringResultItem,
  ) => Promise<string | null>;
  /** 변형본을 지문함에 저장한다. */
  onSaveVariant: AuthoringPassageEditorProps["onSaveVariant"];
  onDismiss: (localId: string) => void;
  /**
   * 후속 요청 — 컴포저를 채우고 그 실행의 스냅샷을 복원할 뿐 **실행하지 않는다**.
   * 미전달이면 칩을 그리지 않는다(죽은 버튼 금지).
   */
  onFollowUp?: (prompt: string, run: AuthoringRun) => void;
}

export function AuthoringRunCards({
  runs,
  registeredIds,
  registeredItemIds,
  registering,
  onEnsureItems,
  onRegisterItems,
  onEnsureRegisteredId,
  onSaveVariant,
  onDismiss,
  onFollowUp,
}: AuthoringRunCardsProps) {
  const activeRuns = runs.filter(isRunActive);
  const hasActive = activeRuns.length > 0;
  const now = useNowWhile(hasActive);

  // 훅 호출 뒤에 조기 반환 — 훅 순서 규칙 유지.
  if (runs.length === 0) return null;

  // "쓰고 있는 편"은 요청 편수 총합이 아니라 **아직 안 나온 편**이다.
  const writingCount = activeRuns.reduce(
    (sum, run) => sum + Math.max(0, run.requestedCount - run.successCount),
    0,
  );

  return (
    <section className="min-w-0" aria-label={AUTHORING_COPY.A11Y.runList}>
      <header className="flex min-w-0 flex-wrap items-center gap-2 pb-2">
        <Kicker>{AUTHORING_COPY.KICKER.result}</Kicker>
        {hasActive ? (
          <>
            {/* 남은 편수가 0으로 떨어지는 짧은 순간("다 나왔지만 아직 RUNNING")에
                "남은 0편을 쓰고 있어요"라고 적지 않는다. */}
            <StatusPill tone="blue" pulse>
              {writingCount > 0
                ? AUTHORING_COPY.RUN.writing(writingCount)
                : AUTHORING_COPY.RUN.statusWriting}
            </StatusPill>
            <span className={cn(DESK.meta, "min-w-0 text-slate-500")}>
              {AUTHORING_COPY.RUN.backgroundHint}
            </span>
          </>
        ) : null}
      </header>

      <ul className="min-w-0">
        {runs.map((run) => (
          <AuthoringRunBand
            key={run.localId}
            run={run}
            now={now}
            registered={registeredIds.has(run.localId)}
            registeredItemIds={registeredItemIds}
            registering={registering}
            onEnsureItems={onEnsureItems}
            onRegisterItems={onRegisterItems}
            onEnsureRegisteredId={onEnsureRegisteredId}
            onSaveVariant={onSaveVariant}
            onDismiss={onDismiss}
            onFollowUp={onFollowUp}
          />
        ))}
      </ul>
    </section>
  );
}

// ── 밴드 1건 ─────────────────────────────────────────────────────────────────

function AuthoringRunBand({
  run,
  now,
  registered,
  registeredItemIds,
  registering,
  onEnsureItems,
  onRegisterItems,
  onEnsureRegisteredId,
  onSaveVariant,
  onDismiss,
  onFollowUp,
}: {
  run: AuthoringRun;
  now: number;
  registered: boolean;
  registeredItemIds: ReadonlySet<string>;
  registering: boolean;
  onEnsureItems: (localId: string) => Promise<void>;
  onRegisterItems: (
    run: AuthoringRun,
    items: AuthoringResultItem[],
  ) => Promise<boolean>;
  onEnsureRegisteredId: (
    run: AuthoringRun,
    item: AuthoringResultItem,
  ) => Promise<string | null>;
  onSaveVariant: AuthoringPassageEditorProps["onSaveVariant"];
  onDismiss: (localId: string) => void;
  onFollowUp?: (prompt: string, run: AuthoringRun) => void;
}) {
  // 아직 등록하지 않은 결과를 버리려 할 때만 확인 단계를 끼운다(되돌릴 수 없음).
  const [confirming, setConfirming] = useState(false);
  // 복구된 실행의 인라인 적재 상태(이 밴드 한정).
  const [loadingItems, setLoadingItems] = useState(false);
  // 펼친 편 집합. null = 아직 손대지 않음 → 기본 규칙(한 편짜리 실행은 펼쳐서
  // 도착) 적용. 사용자가 한 번이라도 토글하면 그 선택이 이긴다.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string> | null>(null);

  const active = isRunActive(run);
  const failed = run.status === "FAILED";
  const failedCount =
    run.failedCount > 0
      ? run.failedCount
      : Math.max(0, run.requestedCount - run.successCount);
  const partial = !failed && !active && failedCount > 0;
  const creditNotice = creditNoticeFor(run);

  const okItems = run.items.filter((item) => item.status === "OK");
  const failedItems = run.items.filter((item) => item.status === "FAILED");
  // 복구된 실행은 요약만 있고 본문이 없다 — [결과 보기]가 인라인으로 채운다.
  const itemsMissing = !active && !failed && okItems.length === 0 && Boolean(run.jobId);

  // 자료 몇 건이 실렸는지 — 상태 줄에 한 조각으로 붙는다(별도 각주 줄 폐기.
  // 구 "S1" 골격 각주는 선생님에게 아무 뜻이 없어 함께 삭제했다).
  const materialCount = (() => {
    const ids = new Set<string>();
    for (const item of run.items)
      for (const id of item.usedMaterialIds ?? []) ids.add(id);
    return ids.size;
  })();

  const effectiveExpanded: ReadonlySet<string> =
    expandedIds ??
    // 기본 규칙: 한 편짜리 실행은 도착 즉시 펼쳐진 채 나타난다 — "생성된 지문이
    // 잘 보여야 한다"가 이 재설계의 발주 문장이다. 여러 편이면 접힌 채 나열한다
    // (요약 줄로 고르게 하고, 펼침은 사용자가 정한다).
    (okItems.length === 1 ? new Set([okItems[0].id]) : new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds(() => {
      const next = new Set(effectiveExpanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const itemRegistered = (item: AuthoringResultItem) =>
    registered || registeredItemIds.has(item.id);
  const unregisteredOk = okItems.filter((item) => !itemRegistered(item));

  // ── 편집 초안 — 제목·본문의 진실 ────────────────────────────────────────────
  // 등록도 변형도 **이 값**을 쓴다. run.items 는 서버가 준 원본이라 절대 고치지
  // 않는다(구 결과 모달의 소유권 계약을 그대로 승계).
  // ⚠️ 폴링으로 run.items 가 늘어나도 **새 id 만** 시드한다 — 매번 통째로
  //    재생성하면 타이핑이 날아간다(구 모달에서 실제로 났던 회귀).
  const [drafts, setDrafts] = useState<
    Record<string, { title: string; content: string }>
  >({});
  const draftFor = (item: AuthoringResultItem) =>
    drafts[item.id] ?? { title: item.title, content: item.passage };
  const patchDraft = (
    item: AuthoringResultItem,
    patch: Partial<{ title: string; content: string }>,
  ) =>
    setDrafts((prev) => ({
      ...prev,
      [item.id]: { ...(prev[item.id] ?? { title: item.title, content: item.passage }), ...patch },
    }));
  /** 편집본을 반영한 사본. 등록·변형에는 반드시 이걸 넘긴다(원본 금지). */
  const withDraft = (item: AuthoringResultItem): AuthoringResultItem => {
    const d = draftFor(item);
    return { ...item, title: d.title, passage: d.content };
  };

  // ── 일괄 등록 선택 ──────────────────────────────────────────────────────────
  // 구 결과 모달의 "전체 선택 + 모두 넣기"를 이 자리로 옮긴 것(26-08-04).
  // 선택이 하나도 없으면 기존 동작 그대로 "남은 N편 모두"가 대상이다.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedUnregistered = unregisteredOk.filter((item) =>
    selectedIds.has(item.id),
  );
  /** 묶음 넣기의 실제 대상 — 고른 게 있으면 그것만, 없으면 남은 전부. */
  const bulkTargets =
    selectedUnregistered.length > 0 ? selectedUnregistered : unregisteredOk;
  const allSelected =
    unregisteredOk.length > 0 &&
    unregisteredOk.every((item) => selectedIds.has(item.id));
  const toggleSelectAll = () =>
    setSelectedIds(
      allSelected ? new Set() : new Set(unregisteredOk.map((item) => item.id)),
    );

  const requestDismiss = () => {
    if (registered || failed || unregisteredOk.length === 0) {
      onDismiss(run.localId);
      return;
    }
    setConfirming(true);
  };

  const handleLoadItems = () => {
    if (loadingItems) return;
    setLoadingItems(true);
    void onEnsureItems(run.localId).finally(() => setLoadingItems(false));
  };

  return (
    <li
      className={cn(
        // 좌측 2px accent bar — 진행/완료/실패가 같은 형태이고 이 선만 색이 다르다.
        // ⚠️ 바는 **밴드 내용 높이에만** 선다(inset-y-4 = py-4 와 같은 값). h-full 로
        //   두면 연속된 밴드의 바가 한 줄로 이어져 목록 전체가 한 덩어리로 읽힌다
        //   (26-07-26 실사용: "생성된 지문들 사이 경계를 구분해줘"). 바 끊김 16+16
        //   + hairline 이 밴드 경계를 만든다 — py 와 inset-y 는 반드시 같이 고친다.
        "relative min-w-0 border-b py-4 pl-4",
        HAIRLINE,
        "before:absolute before:left-0 before:inset-y-4 before:w-0.5",
        active
          ? "before:bg-blue-600"
          : failed
            ? "before:bg-rose-600"
            : "before:bg-emerald-600",
      )}
    >
      {/* 제목 줄 — run.title 은 상태가 바뀌어도 이 자리에 이 크기로 남는다. */}
      <div className="flex min-w-0 items-center gap-2">
        <p className={cn(DESK.title, "min-w-0 flex-1 truncate text-slate-900")}>
          {run.title}
        </p>
        {registered ? (
          <StatusPill tone="emerald">{AUTHORING_COPY.RUN.registered}</StatusPill>
        ) : null}
        {!active ? (
          <CardDetailIconButton
            icon={X}
            onClick={requestDismiss}
            className="size-7"
            title={AUTHORING_COPY.A11Y.closeRunCard}
            aria-label={AUTHORING_COPY.A11Y.closeRunCard}
          />
        ) : null}
      </div>

      {/* 상태 줄 — 무슨 일이 일어났는지 + 자료 몇 건이 실렸는지, 한 문장. */}
      <p
        className={cn(
          DESK.meta,
          "mt-1 min-w-0 leading-snug",
          active ? "text-blue-700" : failed ? "text-rose-700" : "text-emerald-700",
        )}
      >
        {active
          ? AUTHORING_COPY.RUN.progressWithEta(
              run.successCount,
              run.requestedCount,
              formatRunEta(run, now),
            )
          : failed
            ? AUTHORING_COPY.RUN.failed
            : partial
              ? AUTHORING_COPY.RUN.donePartial(run.successCount, failedCount)
              : AUTHORING_COPY.RUN.done(run.successCount)}
        {!failed && materialCount > 0 ? (
          <span className="text-slate-500">
            {" · "}
            {AUTHORING_COPY.RUN.materialsSent(materialCount)}
          </span>
        ) : null}
      </p>

      {active ? (
        <Gauge
          value={estimateRunProgress(run, now)}
          total={100}
          ariaLabel={AUTHORING_COPY.RUN.statusWriting}
          className="mt-2"
        />
      ) : null}

      {/* 실시간 미리보기 — 사고 단계 → 작성 단계 전환이 여기서 보인다. */}
      {active && run.preview ? <StreamPreviewPane preview={run.preview} /> : null}

      {/* 실패 사유 */}
      {failed ? (
        <p className={cn(DESK.meta, "mt-2 break-words leading-relaxed text-rose-700")}>
          {run.error?.trim() || AUTHORING_COPY.RUN.failedBody}
        </p>
      ) : null}

      {/* ── 지문 카드들 — 이 층의 주인공. 완성되는 즉시(진행 중에도) 선다. ── */}
      {okItems.length > 0 ? (
        <ul className="mt-3 flex min-w-0 flex-col gap-2">
          {okItems.map((item) => (
            <PassageItemCard
              key={item.id}
              item={item}
              index={item.index}
              expanded={effectiveExpanded.has(item.id)}
              registered={itemRegistered(item)}
              registering={registering}
              draft={draftFor(item)}
              onChangeDraft={(patch) => patchDraft(item, patch)}
              selected={selectedIds.has(item.id)}
              onToggleSelected={() => toggleSelected(item.id)}
              onToggle={() => toggleExpanded(item.id)}
              onRegister={() => void onRegisterItems(run, [withDraft(item)])}
              ensureRegistered={() => onEnsureRegisteredId(run, withDraft(item))}
              onSaveVariant={onSaveVariant}
            />
          ))}
          {failedItems.map((item) => (
            <li
              key={item.id}
              className={cn(
                DESK.meta,
                "flex min-w-0 items-start gap-1 leading-snug text-rose-700",
              )}
            >
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {AUTHORING_COPY.RUN.itemFailed(item.index + 1)}
                {item.error?.trim() ? ` — ${item.error.trim()}` : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* 복구된 실행 — 본문을 인라인으로 불러온다(모달 아님). */}
      {itemsMissing ? (
        <div className="mt-3 min-w-0">
          {loadingItems ? (
            <p className={cn(DESK.meta, "leading-snug text-slate-500")}>
              {AUTHORING_COPY.RESULTS_MODAL.loading}
            </p>
          ) : (
            <AuthoringButton variant="secondary" onClick={handleLoadItems}>
              {AUTHORING_COPY.CTA.openResults}
            </AuthoringButton>
          )}
        </div>
      ) : null}

      {creditNotice ? (
        <p className={cn(DESK.meta, "mt-2 leading-snug text-slate-600")}>
          {creditNotice}
        </p>
      ) : null}

      {/* 행동 줄 — 편 단위 넣기는 카드 안에 있으므로, 밴드 바닥에는 묶음 행동만. */}
      {confirming ? (
        <div className="mt-2 min-w-0">
          <p className={cn(DESK.meta, "leading-snug text-rose-700")}>
            {AUTHORING_COPY.RUN.dismissConfirm}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <AuthoringButton variant="primary" onClick={() => setConfirming(false)}>
              {AUTHORING_COPY.CTA.keep}
            </AuthoringButton>
            <AuthoringButton variant="danger" onClick={() => onDismiss(run.localId)}>
              {AUTHORING_COPY.CTA.discard}
            </AuthoringButton>
          </div>
        </div>
      ) : !active ? (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
          {failed && onFollowUp ? (
            <AuthoringButton
              variant="secondary"
              onClick={() => onFollowUp(AUTHORING_COPY.FOLLOWUP.PROMPT.retry, run)}
            >
              {AUTHORING_COPY.CTA.retryRun}
            </AuthoringButton>
          ) : null}
          {/* 두 편 이상 남았을 때만 묶음 넣기 — 한 편은 카드 안 버튼이 이미 한다.
              구 결과 모달의 "전체 선택 + 모두 넣기"가 이 자리로 내려왔다(26-08-04).
              카드 헤더의 체크박스로 고른 편이 있으면 그것만, 없으면 남은 전부. */}
          {unregisteredOk.length >= 2 ? (
            <>
              <AuthoringButton variant="ghost" onClick={toggleSelectAll}>
                {allSelected
                  ? AUTHORING_COPY.CTA.unselectAll
                  : AUTHORING_COPY.CTA.selectAll}
              </AuthoringButton>
              <AuthoringButton
                variant="primary"
                disabled={registering}
                onClick={() => void onRegisterItems(run, bulkTargets.map(withDraft))}
              >
                {registering
                  ? AUTHORING_COPY.CTA.registering
                  : AUTHORING_COPY.CTA.registerAll(bulkTargets.length)}
              </AuthoringButton>
            </>
          ) : null}
          <AuthoringButton variant="ghost" onClick={requestDismiss}>
            {AUTHORING_COPY.CTA.close}
          </AuthoringButton>
        </div>
      ) : null}
    </li>
  );
}

// ── 지문 카드 1장 ────────────────────────────────────────────────────────────
//
// 26-08-04 오너 지시로 **읽기 전용 카드 + '고치기' 모달**을 폐기하고, 워크스페이스
// 지문 행(WorkspacePassageRow)을 그대로 끼웠다. 생성된 지문을 다른 화면으로
// 옮기지 않고 그 자리에서 고치고, AI 도구(복원 · 변형 지문 · 앞 맥락 문단 ·
// 문장 재작성)도 워크스페이스와 **같은 코드**로 쓴다.
//
// 카드가 직접 그리는 것은 두 가지뿐이다 — 해석(요약+집필 근거)과 행동(넣기).
// 둘 다 행의 footer 자리로 넘긴다. 제목·번호·접기·체크박스·본문은 전부 행이 그린다
// (여기서 다시 그리면 헤더가 두 개가 된다).
//
// 접힘 상태는 밴드가 소유한다 — "한 편짜리 실행은 펼쳐서 도착"이라는 규칙이 편
// 바깥에서 정해지기 때문이다(effectiveExpanded).

function PassageItemCard({
  item,
  index,
  expanded,
  registered,
  registering,
  draft,
  onChangeDraft,
  selected,
  onToggleSelected,
  onToggle,
  onRegister,
  ensureRegistered,
  onSaveVariant,
}: {
  item: AuthoringResultItem;
  index: number;
  expanded: boolean;
  registered: boolean;
  registering: boolean;
  draft: { title: string; content: string };
  onChangeDraft: (patch: Partial<{ title: string; content: string }>) => void;
  selected: boolean;
  onToggleSelected: () => void;
  onToggle: () => void;
  onRegister: () => void;
  ensureRegistered: () => Promise<string | null>;
  onSaveVariant: AuthoringPassageEditorProps["onSaveVariant"];
}) {
  const summary = item.koreanSummary.trim();
  const rationale = item.rationale.trim();

  return (
    <li className="min-w-0">
      <AuthoringPassageEditor
        item={item}
        index={index}
        disabled={registering}
        title={draft.title}
        onChangeTitle={(title) => onChangeDraft({ title })}
        onChangeContent={(content) => onChangeDraft({ content })}
        selected={selected}
        onToggleSelected={onToggleSelected}
        collapsed={!expanded}
        onToggleCollapsed={onToggle}
        ensureRegistered={ensureRegistered}
        onSaveVariant={onSaveVariant}
        footer={
          <div className="min-w-0 space-y-2 px-1">
            {/* 해석 — 접혀 있을 때는 그리지 않는다(접힘은 "요약 줄만 본다"는 뜻). */}
            {expanded && (summary || rationale) ? (
              <div className="min-w-0">
                <Kicker>{AUTHORING_COPY.RESULT.interpretTitle}</Kicker>
                {summary ? (
                  <p
                    className={cn(
                      DESK.body,
                      "mt-1 break-words leading-snug text-slate-800",
                    )}
                  >
                    {summary}
                  </p>
                ) : null}
                {rationale ? (
                  <p
                    className={cn(
                      DESK.meta,
                      "mt-1 whitespace-pre-wrap break-words leading-relaxed text-slate-600",
                    )}
                  >
                    {rationale}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* 행동 — 접혀 있어도 보인다(구 카드가 헤더에 넣기 버튼을 둔 이유와 같다). */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {registered ? (
                <span
                  className={cn(
                    DESK.meta,
                    "inline-flex items-center gap-1 text-emerald-700",
                  )}
                >
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                  {AUTHORING_COPY.RUN.itemRegistered}
                </span>
              ) : (
                <AuthoringButton
                  variant="primary"
                  disabled={registering}
                  onClick={onRegister}
                >
                  {registering
                    ? AUTHORING_COPY.CTA.registering
                    : AUTHORING_COPY.CTA.registerOne}
                </AuthoringButton>
              )}
            </div>
          </div>
        }
      />
    </li>
  );
}
