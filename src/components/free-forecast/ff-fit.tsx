import type { CSSProperties, ReactNode } from "react";
import s from "./free-forecast.module.css";

// 한 줄 제목을 컨테이너 폭에 「딱」 맞춘다 — font-size = k cqi. k 는 Black Han Sans 로 실측해 맞춘 값이고
// 여유 3% 를 둔다(가로 넘침 0). 문구를 바꾸면 작업 폴더(gitignore)의 ff-fit-measure.mjs 로 다시 재서 고친다.
// 같은 묶음 안의 줄은 일부러 같은 k 를 써서 글자 크기를 맞춘다(짧은 줄은 왼쪽 정렬로 덜 찬다).
// FIT_LSB: 줄 첫 글자의 왼쪽 여백(em) — 큰 글자일수록 정렬선이 안쪽으로 밀려 보여 그만큼 당긴다(실측).

export const FIT_K = {
  heroA: 13.21, // 100% 파격 무료!!!
  heroB: 11.52, // 이 중에 무조건 적중!!!
  mHero1: 37.28, // 100%
  mHero2: 21.78, // 파격 무료!!!
  mHero3: 18.06, // 이 중에 / 무조건 적중!!!
  school1: 12.59, // 전국 공통 문제 말고,
  school2: 12.91, // ○○고 기출 그대로.
  mSchool1: 25.13, // 전국 공통 / 문제 말고,
  mSchool2: 21.64, // ○○고 기출 / 그대로.
  show1: 13.12, // 소름 끼치게 똑같고,
  show2: 14.63, // 미치게 아름답다.
  mShow: 22.2, // 소름 끼치게 / 똑같고, / 미치게 / 아름답다.
  upload1: 10.59, // 파일 딱 3개만 올리세요!
  mUpload1: 18.41, // 파일 딱 3개만
  mUpload2: 26.89, // 올리세요!
  tears: 13.16, // 받으면 눈물 납니다.
  mTears: 20.93, // 받으면 / 눈물 납니다.
  last: 12.89, // 아직도 안 올렸어요?
  mLast: 20.23, // 아직도 / 안 올렸어요?
} as const;

export const FIT_LSB: Partial<Record<keyof typeof FIT_K, number>> = {
  // 가운데 정렬 줄(last·mLast)·고리로 시작하는 줄(school2)은 0
  heroA: 0.06,
  heroB: 0.055,
  mHero1: 0.06,
  mHero2: 0.055,
  mHero3: 0.055,
  school1: 0.035,
  mSchool1: 0.045,
  show1: 0.055,
  show2: 0.055,
  mShow: 0.055,
  upload1: 0.055,
  mUpload1: 0.055,
  mUpload2: 0.055,
  tears: 0.055,
  mTears: 0.055,
};

export type FitKey = keyof typeof FIT_K;

export function FitLine({ k, children, className = "", lsb }: { k: FitKey; children: ReactNode; className?: string; /** 이 줄만 다른 첫 글자 여백(em) — 형광 상자·고리로 시작하는 줄은 0 */ lsb?: number }) {
  const l = lsb ?? FIT_LSB[k];
  const style = { "--k": FIT_K[k], ...(l ? { "--lsb": l } : {}) } as CSSProperties;
  return (
    <span data-fit={k} className={`${s.fitLine} ${s.display} ${className}`} style={style}>
      {children}
    </span>
  );
}

/** 줄 묶음 — 넓은 화면과 좁은 화면에서 줄 나눔이 다르면 두 벌을 준다. bp: 바뀌는 폭(기본 md=768px) */
export function Fit({
  wide,
  narrow,
  className = "",
  as: Tag = "div",
  id,
  bp = "md",
}: {
  wide: ReactNode;
  narrow?: ReactNode;
  className?: string;
  as?: "div" | "h1" | "h2" | "p";
  id?: string;
  bp?: "md" | "560";
}) {
  if (!narrow)
    return (
      <Tag id={id} className={`${s.fit} ${className}`}>
        {wide}
      </Tag>
    );
  const show = bp === "560" ? "hidden min-[560px]:block" : "hidden md:block";
  const hide = bp === "560" ? "block min-[560px]:hidden" : "block md:hidden";
  return (
    <Tag id={id} className={className}>
      <span className={`${s.fit} ${show}`}>{wide}</span>
      <span className={`${s.fit} ${hide}`}>{narrow}</span>
    </Tag>
  );
}
