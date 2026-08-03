"use client";

// ============================================================================
// 지문 마킹 표면(pms-*) 전역 스타일 — 마킹 무대·'직접 편집' 백드롭이 같은 규칙을
// 공유하고, 무대는 편집 모드에서 언마운트되므로 항상 살아 있는 PassageMarkEditor
// 가 이 컴포넌트 하나로 소유한다(styled-jsx 는 한 컴포넌트에 style 태그를 중첩할
// 수 없어서 파일로 뺐다). 규칙 순서 = 우선순위이므로 아래 순서를 지킬 것:
//   편집 diff → 단어 hover → 선택/드래그 → 주석 마크
// ============================================================================

export function PassageMarkStyles() {
  return (
    <style jsx global>{`
      .pms-stage {
        -webkit-tap-highlight-color: transparent;
      }
      .pms-sup {
        margin-right: 3px;
        font-size: 10px;
        font-weight: 600;
        color: #cbd5e1;
        vertical-align: super;
        user-select: none;
        transition: color 0.12s ease;
      }
      .pms-sent:hover > .pms-sup {
        color: #60a5fa;
      }
      .pms-between {
        color: #94a3b8;
      }

      /* ── '직접 편집'으로 바뀐 자리 — 형광펜(추가·수정) / 빨간 마커(삭제) ──── */
      .pms-diff {
        background-color: #fee2e2;
        box-shadow: inset 0 -2px 0 0 #f87171;
        border-radius: 2px;
      }
      /* 지운 원문을 그 자리에 되살린 유령 텍스트 — 빨간 취소선. 본문이 아니므로
         선택·드래그·히트테스트에서 완전히 비켜서 있다(pointer-events: none). */
      .pms-del-ghost {
        color: #dc2626;
        background-color: rgba(254, 226, 226, 0.7);
        text-decoration: line-through;
        -webkit-text-decoration: line-through;
        text-decoration-color: rgba(220, 38, 38, 0.75);
        text-decoration-thickness: 1.5px;
        border-radius: 3px;
        box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.45);
        padding: 0 3px;
        margin: 0 2px;
        user-select: none;
        pointer-events: none;
      }
      /* 원문을 못 살렸을 때만 쓰는 자리 쐐기. */
      .pms-diff-del {
        position: relative;
      }
      .pms-diff-del::before {
        content: "";
        position: absolute;
        left: -1px;
        top: -1px;
        bottom: -1px;
        width: 3px;
        border-radius: 2px;
        background: #ef4444;
      }
      .pms-diff-del::after {
        content: "";
        position: absolute;
        left: -4px;
        top: -6px;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 5px solid #ef4444;
      }
      /* 지운 자리가 속한 문장 — "이 문장에서 지웠다"가 한눈에 보이게. */
      .pms-sent-del {
        background-color: rgba(254, 226, 226, 0.5);
        border-radius: 3px;
        box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.35);
      }

      .pms-tok {
        display: inline-block;
        padding: 0 1px;
        margin: 0 -1px;
        border-radius: 2px;
        cursor: pointer;
        transition: background-color 0.12s ease;
      }
      .pms-tok:not(.pms-sel):not(.pms-drag):hover {
        background-color: #dbeafe;
        border-radius: 6px;
      }
      /* 선택 pill — 픽커의 커밋 선택과 동일 문법 (연속 배경 + 하단 스트로크) */
      .pms-sel {
        background-color: #bfdbfe;
        box-shadow: inset 0 -2px 0 0 #3b82f6;
        border-radius: 0;
      }
      .pms-sel-a {
        border-top-left-radius: 6px;
        border-bottom-left-radius: 6px;
      }
      .pms-sel-b {
        border-top-right-radius: 6px;
        border-bottom-right-radius: 6px;
      }
      /* 드래그 프리뷰 pill */
      .pms-drag {
        background-color: rgba(191, 219, 254, 0.55);
        box-shadow: inset 0 -2px 0 0 #93c5fd;
        border-radius: 0;
      }
      .pms-drag-a {
        border-top-left-radius: 6px;
        border-bottom-left-radius: 6px;
      }
      .pms-drag-b {
        border-top-right-radius: 6px;
        border-bottom-right-radius: 6px;
      }
      /* 범위 내 공백도 토큰과 같은 박스로 — 배경·스트로크 연속 */
      .pms-gap.pms-sel,
      .pms-gap.pms-drag {
        display: inline-block;
      }

      /* ── 5종 주석 하이라이트 — PassageAnnotationEditor(ann-*)와 동일 색 문법 ── */
      mark.pms-ann {
        color: inherit;
        cursor: pointer;
        padding: 0 1px;
      }
      mark.pms-ann-vocab {
        background: linear-gradient(to top, #dbeafe 35%, transparent 35%);
        border-bottom: 2px solid #3b82f6;
        border-radius: 1px;
      }
      mark.pms-ann-vocab:hover {
        background: linear-gradient(to top, #bfdbfe 45%, transparent 45%);
      }
      mark.pms-ann-grammar {
        text-decoration: underline wavy #8b5cf6;
        -webkit-text-decoration: underline wavy #8b5cf6;
        text-decoration-skip-ink: none;
        text-underline-offset: 3px;
      }
      mark.pms-ann-grammar:hover {
        background-color: #ede9fe;
        border-radius: 2px;
      }
      mark.pms-ann-syntax {
        border-bottom: 2px dashed #0891b2;
      }
      mark.pms-ann-syntax:hover {
        background-color: #ecfeff;
        border-radius: 2px;
      }
      mark.pms-ann-sentence {
        background: linear-gradient(to top, #dcfce7 45%, transparent 45%);
        box-shadow: inset 2px 0 0 0 #22c55e;
        border-radius: 1px;
      }
      mark.pms-ann-sentence:hover {
        background: linear-gradient(to top, #bbf7d0 55%, transparent 55%);
      }
      mark.pms-ann-examPoint {
        background: linear-gradient(to top, #fef08a 40%, transparent 40%);
        border-radius: 1px;
      }
      mark.pms-ann-examPoint:hover {
        background: linear-gradient(to top, #fde047 50%, transparent 50%);
      }

      /* ── '직접 편집' 표면 ──────────────────────────────────────────────────
         백드롭(.pms-mirror)과 textarea(.pms-input)는 폰트·행간·패딩·줄바꿈 규칙이
         완전히 동일해야 마킹이 글자와 정확히 겹친다. 백드롭은 글자를 투명 렌더해
         배경/밑줄만 남기고, 보이는 글자·커서·IME 는 textarea 것을 쓴다. */
      .pms-mirror {
        white-space: pre-wrap;
        overflow-wrap: break-word;
        word-break: normal;
        color: transparent;
        user-select: none;
        pointer-events: none;
      }
      /* 무대의 mark 는 좌우 1px 패딩으로 부풀지만 백드롭에선 그만큼 글자가 밀려
         어긋나므로 패딩을 없앤다. */
      .pms-mirror mark.pms-ann {
        padding: 0;
        cursor: inherit;
      }
      .pms-input {
        white-space: pre-wrap;
        overflow-wrap: break-word;
        word-break: normal;
        background: transparent;
        border: 0;
        outline: none;
        box-shadow: none;
        /* 스크롤은 바깥 컨테이너 담당 — 자체 스크롤이 생기면 백드롭과 어긋난다. */
        overflow: hidden;
      }

      /* 단어 선택 직후 커서 옆 안내 칩 */
      .pms-hint {
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
        .pms-hint {
          animation: pmsHintIn 0.18s ease-out;
        }
      }
      @keyframes pmsHintIn {
        from {
          opacity: 0;
          transform: translateY(3px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes pmsHintShimmer {
        0% {
          background-position: 0% 50%;
        }
        50% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0% 50%;
        }
      }
    `}</style>
  );
}
