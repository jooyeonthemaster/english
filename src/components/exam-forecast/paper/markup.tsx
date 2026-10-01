import { Fragment, type ReactNode } from "react";

// 지문 마크업 → React 노드.
//
// 문법(생성 함대·DB 계약, docs/hanguang-2610/generation-spec.md §2.2):
//   <u>…</u> 밑줄 · <b>…</b> 굵게 · <i>…</i> 기울임 (중첩 허용, 다른 태그는 글자로 취급)
//   [[BLANK]]      긴 빈칸 밑줄
//   [[BLANK:A]]    (A) 라벨이 앉은 빈칸 밑줄
//   [[SLOT:3]]     문장 삽입 자리 「( ③ )」
//   ① <u>…</u>     밑줄 번호 — 원문자는 굵게, 뒤 낱말과 한 줄에 묶는다
//   (a) <u>…</u>   조합형 라벨 — 작은 고딕
//   빈 줄(\n\n)    새 문단 · 한 줄 바꿈(\n) 은 강제 줄바꿈
//
// 마크업은 우리 생성물만 들어온다(사용자 입력 아님) — 그래도 HTML 로 해석하지 않고 토큰만 판다.

const CIRCLED = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

type Tag = "u" | "b" | "i";

interface Token {
  kind: "text" | "open" | "close" | "blank" | "slot" | "br" | "mark" | "lab" | "bracket" | "brk";
  value: string;
  /** 빈칸 바로 뒤 문장부호 — 빈칸(인라인 블록) 뒤는 줄바꿈 자리라 「, when …」처럼 부호가 줄 머리로 떨어진다 */
  tail?: string;
}

const GLUE_RE = /^[,.;:!?)’”'"]+/;

// 〔보기〕〔3.5점〕처럼 짧은 거북등 괄호 묶음은 한 토큰 — 양쪽 정렬이 괄호 안쪽 간격을 벌리지 못하게 한 덩어리로 찍는다
const TOKEN_RE = /(<\/?[ubi]>|\[\[BLANK(?::[A-Z])?\]\]|\[\[SLOT:\d\]\]|\n|[①-⑧]\s?(?=<u>)|\([a-h]\)\s?(?=<u>)|[①-⑧]|〔[^〔〕\n]{1,12}〕|[〔〕])/g;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  for (const part of src.split(TOKEN_RE)) {
    if (!part) continue;
    if (part === "\n") out.push({ kind: "br", value: "" });
    else if (/^<[ubi]>$/.test(part)) out.push({ kind: "open", value: part[1] });
    else if (/^<\/[ubi]>$/.test(part)) out.push({ kind: "close", value: part[2] });
    else if (part.startsWith("[[BLANK")) out.push({ kind: "blank", value: part.length > 9 ? part.slice(8, 9) : "" });
    else if (part.startsWith("[[SLOT:")) out.push({ kind: "slot", value: part.slice(7, 8) });
    else if (/^[①-⑧]\s?$/.test(part)) out.push({ kind: "mark", value: part.trim() + (part.length > 1 ? " " : "") });
    else if (/^\([a-h]\)\s?$/.test(part)) out.push({ kind: "lab", value: part.trim() });
    else if (/^〔[^〔〕\n]{1,12}〕$/.test(part)) out.push({ kind: "brk", value: part.slice(1, -1) });
    else if (part === "〔" || part === "〕") out.push({ kind: "bracket", value: part });
    else {
      const prev = out[out.length - 1];
      // 「① Scientists …」(무관 문장 번호) — 번호 뒤 공백을 고정 여백+결합자로 바꿔 번호만 줄 끝에 남지 않게
      if (prev?.kind === "mark" && !prev.value.endsWith(" ") && part.startsWith(" ") && part.length > 1) {
        prev.value += " ";
        out.push({ kind: "text", value: part.slice(1) });
        continue;
      }
      const glue = prev?.kind === "blank" ? part.match(GLUE_RE)?.[0] : undefined;
      if (glue) {
        prev.tail = glue;
        if (part.length > glue.length) out.push({ kind: "text", value: part.slice(glue.length) });
      } else out.push({ kind: "text", value: part });
    }
  }
  return out;
}

