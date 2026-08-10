"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen, PenTool, Braces, MessageSquare, Target,
  X, Trash2, Undo2, Redo2, Pencil, Check,
} from "lucide-react";
import { SaveButton } from "@/components/ui/save-button";
import {
  generateAnnotationId,
  type Annotation, type AnnotationType,
} from "./annotation-marks";
import {
  PassageMarkStage,
  type StageAnchor,
  type StageSelection,
} from "./passage-mark-stage";
import { PassageMarkStyles } from "./passage-mark-styles";
import { diffEditSpans, type EditSpan } from "@/lib/passage-edit-diff";

// ============================================================================
// 지문 마킹 에디터 — 문제 생성 워크스페이스(WorkspaceSelectStage + '직접 편집'
// textarea 토글)를 학습지 5종 마킹에 그대로 이식한 호스트. 기본은 읽기 전용
// 마킹 무대(단어 hover·클릭·더블클릭 문장·스냅 드래그), 타이핑이 필요하면
// '직접 편집' 토글로 textarea 를 연다. 마킹/메모/실행취소/AI변형은 전부
// 원문 문자 오프셋 기반으로 동작한다(ProseMirror 위치 X).
//
// 두 표면은 '같은 지오메트리'를 공유한다(SURFACE_*) — 폰트·행간·패딩이 1px 도
// 어긋나면 모드를 토글할 때 줄바꿈 모양이 통째로 바뀌어 보인다. 우상단 컨트롤
// 회피도 float 가 아니라 위 패딩으로 통일했다(textarea 는 float 를 못 흉내낸다).
// '직접 편집' 중에도 마킹이 보이도록 textarea 뒤에 동일 지오메트리의 하이라이트
// 백드롭(.pms-mirror)을 깔아 글자는 투명 렌더하고 마킹 배경만 노출한다 — 글자·
// 커서·IME 는 진짜 textarea 그대로라 한글 조합 입력도 그대로 동작한다.
// ============================================================================

// 두 표면 공통 지오메트리 — 여기만 바꾸면 무대/편집이 함께 움직인다.
const SURFACE_FONT_SIZE = "13px";
const SURFACE_LINE_HEIGHT = 1.625;
const SURFACE_PAD_L = 12; // = pl-3
const SURFACE_PAD_R = 64; // = pr-16
const SURFACE_PAD_B = 8; // = py-2
// 우상단 컨트롤(직접 편집·되돌리기) 높이 + 여유. 주석 카운트 바가 떠 있으면
// 컨트롤이 그 위에 겹치므로 본문은 기본 여백만 남긴다.
const SURFACE_PAD_T_RESERVED = 40;
const SURFACE_PAD_T = 8;

const ANNOTATION_CONFIG: Record<
  AnnotationType,
  { label: string; shortLabel: string; icon: typeof BookOpen; color: string; dotColor: string; description: string }
> = {
  vocab: { label: "핵심 어휘", shortLabel: "어휘", icon: BookOpen, color: "text-blue-600", dotColor: "bg-blue-500", description: "동의어·파생어·콜로케이션 등 어휘 심층 분석" },
  grammar: { label: "어법/문법", shortLabel: "어법", icon: PenTool, color: "text-violet-600", dotColor: "bg-violet-500", description: "어법 출제 포인트, 오답 함정, 변형 가능 방향" },
  syntax: { label: "문장별 읽기 포인트", shortLabel: "읽기", icon: Braces, color: "text-cyan-600", dotColor: "bg-cyan-500", description: "긴 문장 끊어읽기, 수식 관계, 읽는 순서" },
  sentence: { label: "핵심 문장", shortLabel: "문장", icon: MessageSquare, color: "text-green-600", dotColor: "bg-green-500", description: "논리 흐름, 주제문, 빈칸 출제 적합 위치" },
  examPoint: { label: "출제 포인트", shortLabel: "출제", icon: Target, color: "text-yellow-600", dotColor: "bg-yellow-500", description: "패러프레이징, 문장 전환, 서술형 조건 설정" },
};
const ANNOTATION_TYPES = Object.keys(ANNOTATION_CONFIG) as AnnotationType[];

// Alt/Option + letter (event.code, IME-agnostic) — 툴바 열려 있을 때만.
const SHORTCUT_MAP: Record<AnnotationType, { code: string; letter: string }> = {
  vocab: { code: "KeyV", letter: "V" },
  grammar: { code: "KeyG", letter: "G" },
  syntax: { code: "KeyP", letter: "P" },
  sentence: { code: "KeyS", letter: "S" },
  examPoint: { code: "KeyE", letter: "E" },
};

