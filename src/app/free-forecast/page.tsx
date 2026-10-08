import type { Metadata, Viewport } from "next";
import { Black_Han_Sans } from "next/font/google";
import { FreeForecastLanding } from "@/components/free-forecast/free-forecast-landing";

// 무료 적중 예측 팩 신청 — 공개 원페이지 랜딩. 파일 3개(지난 기출 시험지·그 범위 지문·이번 범위 지문)를 받아
// 24시간 안에 동형 모의고사 10세트 + 예상 문제 600개+ 를 이메일로 보낸다(실시간 생성 아님).

const display = Black_Han_Sans({ weight: "400", subsets: ["latin"], display: "swap", variable: "--ff-display", preload: false });

// 공유 카드 — 하위 경로의 openGraph·twitter 는 루트 것을 통째로 갈아 끼우므로(얕은 병합) type·siteName·locale 까지 다시 적는다.
// twitter 를 비우면 루트의 기본 문구(영어학원 AI 올인원)가 카드에 나온다. 그림은 1200×630(public/free-forecast/og.png).
const SHARE_TITLE = "100% 파격 무료!!! 내신 적중 예측 팩";
const SHARE_DESC = "파일 딱 3개 → 동형 모의고사 10세트 + 예상 문제 600개+. 24시간 안에 이메일로. 진짜 무료.";
const SHARE_IMAGE = { url: "/free-forecast/og.png", width: 1200, height: 630, alt: "100% 파격 무료!!! 이 중에 무조건 적중!!! 파일 딱 3개로 동형 모의고사 10세트와 예상 문제 600개+를 24시간 안에 이메일로" };

export const metadata: Metadata = {
  title: "100% 무료 내신 적중 예측 팩 — 파일 3개만 올리세요",
  description: "지난 기출 시험지 + 그 시험 범위 지문 + 이번 시험 범위 지문, 파일 딱 3개면 동형 모의고사 10세트와 예상 문제 600개+를 24시간 안에 이메일로 보내드립니다. 진짜 무료.",
  alternates: { canonical: "/free-forecast" },
  openGraph: {
    type: "website",
    siteName: "SMOAT",
    locale: "ko_KR",
    title: SHARE_TITLE,
    description: SHARE_DESC,
    url: "/free-forecast",
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESC,
    images: [SHARE_IMAGE],
  },
};

// 폰 상단 UI(주소창) 색 — 검정 포스터와 잇는다. 루트 layout 의 viewport(width·viewportFit 등)와 합쳐진다
export const viewport: Viewport = { themeColor: "#0b0b0c" };

// 글꼴 대기 신호 — 거대 제목 줄(FitLine)의 k 는 Black Han Sans 로 잰 값이라, 글꼴이 오기 전 대체 글꼴로는 칸을 넘어
// 「100%」의 「%」가 잘렸다(2차 검수 실측 +43~118px). 이 스크립트는 HTML 을 읽는 도중 바로 돌아 감싸개에 data-ff-font 를 단다:
//   글꼴이 이미 있으면 아무것도 안 함 · 아니면 pending(거대 제목만 잠깐 숨김) → 오면 ready / 1.5초 넘거나 실패하면 fallback(82% 축소).
//   자바스크립트가 꺼져 있으면 속성이 없어 그대로 보인다. 글꼴 이름이 안 맞으면 check() 가 참이라 역시 그대로(멀쩡한 화면을 숨기지 않는다).
//   2단계(3차 R3-30): ready 는 히어로 글자 조각(14조각 중 6)만 본다 — 나머지 조각이 늦거나 끊기면 아래 거대 제목이 100% 크기의
//   대체 글꼴로 찍혀 넘칠 수 있었다. ready 뒤에 페이지의 모든 거대 제목([data-fit])·고정 칸 표시 글자([data-ff-glyphs]) 글자를 받아
//   다 오면 data-ff-font-all 을 단다.
//   그 전까지 히어로 밖 거대 제목은 fallback 과 같은 82%. 「○→↓—·…」·공백·NBSP·WJ 는 이 글꼴에 없거나(본문 글꼴로 그린다) 필요 없어 뺀다.
//   보이는 규칙은 free-forecast.module.css 맨 위 [data-ff-font] 규칙들.
function fontGateScript(family: string) {
  const q = JSON.stringify(`400 32px ${family}`);
  const rest = `function rest(){var a='',seen={},els=g.querySelectorAll('[data-fit],[data-ff-glyphs]');for(var i=0;i<els.length;i++){var x=els[i].textContent||'';for(var j=0;j<x.length;j++){var c=x.charAt(j),k=x.charCodeAt(j);if(k<=32||k===160||k===8288||seen[c]||'○→↓—·…'.indexOf(c)>=0)continue;seen[c]=1;a+=c}}function all(){g.setAttribute('data-ff-font-all','')}try{if(!a||F.check(q,a))return all()}catch(e){return all()}F.load(q,a).then(all,function(){})}function later(){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',rest);else rest()}`;
  return `(function(){var g=document.currentScript&&document.currentScript.parentElement;var F=document.fonts;if(!g||!F||!F.load||!F.check)return;var q=${q},t='100%파격무료!';function s(v){g.setAttribute('data-ff-font',v)}${rest}try{if(F.check(q,t))return}catch(e){return}s('pending');var to=setTimeout(function(){s('fallback')},1500);F.load(q,t).then(function(){clearTimeout(to);s('ready');later()},function(){clearTimeout(to);s('fallback')})})();`;
}

export default function FreeForecastPage() {
  const family = display.style.fontFamily.split(",")[0].trim();
  return (
    // 감싸개 속성은 스크립트가 바꾸므로 수화 경고를 끈다(서버 컴포넌트라 클라이언트에서 다시 그리지 않아 값이 유지된다)
    <div suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: fontGateScript(family) }} />
      <FreeForecastLanding fontClass={display.variable} />
    </div>
  );
}
