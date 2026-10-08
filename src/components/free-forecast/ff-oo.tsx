import s from "./free-forecast.module.css";

/** 「○○고」 — 큰 글자(Black Han Sans)에서도 굵기가 맞게 고리를 그린다. 화면 낭독기는 「○○고」로 읽는다.
 *  variant="text" 는 본문 크기용(고리를 조금 가늘게). 어느 쪽이든 한 덩어리라 줄 사이에서 찢어지지 않는다. */
export function OO({ suffix = "고", variant = "display" }: { suffix?: string; variant?: "display" | "text" }) {
  const ring = variant === "text" ? `${s.ring} ${s.ringText}` : s.ring;
  return (
    <span className={s.oo}>
      <span className="sr-only">○○</span>
      <span aria-hidden>
        <span className={ring} />
        <span className={ring} />
      </span>
      {suffix}
    </span>
  );
}