const MIN_MARK_CHARS = 1;
const TYPING_BURST_MS = 600;
const POPUP_W = { toolbar: 366, memo: 300, edit: 300 } as const;
const POPUP_H = { toolbar: 52, memo: 96, edit: 96 } as const;

/**
 * 부모(PassageInputRow)가 AI 변형(문장 재작성·앞 맥락 추가)을 적용할 때 쓰는
 * 명령형 핸들 — TipTap Editor 대신 문자 오프셋 뮤테이션으로 마킹을 보존한다.
 */
export interface MarkEditorHandle {
  /** [from, to) 구간을 text 로 치환(주석 오프셋 자동 보정 + 실행취소 1스텝). */
  replaceRange(from: number, to: number, text: string): void;
  /** 맨 앞에 새 문단을 끼워 넣는다(주석 전체 평행이동 + 실행취소 1스텝). */
  prependParagraph(text: string): void;
}

interface PassageMarkEditorProps {
  content: string;
  onContentChange?: (text: string) => void;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  editable?: boolean;
  placeholder?: string;
  showAnnotationHint?: boolean;
  /** 현재 선택(문자 오프셋)을 부모에 보고 — 'AI 문장 변형' 버튼 활성화용. */
  onSelectionChange?: (sel: { from: number; to: number; text: string } | null) => void;
  /** 명령형 핸들 전달(마운트 시 handle, 언마운트 시 null). */
  onReady?: (handle: MarkEditorHandle | null) => void;
}

type PopupState =
  | { mode: "toolbar" }
  | { mode: "memo"; type: AnnotationType; id: string; text: string }
  | { mode: "edit"; id: string };

/**
 * 본문이 oldStr → newStr 로 바뀌었을 때 주석 오프셋을 보정한다(문제 생성
 * adjustHighlights 와 동일한 단일 변경 구간 규칙). 변경 구간에 완전히 삼켜진
 * 주석은 버리고, 뒤쪽은 평행이동, 걸친 것은 살아남은 부분만 남긴다.
 */
function adjustAnnotations(
  oldStr: string,
  newStr: string,
  anns: Annotation[],
): Annotation[] {
  if (anns.length === 0 || oldStr === newStr) return anns;
  let p = 0;
  const maxP = Math.min(oldStr.length, newStr.length);
  while (p < maxP && oldStr[p] === newStr[p]) p += 1;
  let s = 0;
  while (
    s < oldStr.length - p &&
    s < newStr.length - p &&
    oldStr[oldStr.length - 1 - s] === newStr[newStr.length - 1 - s]
  )
    s += 1;
  const oldEnd = oldStr.length - s;
  const delta = newStr.length - oldStr.length;
  const out: Annotation[] = [];
  for (const a of anns) {
    let from: number;
    let to: number;
    if (a.to <= p) {
      from = a.from;
      to = a.to;
    } else if (a.from >= oldEnd) {
      from = a.from + delta;
      to = a.to + delta;
    } else {
      from = Math.max(0, Math.min(a.from, p));
      to = a.to >= oldEnd ? a.to + delta : Math.min(a.to, p);
      if (to - from < 2) continue; // 남은 조각이 너무 짧으면 주석 폐기
    }
    out.push({ ...a, from, to, text: newStr.slice(from, to) });
  }
  return out;
}

const byOffset = (a: Annotation, b: Annotation) => a.from - b.from || a.to - b.to;

