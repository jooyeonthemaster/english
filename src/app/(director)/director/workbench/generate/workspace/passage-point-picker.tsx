"use client";

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, ChevronDown, Crosshair, Loader2, ScanSearch, Tag, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { PearlIcon } from "@/components/icons/pearl-icon";
import {
  snapRangeToWords,
  tokenizePassage,
  anchorVerbatimText,
  type PointToken,
  type SnappedRange,
  type TokenizedPassage,
} from "@/lib/passage-point-tokenizer";
import {
  TEACHER_POINTS_HARD_CAP,
  type ResolvedPointPickerMeta,
  type TeacherPoint,
  type TeacherPointUnit,
} from "../generation-config-panel-parts/point-picker-config";

// ============================================================================
// "포인트 짚어주기" 지문 무대 (point-picker-design.md §1·§3·§5·§6)
//
// PassageGenerateModal 좌측 컬럼에 상주하는 클라이언트 컴포넌트. 교사가 지문에서
// 직접 단어/구/문장을 짚으면 TeacherPoint[] 를 controlled 로 부모에 올린다.
// - 포인트 상태·AI 제안 호출(POST /api/workbench/point-suggest)은 전부 부모 소유.
//   여기서는 표시·제스처·승격만 담당한다(자동 발사 금지 — ScanSearch 버튼 명시 호출).
// - 토큰 hover 는 CSS :hover 전용(React hover state 금지 — 60fps 규율). 드래그
//   프리뷰·칩↔본문 링 펄스도 재렌더 없이 classList 로만 처리한다.
// - Esc 사다리(1회=픽커 닫기)는 부모(passage-generate-modal)가 pickerOpen 게이트로
//   처리한다 — 여기서는 Esc 를 먹지 않는다.
// - 부모는 지문/유형 전환 시 key={`${passageId}:${typeId}`} 로 리마운트를 권장한다
//   (내부 reset effect 도 있지만 suggestState 는 부모가 함께 갈아끼워야 한다).
// ============================================================================

/** AI 제안 1건 — point-suggest 응답의 suggestions[] 원소와 동일 형태. */
export interface PointSuggestion {
  /** 지문 축자(서버 indexOf 검증·단어 경계 스냅 완료) — 클라는 다시 앵커링해 검증한다. */
  quote: string;
  sentenceIndex: number;
  start: number;
  end: number;
  /** ≤40자 합니다체 — hover 툴팁에 그대로 노출. */
  reason: string;
  tag?: string;
}

/** AI 제안 채널 상태 — 부모(fetch 소유)가 내려준다. 실패는 완전 비차단. */
export type PointSuggestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; suggestions: PointSuggestion[]; cached?: boolean };

export interface PassagePointPickerProps {
  /** 지문 스코프 키 — 부모가 teacherPointsByPassage[passageId][typeId] 를 연결한다. */
  passageId: string;
  /** 지문 원문 무가공 — tokenizePassage 에 그대로 들어간다(activeRow.fullContent). */
  passageText: string;
  /** POINT_PICKER_CONFIG 등재 유형 ID — 미등재 유형은 부모가 진입 행 자체를 렌더하지 않는다. */
  typeId: string;
  /** 무대 헤더에 표시할 유형 한글 라벨(QUESTION_TYPE_UI[typeId].label). */
  typeLabel: string;
  /** resolvePointPickerMeta(typeId, questionTypeSettings[typeId]) 확정 메타. */
  meta: ResolvedPointPickerMeta;
  /** 현재 포인트 — 부모 소유 controlled. 항상 onChange 로만 갱신된다. */
  points: TeacherPoint[];
  onChange: (points: TeacherPoint[]) => void;
  /** 유효 상한 — 부모가 meta.maxPoints 를 그대로 전달한다(카운터·초과 셰이크 기준). */
  maxPoints: number;
  /** 픽커 닫기(설정 콘솔 복귀) — '선택 완료' 버튼. Esc 1단도 부모가 이걸 부른다. */
  onClose: () => void;
  /** AI 제안 상태 — 부모가 (passageId, typeId) 스코프로 관리·리셋한다. */
  suggestState: PointSuggestState;
  /** ScanSearch 버튼 명시 호출 — 부모가 point-suggest POST 를 발사한다. */
  onRequestSuggest: () => void;
}

// 배지 문자 — 상한이 TEACHER_POINTS_HARD_CAP(12)이라 이 범위로 충분하다.
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫"] as const;

// 어법 3종 분류 태그 — grammar-point-catalog a~m 코드 순서. 표시명은 교사 눈높이로
// 다듬었다(예: "태"→"능동/수동"). 서버는 태그를 자유 문자열로 프롬프트에 그대로
// 주입하므로(question-generation-prompt-contract) 여기 없는 직접 입력 값도 유효하다.
const GRAMMAR_TAG_OPTIONS = [
  "정동사/준동사",
  "관계사",
  "분사",
  "수일치",
  "능동/수동",
  "형용사/부사",
  "대명사",
  "목적격보어",
  "병렬",
  "가정법",
  "to-v/v-ing",
  "전치사/접속사",
  "비교",
] as const;

interface AnchoredSuggestion {
  key: string;
  range: SnappedRange;
  reason: string;
  tag?: string;
  /** 좌→우 드로우-인 스태거(40ms 간격) — 소비돼도 나머지 딜레이는 고정 유지. */
  delayMs: number;
}

interface DragState {
  pointerId: number;
  anchorIdx: number;
  x: number;
  y: number;
  moved: boolean;
  lastIdx: number;
  last: SnappedRange | null;
  /** 프리뷰 클래스를 붙인 요소들 — 다음 프레임에 지우기 위한 목록. */
  els: HTMLElement[];
}

const pointKeyOf = (p: { start: number; end: number }) => `${p.start}:${p.end}`;

const shortText = (t: string) => (t.length > 28 ? `${t.slice(0, 28)}…` : t);