function wrap(tag: Tag, children: ReactNode[], key: string): ReactNode {
  if (tag === "u") return <u key={key} className="fcp-u">{children}</u>;
  if (tag === "b") return <b key={key}>{children}</b>;
  return <i key={key}>{children}</i>;
}

/** 인라인 마크업 한 덩어리(문단 하나) → 노드 */
export function renderInline(src: string, keyPrefix = "m"): ReactNode[] {
  const tokens = tokenize(src);
  const stack: { tag: Tag | null; children: ReactNode[] }[] = [{ tag: null, children: [] }];
  tokens.forEach((t, i) => {
    const top = stack[stack.length - 1];
    const key = `${keyPrefix}-${i}`;
    switch (t.kind) {
      case "text":
        top.children.push(<Fragment key={key}>{t.value}</Fragment>);
        break;
      case "br":
        top.children.push(<br key={key} />);
        break;
      case "mark":
        // 원문자 + 고정 여백 + 낱말 결합자(U+2060) — 번호만 줄 끝에 남지 않게, 양쪽 정렬이 번호 뒤를 벌리지 않게
        // (공백 문자는 정렬 때 늘어나 「①    drawn」처럼 벌어진다)
        top.children.push(
          <span key={key} className={t.value.endsWith(" ") ? "fcp-mark fcp-mark-sp" : "fcp-mark"}>
            {t.value.trim()}
          </span>,
        );
        if (t.value.endsWith(" ")) top.children.push(<Fragment key={`${key}-wj`}>{"⁠"}</Fragment>);
        break;
      case "bracket":
        // 거북등 괄호는 전각 폭 — 빈 반쪽을 당겨 기출처럼 내용에 붙인다
        top.children.push(
          <span key={key} className={t.value === "〔" ? "fcp-brl" : "fcp-brr"}>
            {t.value}
          </span>,
        );
        break;
      case "brk":
        top.children.push(
          <span key={key} className="fcp-brk">
            <span className="fcp-brl">〔</span>
            {t.value}
            <span className="fcp-brr">〕</span>
          </span>,
        );
        break;
      case "lab":
        top.children.push(
          <span key={key} className="fcp-lab">
            {t.value}
          </span>,
        );
        break;
      case "blank": {
        const blank = (
          <span key={key} className={`fcp-blank${t.value ? ` fcp-blank-${t.value}` : ""}`}>
            {t.value ? `(${t.value})` : " "}
          </span>
        );
        top.children.push(
          t.tail ? (
            <span key={`${key}-g`} className="fcp-glue">
              {blank}
              {t.tail}
            </span>
          ) : (
            blank
          ),
        );
        break;
      }
      case "slot":
        top.children.push(
          <span key={key} className="fcp-slot">
            ( <span className="fcp-mark">{CIRCLED[Number(t.value)] ?? t.value}</span> )
          </span>,
        );
        break;
      case "open":
        stack.push({ tag: t.value as Tag, children: [] });
        break;
      case "close": {
        // 짝이 맞는 여는 태그까지 닫는다(어긋난 마크업은 글자로 남기지 않고 조용히 접는다)
        const idx = stack.map((s) => s.tag).lastIndexOf(t.value as Tag);
        if (idx <= 0) break;
        while (stack.length - 1 >= idx) {
          const frame = stack.pop()!;
          stack[stack.length - 1].children.push(wrap(frame.tag as Tag, frame.children, `${key}-${stack.length}`));
        }
        break;
      }
    }
  });
  while (stack.length > 1) {
    const frame = stack.pop()!;
    stack[stack.length - 1].children.push(wrap(frame.tag as Tag, frame.children, `${keyPrefix}-tail-${stack.length}`));
  }
  return stack[0].children;
}

/** 문단 분리: 빈 줄 기준 */
export function splitParagraphs(src: string): string[] {
  return src
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim().length > 0);
}

/** 마크업 → 태그 없는 평문(검색·미리보기용) */
export function markupToPlain(src: string): string {
  return src
    .replace(/<\/?[ubi]>/g, "")
    .replace(/\[\[BLANK:([A-Z])\]\]/g, "____($1)____")
    .replace(/\[\[BLANK\]\]/g, "________")
    .replace(/\[\[SLOT:(\d)\]\]/g, (_, n) => `( ${CIRCLED[Number(n)] ?? n} )`)
    .replace(/\s+/g, " ")
    .trim();
}
