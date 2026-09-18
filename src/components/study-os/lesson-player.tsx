"use client";

// ============================================================================
// 인터랙티브 레슨 플레이어 — 블록 카드 스택.
//
// 원칙(docs/study-os-spec.md §4):
//  - 학생은 언제나 "지금 무엇을 하는지"와 "다음이 무엇인지"를 안다.
//  - 뒤로가기는 명시적이다(router.back() 금지 — 딥링크로 들어오면 앱 밖으로 나간다).
//  - 이탈해도 진행이 저장되고, 재진입 시 이어서 볼지 묻는다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  MessageCircleQuestion,
  PanelRightClose,
  PanelRightOpen,
  Shield,
  X,
} from "lucide-react";
import { BackBar } from "@/components/grammar-drill/back-bar";
import { ChatSheet } from "@/components/grammar-drill/sheets";
import type { SafeLesson, SafeLessonBlock } from "@/lib/study-os/lesson-payload";
import { TIER_LABEL } from "@/lib/study-os/lesson-types";
import type { GameEvent, GrowthReport } from "@/lib/study-os/stats";
import {
  AlgorithmView,
  CompletionView,
  ContrastView,
  DiagramView,
  ExamView,
  HookView,
  MisconceptionView,
  RuleView,
  SummaryView,
  TrapView,
  WorkedView,
} from "./lesson-blocks";
import {
  ErrorHuntView,
  GenerateView,
  NoteView,
  SelfExplainView,
  SortView,
  TransferView,
} from "./lesson-blocks-interactive";
import {
  ConceptIntroView,
  MnemonicView,
  NotebookView,
  TableView,
} from "./lesson-blocks-notebook";
import {
  MemoryGateView,
  SpeedOxView,
  WordHuntView,
} from "./lesson-blocks-game-core";
import {
  BossView,
  OddOneOutView,
  PairMatchView,
} from "./lesson-blocks-game-arena";
import { StatusWindow } from "./status-window";
import { CheckBlockView } from "./lesson-check-block";
import { LessonDoneScreen } from "./lesson-done-screen";

/** 게임 결과 순위 — 같은 블록의 재도전은 최고 기록만 서버에 신고한다 */
const OUTCOME_RANK: Record<GameEvent["result"], number> = {
  fail: 0,
  done: 1,
  perfect: 2,
};

export interface LessonPlayerProps {
  lesson: SafeLesson;
  /** 이전 진행 — 없으면 처음부터 */
  resumeIndex: number;
  alreadyCompleted: boolean;
  savedNote: string;
  /** 유닛 내 다음 개념(있으면 완료 화면에서 이어간다) */
  nextConceptId: string | null;
}

