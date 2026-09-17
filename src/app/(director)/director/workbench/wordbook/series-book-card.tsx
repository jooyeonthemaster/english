"use client";

// 교재(시리즈) 카드 — deployments-panel 의 분리체(500줄 규약).
// 위저드 산출 단계 덱들을 spec.series.key 로 묶어 "책 한 권"으로 보여 준다.
// 그룹핑·보내기 프리셋 헬퍼도 여기 산다(패널은 조립만).
// 발송은 스펙 §11 단일 통합 — 버튼은 「학생에게 보내기」 하나, 우측 슬라이드가 교재 모드로 연다.
//
// ★ 용어 규약(적대검수 2026-08-10) — 이 화면의 산출물은 두 종류다.
//   **교재** = 단계로 나뉜 것(spec.series 보유) / **단어장** = 단일 덱.
//   이 파일은 교재 전용이므로 화면 문구에 "단어장"을 쓰지 않는다(반대도 마찬가지).

import { Archive, BookMarked, BookPlus, Send } from "lucide-react";
import type { VocabDeckRow } from "@/actions/vocab-drill-admin/decks";
import type { VocabDeckSeriesMeta } from "@/lib/vocab-drill/payload";
import { studyDaysShort } from "@/lib/vocab-drill/wordbook-plan-types";
import type { WordbookPresetSeries } from "./wordbook-types";
import { fmt, SectionTitle } from "./wordbook-ui";

type SeriesSchedule = NonNullable<VocabDeckSeriesMeta["schedule"]>;

export interface SeriesBookUnit {
  deckId: string;
  /** 덱 title("교재 · N단계") — 미리보기 모달 제목·보내기 인자에 그대로 쓴다 */
  title: string;
  /** series.index (1-base) */
  index: number;
  senseCount: number;
}

export interface SeriesBook {
  key: string;
  /** series.title — 교재 원제(단계 덱 title 과 별개) */
  title: string;
  /** 학습 주기 — 방어적으로 읽는다(없을 수 있다) */
  schedule?: SeriesSchedule;
  /** 활성 단계만, index 오름차순 */
  units: SeriesBookUnit[];
  /** 활성 단계 senseCountCache 합 */
  totalWords: number;
  /** 보관된 단계 수 — 캡션용(「보관함」 접이식엔 개별 덱으로 그대로 남는다) */
  archivedCount: number;
}

/**
 * 덱 목록 → 교재 묶음 + 나머지 활성 덱.
 * - 활성 && spec.series 보유 → 교재 단계로 흡수(등장 순서 = 목록 정렬 계승).
 * - 보관된 단계는 카드에서 빼고 archivedCount 로만 계상.
 * - 전 단계가 보관이면 교재가 아예 빠진다 — 패널의 「보관함」 접이식이 담당(현행 유지).
 */
export function groupSeriesBooks(decks: VocabDeckRow[]): {
  books: SeriesBook[];
  standalone: VocabDeckRow[];
} {
  const byKey = new Map<string, SeriesBook>(); // Map = 삽입 순서 보존
  const archivedByKey = new Map<string, number>();
  const standalone: VocabDeckRow[] = [];
  for (const d of decks) {
    const s = d.spec.series;
    if (d.status === "ARCHIVED") {
      if (s) archivedByKey.set(s.key, (archivedByKey.get(s.key) ?? 0) + 1);
      continue;
    }
    if (!s) {
      standalone.push(d);
      continue;
    }
    let book = byKey.get(s.key);
    if (!book) {
      book = { key: s.key, title: s.title, units: [], totalWords: 0, archivedCount: 0 };
      byKey.set(s.key, book);
    }
    if (!book.schedule && s.schedule) book.schedule = s.schedule;
    book.units.push({ deckId: d.id, title: d.title, index: s.index, senseCount: d.senseCountCache });
    book.totalWords += d.senseCountCache;
  }
  const books = [...byKey.values()].map((b) => {
    b.units.sort((a, z) => a.index - z.index);
    b.archivedCount = archivedByKey.get(b.key) ?? 0;
    return b;
  });
  return { books, standalone };
}

/**
 * 교재 카드 → 「학생에게 보내기」 슬라이드(교재 모드) 프리셋.
 * schedule 없으면 1단계 크기·주 5일 폴백(그마저 없으면 20 — 스펙 §11 형상 정본).
 */
export function seriesSendPreset(book: SeriesBook): WordbookPresetSeries {
  return {
    seriesKey: book.key,
    title: book.title,
    unitCount: book.units.length,
    totalWords: book.totalWords,
    wordsPerDay: book.schedule?.wordsPerDay ?? book.units[0]?.senseCount ?? 20,
    studyDays: book.schedule?.studyDays ?? [1, 2, 3, 4, 5],
  };
}