export function PassageMarkEditor({
  content,
  onContentChange,
  annotations,
  onAnnotationsChange,
  editable = true,
  placeholder = "영어 지문을 붙여넣으세요...",
  showAnnotationHint = true,
  onSelectionChange,
  onReady,
}: PassageMarkEditorProps) {
  // 빈 지문은 붙여넣기가 필요하므로 '직접 편집'(textarea)으로 시작한다 — 무대는
  // 읽기 전용이라 빈 행에 타이핑할 수 없다. 내용이 있으면 마킹 무대로 시작.
  const [editMode, setEditMode] = useState(() => content.trim().length === 0);
  const [selection, setSelection] = useState<StageSelection | null>(null);
  const [anchor, setAnchor] = useState<StageAnchor | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [memoInput, setMemoInput] = useState("");
  // 직전 '직접 편집'에서 바뀐 자리 — 편집 완료 시 계산해 무대에 형광펜으로 칠한다.
  const [editSpans, setEditSpans] = useState<EditSpan[]>([]);
  const editBaseRef = useRef<string | null>(null);
  // undo/redo 버튼 활성화 상태 — 스택 변할 때마다 syncHist 로 갱신(렌더 중 ref 접근 X).
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const pendingIdRef = useRef<string | null>(null);
  // 최신 props 를 핸들/스냅샷 콜백이 읽도록 ref 로 미러링(커밋 후 effect 로 동기화).
  const contentRef = useRef(content);
  const annsRef = useRef(annotations);
  useEffect(() => {
    contentRef.current = content;
    annsRef.current = annotations;
  });
  // 실행취소/다시실행 스냅샷 스택({content, annotations}).
  const pastRef = useRef<{ content: string; annotations: Annotation[] }[]>([]);
  const futureRef = useRef<{ content: string; annotations: Annotation[] }[]>([]);
  const syncHist = useCallback(() => {
    setHist({
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
    });
  }, []);

  const emitSelection = useCallback(
    (sel: StageSelection | null) => {
      onSelectionChange?.(
        sel ? { from: sel.start, to: sel.end, text: sel.text } : null,
      );
    },
    [onSelectionChange],
  );

  const clearSelection = useCallback(() => {
    setSelection(null);
    setAnchor(null);
    emitSelection(null);
  }, [emitSelection]);

  // ── 실행취소 스택 원자 연산 ──────────────────────────────────────────────
  const snapshot = useCallback(
    () => ({ content: contentRef.current, annotations: annsRef.current }),
    [],
  );
  /** 현재 상태를 past 에 밀고 future 를 비운 뒤 다음 상태를 커밋한다. */
  const commitStep = useCallback(
    (nextContent: string, nextAnns: Annotation[]) => {
      pastRef.current.push(snapshot());
      if (pastRef.current.length > 100) pastRef.current.shift();
      futureRef.current = [];
      if (nextContent !== contentRef.current) {
        onContentChange?.(nextContent);
        setEditSpans([]); // 본문이 또 바뀌면 직전 편집 표시는 유효하지 않다
      }
      onAnnotationsChange(nextAnns);
      syncHist();
    },
    [snapshot, onContentChange, onAnnotationsChange, syncHist],
  );
  const applySnap = useCallback(
    (snap: { content: string; annotations: Annotation[] }) => {
      if (snap.content !== contentRef.current) {
        onContentChange?.(snap.content);
        setEditSpans([]);
      }
      onAnnotationsChange(snap.annotations);
      pendingIdRef.current = null;
      setPopup(null);
      clearSelection();
      syncHist();
    },
    [onContentChange, onAnnotationsChange, clearSelection, syncHist],
  );
  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(snapshot());
    applySnap(prev);
  }, [snapshot, applySnap]);
  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(snapshot());
    applySnap(next);
  }, [snapshot, applySnap]);

  // ── 명령형 핸들(AI 변형) — 절대 안정 참조. 최신 commitStep/clearSelection 을
  // ref 로 읽어 onReady 가 마운트당 1회만 발화되게 한다(부모의 인라인 콜백 때문에
  // commitStep 이 매 렌더 새로 생겨도 핸들 정체성은 불변 → setMarkApi 무한루프 방지).
  const commitStepRef = useRef(commitStep);
  const clearSelectionRef = useRef(clearSelection);
  useEffect(() => {
    commitStepRef.current = commitStep;
    clearSelectionRef.current = clearSelection;
  });
  const handle = useMemo<MarkEditorHandle>(
    () => ({
      replaceRange(from, to, text) {
        const cur = contentRef.current;
        const a = Math.max(0, Math.min(from, cur.length));
        const b = Math.max(a, Math.min(to, cur.length));
        const next = cur.slice(0, a) + text + cur.slice(b);
        commitStepRef.current(
          next,
          adjustAnnotations(cur, next, annsRef.current).sort(byOffset),
        );
        pendingIdRef.current = null;
        setPopup(null);
        clearSelectionRef.current();
      },
      prependParagraph(text) {
        const cur = contentRef.current;
        const insert = `${text}\n\n`;
        const next = insert + cur;
        const shifted = annsRef.current
          .map((x) => ({
            ...x,
            from: x.from + insert.length,
            to: x.to + insert.length,
          }))
          .sort(byOffset);
        commitStepRef.current(next, shifted);
        setPopup(null);
        clearSelectionRef.current();
      },
    }),
    [],
  );
  useEffect(() => {
    onReady?.(handle);
    return () => onReady?.(null);
  }, [handle, onReady]);

  // ── 마킹 무대 선택 커밋 ────────────────────────────────────────────────
  const handleStageSelect = useCallback(
    (sel: StageSelection | null, a: StageAnchor | null) => {
      // 이전에 저장 안 된 임시 마킹이 있으면 취소(원복).
      if (pendingIdRef.current) {
        pendingIdRef.current = null;
        undo();
      }
      if (sel && sel.end - sel.start >= MIN_MARK_CHARS) {
        setSelection(sel);
        setAnchor(a);
        emitSelection(sel);
        setMemoInput("");
        setPopup({ mode: "toolbar" });
      } else {
        setPopup(null);
        clearSelection();
      }
    },
    [undo, emitSelection, clearSelection],
  );

  const handleAnnotationClick = useCallback(
    (id: string, a: StageAnchor | null) => {
      if (pendingIdRef.current) {
        pendingIdRef.current = null;
        undo();
      }
      const ann = annsRef.current.find((x) => x.id === id);
      if (!ann) return;
      clearSelection();
      setAnchor(a);
      setMemoInput(ann.memo);
      setPopup({ mode: "edit", id });
    },
    [undo, clearSelection],
  );

  // ── 마킹(임시 확정 → 메모 모드) ─────────────────────────────────────────
  const doMark = useCallback(
    (type: AnnotationType) => {
      if (!selection) return;
      const { start, end } = selection;
      const text = content.slice(start, end).trim();
      if (!text) return;
      const id = generateAnnotationId();
      pendingIdRef.current = id;
      const nextAnns = [
        ...annsRef.current,
        { id, type, text: content.slice(start, end), memo: "", from: start, to: end },
      ].sort(byOffset);
      commitStep(content, nextAnns);
      setMemoInput("");
      setPopup({ mode: "memo", type, id, text });
    },
    [selection, content, commitStep],
  );

  // ── 메모 저장(확정) — 메모만 갱신, 실행취소 스텝 추가 안 함 ───────────────
  const saveMemo = useCallback(
    (id: string, memo: string) => {
      pendingIdRef.current = null;
      onAnnotationsChange(
        annsRef.current.map((a) =>
          a.id === id ? { ...a, memo: memo.trim() } : a,
        ),
      );
      setPopup(null);
      clearSelection();
    },
    [onAnnotationsChange, clearSelection],
  );

  // ── 임시 마킹 취소(저장 안 누름) — undo 로 방금 마킹 제거 ─────────────────
  const cancelMemo = useCallback(() => {
    if (pendingIdRef.current) {
      pendingIdRef.current = null;
      undo();
    } else {
      setPopup(null);
    }
  }, [undo]);

  const removeAnnotation = useCallback(
    (id: string) => {
      pendingIdRef.current = null;
      commitStep(
        contentRef.current,
        annsRef.current.filter((a) => a.id !== id),
      );
      setPopup(null);
      clearSelection();
    },
    [commitStep, clearSelection],
  );

  // ── 키보드 단축키(툴바 열려 있을 때만) ──────────────────────────────────
  useEffect(() => {
    if (popup?.mode !== "toolbar") return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        clearSelection();
        setPopup(null);
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const match = ANNOTATION_TYPES.find((t) => SHORTCUT_MAP[t].code === e.code);
      if (!match) return;
      e.preventDefault();
      doMark(match);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [popup, doMark, clearSelection]);

  // ── 에디터 바깥 클릭 = 팝오버 닫기(무대 안쪽 클릭은 무대가 처리) ──────────
  useEffect(() => {
    if (!popup) return;
    function onDocDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (t && containerRef.current?.contains(t)) return;
      if (popup?.mode === "memo") cancelMemo();
      else {
        setPopup(null);
        clearSelection();
      }
    }
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [popup, cancelMemo, clearSelection]);

  // 타이머 정리.
  useEffect(
    () => () => {
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    },
    [],
  );

  // ── 직접 편집(textarea) 타이핑 — 버스트 1개 = undo 1스텝, 주석 오프셋 보정 ──
  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      const prev = contentRef.current;
      const remapped = adjustAnnotations(prev, next, annsRef.current);
      if (typingTimerRef.current === null) {
        // 버스트 시작 — 현재 상태를 실행취소 스택에 한 번 밀어 둔다.
        pastRef.current.push(snapshot());
        if (pastRef.current.length > 100) pastRef.current.shift();
        futureRef.current = [];
      } else {
        window.clearTimeout(typingTimerRef.current);
      }
      typingTimerRef.current = window.setTimeout(() => {
        typingTimerRef.current = null;
      }, TYPING_BURST_MS);
      onContentChange?.(next);
      onAnnotationsChange(remapped);
      syncHist();
    },
    [snapshot, onContentChange, onAnnotationsChange, syncHist],
  );

  const enterEditMode = useCallback(() => {
    setPopup(null);
    clearSelection();
    // 편집 전 원문을 기억해 뒀다가 '편집 완료' 때 무엇이 바뀌었는지 되짚는다.
    editBaseRef.current = contentRef.current;
    setEditSpans([]);
    setEditMode(true);
  }, [clearSelection]);

  /** '편집 완료' — 편집 전 원문과 비교해 바뀐 자리를 형광펜 구간으로 남긴다. */
  const exitEditMode = useCallback(() => {
    const base = editBaseRef.current;
    editBaseRef.current = null;
    setEditSpans(base === null ? [] : diffEditSpans(base, contentRef.current));
    setEditMode(false);
  }, []);

  // ── 클릭하고 그냥 타이핑 = 바로 수정 ──────────────────────────────────────
  // 무대에서 단어/문장을 고른 상태로 글자를 치면 그 자리를 고쳐 쓴다. 무대는
  // 읽기 전용(contentEditable X)이라 캐럿이 없으므로, 선택 구간을 친 글자로
  // 치환하면서 편집 표면으로 넘어가고 캐럿을 그 자리에 세운다. 두 표면 지오
  // 메트리가 같아 글자가 움직이지 않으므로 '제자리 편집'처럼 보인다.
  const pendingCaretRef = useRef<number | null>(null);
  const typeEdit = useCallback(
    (start: number, end: number, insert: string) => {
      const cur = contentRef.current;
      const next = cur.slice(0, start) + insert + cur.slice(end);
      editBaseRef.current = cur;
      setEditSpans([]);
      pendingIdRef.current = null;
      if (next !== cur) {
        commitStep(
          next,
          adjustAnnotations(cur, next, annsRef.current).sort(byOffset),
        );
      }
      pendingCaretRef.current = start + insert.length;
      setPopup(null);
      clearSelection();
      setEditMode(true);
    },
    [commitStep, clearSelection],
  );

  useEffect(() => {
    if (!editable || editMode || !selection) return;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      if (!selection) return;
      // IME 조합 중(한글 등)은 글자를 가로채지 않고 편집 표면만 연다 — 조합을
      // 중간에 훔치면 입력이 깨진다.
      if (e.isComposing || e.keyCode === 229 || e.key === "Process") {
        e.preventDefault();
        typeEdit(selection.start, selection.end, "");
        return;
      }
      const insert =
        e.key.length === 1
          ? e.key
          : e.key === "Enter"
            ? "\n"
            : e.key === "Backspace" || e.key === "Delete"
              ? ""
              : null;
      if (insert === null) return;
      e.preventDefault();
      typeEdit(selection.start, selection.end, insert);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editable, editMode, selection, typeEdit]);

  // 편집 표면 진입 직후 캐럿을 방금 고친 자리에 세운다(값 반영 후 1프레임 뒤).
  useEffect(() => {
    if (!editMode) return;
    const pos = pendingCaretRef.current;
    if (pos === null) return;
    pendingCaretRef.current = null;
    const el = textareaRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.focus();
      const p = Math.min(pos, el.value.length);
      el.setSelectionRange(p, p);
    });
    return () => window.cancelAnimationFrame(id);
  }, [editMode, content]);

  const { canUndo, canRedo } = hist;
  const hasText = content.trim().length > 0;
  const counts = ANNOTATION_TYPES.reduce((acc, t) => {
    acc[t] = annotations.filter((a) => a.type === t).length;
    return acc;
  }, {} as Record<AnnotationType, number>);

  const stageAnnotations = useMemo(
    () => annotations.map((a) => ({ id: a.id, type: a.type, from: a.from, to: a.to })),
    [annotations],
  );

  // 상단 상태 바(주석 카운트 · 편집 표시)가 떠 있으면 우상단 컨트롤이 그 위에
  // 얹히므로, 본문은 상단 여백을 비울 필요가 없다.
  const statusBar = annotations.length > 0 || (editSpans.length > 0 && !editMode);

  // 두 표면 공통 지오메트리 — 무대/편집이 정확히 같은 폭·행간으로 접힌다.
  const surfaceStyle = useMemo(
    () => ({
      fontFamily: "inherit" as const,
      fontSize: SURFACE_FONT_SIZE,
      lineHeight: SURFACE_LINE_HEIGHT,
      paddingTop:
        editable && !statusBar ? SURFACE_PAD_T_RESERVED : SURFACE_PAD_T,
      paddingBottom: SURFACE_PAD_B,
      paddingLeft: SURFACE_PAD_L,
      paddingRight: SURFACE_PAD_R,
    }),
    [editable, statusBar],
  );

  // 편집 모드 하이라이트 백드롭 — 본문을 [무마킹 | 마킹] 조각으로 쪼갠다.
  // 겹치는 주석은 앞선 것이 이긴다(cursor 로 클램프).
  const mirrorParts = useMemo(() => {
    const parts: { text: string; type: AnnotationType | null }[] = [];
    let cursor = 0;
    for (const a of [...annotations].sort(byOffset)) {
      const from = Math.max(cursor, Math.min(a.from, content.length));
      const to = Math.max(from, Math.min(a.to, content.length));
      if (to <= from) continue;
      if (from > cursor) parts.push({ text: content.slice(cursor, from), type: null });
      parts.push({ text: content.slice(from, to), type: a.type });
      cursor = to;
    }
    if (cursor < content.length) parts.push({ text: content.slice(cursor), type: null });
    return parts;
  }, [content, annotations]);

  // ── 팝오버(툴바/메모/편집) — anchor(콘텐츠 좌표)에 배치, 본문과 함께 스크롤 ──
  const popover: ReactNode =
    !editMode && popup && anchor
      ? (() => {
          const w = POPUP_W[popup.mode];
          const h = POPUP_H[popup.mode];
          const below =
            anchor.bottomY + h + 10 <= anchor.contentH ||
            anchor.topY - h - 10 < 0;
          const top = Math.max(4, below ? anchor.bottomY + 8 : anchor.topY - 8 - h);
          const left = Math.max(
            4,
            Math.min(anchor.x - w / 2, anchor.contentW - w - 4),
          );
          const arrowX = Math.max(14, Math.min(anchor.x - left, w - 14));
          return (
            <div data-pms-pop="" className="absolute z-[5]" style={{ left, top }}>
              {below && popup.mode !== "toolbar" ? (
                <div style={{ paddingLeft: arrowX - 4 }}>
                  <div className="-mb-1 h-2 w-2 rotate-45 border-l border-t border-slate-200 bg-white" />
                </div>
              ) : null}
              {below && popup.mode === "toolbar" ? (
                <div style={{ paddingLeft: arrowX - 4 }}>
                  <div className="-mb-1 h-2 w-2 rotate-45" style={{ background: "#1e3a5f" }} />
                </div>
              ) : null}

              {popup.mode === "toolbar" ? (
                <div
                  className="flex flex-col rounded-xl p-1 shadow-2xl"
                  style={{
                    background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
                    boxShadow: "0 8px 32px rgba(37,99,235,0.25), 0 0 0 1px rgba(255,255,255,0.1) inset",
                  }}
                >
                  <div className="flex items-center gap-0.5">
                    {ANNOTATION_TYPES.map((type) => {
                      const c = ANNOTATION_CONFIG[type];
                      const Icon = c.icon;
                      return (
                        <button
                          key={type}
                          type="button"
                          onPointerDown={(e) => { e.preventDefault(); doMark(type); }}
                          className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-white/15 active:bg-white/25"
                          title={`${c.description} (Alt+${SHORTCUT_MAP[type].letter})`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />{c.shortLabel}
                          <span className="ml-0.5 text-[9px] font-bold leading-none text-white/55 tabular-nums">{SHORTCUT_MAP[type].letter}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="select-none pt-0.5 text-center text-[8.5px] font-medium tracking-wide text-white/45">
                    Alt(⌥) + 단축키 · 그냥 타이핑하면 바로 수정돼요
                  </div>
                </div>
              ) : null}

              {popup.mode === "memo" ? (
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg" style={{ width: w }}>
                  <div className="mb-2 flex items-center gap-1.5">
                    {(() => { const c = ANNOTATION_CONFIG[popup.type]; const Icon = c.icon; return <Icon className={`h-3 w-3 ${c.color}`} />; })()}
                    <span className={`text-[11px] font-semibold ${ANNOTATION_CONFIG[popup.type].color}`}>{ANNOTATION_CONFIG[popup.type].label}</span>
                    <span className="text-[10px] text-slate-400">저장 시 확정</span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      autoFocus
                      value={memoInput}
                      onChange={(e) => setMemoInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveMemo(popup.id, memoInput); }
                        if (e.key === "Escape") { e.preventDefault(); cancelMemo(); }
                      }}
                      placeholder="메모 (Enter 저장 · Esc 취소)"
                      className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[12px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/10"
                    />
                    <SaveButton onClick={() => saveMemo(popup.id, memoInput)} className="h-7 min-w-0 shrink-0" />
                  </div>
                </div>
              ) : null}

              {popup.mode === "edit" ? (() => {
                const ann = annotations.find((a) => a.id === popup.id);
                if (!ann) return null;
                const c = ANNOTATION_CONFIG[ann.type];
                const Icon = c.icon;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg" style={{ width: w }}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Icon className={`h-3 w-3 shrink-0 ${c.color}`} />
                        <span className={`shrink-0 text-[11px] font-semibold ${c.color}`}>{c.label}</span>
                        <span className="truncate text-[11px] text-slate-400">&ldquo;{ann.text}&rdquo;</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button type="button" onClick={() => removeAnnotation(ann.id)} className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                        <button type="button" onClick={() => { setPopup(null); clearSelection(); }} className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100"><X className="h-3 w-3" /></button>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        autoFocus
                        value={memoInput}
                        onChange={(e) => setMemoInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveMemo(ann.id, memoInput); }
                          if (e.key === "Escape") { setPopup(null); clearSelection(); }
                        }}
                        placeholder="메모 수정 (Enter 저장)"
                        className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[12px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/10"
                      />
                      <SaveButton onClick={() => saveMemo(ann.id, memoInput)} className="h-7 min-w-0 shrink-0" />
                    </div>
                  </div>
                );
              })() : null}

              {!below && popup.mode !== "toolbar" ? (
                <div style={{ paddingLeft: arrowX - 4 }}>
                  <div className="-mt-1 h-2 w-2 rotate-45 border-b border-r border-slate-200 bg-white" />
                </div>
              ) : null}
              {!below && popup.mode === "toolbar" ? (
                <div style={{ paddingLeft: arrowX - 4 }}>
                  <div className="-mt-1 h-2 w-2 rotate-45" style={{ background: "#2563eb" }} />
                </div>
              ) : null}
            </div>
          );
        })()
      : null;

  return (
    <div ref={containerRef} className="relative flex h-full flex-col">
      {/* 우상단 컨트롤 — 직접 편집 토글 + 되돌리기/다시실행 */}
      {editable ? (
        <div
          data-editor-tools
          className="absolute right-2 top-2 z-30 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/90 px-0.5 py-0.5 shadow-sm backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => (editMode ? exitEditMode() : enterEditMode())}
            title={editMode ? "마킹 모드로 돌아가기" : "본문을 직접 타이핑 수정"}
            className={
              "flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-colors " +
              (editMode
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800")
            }
          >
            {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editMode ? "편집 완료" : "직접 편집"}
          </button>
          <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            title="되돌리기"
            aria-label="되돌리기"
            disabled={!canUndo}
            onPointerDown={(e) => e.preventDefault()}
            onClick={undo}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="다시 실행"
            aria-label="다시 실행"
            disabled={!canRedo}
            onPointerDown={(e) => e.preventDefault()}
            onClick={redo}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* 주석 카운트 + 편집 표시 */}
      {statusBar ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-2">
          {ANNOTATION_TYPES.map((type) =>
            counts[type] > 0 ? (
              <span key={type} className={`flex items-center gap-1 text-[11px] font-medium ${ANNOTATION_CONFIG[type].color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${ANNOTATION_CONFIG[type].dotColor}`} />
                {ANNOTATION_CONFIG[type].shortLabel} {counts[type]}
              </span>
            ) : null,
          )}
          {editSpans.length > 0 && !editMode ? (
            <button
              type="button"
              onClick={() => setEditSpans([])}
              title="편집한 자리 표시를 지웁니다 — 빨간 취소선은 지운 원문이며 본문에는 포함되지 않아요"
              className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 ring-1 ring-inset ring-red-200 transition-colors hover:bg-red-100"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              직접 편집 {editSpans.length}곳
              <X className="h-3 w-3 opacity-60" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 마킹 무대(기본) / 직접 편집 textarea */}
      {!editMode ? (
        <PassageMarkStage
          content={content}
          annotations={stageAnnotations}
          locked={!editable}
          fontSize={SURFACE_FONT_SIZE}
          selection={selection}
          onSelect={handleStageSelect}
          onAnnotationClick={handleAnnotationClick}
          popover={popover}
          topPad={surfaceStyle.paddingTop}
          editSpans={editSpans}
        />
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* 백드롭(높이 기준) + 그 위에 정확히 겹친 textarea. 스크롤은 바깥
              컨테이너가 담당하므로 마킹과 글자가 절대 어긋나지 않는다. */}
          <div className="relative min-h-full">
            <div aria-hidden="true" className="pms-mirror" style={surfaceStyle}>
              {mirrorParts.map((p, i) =>
                p.type ? (
                  <mark key={i} className={`pms-ann pms-ann-${p.type}`}>
                    {p.text}
                  </mark>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
              {/* 본문이 개행으로 끝날 때 마지막 빈 줄 높이 확보 */}
              {"​"}
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              autoFocus
              onChange={handleTextareaChange}
              readOnly={!editable}
              spellCheck={false}
              style={surfaceStyle}
              className="pms-input absolute inset-0 h-full w-full resize-none text-slate-800 placeholder:text-slate-400"
              placeholder={placeholder}
            />
          </div>
        </div>
      )}

      {/* 온보딩 힌트 — 아직 마킹 0개일 때만. 편집 모드에서도 문구만 바꿔 계속
          띄운다(모드 토글에 본문 영역 높이가 흔들리지 않게). */}
      {showAnnotationHint && hasText && annotations.length === 0 && !popup ? (
        <div
          className="relative flex shrink-0 items-center gap-2.5 overflow-hidden border-t border-blue-200/80 px-4 py-2.5"
          style={{
            background:
              "linear-gradient(110deg, rgba(219,234,254,0.55) 0%, rgba(191,219,254,0.7) 35%, rgba(165,180,252,0.55) 70%, rgba(219,234,254,0.55) 100%)",
            backgroundSize: "200% 100%",
            animation: "pmsHintShimmer 3.6s ease-in-out infinite",
            boxShadow:
              "inset 0 0 0 1px rgba(96,165,250,0.25), 0 0 16px rgba(96,165,250,0.35), 0 0 28px rgba(99,102,241,0.18)",
          }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-10 -top-8 h-28 w-28 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(147,197,253,0.55) 0%, rgba(147,197,253,0) 70%)",
              filter: "blur(8px)",
            }}
          />
          <p className="relative text-[12px] font-medium leading-snug tracking-tight text-blue-800">
            {editMode ? (
              <>
                본문을 직접 고치는 중이에요 — 기존 마킹은 뒤에 그대로 표시되고,{" "}
                <span className="rounded bg-white/70 px-1 py-0.5 font-bold text-blue-900 shadow-[0_0_8px_rgba(59,130,246,0.35)]">편집 완료</span>
                를 누르면 마킹 화면으로 돌아가요
              </>
            ) : (
              <>
                단어에 <b className="text-blue-900">마우스를 올리면</b> 표시되고,{" "}
                <span className="rounded bg-white/70 px-1 py-0.5 font-bold text-blue-900 shadow-[0_0_8px_rgba(59,130,246,0.35)]">클릭·더블클릭·드래그</span>
                로 선택해 어휘·어법·출제 포인트를 마킹할 수 있어요
              </>
            )}
          </p>
        </div>
      ) : null}

      {/* 무대·백드롭이 공유하는 pms-* 전역 스타일 — 무대는 편집 모드에서
          언마운트되므로 항상 살아 있는 이 호스트가 소유한다. */}
      <PassageMarkStyles />
    </div>
  );
}