export function LessonPlayer({
  lesson,
  resumeIndex,
  alreadyCompleted,
  savedNote,
  nextConceptId,
}: LessonPlayerProps) {
  const router = useRouter();
  const total = lesson.blocks.length;

  const [askResume, setAskResume] = useState(resumeIndex > 0 && !alreadyCompleted);
  const [idx, setIdx] = useState(0);
  const [note, setNote] = useState(savedNote);
  const [checkResults, setCheckResults] = useState({ correct: 0, total: 0 });
  const [answered, setAnswered] = useState<Record<string, number>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [growth, setGrowth] = useState<GrowthReport | null>(null);
  // 태블릿+ 사이드레일(목차) 펼침 여부 — 학생 선택을 localStorage 에 기억(레슨 간 유지).
  const [railOpen, setRailOpen] = useState(true);
  const mainRef = useRef<HTMLDivElement>(null);
  // 게임 결과 — 블록별 최고 기록만 유지, 저장 성공 시 비운다(원장은 서버가 관리)
  const gameEvents = useRef<Record<string, GameEvent>>({});
  // 렌더 중 Date.now() 호출은 순수성 위반이다 — 마운트 후에 채운다.
  const savedAt = useRef(0);
  useEffect(() => {
    savedAt.current = Date.now();
    // SSR 안전: localStorage 는 마운트 후에만 읽는다(라이트 플래시 1프레임 감수).
    try {
      if (localStorage.getItem("gd-lesson-rail") === "0") setRailOpen(false);
    } catch {
      /* 스토리지 접근 불가(프라이빗 모드 등)는 기본값 유지 */
    }
  }, []);

  const toggleRail = useCallback(() => {
    setRailOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem("gd-lesson-rail", next ? "1" : "0");
      } catch {
        /* 무시 */
      }
      return next;
    });
  }, []);

  const reportGame = useCallback(
    (blockId: string) =>
      (result: "done" | "perfect" | "fail", meta?: { combo?: number }) => {
        const prev = gameEvents.current[blockId];
        const combo = Math.max(prev?.combo ?? 0, meta?.combo ?? 0) || undefined;
        if (!prev || OUTCOME_RANK[result] >= OUTCOME_RANK[prev.result]) {
          gameEvents.current[blockId] = { blockId, result, combo };
        } else {
          gameEvents.current[blockId] = { ...prev, combo };
        }
      },
    [],
  );

  const unitHref = `/g/unit/${lesson.unitId}`;
  const block = lesson.blocks[idx];

  const save = useCallback(
    async (opts: { complete?: boolean; confidence?: number } = {}) => {
      const now = Date.now();
      const secondsDelta = savedAt.current ? Math.round((now - savedAt.current) / 1000) : 0;
      savedAt.current = now;
      const pendingGames = Object.values(gameEvents.current);
      try {
        const res = await fetch(`/api/grammar-drill/lesson/${lesson.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lastBlockIndex: idx,
            blocksSeen: idx + 1,
            secondsDelta,
            note: note || null,
            confidence: opts.confidence,
            complete: opts.complete ?? false,
            checkDelta: checkResults.total > 0 ? checkResults : undefined,
            gameEvents: pendingGames.length > 0 ? pendingGames : undefined,
          }),
        });
        if (checkResults.total > 0) setCheckResults({ correct: 0, total: 0 });
        if (pendingGames.length > 0) gameEvents.current = {};
        if (res.ok) {
          const data = (await res.json()) as { growth?: GrowthReport | null };
          // 완주 저장의 성장 리포트는 완료 화면 연출로 흘려보낸다
          if (opts.complete && data.growth) setGrowth(data.growth);
        }
      } catch {
        // 저장 실패는 학습을 막지 않는다 — 다음 저장 시점에 다시 시도된다.
      }
    },
    [lesson.id, idx, note, checkResults],
  );

  // 화면을 벗어날 때 진행 저장
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void save();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [save]);

  function go(delta: number) {
    const next = idx + delta;
    if (next < 0 || next >= total) return;
    setIdx(next);
    mainRef.current?.scrollTo({ top: 0 });
    if (delta > 0) void save();
  }

  function exit() {
    void save();
    router.push(unitHref);
  }

  // ── 블록 진행 게이트: 확인 문항은 전부 풀어야 넘어간다 ──
  const isCheck = block.type === "CHECK" || block.type === "RECAP";
  const checkItemCount = isCheck ? (block.items?.length ?? 0) : 0;
  const checkAnswered = answered[block.id] ?? 0;
  const blocked = isCheck && checkAnswered < checkItemCount;

  if (done) {
    return (
      <>
        <LessonDoneScreen
          lesson={lesson}
          nextConceptId={nextConceptId}
          growth={growth}
          onOpenStatus={() => setStatusOpen(true)}
          onConfidence={async (c) => {
            await save({ complete: true, confidence: c });
          }}
          onExit={() => router.push(unitHref)}
        />
        <StatusWindow open={statusOpen} onClose={() => setStatusOpen(false)} />
      </>
    );
  }

  return (
    <div className="mx-auto flex h-dvh flex-col">
      {/* ── 헤더: 뒤로 · 위치 · 종료 ── */}
      <header className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <BackBar
          className="gd-page-wide"
          onBack={() => (idx === 0 ? exit() : go(-1))}
          ariaLabel={idx === 0 ? "유닛으로" : "이전 블록"}
          eyebrow={lesson.unitTitle}
          title={lesson.title}
          right={
            <>
              <p
                className="gd-mono gd-t-2xs shrink-0 font-semibold"
                style={{ color: "var(--gd-ink-2)" }}
              >
                {idx + 1}
                <span style={{ color: "var(--gd-ink-3)" }}>/{total}</span>
              </p>
              {/* 목차 접기/펼치기 — 태블릿+ 에서만 노출(모바일은 레일 자체가 없음, gd.css) */}
              <button
                type="button"
                onClick={toggleRail}
                className="gd-iconbtn gd-rail-toggle"
                style={{ color: railOpen ? "var(--gd-blue)" : "var(--gd-ink-2)" }}
                aria-label={railOpen ? "레슨 구성 접기" : "레슨 구성 펼치기"}
                aria-pressed={railOpen}
              >
                {railOpen ? (
                  <PanelRightClose className="h-4.5 w-4.5" strokeWidth={1.75} />
                ) : (
                  <PanelRightOpen className="h-4.5 w-4.5" strokeWidth={1.75} />
                )}
              </button>
              <button
                type="button"
                onClick={() => setStatusOpen(true)}
                className="gd-iconbtn"
                aria-label="상태창 열기"
              >
                <Shield className="h-4.5 w-4.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={exit}
                className="gd-iconbtn"
                style={{ color: "var(--gd-ink-3)" }}
                aria-label="레슨 종료(진행은 저장됩니다)"
              >
                <X className="h-4.5 w-4.5" strokeWidth={2} />
              </button>
            </>
          }
        />
        <div className="gd-page-wide gd-seg pb-1 pt-1.5">
          {lesson.blocks.map((b, i) => (
            <i key={b.id} data-on={i < idx ? "done" : i === idx ? "true" : undefined} />
          ))}
        </div>
      </header>

      {/* ── 본문 ── */}
      <div ref={mainRef} className="gd-scroll flex-1 px-4 pb-6 pt-3">
        <div className="gd-page-wide gd-lesson-grid" data-rail={railOpen ? undefined : "closed"}>
          <div className="min-w-0">
            <BlockRouter
              block={block}
              note={note}
              setNote={setNote}
              onGameResult={reportGame(block.id)}
              onCheckResult={(correct) => {
                setCheckResults((r) => ({
                  correct: r.correct + (correct ? 1 : 0),
                  total: r.total + 1,
                }));
                setAnswered((a) => ({ ...a, [block.id]: (a[block.id] ?? 0) + 1 }));
              }}
            />
          </div>

          {/* 태블릿 사이드레일 — 블록 목차(접기 가능) */}
          <aside className="gd-rail">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="gd-label">레슨 구성</p>
              <button
                type="button"
                onClick={toggleRail}
                className="flex h-6 w-6 items-center justify-center rounded-md"
                style={{ color: "var(--gd-ink-3)" }}
                aria-label="레슨 구성 접기"
              >
                <PanelRightClose className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            <ol className="flex flex-col gap-1">
              {lesson.blocks.map((b, i) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setIdx(i)}
                    className="gd-t-xs flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left"
                    style={
                      i === idx
                        ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)", fontWeight: 700 }
                        : { color: i < idx ? "var(--gd-ink-2)" : "var(--gd-ink-3)" }
                    }
                  >
                    <span className="gd-mono gd-t-3xs w-4 shrink-0">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{blockLabel(b)}</span>
                    <span className="gd-t-3xs shrink-0">{TIER_LABEL[b.tier]}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>

      {/* ── 액션 바 ── */}
      <footer className="gd-hairline-t gd-safe-b shrink-0 px-4 pt-2.5" style={{ background: "var(--gd-card)" }}>
        <div className="gd-page-wide flex gap-2">
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="gd-btn gd-btn-ghost"
            aria-label="선생님 AI에게 질문"
          >
            <MessageCircleQuestion className="h-4 w-4" strokeWidth={1.75} />
            질문
          </button>
          {idx + 1 < total ? (
            <button
              type="button"
              onClick={() => go(1)}
              disabled={blocked}
              className="gd-btn gd-btn-primary flex-1"
            >
              {blocked
                ? `확인 문항을 마치십시오 (${checkAnswered}/${checkItemCount})`
                : "다음"}
              {!blocked && <ArrowRight className="h-4 w-4" strokeWidth={2} />}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                void save();
                setDone(true);
              }}
              disabled={blocked}
              className="gd-btn gd-btn-primary flex-1"
            >
              {blocked
                ? `확인 문항을 마치십시오 (${checkAnswered}/${checkItemCount})`
                : "레슨 마치기"}
              {!blocked && <ArrowRight className="h-4 w-4" strokeWidth={2} />}
            </button>
          )}
        </div>
      </footer>

      {/* ── 이어보기 확인 ── */}
      {askResume && (
        <>
          <button
            type="button"
            className="gd-sheet-backdrop"
            aria-label="닫기"
            onClick={() => setAskResume(false)}
          />
          <div className="gd-sheet gd-app gd-safe-b" role="dialog" aria-modal="true">
            <div className="gd-sheet-grip" />
            <div className="px-5 pb-5 pt-4">
              <p className="gd-t-md font-bold">이어서 볼까요?</p>
              <p className="gd-prose-2 mt-1">
                지난번에 {resumeIndex + 1}번째 블록까지 보았습니다.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="gd-btn gd-btn-ghost flex-1"
                  onClick={() => {
                    setIdx(0);
                    setAskResume(false);
                  }}
                >
                  처음부터
                </button>
                <button
                  type="button"
                  className="gd-btn gd-btn-primary flex-1"
                  onClick={() => {
                    setIdx(Math.min(resumeIndex, total - 1));
                    setAskResume(false);
                  }}
                >
                  이어서 보기
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {chatOpen && (
        <ChatSheet conceptId={lesson.id} revealAllowed onClose={() => setChatOpen(false)} />
      )}
      <StatusWindow open={statusOpen} onClose={() => setStatusOpen(false)} />
    </div>
  );
}

// ── 블록 → 렌더러 ──────────────────────────────────────────────────────────

function BlockRouter({
  block,
  note,
  setNote,
  onCheckResult,
  onGameResult,
}: {
  block: SafeLessonBlock;
  note: string;
  setNote: (v: string) => void;
  onCheckResult: (correct: boolean) => void;
  onGameResult: (result: "done" | "perfect" | "fail", meta?: { combo?: number }) => void;
}) {
  switch (block.type) {
    case "HOOK":
      return <HookView block={block} onDone={() => {}} />;
    case "MISCONCEPTION":
      return <MisconceptionView block={block} />;
    case "RULE":
      return <RuleView block={block} />;
    case "DIAGRAM":
      return <DiagramView block={block} />;
    case "ALGORITHM":
      return <AlgorithmView block={block} />;
    case "WORKED":
      return <WorkedView block={block} />;
    case "COMPLETION":
      return <CompletionView block={block} />;
    case "CONTRAST":
      return <ContrastView block={block} />;
    case "TRAP":
      return <TrapView block={block} />;
    case "EXAM":
      return <ExamView block={block} />;
    case "SUMMARY":
      return <SummaryView block={block} />;
    case "SORT":
      return <SortView block={block} />;
    case "GENERATE":
      return <GenerateView block={block} />;
    case "ERROR_HUNT":
      return <ErrorHuntView block={block} />;
    case "SELF_EXPLAIN":
      return <SelfExplainView block={block} />;
    case "TRANSFER":
      return <TransferView block={block} />;
    case "NOTE":
      return <NoteView block={block} value={note} onChange={setNote} />;
    case "CONCEPT_INTRO":
      return <ConceptIntroView block={block} />;
    case "NOTEBOOK":
      return <NotebookView block={block} />;
    case "TABLE":
      return <TableView block={block} />;
    case "MNEMONIC":
      return <MnemonicView block={block} />;
    case "MEMORY_GATE":
      return <MemoryGateView block={block} onResult={onGameResult} />;
    case "SPEED_OX":
      return <SpeedOxView block={block} onResult={onGameResult} />;
    case "WORD_HUNT":
      return <WordHuntView block={block} onResult={onGameResult} />;
    case "PAIR_MATCH":
      return <PairMatchView block={block} onResult={onGameResult} />;
    case "ODD_ONE_OUT":
      return <OddOneOutView block={block} onResult={onGameResult} />;
    case "BOSS":
      return <BossView block={block} onResult={onGameResult} />;
    case "CHECK":
    case "RECAP":
      return (
        <CheckBlockView
          blockType={block.type}
          title={block.title}
          items={block.items}
          onResult={onCheckResult}
        />
      );
  }
}

function blockLabel(block: SafeLessonBlock): string {
  if (block.title) return block.title;
  return BLOCK_SHORT[block.type] ?? block.type;
}

const BLOCK_SHORT: Record<string, string> = {
  HOOK: "먼저 판단",
  MISCONCEPTION: "흔한 오해",
  RULE: "규칙",
  DIAGRAM: "문장 해부",
  ALGORITHM: "판단 절차",
  WORKED: "예제 풀이",
  COMPLETION: "마무리 판단",
  CHECK: "확인 문항",
  CONTRAST: "대조",
  SORT: "분류",
  TRAP: "함정",
  EXAM: "시험에서는",
  SELF_EXPLAIN: "이유 말하기",
  NOTE: "내 필기",
  SUMMARY: "요약 노트",
  RECAP: "마무리 점검",
  GENERATE: "직접 만들기",
  ERROR_HUNT: "오류 찾기",
  TRANSFER: "지문에서 찾기",
  CONCEPT_INTRO: "용어부터",
  NOTEBOOK: "필기노트",
  TABLE: "정리표",
  MNEMONIC: "암기 카드",
  MEMORY_GATE: "암기 관문",
  SPEED_OX: "스피드 판정",
  WORD_HUNT: "문장 속 사냥",
  PAIR_MATCH: "짝 맞추기",
  ODD_ONE_OUT: "이단아 찾기",
  BOSS: "보스전",
};
