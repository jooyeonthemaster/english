"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 보내기 스텝(SendStep) + 단어 미리보기 모달
//
// basket-dock 500줄 제한을 지키기 위한 분리 파일 — dock 이 조립한다.
// 공용 원자(BTN·INPUT·Field·Spin·clampInt)도 여기서 정의해 dock 이 가져다
// 쓴다(dock → send 단방향 import — 역방향을 만들면 순환이 된다).
// 전송 payload 계약: sendSource "deck" → deckIds / "picks" → senseIds.
// 문제 유형 선택은 **선호이지 보장이 아니다**(VocabAssignmentPayload.itemTypes
// 주석) — 자동(선택 없음)이면 itemTypes 키 자체를 보내지 않는다.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import { createStudyAssignment } from "@/actions/study-assignments/mutations";
import { listDeckRecipients } from "@/actions/vocab-drill-admin/deployments";
import type { VocabDeckPreviewRow } from "@/actions/vocab-drill-admin/decks";
import type {
  ClassFolderList,
  ClassRosterStudent,
} from "@/actions/students/class-folders";
import { VOCAB_ITEM_TYPE_LABELS } from "@/lib/vocab-drill/display";
import type { VocabItemType } from "@/lib/vocab-drill/payload";
import { DiffDots, PosChip, TierChip, fmt } from "./wordbook-ui";
import type { WordbookBasketItem } from "./wordbook-types";

// ── 공용 원자 (dock 과 공유) ─────────────────────────────────────────────────

export const BTN_PRIMARY =
  "flex h-9 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40";
export const BTN_GHOST =
  "flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40";
export const INPUT =
  "h-9 w-full rounded-md border border-slate-200 px-2.5 text-[12.5px] outline-none transition-colors focus:border-blue-400 disabled:opacity-40";

export function clampInt(v: string, min: number, max: number, fallback: number) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** label 필수 규약(접근성)을 짧게 지키기 위한 래퍼. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block text-[10.5px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function Spin() {
  return <Loader2 className="size-3.5 animate-spin" />;
}

/** 서버 MAX_VOCAB_BRIDGE_CELLS 미러 — 보내기 전에 미리 막아 왕복을 아낀다. */
export const MAX_BRIDGE_CELLS = 20_000;

// FLASH 는 자기평가 카드(채점 불가)라 과제 유형에서 제외 — 서버 화이트리스트
// (mutations.ts VOCAB_GRADED_ITEM_TYPES)와 같은 결론이다.
const TYPE_KEYS = (Object.keys(VOCAB_ITEM_TYPE_LABELS) as VocabItemType[]).filter(
  (k) => k !== "FLASH",
);

function chipCls(on: boolean) {
  return `flex h-7 items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
    on
      ? "border-blue-300 bg-blue-50 text-blue-700"
      : "border-slate-200 text-slate-600 hover:bg-slate-50"
  }`;
}

// ── 단어 미리보기 모달 ───────────────────────────────────────────────────────

export type PreviewState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; rows: VocabDeckPreviewRow[]; total: number };

/** 패널(z-50) 위에 뜨는 미리보기 — 백드롭 클릭으로 닫는다.
 *  title·note 는 진입점이 정한다 — "조건으로 뽑힐 단어"와 "담은 단어"가 다른
 *  개념인데 제목이 하나면 정체를 오독한다(유저 실사용 피드백 2026-08-04). */
