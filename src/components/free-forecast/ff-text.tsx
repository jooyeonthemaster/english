import { Fragment, cloneElement, isValidElement, type ReactNode } from "react";
import { NB, WJ, ko } from "./ff-ko";
import s from "./free-forecast.module.css";

export { ko };

// 한국어 조판 보조 — 사용자 요구 「이상하게 잘리지 않게」의 문자 단위 장치. 보이는 글자는 그대로, 줄바꿈 자리만 막는다.
//   ko(= nbDot): 「·」「—」「→」로 시작하는 줄, 「〔보기〕⏎의」(닫는 괄호 뒤 조사), 「한⏎구간」(한 글자 관형사), 「보내드릴⏎수」(의존명사)를 막는다
//   koNode     : ReactNode 안의 문자열 조각에 ko — span·b 같은 태그 안까지. 컴포넌트(OO·Sep…)는 건드리지 않는다
//   keepMarks  : 「(A)(B)(C)」「(a)~(f)」 같은 표지를 한 덩어리로(괄호 사이에서 끊기지 않게)
//   Sep / Dash : 큰 글자(Black Han Sans) 안의 「·」「—」 — 이 글꼴에 없거나 떠서 Pretendard 900 으로 찍는다
//   Arrow      : 이 글꼴에 「→」「↓」가 없어 가는 대체 글꼴로 나온다 — 굵기 맞춘 SVG
// 금칙 규칙 본체(순수 함수)는 ff-ko.ts.

/** 예전 이름 — ko 와 같다 */
export const nbDot = ko;

/** ReactNode 안의 문자열 조각에 ko — Fragment·태그 요소(span·b…)의 자식까지 들어간다. 컴포넌트(OO·Sep…)는 그대로 둔다.
 *  문자열 조각 경계를 넘는 규칙(「이{" "}선생님」)은 못 보므로, 묶일 말은 한 문자열 안에 둔다. */
export function koNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return ko(node);
  if (Array.isArray(node)) return node.map((n, i) => <Fragment key={i}>{koNode(n)}</Fragment>);
  if (isValidElement(node) && (node.type === Fragment || typeof node.type === "string")) {
    const kids = (node.props as { children?: ReactNode }).children;
    return kids === undefined ? node : cloneElement(node, undefined, koNode(kids));
  }
  return node;
}

const MARKS = /\([A-Za-z]\)(?:~?\([A-Za-z]\))*/g;

/** 큰 글자(Black Han Sans)용 — 표지를 묶고 「·」는 Pretendard 점으로 */
export function keepMarksDisplay(text: string): ReactNode {
  const parts = text.split(/\s*·\s*/);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <>
              {NB}
              <Sep />{" "}
            </>
          ) : null}
          {keepMarks(p)}
        </Fragment>
      ))}
    </>
  );
}

export function keepMarks(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKS)) {
    const i = m.index ?? 0;
    if (i > last) out.push(ko(text.slice(last, i)));
    out.push(
      <span key={i} className="whitespace-nowrap">
        {m[0]}
      </span>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(ko(text.slice(last)));
  return <>{out}</>;
}

/** 큰 글자용 — 「·」를 Pretendard 로 바꿔 찍고, 앞에서 줄이 바뀌지 않게 */
export function Sep() {
  return (
    <>
      {WJ}
      <span className={s.sep}>·</span>
    </>
  );
}

/** 큰 글자용 줄표 — Black Han Sans 에 「—」가 없어 가는 대체 글꼴 머리카락 선이 나온다. Pretendard 900 으로, 앞에서 줄이 바뀌지 않게 */
export function Dash() {
  return (
    <>
      {NB}
      <span className={s.sep}>—</span>{" "}
    </>
  );
}

/** 큰 글자 문자열 안의 「·」를 모두 <Sep/>로 */
export function displayDots(text: string): ReactNode {
  const parts = text.split(/\s*·\s*/);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 ? <Sep /> : null}
          {p}
        </Fragment>
      ))}
    </>
  );
}

export function Arrow({ dir = "right", className = "" }: { dir?: "right" | "down"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`inline-block h-[0.9em] w-[0.9em] ${className}`} style={{ transform: dir === "down" ? "rotate(90deg)" : undefined }}>
      <path d="M3 12h15M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}
