import Link from "next/link";
import { ArrowRight, Megaphone, X } from "lucide-react";
import type { LandingPopupConfig } from "@/lib/platform-settings";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

/**
 * 랜딩 팝업 카드의 순수 시각 표현 — 앱 진입 배너(공지 템플릿)와 동일한 디자인 언어:
 * 그라데이션 상단 레일 · 상단 태그 칩 · 큰 제목 · 본문 · 풀폭 CTA · 하단 '오늘 하루 보지 않기'.
 * 실제 노출(landing-popup)과 관리자 미리보기(editor)가 공유해 서로 어긋나지 않게 한다.
 */
export function LandingPopupCardView({
  popup,
  onDismissToday,
  onClose,
  interactive = false,
  disableLink = false,
}: {
  popup: Pick<
    LandingPopupConfig,
    "eyebrow" | "title" | "text" | "imageUrl" | "href" | "ctaLabel"
  >;
  onDismissToday?: () => void;
  onClose?: () => void;
  /** true면 실제 클릭 동작(링크 이동·닫기) 활성화, false면 미리보기(비활성). */
  interactive?: boolean;
  /** 관리자 미리보기 등 — CTA는 보이되 클릭 시 링크 이동을 막는다. */
  disableLink?: boolean;
}) {
  const eyebrow = popup.eyebrow?.trim();
  const title = popup.title?.trim();
  const text = popup.text?.trim();
  const hasImage = !!popup.imageUrl;
  const hasCta = !!popup.href;
  const hasTextBlock = !!(eyebrow || title || text || hasCta);
  const linkable = interactive && !disableLink && hasCta;

  const image = hasImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={popup.imageUrl}
      alt={title || "이벤트 배너"}
      className="block max-h-[52vh] w-full object-cover"
    />
  ) : null;

  const ctaInner = (
    <>
      {popup.ctaLabel?.trim() || "자세히 보기"}
      <ArrowRight
        className="size-4 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </>
  );
  const ctaClass = `group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] transition-all hover:bg-blue-700 active:scale-[0.99] ${FOCUS_RING}`;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-18px_rgba(15,23,42,0.4)]">
      {/* 닫기 X — 실제 노출에선 다음 팝업으로 넘어가거나 닫힘 */}
      <button
        type="button"
        onClick={interactive ? onClose : undefined}
        aria-label="닫기"
        className={`absolute right-3.5 top-3.5 z-10 flex size-8 items-center justify-center rounded-full transition-colors ${
          hasImage
            ? "bg-white/85 text-slate-600 shadow-sm backdrop-blur-sm hover:bg-white hover:text-slate-900"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        } ${FOCUS_RING}`}
      >
        <X className="size-[18px]" aria-hidden="true" />
      </button>

      {/* 상단 그라데이션 레일 — 이미지가 맨 위일 땐 생략 */}
      {!hasImage && (
        <div
          aria-hidden="true"
          className="h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400"
        />
      )}

      {/* 이미지 */}
      {image &&
        (linkable ? (
          <Link href={popup.href} onClick={onClose} className="block">
            {image}
          </Link>
        ) : (
          image
        ))}

      {/* 텍스트 블록 */}
      {hasTextBlock ? (
        <div className="px-6 pb-6 pt-5 sm:px-7">
          {eyebrow && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold tracking-[0.02em] text-blue-700">
              <Megaphone className="size-3.5" aria-hidden="true" />
              {eyebrow}
            </span>
          )}
          {title && (
            <h2
              className={`text-[21px] font-bold leading-snug tracking-tight text-slate-900 break-keep ${
                eyebrow ? "mt-3" : ""
              }`}
            >
              {title}
            </h2>
          )}
          {text && (
            <p className="mt-3 whitespace-pre-line text-[14px] leading-[1.6] text-slate-500 break-keep">
              {text}
            </p>
          )}

          {hasCta &&
            (linkable ? (
              <Link href={popup.href} onClick={onClose} className={ctaClass}>
                {ctaInner}
              </Link>
            ) : (
              <span className={ctaClass}>{ctaInner}</span>
            ))}

          <div className="mt-2.5 flex items-center justify-center">
            <button
              type="button"
              onClick={interactive ? onDismissToday : undefined}
              className={`rounded px-1.5 py-1 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600 ${FOCUS_RING}`}
            >
              오늘 하루 보지 않기
            </button>
          </div>
        </div>
      ) : hasImage ? (
        /* 순수 이미지 팝업 — 이미지 아래 구분선 + 오늘 하루 보지 않기 */
        <div className="flex items-center justify-center border-t border-slate-100 py-2.5">
          <button
            type="button"
            onClick={interactive ? onDismissToday : undefined}
            className={`rounded px-1.5 py-1 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600 ${FOCUS_RING}`}
          >
            오늘 하루 보지 않기
          </button>
        </div>
      ) : (
        /* 완전히 빈 상태 — 편집기 미리보기용 안내 */
        <div className="px-6 py-12 text-center text-[13px] text-slate-300">
          상단 태그·제목·문구·이미지를 입력하면 여기에 표시됩니다.
        </div>
      )}
    </div>
  );
}