export function PassagePointPicker({
  passageId,
  passageText,
  typeId,
  typeLabel,
  meta,
  points,
  onChange,
  maxPoints,
  onClose,
  suggestState,
  onRequestSuggest,
}: PassagePointPickerProps) {
  const tokenized = useMemo(() => tokenizePassage(passageText), [passageText]);

  const sentenceMode = meta.unit === "sentence";
  const isInsert = typeId === "SENTENCE_INSERT";
  const showTag = typeId.startsWith("GRAMMAR_");
  // 단어 유형은 allowPhraseDrag(어법 3종)일 때만, 구/절 유형은 항상 드래그 허용.
  const dragEnabled = !sentenceMode && (meta.unit !== "word" || meta.allowPhraseDrag);
  const cap = Math.min(Math.max(1, Math.round(maxPoints)), TEACHER_POINTS_HARD_CAP);

  // ── 파생: 토큰 평탄화 + 유효 포인트(축자 불일치 방어) ─────────────────────
  const allTokens = useMemo(() => tokenized.sentences.flatMap((s) => s.tokens), [tokenized]);
  const sentenceTokenBase = useMemo(() => {
    const base: number[] = [];
    let acc = 0;
    for (const s of tokenized.sentences) {
      base.push(acc);
      acc += s.tokens.length;
    }
    return base;
  }, [tokenized]);

  // 오프셋이 현재 지문과 어긋난 포인트(지문 교체 직후 등)는 표시·전송 모두에서
  // 제외한다 — 이후 모든 변이는 이 유효 목록 기준으로 emit 되므로 자연 소거된다.
  const orderedPoints = useMemo(
    () =>
      points
        .filter((p) => tokenized.text.slice(p.start, p.end) === p.text)
        .sort((a, b) => a.start - b.start),
    [points, tokenized],
  );
  const atCap = orderedPoints.length >= cap;

  // ── AI 제안: 클라 재앵커링(축자 재검증) + 소비(포인트 겹침) 필터 ──────────
  const anchoredSuggestions = useMemo<AnchoredSuggestion[]>(() => {
    if (suggestState.status !== "done") return [];
    const seen = new Set<string>();
    const list: Omit<AnchoredSuggestion, "delayMs">[] = [];
    for (const s of suggestState.suggestions) {
      const range = anchorVerbatimText(tokenized, s.quote);
      if (!range) continue; // 지문 불일치(부모 무효화 경계) — 조용히 드롭
      const key = pointKeyOf(range);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ key, range, reason: s.reason, ...(s.tag ? { tag: s.tag } : {}) });
    }
    return list
      .sort((a, b) => a.range.start - b.range.start)
      .map((s, i) => ({ ...s, delayMs: i * 40 }));
  }, [suggestState, tokenized]);

  const visibleSuggestions = useMemo(
    () =>
      anchoredSuggestions.filter(
        (s) => !orderedPoints.some((p) => p.start < s.range.end && s.range.start < p.end),
      ),
    [anchoredSuggestions, orderedPoints],
  );
  const suggestionBySentence = useMemo(() => {
    const m = new Map<number, AnchoredSuggestion>();
    if (!sentenceMode) return m;
    for (const s of visibleSuggestions) {
      if (!m.has(s.range.sentenceIndex)) m.set(s.range.sentenceIndex, s);
    }
    return m;
  }, [visibleSuggestions, sentenceMode]);

  // ── 로컬 상태 (hover 는 전부 CSS — 여기엔 커밋·키보드·2탭 상태만) ──────────
  const [activeIdx, setActiveIdx] = useState(0); // roving 커서 (토큰 or 문장)
  const [kbAnchor, setKbAnchor] = useState<number | null>(null); // Shift+화살표 구 확장 시작점
  const [touchAnchor, setTouchAnchor] = useState<number | null>(null); // 터치 2탭 시작 토큰
  // 태그 드롭 패널 — 칩 레일이 overflow 스크롤 컨테이너라 absolute 는 클리핑된다.
  // 버튼 rect 로 좌표를 계산해 fixed 로 띄운다(스크롤/리사이즈 시 자동 닫힘).
  const [tagPop, setTagPop] = useState<{ key: string; left: number; bottom: number } | null>(null);
  // 태그 직접 입력값 — 패널을 열 때 초기화(기존 태그가 커스텀이면 그 값으로 프리필).
  const [tagCustom, setTagCustom] = useState("");
  const [shakeNonce, setShakeNonce] = useState(0); // 카운터 셰이크 재트리거
  const [capNoticeOn, setCapNoticeOn] = useState(false); // 상한 도달 힌트 바 일시 안내
  const [spring, setSpring] = useState<{ key: string; nonce: number } | null>(null); // press-spring 대상
  const [liveMsg, setLiveMsg] = useState("");

  const stageId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const optionId = (i: number) => `ppk-${stageId}-o${i}`;

  const listRef = useRef<HTMLDivElement>(null);
  const segEls = useRef(new Map<number, HTMLElement>()); // seg.start → 무대 요소 (드래그 프리뷰)
  const chipEls = useRef(new Map<string, HTMLElement>()); // pointKey → 칩 요소 (본문→칩 펄스)
  const dragRef = useRef<DragState | null>(null);
  const touchDownRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredPtRef = useRef<string | null>(null); // 본문 hover 중인 포인트 키
  const capNoticeTimerRef = useRef<number | null>(null); // 상한 안내 자동 소거 타이머
  // 더블클릭 판정(마우스 전용) — 같은 문장 450ms 내 재클릭이면 문장 전체 지정.
  const lastClickRef = useRef<{ si: number; t: number } | null>(null);
  // "더블클릭 = 문장" 안내 칩 — 단어 지정 직후 커서 옆에 잠깐 표시(재렌더 0).
  const clickHintRef = useRef<HTMLDivElement>(null);
  const clickHintTimerRef = useRef<number | null>(null);

  const hideClickHint = () => {
    if (clickHintTimerRef.current !== null) {
      window.clearTimeout(clickHintTimerRef.current);
      clickHintTimerRef.current = null;
    }
    const el = clickHintRef.current;
    if (el) el.style.display = "none";
  };

  const showClickHint = (x: number, y: number) => {
    const el = clickHintRef.current;
    if (!el) return;
    el.style.display = "block";
    el.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${y + 20}px`;
    if (clickHintTimerRef.current !== null) window.clearTimeout(clickHintTimerRef.current);
    clickHintTimerRef.current = window.setTimeout(() => {
      clickHintTimerRef.current = null;
      hideClickHint();
    }, 1800);
  };

  // 지문/유형 전환 시 제스처 상태 초기화 — 렌더 중 이전 값 비교 패턴(effect 미사용,
  // 부모 key 리마운트의 이중 안전망).
  const [gestureScope, setGestureScope] = useState<{
    tokenized: TokenizedPassage;
    typeId: string;
  } | null>(null);
  if (!gestureScope || gestureScope.tokenized !== tokenized || gestureScope.typeId !== typeId) {
    setGestureScope({ tokenized, typeId });
    setActiveIdx(0);
    setKbAnchor(null);
    setTouchAnchor(null);
    setTagPop(null);
    setSpring(null);
    setCapNoticeOn(false);
  }
  // 진행 중이던 드래그/탭 추적도 함께 버린다 — ref 는 렌더 밖(effect)에서만 만진다.
  useEffect(() => {
    dragRef.current = null;
    touchDownRef.current = null;
    lastClickRef.current = null;
  }, [tokenized, typeId]);
  // 상한 안내·클릭 안내 타이머 — 언마운트 시 정리(늦은 setState 방지).
  useEffect(
    () => () => {
      if (capNoticeTimerRef.current !== null) window.clearTimeout(capNoticeTimerRef.current);
      if (clickHintTimerRef.current !== null) window.clearTimeout(clickHintTimerRef.current);
    },
    [],
  );

  // ── 커밋/해제 (변이는 전부 orderedPoints 기준 → onChange 로만) ─────────────
  const emit = (next: TeacherPoint[]) => {
    onChange([...next].sort((a, b) => a.start - b.start));
  };

  const removePoint = (target: TeacherPoint) => {
    const next = orderedPoints.filter((p) => p !== target);
    emit(next);
    setLiveMsg(`'${shortText(target.text)}' 포인트를 해제했습니다. 현재 ${next.length}/${cap}개입니다.`);
  };

  const rejectOverCap = () => {
    // 카운터 셰이크 재사용 + 힌트 바 일시 안내 — AI 제안 클릭이 무반응처럼 보이지 않게.
    setShakeNonce((n) => n + 1);
    setCapNoticeOn(true);
    if (capNoticeTimerRef.current !== null) window.clearTimeout(capNoticeTimerRef.current);
    capNoticeTimerRef.current = window.setTimeout(() => {
      capNoticeTimerRef.current = null;
      setCapNoticeOn(false);
    }, 2600);
    setLiveMsg(`포인트는 최대 ${cap}개까지 지정할 수 있습니다. 기존 포인트를 해제한 뒤 다시 선택해 주세요.`);
  };

  const commitRange = (range: SnappedRange, source: "manual" | "ai", tag?: string) => {
    // 동일 범위 재선택 = 해제(토글).
    const exact = orderedPoints.find((p) => p.start === range.start && p.end === range.end);
    if (exact) {
      removePoint(exact);
      return;
    }
    // 부분 겹침은 기존 포인트를 걷어내고 새 범위로 다시 긋는다(재드로잉).
    let kept = orderedPoints.filter((p) => p.end <= range.start || p.start >= range.end);
    if (kept.length >= cap) {
      if (cap === 1) kept = []; // 단일 선택 유형(SENTENCE_INSERT 등)은 교체가 자연스럽다
      else {
        rejectOverCap();
        return;
      }
    }
    const unit: TeacherPointUnit = sentenceMode
      ? "sentence"
      : range.wordCount <= 1
        ? "word"
        : meta.unit === "clause"
          ? "clause"
          : "phrase";
    const next: TeacherPoint = {
      text: range.text,
      sentenceIndex: range.sentenceIndex,
      start: range.start,
      end: range.end,
      unit,
      source,
      ...(tag ? { tag } : {}),
    };
    emit([...kept, next]);
    setSpring((prev) => ({ key: pointKeyOf(range), nonce: (prev?.nonce ?? 0) + 1 }));
    setLiveMsg(
      `'${shortText(range.text)}' 포인트를 지정했습니다. 현재 ${kept.length + 1}/${cap}개입니다.`,
    );
  };

  const setPointTag = (target: TeacherPoint, tag: string | undefined) => {
    emit(orderedPoints.map((p) => (p === target ? { ...p, tag } : p)));
    setTagPop(null);
  };

  const coveringPoint = (start: number, end: number) =>
    orderedPoints.find((p) => p.start <= start && end <= p.end);
  const coveringSuggestion = (start: number, end: number) =>
    visibleSuggestions.find((s) => s.range.start <= start && end <= s.range.end);

  /** 클릭/탭 = 단일 토글. 제안 위 클릭은 승격(점선→실선), 선택 위 클릭은 해제. */
  const handleTokenTap = (tok: PointToken) => {
    const covering = coveringPoint(tok.start, tok.end);
    if (covering) {
      removePoint(covering);
      return;
    }
    const sug = coveringSuggestion(tok.start, tok.end);
    if (sug) {
      commitRange(sug.range, "ai", sug.tag);
      return;
    }
    const snapped = snapRangeToWords(tokenized, tok.start, tok.end);
    if (snapped) commitRange(snapped, "manual");
  };

  const toggleSentence = (si: number) => {
    const sent = tokenized.sentences[si];
    if (!sent) return;
    const sug = suggestionBySentence.get(si);
    const range: SnappedRange = {
      sentenceIndex: si,
      start: sent.start,
      end: sent.end,
      text: sent.text,
      wordCount: sent.tokens.length,
    };
    commitRange(range, sug ? "ai" : "manual", sug?.tag);
  };

  // ── 드래그(마우스/펜) — 단어 경계 스냅 pill 프리뷰, 재렌더 0 ────────────────
  const clearDragPreview = () => {
    const d = dragRef.current;
    if (!d) return;
    for (const el of d.els) el.classList.remove("ppk-drag", "ppk-drag-a", "ppk-drag-b");
    d.els = [];
  };

  const applyDragPreview = (range: SnappedRange) => {
    const d = dragRef.current;
    if (!d) return;
    clearDragPreview();
    const sent = tokenized.sentences[range.sentenceIndex];
    if (!sent) return;
    const covered = sent.segments.filter((seg) => seg.start >= range.start && seg.end <= range.end);
    covered.forEach((seg, i) => {
      const el = segEls.current.get(seg.start);
      if (!el) return;
      el.classList.add("ppk-drag");
      if (i === 0) el.classList.add("ppk-drag-a");
      if (i === covered.length - 1) el.classList.add("ppk-drag-b");
      d.els.push(el);
    });
  };

  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 클릭 승격/해제로 대상 요소가 사라져도 툴팁이 남지 않게 선제 숨김.
    hideSugTip();
    if (e.pointerType === "touch") {
      // 터치는 2탭 흐름 — 여기서는 스크롤 판별용 시작점만 기억한다.
      touchDownRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (sentenceMode || e.button !== 0) return; // 문장 모드 마우스는 onClick 경로
    const t = e.target;
    if (!(t instanceof Element)) return;
    const el = t.closest("[data-i]");
    if (!(el instanceof HTMLElement)) return;
    const idx = Number(el.dataset.i);
    if (!Number.isInteger(idx) || idx < 0 || idx >= allTokens.length) return;
    dragRef.current = {
      pointerId: e.pointerId,
      anchorIdx: idx,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      lastIdx: idx,
      last: null,
      els: [],
    };
    if (dragEnabled) e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault(); // 네이티브 텍스트 선택 차단 — 포커스는 아래에서 수동 부여
    listRef.current?.focus({ preventScroll: true });
  };

  const onStagePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId || e.pointerType === "touch") return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.moved = true;
    if (!dragEnabled) return; // 단어 전용 유형은 드래그 확장 없음(클릭만)
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-i]");
    if (hit instanceof HTMLElement) {
      const j = Number(hit.dataset.i);
      if (Number.isInteger(j) && j >= 0 && j < allTokens.length) d.lastIdx = j;
    }
    const lo = allTokens[Math.min(d.anchorIdx, d.lastIdx)];
    const hi = allTokens[Math.max(d.anchorIdx, d.lastIdx)];
    if (!lo || !hi) return;
    const snapped = snapRangeToWords(tokenized, lo.start, hi.end);
    if (!snapped) return;
    if (d.last && d.last.start === snapped.start && d.last.end === snapped.end) return;
    d.last = snapped;
    applyDragPreview(snapped);
  };

  const handleTouchTap = (e: ReactPointerEvent<HTMLDivElement>) => {
    const down = touchDownRef.current;
    touchDownRef.current = null;
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return; // 스크롤이었음
    if (sentenceMode) return; // 문장 모드 탭은 click 이벤트가 처리(마우스와 동일 경로)
    const t = e.target;
    const el = t instanceof Element ? t.closest("[data-i]") : null;
    if (!(el instanceof HTMLElement)) {
      setTouchAnchor(null); // 여백 탭 = 시작 탭 취소
      return;
    }
    const idx = Number(el.dataset.i);
    const tok = allTokens[idx];
    if (!tok) return;
    if (!dragEnabled) {
      handleTokenTap(tok);
      return;
    }
    // 2탭: 시작 탭 → 끝 탭. 선택/제안 위 탭은 즉시 토글·승격(2탭 강요 금지).
    const covering = coveringPoint(tok.start, tok.end);
    if (covering) {
      setTouchAnchor(null);
      removePoint(covering);
      return;
    }
    if (touchAnchor === null) {
      const sug = coveringSuggestion(tok.start, tok.end);
      if (sug) {
        commitRange(sug.range, "ai", sug.tag);
        return;
      }
      setTouchAnchor(idx);
      setLiveMsg("시작 단어를 지정했습니다. 끝 단어를 탭하면 구로, 같은 단어를 다시 탭하면 단어로 지정됩니다.");
      return;
    }
    const anchorTok = allTokens[touchAnchor];
    setTouchAnchor(null);
    if (!anchorTok) return;
    if (anchorTok.sentenceIndex !== tok.sentenceIndex) {
      // 문장을 넘는 끝 탭 — 새 시작 탭으로 갱신한다(스냅 클램프 혼동 방지).
      setTouchAnchor(idx);
      setLiveMsg("문장이 달라 시작 단어를 새로 지정했습니다. 같은 문장 안에서 끝 단어를 탭해 주세요.");
      return;
    }
    const snapped = snapRangeToWords(
      tokenized,
      Math.min(anchorTok.start, tok.start),
      Math.max(anchorTok.end, tok.end),
    );
    if (snapped) commitRange(snapped, "manual");
  };

  const onStagePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      handleTouchTap(e);
      return;
    }
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    clearDragPreview();
    dragRef.current = null;
    if (!d.moved) {
      const tok = allTokens[d.anchorIdx];
      if (!tok) return;
      // 더블클릭 = 문장 전체 지정 (구 선택이 허용되는 유형만 — 단어 전용 유형은
      // 문장 지정이 unit 계약 밖이라 제외). 워크스페이스 선택 무대와 동일 문법.
      if (dragEnabled) {
        const last = lastClickRef.current;
        if (last && last.si === tok.sentenceIndex && e.timeStamp - last.t < 450) {
          lastClickRef.current = null;
          hideClickHint();
          const sent = tokenized.sentences[tok.sentenceIndex];
          const snapped = sent
            ? snapRangeToWords(tokenized, sent.start, sent.end)
            : null;
          // commitRange 가 겹치는 기존(방금 찍힌 단어) 포인트를 걷어내고 문장
          // 범위로 다시 긋는다 — 첫 클릭의 단어 포인트가 자연 승격된다.
          if (snapped) commitRange(snapped, "manual");
          return;
        }
        lastClickRef.current = { si: tok.sentenceIndex, t: e.timeStamp };
        const plainNew =
          !coveringPoint(tok.start, tok.end) &&
          !coveringSuggestion(tok.start, tok.end);
        handleTokenTap(tok);
        // 새 단어를 지정한 경우에만 안내 — 해제/제안 승격 클릭에는 띄우지 않는다.
        if (plainNew) showClickHint(e.clientX, e.clientY);
        else hideClickHint();
        return;
      }
      handleTokenTap(tok);
      return;
    }
    hideClickHint();
    if (dragEnabled && d.last) commitRange(d.last, "manual");
  };

  const onStagePointerCancel = () => {
    clearDragPreview();
    dragRef.current = null;
    touchDownRef.current = null;
  };

  // 문장 모드 전용 — click 은 마우스·터치 공통이고 스크롤/드래그를 스스로 거른다.
  const onStageClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!sentenceMode) return;
    const t = e.target;
    const el = t instanceof Element ? t.closest("[data-sent-i]") : null;
    if (!(el instanceof HTMLElement)) return;
    const si = Number(el.dataset.sentI);
    if (Number.isInteger(si) && si >= 0 && si < tokenized.sentences.length) {
      setActiveIdx(si);
      toggleSentence(si);
    }
  };

  // ── 키보드: roving 커서(aria-activedescendant) + Shift+화살표 구 확장 ───────
  const kbPreview = useMemo(() => {
    if (sentenceMode || !dragEnabled || kbAnchor === null || kbAnchor === activeIdx) return null;
    const lo = allTokens[Math.min(kbAnchor, activeIdx)];
    const hi = allTokens[Math.max(kbAnchor, activeIdx)];
    if (!lo || !hi) return null;
    return snapRangeToWords(tokenized, lo.start, hi.end);
  }, [sentenceMode, dragEnabled, kbAnchor, activeIdx, allTokens, tokenized]);

  const onStageKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const itemCount = sentenceMode ? tokenized.sentences.length : allTokens.length;
    if (itemCount === 0) return;
    const move = (next: number, extend: boolean) => {
      e.preventDefault();
      if (!sentenceMode && dragEnabled && extend) setKbAnchor((prev) => prev ?? activeIdx);
      else setKbAnchor(null);
      setActiveIdx(Math.max(0, Math.min(itemCount - 1, next)));
    };
    switch (e.key) {
      case "ArrowRight":
        move(activeIdx + 1, e.shiftKey);
        return;
      case "ArrowLeft":
        move(activeIdx - 1, e.shiftKey);
        return;
      case "ArrowDown":
      case "ArrowUp": {
        const dir = e.key === "ArrowDown" ? 1 : -1;
        if (sentenceMode) {
          move(activeIdx + dir, false);
          return;
        }
        const cur = allTokens[activeIdx];
        const si = (cur?.sentenceIndex ?? 0) + dir;
        if (si < 0 || si >= tokenized.sentences.length) {
          e.preventDefault();
          return;
        }
        move(sentenceTokenBase[si], false);
        return;
      }
      case "Home":
        move(0, false);
        return;
      case "End":
        move(itemCount - 1, false);
        return;
      case "Enter":
      case " ": {
        e.preventDefault();
        if (sentenceMode) {
          toggleSentence(activeIdx);
          return;
        }
        if (kbAnchor !== null && kbAnchor !== activeIdx) {
          const preview = kbPreview;
          setKbAnchor(null);
          if (preview) commitRange(preview, "manual");
          return;
        }
        const tok = allTokens[activeIdx];
        if (tok) handleTokenTap(tok);
        return;
      }
      case "Backspace":
      case "Delete": {
        if (sentenceMode) {
          const sent = tokenized.sentences[activeIdx];
          const covering = sent ? coveringPoint(sent.start, sent.end) : undefined;
          if (covering) {
            e.preventDefault();
            removePoint(covering);
          }
          return;
        }
        const tok = allTokens[activeIdx];
        const covering = tok ? coveringPoint(tok.start, tok.end) : undefined;
        if (covering) {
          e.preventDefault();
          removePoint(covering);
        }
        return;
      }
      default:
    }
  };

  // roving 커서 이동 시 화면 안으로 — 포커스 중일 때만(마운트 직후 점프 방지).
  useEffect(() => {
    const root = listRef.current;
    if (!root || document.activeElement !== root) return;
    const el = root.querySelector(
      sentenceMode ? `[data-sent-i="${activeIdx}"]` : `[data-i="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, sentenceMode]);

  // ── 칩 레일 ↔ 본문 양방향 링 펄스 (재렌더 없이 classList 로만) ──────────────
  const pulseStageForPoint = (key: string, on: boolean) => {
    const root = listRef.current;
    if (!root) return;
    root.querySelectorAll(`[data-pt="${key}"]`).forEach((el) => {
      el.classList.toggle("ppk-ring", on);
    });
    if (on) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      root
        .querySelector(`[data-pt="${key}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
  };

  // ── AI 제안 사유 툴팁 — 무대가 overflow 스크롤 컨테이너라 CSS ::after(absolute)
  // 는 첫 줄에서 상단이 잘린다. 단일 fixed 요소를 DOM 조작으로만 이동(재렌더 0),
  // 위 공간이 부족하면 아래로 플립한다.
  const sugTipRef = useRef<HTMLDivElement>(null);
  const sugTipForRef = useRef<Element | null>(null);

  const hideSugTip = () => {
    const tip = sugTipRef.current;
    if (tip) tip.style.display = "none";
    sugTipForRef.current = null;
  };

  const showSugTip = (el: HTMLElement) => {
    const tip = sugTipRef.current;
    const reason = el.dataset.reason;
    if (!tip || !reason) return;
    sugTipForRef.current = el;
    tip.textContent = reason;
    tip.style.display = "block";
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(r.left, 8), window.innerWidth - w - 8);
    let top = r.top - h - 7;
    if (top < 8) top = r.bottom + 7;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  const onStageMouseOver = (e: ReactMouseEvent<HTMLDivElement>) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const sugEl = t.closest("[data-reason]");
    if (sugEl !== sugTipForRef.current) {
      if (sugEl instanceof HTMLElement) showSugTip(sugEl);
      else hideSugTip();
    }
    const el = t.closest("[data-pt]");
    const key = el instanceof HTMLElement ? (el.dataset.pt ?? null) : null;
    if (key === hoveredPtRef.current) return;
    if (hoveredPtRef.current) {
      chipEls.current.get(hoveredPtRef.current)?.classList.remove("ppk-ring");
    }
    hoveredPtRef.current = key;
    if (key) chipEls.current.get(key)?.classList.add("ppk-ring");
  };

  const onStageMouseLeave = () => {
    hideSugTip();
    if (hoveredPtRef.current) {
      chipEls.current.get(hoveredPtRef.current)?.classList.remove("ppk-ring");
      hoveredPtRef.current = null;
    }
  };

  // ── 태그 드롭 패널 닫기 — 바깥 클릭·스크롤·리사이즈·Esc (fixed 좌표 스테일 방지).
  // Esc 는 캡처 단계에서 소비해 부모 Esc 사다리(픽커 닫기)로 새지 않게 한다.
  useEffect(() => {
    if (!tagPop) return;
    const onPointerDown = (e: Event) => {
      const t = e.target;
      if (t instanceof Element && t.closest("[data-ppk-tagpop]")) return;
      setTagPop(null);
    };
    const closeNow = () => setTagPop(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setTagPop(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", closeNow, true);
    window.addEventListener("resize", closeNow);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", closeNow, true);
      window.removeEventListener("resize", closeNow);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [tagPop]);

  // ── AI 제안 상태 전환 알림 (스크린리더) — 렌더 중 이전 값 비교 패턴 ─────────
  const [seenSuggestStatus, setSeenSuggestStatus] = useState(suggestState.status);
  if (seenSuggestStatus !== suggestState.status) {
    setSeenSuggestStatus(suggestState.status);
    if (suggestState.status === "done") {
      setLiveMsg(
        anchoredSuggestions.length === 0
          ? "제안할 포인트를 찾지 못했습니다. 지문에서 직접 선택해 주세요."
          : `AI 제안 ${anchoredSuggestions.length}건이 점선 밑줄로 표시되었습니다.`,
      );
    } else if (suggestState.status === "error") {
      setLiveMsg("AI 제안을 불러오지 못했습니다. 수동 선택은 계속 이용할 수 있습니다.");
    }
  }

  // ── 렌더 파생 ────────────────────────────────────────────────────────────────
  const suggestLoading = suggestState.status === "loading";
  const guideParts = useMemo(() => {
    const i = meta.guide.indexOf(meta.unitNoun);
    if (i < 0) return null;
    return [meta.guide.slice(0, i), meta.guide.slice(i + meta.unitNoun.length)] as const;
  }, [meta.guide, meta.unitNoun]);

  const registerSeg = (start: number) => (el: HTMLElement | null) => {
    if (el) segEls.current.set(start, el);
    else segEls.current.delete(start);
  };
  const registerChip = (key: string) => (el: HTMLElement | null) => {
    if (el) chipEls.current.set(key, el);
    else chipEls.current.delete(key);
  };

  const itemCount = sentenceMode ? tokenized.sentences.length : allTokens.length;
  const lastSentence = tokenized.sentences[tokenized.sentences.length - 1];
  const trailingText = lastSentence ? tokenized.text.slice(lastSentence.end) : "";

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col bg-white"
      aria-label="포인트 짚어주기"
      data-passage-id={passageId}
    >
      {/* ── 상단: 타이틀 + AI 제안/완료 + 안내 칩 + 카운터 ── */}
      <header className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <Crosshair className="size-3.5" aria-hidden="true" />
          </span>
          <span className="text-[12px] font-bold text-slate-800">포인트 짚어주기</span>
          <span className="truncate px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
            {typeLabel}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (!suggestLoading) onRequestSuggest();
              }}
              disabled={suggestLoading || itemCount === 0}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:border-slate-200"
            >
              {suggestLoading ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <ScanSearch className="size-3.5" aria-hidden="true" />
              )}
              <span>
                {suggestLoading
                  ? "제안 검색 중"
                  : suggestState.status === "done"
                    ? "다시 제안"
                    : suggestState.status === "error"
                      ? "다시 시도"
                      : "AI 제안"}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Check className="size-3.5" aria-hidden="true" />
              <span>선택 완료</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
            {guideParts ? (
              <>
                {guideParts[0]}
                <strong className="font-bold text-blue-700">{meta.unitNoun}</strong>
                {guideParts[1]}
              </>
            ) : (
              meta.guide
            )}
          </p>
          <span
            key={shakeNonce}
            aria-label={`지정한 포인트 ${orderedPoints.length}개, 최대 ${cap}개`}
            className={cn(
              "inline-flex h-[26px] shrink-0 items-center gap-0.5 rounded-md border px-2 text-[11px] font-bold tabular-nums",
              atCap
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600",
              shakeNonce > 0 && "ppk-shake",
            )}
          >
            {orderedPoints.length}
            <span className="font-medium text-slate-300">/</span>
            {cap}
          </span>
        </div>

        {suggestState.status === "error" ? (
          <p className="text-[10px] leading-snug text-slate-500">
            {suggestState.message || "AI 제안을 불러오지 못했습니다."} 수동 선택은 계속 이용할 수
            있습니다.
          </p>
        ) : suggestState.status === "done" && anchoredSuggestions.length === 0 ? (
          <p className="text-[10px] leading-snug text-slate-500">
            제안할 포인트를 찾지 못했습니다. 지문에서 직접 선택해 주세요.
          </p>
        ) : suggestState.status === "done" && visibleSuggestions.length > 0 ? (
          <p className="text-[10px] leading-snug text-slate-500">
            AI 제안 <span className="font-bold text-blue-700">{visibleSuggestions.length}건</span> —
            점선 밑줄에 마우스를 올리면 사유가 보이고, 클릭하면 포인트로 추가됩니다.
          </p>
        ) : null}
        {orderedPoints.length > cap ? (
          <p className="text-[10px] leading-snug text-slate-500">
            유형 설정 상한이 줄어 앞에서부터 {cap}개만 생성에 반영됩니다.
          </p>
        ) : null}
      </header>

      {/* ── 무대: 원고지 타이포 지문 (68ch, 15.5px/1.95) ── */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={() => {
          hideSugTip();
          hideClickHint();
        }}
      >
        {itemCount === 0 ? (
          <p className="px-6 py-10 text-center text-[12px] text-slate-400">
            선택할 수 있는 문장이 없습니다. 지문 내용을 확인해 주세요.
          </p>
        ) : (
          <div
            ref={listRef}
            role="listbox"
            aria-label={`${typeLabel} 출제 포인트 선택 — 지문`}
            aria-multiselectable="true"
            aria-activedescendant={optionId(activeIdx)}
            tabIndex={0}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerCancel}
            onClick={onStageClick}
            onKeyDown={onStageKeyDown}
            onMouseOver={onStageMouseOver}
            onMouseLeave={onStageMouseLeave}
            className="ppk-stage mx-auto max-w-[68ch] select-none whitespace-pre-wrap px-6 py-6 text-[15.5px] leading-[1.95] text-slate-800 outline-none"
          >
            {tokenized.sentences.map((sent, si) => {
              const between =
                si === 0
                  ? tokenized.text.slice(0, sent.start)
                  : tokenized.text.slice(tokenized.sentences[si - 1].end, sent.start);

              // ── 문장 단위 유형: 문장 전체가 하나의 옵션 ──
              if (sentenceMode) {
                const point = coveringPoint(sent.start, sent.end);
                const pKey = point ? pointKeyOf(point) : undefined;
                const pIdx = point ? orderedPoints.indexOf(point) : -1;
                const sug = point ? undefined : suggestionBySentence.get(si);
                const springOn = point && spring !== null && pKey === spring.key;
                return (
                  <Fragment key={sent.start}>
                    {between ? (
                      <span aria-hidden="true" className="ppk-between">
                        {between}
                      </span>
                    ) : null}
                    <span
                      key={`${sent.start}${springOn ? `-sp${spring.nonce}` : ""}`}
                      id={optionId(si)}
                      role="option"
                      aria-selected={!!point}
                      data-sent-i={si}
                      data-pt={pKey}
                      data-reason={sug?.reason}
                      style={
                        sug ? ({ "--ppk-d": `${sug.delayMs}ms` } as CSSProperties) : undefined
                      }
                      className={cn(
                        "ppk-sent ppk-sint",
                        point && (isInsert ? "ppk-gone" : "ppk-ssel"),
                        springOn && "ppk-spring",
                        sug && "ppk-ssug",
                        activeIdx === si && "ppk-active",
                      )}
                    >
                      <sup className="ppk-sup" aria-hidden="true">
                        {si + 1}
                      </sup>
                      {point ? (
                        <span className="ppk-badge" aria-hidden="true">
                          {CIRCLED[pIdx] ?? String(pIdx + 1)}
                        </span>
                      ) : null}
                      {isInsert && point ? (
                        <>
                          <span className="ppk-gone-chip">빠진 자리</span>
                          <span className="ppk-gone-txt">{sent.text}</span>
                        </>
                      ) : (
                        sent.text
                      )}
                    </span>
                  </Fragment>
                );
              }

              // ── 단어/구 유형: 토큰 단위 옵션 + gap 은 원문 재구성용 ──
              return (
                <Fragment key={sent.start}>
                  {between ? (
                    <span aria-hidden="true" className="ppk-between">
                      {between}
                    </span>
                  ) : null}
                  <span className="ppk-sent">
                    <sup className="ppk-sup" aria-hidden="true">
                      {si + 1}
                    </sup>
                    {sent.segments.map((seg) => {
                      const point = coveringPoint(seg.start, seg.end);
                      const pKey = point ? pointKeyOf(point) : undefined;
                      const sug = point ? undefined : coveringSuggestion(seg.start, seg.end);
                      const kbCover =
                        kbPreview !== null &&
                        seg.start >= kbPreview.start &&
                        seg.end <= kbPreview.end;
                      const springOn = point && spring !== null && pKey === spring.key;
                      const segKey = `${seg.start}${springOn ? `-sp${spring.nonce}` : ""}`;
                      const delayStyle = sug
                        ? ({ "--ppk-d": `${sug.delayMs}ms` } as CSSProperties)
                        : undefined;

                      if (seg.kind === "gap") {
                        return (
                          <span
                            key={segKey}
                            ref={registerSeg(seg.start)}
                            aria-hidden="true"
                            data-pt={pKey}
                            style={delayStyle}
                            className={cn(
                              "ppk-gap",
                              point && "ppk-sel",
                              sug && "ppk-sug",
                              kbCover && "ppk-drag",
                              springOn && "ppk-spring",
                            )}
                          >
                            {seg.text}
                          </span>
                        );
                      }

                      const gi = sentenceTokenBase[si] + seg.wordIndex;
                      return (
                        <span
                          key={segKey}
                          ref={registerSeg(seg.start)}
                          id={optionId(gi)}
                          role="option"
                          aria-selected={!!point}
                          data-i={gi}
                          data-pt={pKey}
                          data-reason={sug?.reason}
                          style={delayStyle}
                          className={cn(
                            "ppk-tok",
                            point && "ppk-sel",
                            point && seg.start === point.start && "ppk-sel-a",
                            point && seg.end === point.end && "ppk-sel-b",
                            sug && "ppk-sug",
                            kbCover && "ppk-drag",
                            kbCover && kbPreview.start === seg.start && "ppk-drag-a",
                            kbCover && kbPreview.end === seg.end && "ppk-drag-b",
                            touchAnchor === gi && "ppk-anchor",
                            activeIdx === gi && "ppk-active",
                            springOn && "ppk-spring",
                          )}
                        >
                          {point && seg.start === point.start ? (
                            <span className="ppk-badge" aria-hidden="true">
                              {CIRCLED[orderedPoints.indexOf(point)] ??
                                String(orderedPoints.indexOf(point) + 1)}
                            </span>
                          ) : null}
                          {seg.text}
                        </span>
                      );
                    })}
                  </span>
                </Fragment>
              );
            })}
            {trailingText ? (
              <span aria-hidden="true" className="ppk-between">
                {trailingText}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* ── 하단: 칩 레일 + sticky 힌트 바 ── */}
      <footer className="shrink-0 border-t border-slate-200 bg-white">
        <div className="flex max-h-[84px] flex-wrap items-center gap-1.5 overflow-y-auto px-4 py-2.5">
          {orderedPoints.length === 0 ? (
            <p className="text-[10px] font-medium text-slate-400">
              아직 지정한 포인트가 없습니다. 지문에서 직접 선택하거나 AI 제안을 받아 보세요.
            </p>
          ) : (
            orderedPoints.map((p, idx) => {
              const pKey = pointKeyOf(p);
              return (
                <span
                  key={pKey}
                  ref={registerChip(pKey)}
                  data-chip={pKey}
                  onMouseEnter={() => pulseStageForPoint(pKey, true)}
                  onMouseLeave={() => pulseStageForPoint(pKey, false)}
                  className="relative inline-flex max-w-[240px] items-center gap-1 rounded-md border border-blue-200 bg-blue-50 py-0.5 pl-1.5 pr-0.5"
                >
                  <span className="text-[11px] font-bold leading-none text-blue-600" aria-hidden="true">
                    {CIRCLED[idx] ?? String(idx + 1)}
                  </span>
                  <span title={p.text} className="min-w-0 truncate text-[11px] font-medium text-blue-900">
                    {p.text}
                  </span>
                  {p.source === "ai" ? (
                    <PearlIcon className="size-3 shrink-0 text-blue-400" />
                  ) : null}
                  {showTag ? (
                    <span className="shrink-0" data-ppk-tagpop="">
                      <button
                        type="button"
                        onClick={(e) => {
                          if (tagPop?.key === pKey) {
                            setTagPop(null);
                            return;
                          }
                          // 칩 레일이 overflow 컨테이너라 fixed 로 띄운다 —
                          // 버튼 위 중앙 정렬 + 좌우 뷰포트 클램프(패널 w-60).
                          const r = e.currentTarget.getBoundingClientRect();
                          setTagCustom(
                            p.tag && !(GRAMMAR_TAG_OPTIONS as readonly string[]).includes(p.tag)
                              ? p.tag
                              : "",
                          );
                          setTagPop({
                            key: pKey,
                            left: Math.min(
                              Math.max(r.left + r.width / 2 - 120, 8),
                              window.innerWidth - 248,
                            ),
                            bottom: window.innerHeight - r.top + 6,
                          });
                        }}
                        aria-expanded={tagPop?.key === pKey}
                        aria-label={`'${shortText(p.text)}' 문법 분류 선택`}
                        title="이 포인트의 문법 분류를 선택합니다 (선택사항)"
                        className={cn(
                          "inline-flex h-[18px] items-center gap-0.5 rounded-[5px] px-1 text-[10px] font-bold transition-colors",
                          p.tag
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "border border-dashed border-slate-300 bg-white text-slate-400 hover:border-blue-400 hover:text-blue-600",
                        )}
                      >
                        <Tag className="size-2.5 shrink-0" aria-hidden="true" />
                        <span className="max-w-[88px] truncate">{p.tag ?? "분류"}</span>
                        <ChevronDown className="size-2.5 shrink-0" aria-hidden="true" />
                      </button>
                      {tagPop?.key === pKey ? (
                        <span
                          data-ppk-tagpop=""
                          style={{ left: tagPop.left, bottom: tagPop.bottom }}
                          className="fixed z-50 block w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                        >
                          <span className="flex items-center justify-between px-1 pb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              문법 분류
                            </span>
                            {p.tag ? (
                              <button
                                type="button"
                                onClick={() => setPointTag(p, undefined)}
                                className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                              >
                                <X className="size-2.5" aria-hidden="true" />
                                지우기
                              </button>
                            ) : null}
                          </span>
                          <span className="grid grid-cols-2 gap-0.5">
                            {GRAMMAR_TAG_OPTIONS.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => setPointTag(p, tag)}
                                className={cn(
                                  "flex h-7 items-center justify-between gap-1 rounded-md px-2 text-left text-[11px] transition-colors",
                                  p.tag === tag
                                    ? "bg-blue-600 font-bold text-white"
                                    : "font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700",
                                )}
                              >
                                <span className="truncate">{tag}</span>
                                {p.tag === tag ? (
                                  <Check className="size-3 shrink-0" aria-hidden="true" />
                                ) : null}
                              </button>
                            ))}
                          </span>
                          {/* 기타 직접 입력 — 서버가 태그를 자유 문자열로 받으므로
                              목록 밖 분류도 그대로 프롬프트에 반영된다. */}
                          <span className="mt-1.5 flex items-center gap-1 border-t border-slate-100 px-0.5 pt-1.5">
                            <input
                              type="text"
                              value={tagCustom}
                              onChange={(e) => setTagCustom(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                const v = tagCustom.trim();
                                if (v) setPointTag(p, v);
                              }}
                              maxLength={20}
                              placeholder="기타 분류 직접 입력"
                              aria-label="문법 분류 직접 입력"
                              className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const v = tagCustom.trim();
                                if (v) setPointTag(p, v);
                              }}
                              disabled={!tagCustom.trim()}
                              className="h-7 shrink-0 rounded-md bg-blue-600 px-2 text-[11px] font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
                            >
                              적용
                            </button>
                          </span>
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removePoint(p)}
                    aria-label={`'${shortText(p.text)}' 포인트 해제`}
                    className="flex size-[18px] shrink-0 items-center justify-center rounded text-blue-300 transition-colors hover:bg-blue-100 hover:text-blue-700"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              );
            })
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-[10px] font-medium text-slate-500">
          {capNoticeOn ? (
            <span className="font-bold text-blue-700">
              상한에 도달했습니다. 기존 선택을 해제하면 추가할 수 있습니다.
            </span>
          ) : (
            <>
              <span className="ppk-hint-mouse">
                {sentenceMode
                  ? isInsert
                    ? "문장 클릭 = 삽입(빠질) 문장 지정 · 다시 클릭 = 해제"
                    : "문장 클릭 = 선택 · 다시 클릭 = 해제"
                  : dragEnabled
                    ? "클릭 = 단어 · 더블클릭 = 문장 · 드래그 = 구 · 선택 다시 클릭 = 해제"
                    : "클릭 = 단어 선택 · 다시 클릭 = 해제"}
                {" · 방향키 이동 · Enter 선택"}
                {!sentenceMode && dragEnabled ? " · Shift+방향키 구 확장" : ""}
              </span>
              <span className="ppk-hint-touch">
                {sentenceMode
                  ? isInsert
                    ? "문장 탭 = 삽입(빠질) 문장 지정 · 다시 탭 = 해제"
                    : "문장 탭 = 선택 · 다시 탭 = 해제"
                  : dragEnabled
                    ? "탭 = 시작 지정 · 다른 단어 탭 = 구 지정 · 같은 단어 다시 탭 = 단어 지정 · 선택 탭 = 해제"
                    : "탭 = 단어 선택 · 다시 탭 = 해제"}
              </span>
            </>
          )}
        </div>
      </footer>

      {/* AI 제안 사유 툴팁 — 단일 fixed 요소, showSugTip/hideSugTip 이 DOM 으로만 이동 */}
      <div ref={sugTipRef} aria-hidden="true" style={{ display: "none" }} className="ppk-tipfx" />

      {/* "더블클릭 = 문장 지정" 안내 칩 — 단어 지정 직후 커서 옆 */}
      <div ref={clickHintRef} aria-hidden="true" style={{ display: "none" }} className="ppk-clickhint">
        더블클릭하면 문장 전체를 지정해요
      </div>

      {/* 커밋/해제/상한 알림 — 시각 변화와 동일 내용을 보이지 않게 낭독 */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveMsg}
      </p>

      {/* ppk- 접두 전용 무대 스타일 — hover·모션 전부 CSS(재렌더 0), 전역 css 파일 무수정 */}
      <style jsx global>{`
        .ppk-stage {
          -webkit-tap-highlight-color: transparent;
        }
        .ppk-between {
          color: #94a3b8;
        }
        .ppk-sup {
          margin-right: 3px;
          font-size: 10px;
          font-weight: 600;
          color: #cbd5e1;
          vertical-align: super;
          user-select: none;
          transition: color 0.12s ease;
        }
        .ppk-sent:hover > .ppk-sup {
          color: #60a5fa;
        }

        /* 단어 토큰 — hover 는 CSS 전용 */
        .ppk-tok {
          display: inline-block;
          padding: 0 1px;
          margin: 0 -1px;
          border-radius: 2px;
          cursor: pointer;
          transition: background-color 0.12s ease;
        }
        .ppk-tok:not(.ppk-sel):not(.ppk-drag):hover {
          background-color: #dbeafe;
          border-radius: 6px;
        }

        /* 커밋된 선택 — 범위 전체가 하나의 연속 pill(내부 토큰 라운딩 0),
           첫 토큰만 좌측·끝 토큰만 우측 라운딩 + 파랑 하단 스트로크 연속 */
        .ppk-sel {
          background-color: #dbeafe;
          box-shadow: inset 0 -2px 0 0 #3b82f6;
          border-radius: 0;
        }
        .ppk-sel:hover {
          background-color: #bfdbfe;
        }
        .ppk-sel-a {
          border-top-left-radius: 6px;
          border-bottom-left-radius: 6px;
        }
        .ppk-sel-b {
          border-top-right-radius: 6px;
          border-bottom-right-radius: 6px;
        }
        /* 범위 내 공백(gap)도 토큰과 같은 인라인블록 박스로 — 배경 높이가 토큰과
           일치해 공백 구간에서 배경·하단 스트로크가 끊기지 않는다 */
        .ppk-gap.ppk-sel,
        .ppk-gap.ppk-drag {
          display: inline-block;
        }

        /* 드래그/Shift 확장 프리뷰 — 스냅 pill(선택과 동일한 연속 규칙) */
        .ppk-drag {
          background-color: rgba(191, 219, 254, 0.55);
          box-shadow: inset 0 -2px 0 0 #93c5fd;
          border-radius: 0;
        }
        .ppk-drag-a {
          border-top-left-radius: 6px;
          border-bottom-left-radius: 6px;
        }
        .ppk-drag-b {
          border-top-right-radius: 6px;
          border-bottom-right-radius: 6px;
        }

        /* 터치 2탭 시작 앵커 */
        .ppk-anchor {
          outline: 2px dashed #3b82f6;
          outline-offset: 1px;
          border-radius: 4px;
        }

        /* roving 커서 — 키보드 포커스일 때만 표시 */
        .ppk-stage:focus-visible .ppk-active {
          outline: 2px solid #2563eb;
          outline-offset: 1px;
          border-radius: 4px;
        }

        /* 문장 단위 유형 */
        .ppk-sint {
          cursor: pointer;
          padding: 1px 2px;
          margin: 0 -2px;
          border-radius: 6px;
          transition: background-color 0.12s ease;
          -webkit-box-decoration-break: clone;
          box-decoration-break: clone;
        }
        .ppk-sint:not(.ppk-ssel):not(.ppk-gone):hover {
          background-color: #eff6ff;
        }
        .ppk-ssel {
          background-color: #dbeafe;
          box-shadow: inset 0 -2px 0 0 #3b82f6;
        }
        .ppk-ssel:hover {
          background-color: #bfdbfe;
        }

        /* SENTENCE_INSERT — 점선 외곽 + 반투명 '빠진 자리' 프리뷰 */
        .ppk-gone {
          outline: 1.5px dashed #60a5fa;
          outline-offset: 2px;
          border-radius: 6px;
          background-color: #eff6ff;
        }
        .ppk-gone-txt {
          opacity: 0.35;
        }
        .ppk-gone-chip {
          display: inline-block;
          margin: 0 4px 0 1px;
          padding: 0 6px;
          border: 1px dashed #60a5fa;
          border-radius: 9999px;
          background: #ffffff;
          color: #2563eb;
          font-size: 10px;
          font-weight: 700;
          line-height: 16px;
          vertical-align: 2px;
        }

        /* AI 제안 — 점선 밑줄 + hover 사유 툴팁, 클릭 승격 */
        .ppk-sug,
        .ppk-ssug {
          position: relative;
          cursor: pointer;
          background-image: repeating-linear-gradient(
            90deg,
            #60a5fa 0 5px,
            transparent 5px 9px
          );
          background-repeat: no-repeat;
          background-position: 0 100%;
          background-size: 100% 2px;
        }
        /* 단어 지정 직후 커서 옆 "더블클릭 = 문장" 안내 칩 */
        .ppk-clickhint {
          position: fixed;
          z-index: 60;
          padding: 4px 9px;
          border-radius: 7px;
          background: #0f172a;
          color: #f8fafc;
          font-size: 10.5px;
          font-weight: 600;
          line-height: 1.4;
          white-space: nowrap;
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.22);
          pointer-events: none;
        }
        @media (prefers-reduced-motion: no-preference) {
          .ppk-clickhint {
            animation: ppkHintIn 0.18s ease-out;
          }
        }
        @keyframes ppkHintIn {
          from {
            opacity: 0;
            transform: translateY(3px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* AI 제안 사유 툴팁 본체 — fixed 라 무대 overflow 클리핑과 무관하다 */
        .ppk-tipfx {
          position: fixed;
          z-index: 60;
          width: max-content;
          max-width: 260px;
          padding: 5px 9px;
          border-radius: 8px;
          background: #0f172a;
          color: #f8fafc;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.5;
          white-space: normal;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
          pointer-events: none;
        }

        /* ① 배지 */
        .ppk-badge {
          display: inline-block;
          margin-right: 2px;
          font-size: 12.5px;
          font-weight: 700;
          line-height: 1;
          color: #2563eb;
        }

        /* 힌트 바 — 포인터 종류별 스왑 */
        .ppk-hint-touch {
          display: none;
        }
        @media (hover: none) and (pointer: coarse) {
          .ppk-hint-mouse {
            display: none;
          }
          .ppk-hint-touch {
            display: inline;
          }
        }

        /* 모션 — prefers-reduced-motion 전면 존중 */
        @media (prefers-reduced-motion: no-preference) {
          .ppk-sug,
          .ppk-ssug {
            animation: ppkDrawIn 0.4s cubic-bezier(0.25, 1, 0.5, 1) backwards;
            animation-delay: var(--ppk-d, 0ms);
          }
          .ppk-badge {
            animation: ppkPopIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
          }
          .ppk-spring {
            animation: ppkSpring 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          .ppk-shake {
            animation: ppkShake 0.32s ease;
          }
          .ppk-ring {
            animation: ppkRingPulse 0.7s ease-out 2;
            border-radius: 6px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .ppk-tok,
          .ppk-sint,
          .ppk-sup {
            transition: none;
          }
          .ppk-ring {
            box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.5);
            border-radius: 6px;
          }
        }
        @keyframes ppkDrawIn {
          from {
            background-size: 0% 2px;
          }
          to {
            background-size: 100% 2px;
          }
        }
        @keyframes ppkPopIn {
          0% {
            transform: scale(0.4);
            opacity: 0;
          }
          60% {
            transform: scale(1.18);
            opacity: 1;
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes ppkSpring {
          0% {
            transform: scale(0.96);
          }
          55% {
            transform: scale(1.04);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes ppkShake {
          0%,
          100% {
            transform: translateX(0);
          }
          20% {
            transform: translateX(-3px);
          }
          45% {
            transform: translateX(3px);
          }
          70% {
            transform: translateX(-2px);
          }
          90% {
            transform: translateX(1px);
          }
        }
        @keyframes ppkRingPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4);
          }
          100% {
            box-shadow: 0 0 0 7px rgba(37, 99, 235, 0);
          }
        }
      `}</style>
    </section>
  );
}