export function PreviewModal({
  state,
  onClose,
  title = "단어장에 담긴 단어",
  note,
}: {
  state: PreviewState;
  onClose: () => void;
  title?: string;
  note?: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="미리보기 닫기" onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 px-3">
          <h3 className="shrink-0 text-[12.5px] font-bold">{title}</h3>
          {state.status === "ready" && (
            <span className="truncate text-[10.5px] tabular-nums text-slate-400">
              전체 {fmt(state.total)}개 중 앞 {fmt(state.rows.length)}개
            </span>
          )}
          <button type="button" aria-label="닫기" onClick={onClose} className="ml-auto rounded p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="size-4" />
          </button>
        </header>
        {note ? (
          <p className="break-keep border-b border-slate-100 bg-amber-50/60 px-3 py-1.5 text-[10.5px] text-amber-700">
            {note}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.status === "loading" ? (
            <div className="flex justify-center py-14">
              <Loader2 className="size-5 animate-spin text-slate-400" />
            </div>
          ) : state.status === "error" ? (
            <p className="break-keep px-3 py-14 text-center text-[12px] text-slate-500">단어 목록을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>
          ) : state.rows.length === 0 ? (
            <p className="break-keep px-3 py-14 text-center text-[12px] text-slate-500">조건에 맞는 단어가 없습니다.</p>
          ) : (
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-[10.5px] text-slate-400">
                  <th className="h-8 w-[26%] px-3 font-medium">단어</th>
                  <th className="w-[15%] px-1 font-medium">품사</th>
                  <th className="px-1 font-medium">뜻</th>
                  <th className="w-[14%] px-1 font-medium" title="기본·핵심·학술·고난도 네 수준입니다">수준</th>
                  <th className="w-[16%] px-2 font-medium" title="1~5 — 점이 많이 채워질수록 어려운 단어입니다">난이도</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.senseId} className="border-b border-slate-100">
                    <td className="h-9 max-w-0 px-3">
                      <span className="block truncate text-[12.5px] font-semibold" title={r.lemma}>{r.lemma}</span>
                    </td>
                    <td className="px-1"><PosChip pos={r.pos} /></td>
                    <td className="max-w-0 px-1">
                      <span className="block truncate text-[11.5px] text-slate-500" title={r.senseKo}>{r.senseKo}</span>
                    </td>
                    <td className="px-1"><TierChip tier={r.tier} /></td>
                    <td className="px-2"><DiffDots n={r.difficulty} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 보내기 스텝 ──────────────────────────────────────────────────────────────

export interface SendStepProps {
  items: WordbookBasketItem[];
  sendSource: "deck" | "picks";
  savedDeck: { id: string; title: string; senseCount: number } | null;
  /** 마운트 시점의 과제 제목 초기값 — 이후 편집은 이 컴포넌트가 소유 */
  initialTitle: string;
  rosterState: "idle" | "loading" | "error" | "ready";
  folders: ClassFolderList | null;
  students: ClassRosterStudent[];
  onRetryRoster: () => void;
  selected: Set<string>;
  onSelectedChange: Dispatch<SetStateAction<Set<string>>>;
  onBack: () => void;
  onDone: (done: { taskCount: number; notice: string | null }) => void;
  /** 요약 박스 [단어 확인] — dock 이 previewVocabDeck({deckId}) 로 연결한다 */
  onPreviewDeck: () => void;
}

export function SendStep({
  items,
  sendSource,
  savedDeck,
  initialTitle,
  rosterState,
  folders,
  students,
  onRetryRoster,
  selected,
  onSelectedChange,
  onBack,
  onDone,
  onPreviewDeck,
}: SendStepProps) {
  const [studentQ, setStudentQ] = useState("");
  const [assignTitle, setAssignTitle] = useState(initialTitle);
  const [qCount, setQCount] = useState("20");
  const [due, setDue] = useState("");
  /** 선택 유형 — 빈 Set = 자동 섞기(키 미전송). 유형을 고르면 자동이 풀린다. */
  const [itemTypes, setItemTypes] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** 이미 받은 학생 배지 — 로드 실패 시 조용히 생략(보내기 흐름을 막지 않는다) */
  const [recipients, setRecipients] = useState<Record<string, boolean> | null>(null);

  const deckId = sendSource === "deck" && savedDeck ? savedDeck.id : null;
  useEffect(() => {
    if (!deckId) return;
    let alive = true;
    listDeckRecipients(deckId)
      .then((r) => {
        if (alive) setRecipients(r.activeByStudent);
      })
      .catch(() => {
        /* 배지는 보조 정보 — 실패해도 아무것도 하지 않는다 */
      });
    return () => {
      alive = false;
    };
  }, [deckId]);

  const studentIdSet = useMemo(() => new Set(students.map((s) => s.id)), [students]);
  const filteredStudents = useMemo(() => {
    const q = studentQ.trim().toLowerCase();
    return q ? students.filter((s) => s.name.toLowerCase().includes(q)) : students;
  }, [students, studentQ]);

  const toggleStudent = useCallback(
    (id: string) => {
      onSelectedChange((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [onSelectedChange],
  );

  // 반 칩: 전원 선택돼 있으면 해제, 아니면 전원 추가(부분 선택 → 채우기).
  const toggleClass = useCallback(
    (classId: string) => {
      const members = (folders?.membership[classId] ?? []).filter((id) => studentIdSet.has(id));
      if (members.length === 0) return;
      onSelectedChange((prev) => {
        const next = new Set(prev);
        const allIn = members.every((id) => next.has(id));
        for (const id of members) {
          if (allIn) next.delete(id);
          else next.add(id);
        }
        return next;
      });
    },
    [folders, studentIdSet, onSelectedChange],
  );

  const toggleType = useCallback((key: string) => {
    setItemTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // 바로 보내기는 학생마다 senseIds 가 복제 저장되므로 서버 상한을 앞단에서 미러링.
  const overCells = sendSource === "picks" && selected.size * items.length > MAX_BRIDGE_CELLS;

  const handleSend = useCallback(async () => {
    if (pending || selected.size === 0 || overCells) return;
    setPending(true);
    setSendError(null);
    const count = clampInt(qCount, 5, 100, 20);
    const res = await createStudyAssignment({
      kind: "VOCAB",
      title: assignTitle.trim() || "단어 훈련",
      targets: [...selected].map((id) => ({ type: "STUDENT" as const, id })),
      // 마감은 KST 그 날의 끝으로 고정 — 브라우저 시간대에 흔들리지 않게 한다.
      dueAt: due ? new Date(`${due}T23:59:59+09:00`).toISOString() : null,
      vocab: {
        ...(sendSource === "deck" && savedDeck
          ? { deckIds: [savedDeck.id] }
          : { senseIds: items.map((i) => i.senseId) }),
        count,
        // 자동 섞기(선택 없음)면 itemTypes 키 자체를 만들지 않는다 — 계약.
        ...(itemTypes.size ? { itemTypes: [...itemTypes] } : {}),
      },
    });
    setPending(false);
    if (res.success && res.data) onDone({ taskCount: res.data.taskCount, notice: res.data.notice ?? null });
    else setSendError(res.error ?? "보내지 못했습니다.");
  }, [pending, selected, overCells, qCount, assignTitle, due, sendSource, savedDeck, items, itemTypes, onDone]);

  return (
    <div className="space-y-3 px-3 py-3">
      {/* 무엇을 보내는지 요약 */}
      <div className="flex items-center justify-between gap-2 rounded bg-slate-50 p-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold tabular-nums" title={sendSource === "deck" && savedDeck ? savedDeck.title : undefined}>
            {sendSource === "deck" && savedDeck
              ? `단어장 '${savedDeck.title}' · ${fmt(savedDeck.senseCount)}단어`
              : `담은 단어 ${fmt(items.length)}개 바로 보내기`}
          </p>
          {sendSource === "deck" && savedDeck && (
            <button type="button" onClick={onPreviewDeck} className="mt-0.5 text-[10.5px] font-medium text-blue-600 hover:underline">단어 확인</button>
          )}
        </div>
        <button type="button" onClick={onBack} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="size-3.5" />뒤로
        </button>
      </div>

      {/* 학생 선택 */}
      {rosterState !== "ready" ? (
        <div className="flex flex-col items-center gap-2 py-10">
          {rosterState === "error" ? (
            <>
              <p className="text-[12px] text-slate-500">학생 목록을 불러오지 못했습니다.</p>
              <button type="button" onClick={onRetryRoster} className={BTN_GHOST}>다시 시도</button>
            </>
          ) : (
            <Loader2 className="size-5 animate-spin text-slate-400" />
          )}
        </div>
      ) : (
        <>
          {folders && folders.collections.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {folders.collections.map((c) => {
                const members = (folders.membership[c.id] ?? []).filter((id) => studentIdSet.has(id));
                const allIn = members.length > 0 && members.every((id) => selected.has(id));
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleClass(c.id)}
                    className={`flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium transition-colors ${allIn ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {c.name}<span className="tabular-nums text-slate-400">({members.length})</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">학생 검색</span>
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input value={studentQ} onChange={(e) => setStudentQ(e.target.value)} placeholder="학생 이름 검색" className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-[12px] outline-none transition-colors focus:border-blue-400 focus:bg-white" />
            </label>
            <button
              type="button"
              onClick={() => onSelectedChange((prev) => { const next = new Set(prev); for (const s of filteredStudents) next.add(s.id); return next; })}
              className="shrink-0 text-[11px] font-medium text-blue-600 hover:underline"
            >
              전체 선택
            </button>
            <button type="button" onClick={() => onSelectedChange(new Set())} className="shrink-0 text-[11px] font-medium text-slate-400 hover:underline">해제</button>
          </div>

          <ul className="max-h-56 overflow-y-auto rounded-md border border-slate-200">
            {filteredStudents.map((s) => (
              <li key={s.id}>
                <label className={`flex h-8 cursor-pointer items-center gap-2 border-b border-slate-100 px-2.5 ${selected.has(s.id) ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleStudent(s.id)} className="size-3.5 accent-blue-600" />
                  <span className="min-w-0 flex-1 truncate text-[12px]" title={s.name}>{s.name}</span>
                  {/* 이미 받은 학생 표시 — 차단은 하지 않는다(재시험은 정당한 사용례) */}
                  {recipients && s.id in recipients && (
                    recipients[s.id] ? (
                      <span className="shrink-0 whitespace-nowrap text-[9.5px] font-medium text-amber-600" title="이 단어장을 받아 아직 다 풀지 않았습니다">하는 중</span>
                    ) : (
                      <span className="shrink-0 whitespace-nowrap text-[9.5px] text-slate-400" title="이 단어장을 받아 이미 다 풀었습니다">받은 적 있음</span>
                    )
                  )}
                  <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">{s.grade}학년</span>
                </label>
              </li>
            ))}
            {filteredStudents.length === 0 && (
              <li className="px-2.5 py-6 text-center text-[11px] text-slate-400">조건에 맞는 학생이 없습니다.</li>
            )}
          </ul>
          <p className="text-[11px] font-semibold tabular-nums text-blue-700">{fmt(selected.size)}명 선택</p>
        </>
      )}

      {/* 과제 옵션 */}
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <Field label="과제 제목">
          <input value={assignTitle} onChange={(e) => setAssignTitle(e.target.value)} className={INPUT} />
        </Field>
        <div>
          <span className="mb-1 block text-[10.5px] font-medium text-slate-500">문제 유형</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setItemTypes(new Set())} className={chipCls(itemTypes.size === 0)} title="단어마다 알맞은 유형을 자동으로 골라 섞습니다">자동 섞기(추천)</button>
            {TYPE_KEYS.map((k) => (
              <button key={k} type="button" onClick={() => toggleType(k)} className={chipCls(itemTypes.has(k))}>
                {VOCAB_ITEM_TYPE_LABELS[k]}
              </button>
            ))}
          </div>
          {itemTypes.size > 0 && (
            <p className="mt-1 break-keep text-[10.5px] text-slate-400">고른 유형 위주로 나갑니다. 만들 수 없는 단어(예: 숙어의 철자 쓰기)는 다른 유형으로 자동 대체됩니다.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Field label="문항 수 (5~100)">
            <input type="number" min={5} max={100} value={qCount} onChange={(e) => setQCount(e.target.value)} className={`${INPUT} tabular-nums`} />
          </Field>
          <Field label="마감일 (선택)">
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${INPUT} tabular-nums`} />
          </Field>
        </div>
      </div>

      {overCells && (
        <p className="break-keep text-[10.5px] text-amber-600">학생 수 × 단어 수가 2만을 넘어 한 번에 보낼 수 없습니다. 먼저 단어장으로 저장한 뒤 보내 주세요.</p>
      )}
      {sendError && <p className="break-keep text-[11px] text-rose-600">{sendError}</p>}
      <button type="button" onClick={() => void handleSend()} disabled={pending || selected.size === 0 || overCells} className={`${BTN_PRIMARY} w-full`}>
        {pending && <Spin />}학생에게 보내기
      </button>
    </div>
  );
}