export interface SeriesBooksSectionProps {
  /** 덱 목록 로딩·오류 해소 후에만 그린다(스켈레톤·오류 UI 는 패널 소유) */
  ready: boolean;
  books: SeriesBook[];
  /** 교재가 아닌 단일 단어장 존재 여부 — 안내 스트립 노출 조건(전무 빈 상태와 중복 금지) */
  hasStandalone: boolean;
  /** 전체 보관 진행 중인 교재 key */
  archivingKey: string | null;
  onPreviewUnit: (unit: { deckId: string; title: string }) => void;
  /** 「학생에게 보내기」 — 우측 슬라이드를 교재 모드로 연다. 미전달 시 버튼 숨김(하위 호환) */
  onSendSeries?: (series: WordbookPresetSeries) => void;
  onArchiveAll: (book: SeriesBook) => void;
  /** 교재 만들기 위저드 열기 — 미전달 시 안내 스트립을 숨긴다(하위 호환) */
  onCreateBook?: () => void;
}

/** 「단계별 교재」 섹션 — 교재 1개 이상이면 카드 그리드, 없으면 위저드 안내 스트립. */
export function SeriesBooksSection({
  ready,
  books,
  hasStandalone,
  archivingKey,
  onPreviewUnit,
  onSendSeries,
  onArchiveAll,
  onCreateBook,
}: SeriesBooksSectionProps) {
  if (!ready) return null;
  if (books.length === 0) {
    if (!onCreateBook || !hasStandalone) return null;
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
        <p className="min-w-0 text-[11.5px] text-slate-500 break-keep">
          추천 커리큘럼으로 단계별 교재를 만들어 보내면 1단계부터 하루 하나씩 자동으로 열려요.
        </p>
        <button
          type="button"
          onClick={onCreateBook}
          className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <BookPlus className="size-3.5" /> 교재 만들기
        </button>
      </div>
    );
  }
  return (
    <div className="mb-5">
      <SectionTitle hint="단계 칩을 누르면 그 단계에 들어갈 단어를 미리 볼 수 있습니다">단계별 교재</SectionTitle>
      <div className="grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
        {books.map((b) => (
          <SeriesBookCard
            key={b.key}
            book={b}
            archiving={archivingKey === b.key}
            onPreviewUnit={onPreviewUnit}
            onSend={onSendSeries ? () => onSendSeries(seriesSendPreset(b)) : undefined}
            onArchiveAll={() => onArchiveAll(b)}
          />
        ))}
      </div>
    </div>
  );
}

export interface SeriesBookCardProps {
  book: SeriesBook;
  /** 전체 보관 진행 중 — 액션 잠금 */
  archiving: boolean;
  /** 단계 칩 클릭 — 기존 미리보기 모달 재사용(모달은 패널이 소유) */
  onPreviewUnit: (unit: { deckId: string; title: string }) => void;
  /** [학생에게 보내기] — 우측 슬라이드를 교재 모드로 연다. 미전달 시 버튼 숨김 */
  onSend?: () => void;
  onArchiveAll: () => void;
}

export function SeriesBookCard({
  book,
  archiving,
  onPreviewUnit,
  onSend,
  onArchiveAll,
}: SeriesBookCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      {/* 헤더 — 교재 원제 + 합계·단계 수 + (있으면) 학습 주기 */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <BookMarked className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[14px] font-bold text-slate-800" title={book.title}>
            {book.title}
          </h4>
          <p className="mt-0.5 text-[12.5px] font-medium tabular-nums text-slate-600">
            단어 {fmt(book.totalWords)}개 · {book.units.length}단계
          </p>
          {book.schedule ? (
            <p className="mt-0.5 text-[11.5px] tabular-nums text-slate-500 break-keep">
              하루 {book.schedule.wordsPerDay}단어 ·{" "}
              {studyDaysShort(book.schedule.studyDays)} · 학습일{" "}
              {book.schedule.totalDays}일
            </p>
          ) : null}
          {book.archivedCount > 0 ? (
            <p
              className="mt-0.5 text-[10.5px] tabular-nums text-amber-600"
              title="아래 「보관함」에서 단계별로 되살릴 수 있습니다"
            >
              보관된 단계 {book.archivedCount}개
            </p>
          ) : null}
        </div>
      </div>

      {/* 단계 칩 스트립 — 누르면 그 단계 미리보기 */}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {book.units.map((u) => (
          <button
            key={u.deckId}
            type="button"
            title={`${u.index}단계 · ${fmt(u.senseCount)}단어`}
            onClick={() => onPreviewUnit({ deckId: u.deckId, title: u.title })}
            className="flex h-7 min-w-7 items-center justify-center rounded-md border border-slate-200 px-1.5 text-[11.5px] font-medium tabular-nums text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            {u.index}
          </button>
        ))}
      </div>

      {/* 액션 — 학생에게 보내기(주) / 전체 보관 */}
      <div className="mt-3 flex items-center gap-1.5">
        {onSend ? (
          <button
            type="button"
            onClick={onSend}
            disabled={archiving}
            title="보내면 1단계부터 하루 하나씩 자동으로 열려요"
            className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
          >
            <Send className="size-3.5" /> 학생에게 보내기
          </button>
        ) : null}
        <button
          type="button"
          onClick={onArchiveAll}
          disabled={archiving}
          title="이 교재의 모든 단계를 「보관함」으로 치워 둡니다 (단계별로 되살리기 가능)"
          className="ml-auto flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-[11.5px] font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40"
        >
          <Archive className="size-3.5" /> 전체 보관
        </button>
      </div>
    </article>
  );
}
