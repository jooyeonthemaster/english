# SMOAT 세미나 덱 — 정찰 원장

> 본 문서는 11각도 코드 정찰 결과를 교차검증·중복제거한 **사실 원장**이다.
> 규칙: (1) 정찰에 없는 숫자·기능·카피는 기재하지 않는다. (2) `[추론]` 표기는 그대로 유지한다.
> (3) 모순은 양쪽을 모두 적고 ⚠ 로 표기한다. (4) UI 카피는 따옴표 안에 자구 그대로 인용한다.

---

## 0. 서비스 한 줄 정의 (코드/라이브에서 관측된 것 기준)

관측된 공식 정의문은 3개이며, **문항 유형 수 표기가 서로 다르다(⚠ §3 참조)**.

| 출처 | 자구 그대로 |
|---|---|
| `src/app/llms.txt/route.ts:22` | "스모트(SMOAT)는 한국 영어학원을 위한 AI 올인원 서비스입니다. 영어 지문 분석(직독직해·구문·어휘 A4 분석지), 내신·수능 19유형 AI 영어 문제 생성(빈칸추론·어법·순서·삽입·서술형 등), 편집 가능한 Word(.docx)·한글 시험지 자동 조판, 학원 운영(ERP)까지 한곳에서 제공합니다. 주식회사 네안데르가 운영합니다." |
| `src/app/about/page.tsx:43-55` | "스모트(SMOAT)란? — 영어학원을 위한 AI 올인원 / 스모트(SMOAT)는 영어 지문 분석, 내신·수능 19유형 AI 영어 문제 생성, Word 시험지 자동 제작, 그리고 학원 운영까지 한곳에서 끝내는 영어학원 AI 올인원 서비스입니다. 영어 강사가 자료 제작에 쓰던 시간을 수업에 돌려드립니다." |
| `src/lib/seo/config.ts:34-52` (타이틀) | "스모트(SMOAT) \| AI 영어 문제 생성·내신 시험지 제작 영어학원 올인원" |

랜딩 히어로가 제시하는 가치제안 한 줄(`src/components/landing/hero-scene.tsx:422-452`):

> "영어 내신·수능 최적화 AI" / "영어시험 고민은 이제 끝! SMOAT가 모든 걸 해드립니다" / "SMOAT의 영어 내신·수능 최적화 AI로 / 10시간을 10분으로 단축해드립니다!"

`llms.txt` 명시 주요 사용자: "영어학원 원장·강사, 공부방·과외 선생님 (한국)".

---

## 1. 브랜드 시스템

### 1-1. 컬러 표

**브랜드 코어 (`globals.css` `@theme inline`, 접두 `--color-yshin-*`)**

| 토큰 | Hex | 역할 |
|---|---|---|
| `yshin-blue` | `#3B82F6` | 브랜드 프라이머리 |
| `yshin-blue-hover` | `#2563EB` | 프라이머리 hover |
| `yshin-blue-subtle` | `#EFF6FF` | 프라이머리 배경 |
| `yshin-blue-light` | `#BFDBFE` | 보조 라인 |
| `yshin-indigo` | `#6366F1` | — |
| `yshin-indigo-subtle` | `#EEF2FF` | — |
| `yshin-emerald` | `#10B981` | 성공/검수 |
| `yshin-emerald-subtle` | `#ECFDF5` | — |
| `yshin-amber` | `#F59E0B` | 주의 |
| `yshin-amber-subtle` | `#FFFBEB` | — |
| `yshin-red` | `#EF4444` | 오류/미검수 |
| `yshin-red-subtle` | `#FEF2F2` | — |
| `yshin-purple` | `#8B5CF6` | XP·특수 |
| `yshin-purple-subtle` | `#F5F3FF` | — |

시맨틱 규약(`design-sync/foundations/colors.html:18`, 자구 그대로):
> "브랜드 프라이머리는 blue(#3B82F6, hover #2563EB). 시맨틱: emerald=성공/검수, amber=주의, red=오류/미검수, purple=XP·특수."

**중립 그레이 (globals.css:69-78)**

| 단계 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| Hex | `#F9FAFB` | `#F3F4F6` | `#E5E7EB` | `#D1D5DB` | `#9CA3AF` | `#6B7280` | `#4B5563` | `#374151` | `#1F2937` | `#111827` |

**ERP(원장/어드민) 팔레트 (globals.css:133-162)**

| 토큰 | Hex | 토큰 | Hex |
|---|---|---|---|
| `erp-primary` | `#2563EB` | `erp-bg` | `#F8FAFC` |
| `erp-primary-hover` | `#1D4ED8` | `erp-surface` | `#FFFFFF` |
| `erp-primary-light` | `#DBEAFE` | `erp-border` | `#E2E8F0` |
| `erp-primary-subtle` | `#EFF6FF` | `erp-text` | `#0F172A` |
| `erp-secondary` | `#475569` | `erp-text-secondary` | `#64748B` |
| `erp-success` | `#059669` | `erp-text-muted` | `#94A3B8` |
| `erp-warning` | `#D97706` | `erp-error` | `#DC2626` |
| `erp-info` | `#0284C7` | | |

**랜딩 씬 (`shared/scene-ui.tsx`)**

| 토큰 | 값 |
|---|---|
| `SCENE_NAVY_BG` | `radial-gradient(120% 80% at 50% -8%, #1B2A4A 0%, #111C34 45%, #0B1220 100%)` |
| CTA 씬 배경 | `radial-gradient(120% 120% at 50% 0%, #1B2A4A, #0B1220 62%)` |
| `GRID_DARK` | 34px×34px 격자, 선색 `rgba(148,180,255,0.06)` |
| `GRID_INK` | 34px×34px 격자, 선색 `rgba(15,23,42,0.045)` |
| `SceneGlow` | `radial-gradient(closest-side, rgba(59,130,246,0.38), transparent)` + `blur(20px)` |
| `SceneGhost` 아웃라인 | `-webkit-text-stroke: 2px #BFDBFE` |
| 다크 히어로 그라디언트 텍스트 | `linear-gradient(90deg, #7DB0FF → #3B82F6)` + `bg-clip-text` |
| 다크 본문 보조색 | `#B6C2D9` |
| Accent(라이트) | `#2563EB` / Kicker(다크) `#93C5FD` |

**학생앱 `/g` 디자인 시스템 "시험지 × 계기판" (`src/app/g/gd.css:11-25`, 라이트 고정)**

| 토큰 | Hex | 토큰 | Hex |
|---|---|---|---|
| `--gd-paper` | `#f6f5f1` | `--gd-blue` | `#1d4ed8` |
| `--gd-card` | `#ffffff` | `--gd-blue-soft` | `#eef2fe` |
| `--gd-line` | `#e5e3db` | `--gd-blue-line` | `#c7d4f8` |
| `--gd-line-strong` | `#d4d1c6` | `--gd-good` | `#047857` |
| `--gd-ink` | `#16202e` | `--gd-good-soft` | `#ecfdf5` |
| `--gd-ink-2` | `#5a6372` | `--gd-bad` | `#be123c` |
| `--gd-ink-3` | `#98a0ad` | `--gd-bad-soft` | `#fff1f2` |
| | | `--gd-master` | `#0f766e` |

**리포트 테마 6종 (`report-themes.ts:54-152`, primary / accentSoft / tint)**

| 테마 id | 라벨 | primary | accentSoft | tint | 폰트 페어링 |
|---|---|---|---|---|---|
| `indigo-consult` | "컨설팅 블루" | `#1D4ED8` | `#C9D9F7` | `#EFF4FF` | Pretendard |
| `slate-pro` | "모노크롬 프로" | `#1E293B` | `#E2E8F0` | `#F1F5F9` | IBM Plex Sans KR |
| `teal-fresh` | "그로스 코치" | `#0D9488` | `#99F6E4` | `#F0FDFA` | Gowun Dodum / Pretendard |
| `navy-classic` | "클래식 저널" | `#1E3A5F` | `#C3D3E4` | `#EEF2F7` | Noto Serif KR / Gowun Batang |
| `ink-editorial` | "잉크 매거진" | `#18181B` | `#E4E4E7` | `#F4F4F5` | Hahmlet / Pretendard |
| `forest-tutor` | "포레스트 멘토" | `#166534` | `#D5E3CE` | `#F1F5EC` | Pretendard |

기본 테마 `indigo-consult` 나머지 토큰: ok `#059669`, bad `#E11D48`, neutral `#64748B`, surface `#F8FAFE`, line `#DBE3F2`.
코드 주석 규약: "전 테마 인쇄 안전(밝은 배경 기반). 금지: 주황/앰버, 흰 배경 보라 그라데이션".

**학습지 5색 마킹 (`shared/annotation-marks.tsx:5-36`, 제품 지문 편집기와 동일 규약 주석)**

| 라벨 | Hex | 렌더 스타일 |
|---|---|---|
| 어휘 | `#3b82f6` | `linear-gradient(to top, #dbeafe 35%, transparent 35%)` + border-bottom 2px solid |
| 문법 | `#8b5cf6` | `underline wavy`, thickness 2px, offset 3px |
| 구문 | `#0891b2` | border-bottom 2px dashed |
| 핵심문장 | `#22c55e` | `linear-gradient(to right, #22c55e 3px, #f0fdf4 3px)` |
| 출제포인트 | `#eab308` | `linear-gradient(to top, #fef08a 40%, transparent 40%)` |

**유형 카테고리 틴트 (`shared/mock-data.ts:77-81`)**

| 카테고리 | bg | border | text |
|---|---|---|---|
| 객관식 | `#EFF6FF` | `#BFDBFE` | `#1d4ed8` |
| 서술형 | `#EEF2FF` | `#C7D2FE` | `#4338ca` |
| 어휘 | `#ECFDF5` | `#A7F3D0` | `#047857` |

**웹툰 컷 SVG 프리미티브 팔레트 (`public/landing/demo/webtoon/panel-1.svg:2-15`)**

| 요소 | Hex |
|---|---|
| 배경 | `#FEF6E4` |
| 바닥 | `#8B5E3C` |
| 테이블 / 상판 하이라이트 | `#B07D4B` / `#C99666` |
| 피부 | `#F4C7A5` |
| 머리 | `#7B4A2D` |
| 옷 | `#7BA3C9` |
| 금화 / 테두리 | `#F5C64F` / `#C89B2A` |

**기타 확정 색**

| 항목 | 값 |
|---|---|
| 정오 4상태(리포트) | 정답 `--rpt-ok` ✓ / 오답 `--rpt-bad` ✗ / 부분 `--rpt-primary` △ / 미입력 `--rpt-line` · |
| 채점 화면 STATUS_STYLE | CORRECT ○ emerald-600·emerald-50 / WRONG ✕ rose-600·rose-50 / PARTIAL △ blue-700·blue-50 / UNKNOWN · slate-400·white |
| 난이도 3단(생성 UI) | 기본 `bg-blue-50 text-blue-700` / 중급 `bg-amber-50 text-amber-700` / 킬러 `bg-red-50 text-red-700` |
| 지문 하이라이트 | 출제 `--hl-exam-bg #fef08a` / 어휘 `--hl-vocab-bg #dbeafe` |
| 다크 테마(앱) | `--background #1b1b1b`, `--card #232323`, `--foreground #e4e4e4`, `--border #333333` (중성 차콜, 네이비 톤 제거) |
| 구 `/admin` 사이드바(토스 계열) ⚠ | 로고칩 `#3182F6`, 활성 nav `#E8F3FF`/`#3182F6`, 텍스트 `#191F28` — 메인 팔레트와 다른 계열, 덱에서 혼용 금지 |
| 그라디언트 유틸 | primary `linear-gradient(135deg,#3B82F6,#2563EB)` / hero `linear-gradient(135deg,#EFF6FF,#F5F3FF,#ECFDF5)` |
| 글래스 | `.glass` = `rgba(255,255,255,0.72)` + `blur(24px) saturate(180%)` / `.glass-strong` = `rgba(255,255,255,0.92)` + `blur(32px) saturate(200%)` |

### 1-2. 폰트

- 본문 전 화면 **Pretendard 단일**. CDN(jsdelivr, orioncactus/pretendard **v1.3.9** static)을 `<head>`에서 직접 로드.
  스택: `"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif` (`layout.tsx:95-100`, `globals.css:15`)
- `next/font`로 로드하는 것은 **Geist_Mono 하나뿐**(`--font-geist-mono`).
- **시험지 인쇄/미리보기 영역만 별도 서체**: `@font-face "Malgun Gothic Exam"` (400/700, `/fonts/exam/MalgunGothic-Regular.woff2`, `-Bold.woff2`). 목적은 DOCX/HWPX 다운로드본과 줄바꿈 일치(`globals.css:327-351`). 미리보기 `fontFamily`는 `"Malgun Gothic Exam", "Malgun Gothic", "맑은 고딕", sans-serif`, DOCX `DEFAULT_FONT = "맑은 고딕"`.
- `font/`·`public/fonts/webtoon/` 의 그리운 체리 한스푼 / 그리운 규원체 / Ok단단체는 **브랜드 폰트가 아니라 웹툰 말풍선 서체 목록**(`src/lib/webtoon-text/fonts.ts:33-35`).
- 타이포 스케일(`design-sync/foundations/type.html`): heading 18px/900, section title 15px/800, dialog title 18px/600, body 14px/400, ui dense 13px/500, admin 12px/500~600, caption 11px/500, micro chip 10px/600, 숫자는 항상 `tabular-nums`. 제목 자간 `h1,h2,h3 { letter-spacing: -0.025em }`.
- ⚠ 위 스케일 문서와 실제 앱 렌더는 다르다: `body.smoat-large-ui { font-size: 20px }`가 전역 기준이며 `text-xs~text-2xl` 유틸과 버튼/인풋 높이를 한 단계씩 키운다(`globals.css:1495-1660`). 덱에서 "본문 14px"이라고 단정하면 안 된다.
- `/g` 학생앱은 rem 고정 스케일(10/11/12/13/14/15/17/20/24px)로 전역 확대와 무관하며, 영어 지문만 세리프(Georgia/Times New Roman/Noto Serif, line-height 1.72).

### 1-3. 표기 규칙

- 단일 소스는 SEO config: `SITE.name = "SMOAT"`, `SITE.nameKo = "스모트"`, `legalName = "주식회사 네안데르"`, locale `ko_KR`, 도메인 `https://www.smoat.co.kr`. 하위 페이지 타이틀 템플릿 `"%s | 스모트 SMOAT"` (한/영 병기 강제).
- 코드 실측 빈도(`src/` 하위 .ts/.tsx): 대문자 `SMOAT` 262회, 한글 `스모트` 134회, 소문자 `smoat` 273회, 파스칼 `Smoat` 0회.
  소문자 273회는 **전부 기술 식별자**(도메인 `smoat.co.kr`, localStorage 키 `smoat.similarExam.leftWidth`, CSS 프리픽스 `smoat-large-ui`, 내보내기 파일명 `smoat-members-*`). UI 노출 텍스트에 소문자 표기는 없다.
- 로고: 컴포넌트는 `src/components/brand/brand-mark.tsx` 단 하나, 소스는 항상 `/smoat-logo.png`(500×500). `BrandIcon`은 `size-9 rounded-2xl overflow-hidden bg-transparent shadow-[0_16px_32px_-22px_rgba(15,23,42,0.8)]`. alt/title 기본값 "SMOAT".
- 랜딩 헤더 락업 규정(`design-sync/foundations/brand.html:20`, 자구 그대로):
  > "워드마크 = 18px 900 slate-950, hover 시 blue-600. 아이콘은 rounded-full + 딥 섀도. 랜딩 nav 링크는 hover:bg-blue-50 hover:text-blue-700. ※ 국어 과목 기능은 대외비 — 브랜드/마케팅 노출 금지."
- ERP 셸 락업: `BrandIcon(size-8)` + "SMOAT" 20px bold + 소문자 서브라벨 "erp"(10px, gray-300, tracking-widest).
- 버튼 색 규약(`design-sync/patterns/color-rules.html:16`, 자구 그대로):
  > "색은 기능을 말한다 — 파랑=학습자료·생성·주요 액션, 초록=검수(취소 포함), 빨강=미검수 상태, 슬레이트=선택/활성. 검수취소에 rose 사용 금지."
- 앱 버튼 vs 랜딩 CTA는 규격이 다르다. 앱 shadcn Button = `rounded-md(8px)`, h-9(36px), text-sm 500. 랜딩 CTA = `rounded-full`, 배경 `#020617`, 13px/900, `shadow 0 16px 40px -24px rgba(15,23,42,.8)`, hover `#2563EB` + `translateY(-2px)`.
- Tailwind v4 CSS-first: `tailwind.config.*` 파일이 **없다**. PostCSS 플러그인은 `@tailwindcss/postcss` 하나, 모든 토큰은 `globals.css`의 `@theme inline`. shadcn 설정은 style `new-york`, baseColor `neutral`, cssVariables true, icon `lucide`.
- 라운드: `--radius: 0.625rem(10px)` 기준, sm = radius−4px, md = radius−2px, lg = radius, xl/2xl/3xl/4xl = +4/+8/+12/+16px.
- 그림자 유틸 5종: `shadow-card` `0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.06)` / `shadow-card-hover` / `shadow-float` / `shadow-nav` / `shadow-sidebar`.
- 스크롤바 브랜드화: 폭 6px, thumb `linear-gradient(180deg,#93C5FD,#60A5FA 50%,#93C5FD)`, hover `#60A5FA→#3B82F6`.
- 공용 리빌 모션 규격(랜딩): opacity 0→1, y 28→0, `blur(6px)→0`, duration 0.7s, ease `cubic-bezier(0.16,1,0.3,1)`, viewport once amount 0.3. pop 변형은 spring(stiffness 320, damping 22).

---

## 2. 랜딩 씬 11종 해부

**씬 순서(`src/app/page.tsx:49-90`)**: Hero → *(모집중 세미나 있을 때만)* SeminarPromo → `#section-question` QuestionBurst → `#section-annotation` Annotation → `#section-exam` ExamPaper → `#section-intake` Intake → `#section-report` Report → `#section-webtoon` Webtoon → `#section-folder` Folder → `#section-samples` Sample → CtaScene. 각 씬은 lg에서 `lg:snap-start` 스크롤 스냅 단위.

루트 `<main>`: `bg-white text-gray-900 selection:bg-[#3B82F6] selection:text-white font-sans antialiased`, 배너 존재 시 `pt-11`(44px).

**고스트 넘버 할당**: QuestionBurst `01`, Annotation `02`, ExamPaper `03`, Intake `04`, Report `05`, Webtoon `06`. Folder/Sample/CTA에는 고스트 번호가 관측되지 않았다.

**공통 문법**: 대부분의 씬이 `lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]` (좌 카피 / 우 데모), max-w 1480~1600px, px-16, min-height 100svh.

### 2-1. Hero
- 배경 네이비 3-스톱 라디얼(§1 표), 높이 md↑ 100svh(min 850px), 상단 글로우 `-top-10 h-[420px] w-[820px]`.
- 뱃지: 높이 32px 알약, `bg-blue-500/15`, `text-blue-300`, 13px extrabold, tracking `0.04em`, Sparkles 아이콘. → "영어 내신·수능 최적화 AI"
- H1: 34px → sm 48px → lg 72px, font-black, leading-[1.15]. 1줄 흰색, 2줄 그라디언트.
  → "영어시험 고민은 이제 끝!" / "SMOAT가 모든 걸 해드립니다"
- 서브: 본문 `#B6C2D9` 16/19px bold, 둘째 줄은 알약 강조(`bg-blue-100`, `text-blue-800`, 15/17px extrabold, px-5 py-1.5).
  → "SMOAT의 영어 내신·수능 최적화 AI로" / "10시간을 10분으로 단축해드립니다!"
- CTA: 주 = `/register`, 높이 52/58px, `bg-blue-600`, `shadow-[0_24px_54px_-22px_rgba(37,99,235,1)] ring-4 ring-blue-500/15` → "SMOAT 시작하기". 보조 = 글래스(`border-white/[0.28] bg-white/[0.12] backdrop-blur-xl`), 클릭 시 `#section-samples`로 smooth 스크롤 → "실제 결과물 보기".
- 모션: staggerChildren 0.12 / delayChildren 0.15. 뱃지 y20→0(0.6s), H1 y34+blur(8px)→0(0.8s), 서브 y22+blur(6px)→0(0.7s), CTA y18→0(0.6s). 목업 opacity0/y60 → 0.9s, delay 0.55s.
- **3D 부유 목업**: `@keyframes yshin-builder-float` 8s ease-in-out infinite — 0%/100% `translateY(0) rotateX(13deg) rotateY(-9deg) rotateZ(3deg)` → 50% `translateY(-12px) rotateX(15deg) rotateY(-11deg) rotateZ(4deg)`. 부모 `perspective 1600px`, `perspective-origin top`. 1023px 이하는 회전 없이 translateY 0→-8px 6s, `prefers-reduced-motion`이면 `animation:none`.
- 목업 프레임: 베젤 `border-[7px]`(sm 10px) `border-slate-950/90 rounded-[28px]`(lg `rounded-[34px]`), `shadow-[0_36px_110px_-40px_rgba(15,23,42,0.8)]`. 내부 화면 `rounded-[20px] border-white/20 bg-slate-50`, 높이 382 → sm 430 → lg 468px.
- 크롬 바(48px): 신호등 `bg-red-300 / bg-amber-300 / bg-emerald-300`(각 10px), URL 알약 → "smoat.co.kr/workbench/exams/create", 우측 → "저장됨" / "출력".
- 본문 3열 `grid-cols-[172px_minmax(0,1fr)_246px]`(sm 2열 150px+1fr).
  - 좌 네비 4항목 → "문제 생성 / 시험지 생성 / 학습지 생성 / 자료 추출" (index 1 활성: `bg-blue-50 text-blue-700` + 파란 도트)
  - 좌 최근 문서 3종 → "고2 영어 중간 · 12문항 · 편집중" / "수능형 미니 모의고사 · 20문항" / "어법 집중 세트 · 8문항"
  - 중앙 헤더 → "시험지 생성" / "고2 영어 중간고사 시험지 편집" / 칩 "A4 · 2단 · 12문항" · "자동 저장" / 캔버스 라벨 "1페이지 편집중" · "AI 추천 배치"
  - A4 지면 머리말 → "2026학년도 1학기" / "고2 영어 중간고사" / "반 _____ 이름 _____" / 지시문 "다음 글을 읽고 물음에 답하시오. 각 문항의 답을 하나만 고르시오."
  - A4 문항 4개(2단): "1 빈칸 추론 / Attention has become the most valuable currency in the digital age... / ① attention ② memory ③ silence ④ wealth ⑤ patience" · "2 어법 판단 · 선택됨 / 다음 밑줄 친 부분 중 어법상 틀린 것은? / Every notification, every scroll, every swipe demand..." · "3 글의 순서 / (A) However, attention is easily divided... / (B) What we choose shapes our thinking..." · "4 조건부 영작 / [조건] 관계대명사 what을 사용할 것. / 우리가 선택하는 것이 사고의 구조를 만든다."
    2번만 선택 상태 `border-blue-300 bg-blue-50/45 shadow-[0_0_0_2px_rgba(37,99,235,0.12)]`, 좌측 밖 GripVertical 핸들이 `yshin-builder-cursor` 2.4s(opacity 0.35↔1, y 0↔-2px)로 깜빡임.
  - 하단 파이프라인 4카드(아이콘 타일 `bg-blue-500 / bg-cyan-500 / bg-emerald-500 / bg-amber-500`) → "지면 편집 · A4 2단 레이아웃" / "문항 추가 · 라이브러리에서 배치" / "자동 저장 · 편집 내용 즉시 반영" / "파일 출력 · DOCX·HWPX·PDF"
  - 우 패널 → "시험지 설정" / "12문항" / "A4 · 2단 · 정답지" / "문항 라이브러리" / "+ 새 문항" / "1. 빈칸 추론 2. 어법 판단 3. 글의 순서 4. 문장 삽입 5. 제목 추론 6. 조건부 영작" / 다크 Export 카드 "Export Ready" · "고2영어_중간.docx" · "시험지·정답지 함께 생성"
- xl(1280px)↑ 플로팅 뱃지 3개(translateZ 80/60/90px) → "시험지 생성 / 실제 지면 직접 편집" · "문항 구성 / 12문항 자동 배치" · "출력 완료 / DOCX·HWPX·PDF"

### 2-2. SeminarPromo (조건부)
- 카드 `rounded-[28px] border-slate-200 bg-white shadow-[0_30px_80px_-50px_rgba(15,23,42,0.55)]`, hover `-translate-y-0.5` + `shadow-[0_40px_90px_-46px_rgba(37,99,235,0.5)]`.
- 좌 패널 `bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950`, 좌상단 256px blur-3xl `rgba(59,130,246,.2)` 블롭.
- 카피(고정): "모집중"(bg-blue-500 필 + 흰 ping 도트 size-1.5) / "선착순 N명" / "세미나 신청하기". 일정 미정 시 "일정 조율 중". 커버 없으면 placeholder "SMOAT 단체 세미나".
- 카운트다운(랜딩용): red 톤 pill — `border-red-400/50`, `bg-red-500/15`, AlarmClock `text-red-400`, 시계 `font-mono text-[15px] font-black tabular-nums text-white`, 1초 갱신, 마감 후 렌더 안 함 → "신청 마감까지"

### 2-3. QuestionBurst (`#burst`, 고스트 01)
- 흰 배경 + GRID_INK, lg `grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`, gap-8, max-w-[1480px].
- 카피 → "FEATURE · 25유형 문제 생성" / "지문 하나로 시작하는," / "초고속 AI 문제 생성" / "지문을 넣는 순간, 빈칸·어법·순서부터 서술형까지 내신·수능 25유형 문항이 단 몇 초 만에 완성됩니다."
- 모바일 뱃지 4종 → "25유형 전 영역 / 1초 생성 / 장문 세트 / 동형 모의고사"
- 칩 셀렉터 유도 문구 → "유형을 클릭하면 오른쪽에서 문제가 바로 생성됩니다"
- 칩: 비선택 `border-slate-200 bg-white text-slate-700 shadow-sm`, hover `-translate-y-0.5 border-blue-400 text-blue-700`, 선택 `border-blue-600 bg-blue-600 text-white`. 미선택 상태에서 첫 칩에 `ring-2 ring-blue-400/60 animate-pulse`.
- **타자기 시퀀스 페이싱**: 시작 200ms → 발문 26ms/자 → PHASE_PAUSE 200ms → 제시문 18ms/자 → 선지 16ms/자(선지 간 90ms) → 정답 공개 → 700ms 후 done → FINAL_HOLD_MS 2400ms → 다음 유형(25 modulo).
- 페이즈 인디케이터 → "발문 생성중 / 지문 추출중 / 선지 생성중 / 정답 검증중 / 생성 완료". 진행바 6px, 채움 `linear-gradient(90deg,#93C5FD 0%,#3B82F6 50%,#1D4ED8 100%)`, 매핑 0.15 → 0.45 → 0.75 → 1.0.
- 원문 패널 → "분석된 원문" / "EXTRACTING · n" / "ANALYZED · n". 토큰 점등: bg `rgba(219,234,254,0) → #BFDBFE → #DBEAFE`, color `#4B5563 → #1E3A8A → #1E40AF`, shadow `0 → 0 0 0 4px rgba(59,130,246,0.18) → 0`, 0.9s easeOut, delay = index × 220ms.
- ConnectionBeam(데스크톱, 28px): "GENERATE" + 180×2px 레일 위 40px 스윕 `linear-gradient(90deg, transparent, #3B82F6, transparent)` left −40px → 180px, 1.2s 무한.
- 정답 연출: 원형 체크 `bg-[#3B82F6] shadow-[0_4px_14px_rgba(59,130,246,0.4)]`, scale [0.7→1.15→1] 0.45s → "정답 도출 완료".
- 문항 shape 7종(mcq / ordering / insert / write / blanks / arrange / correct)과 라벨 → "원문 인용 / 삽입 문장 / 삽입 위치 후보 / 주어진 글 / 제시문 / 요약문 / 원문 / ▎ 답안 작성 중... / 정답 작성란 / ▎ 정렬 중... / ▎ 교정 중... / 교정 결과"
- SideTracker → "실시간 생성 트래커" / "n/25" / "■ 일시정지" / "▶ 자동재생" / "↺ 초기화". 25칸 진행 대시(현재 `#3B82F6`, 완료 `blue-300`, 미방문 `gray-200`).
- **목업 데이터**: 전 유형이 단 하나의 지문(HERO_PASSAGE)에서 파생 — "In the digital age, attention has become the most valuable currency. Every notification, every scroll, every swipe demands a fragment of our consciousness, and what we choose to engage with shapes the architecture of our thinking."
  대표 샘플: 01 빈칸 추론(정답 ①), 05 글의 순서, 06 문장 삽입("But this abundance came at a hidden cost.", 정답 ③), 20 배열 영작("attention has become the most valuable currency"), 25 반의어("valuable의 반의어로 가장 적절한 것은?", 정답 ②).

### 2-4. Annotation (`#annotation`, 고스트 02)
- `bg-[#F8FAFC]` + GRID_INK, lg 5fr/7fr.
- 카피 → "FEATURE · 학습지 생성" / "어떤 지문이든," / "바로 수업 가능한 학습지가" / "1초만에 나옵니다." / "문장별 해석·구문 분석부터 학습문제까지, 인쇄만 하면 수업이 시작되는 학습지가 한 번에 완성됩니다."
- 3열 `lg:grid-cols-[1fr_56px_1fr]`(xl `[1fr_80px_1fr]`). 좌 카드 상단 `bg-gradient-to-r from-transparent via-[#60A5FA] to-transparent` 1px 라인.
- 좌/우 헤더 → "선생님의 원문 마킹" / "Live Input" / "AI Deep Dive Analysis" / "5/5 완료"
- 지문 마킹 5개: attention(어휘), has become(문법), "Every notification, every scroll, every swipe"(구문), "what we choose to engage with shapes the architecture of our thinking"(핵심문장), "the most valuable currency"(출제포인트). 메모 → "핵심 어휘 — 학생들이 놓치는 명사형 추상어 / 현재완료 — 결과 용법 / 병렬 구조 3회 반복 — 리듬 / 주제문 — 'shapes' 가 술어 / 비유 표현 — 출제 1순위"
- 분석 결과 5행 → "어휘 (3) attention · currency · consciousness / 문법 (2) 현재완료(has become) · 관계대명사(what) / 구문 (1) 병렬 구조 3개 반복 (Every X, every Y, every Z) / 핵심 문장 what we choose to engage with shapes... / 출제 포인트 the most valuable currency (비유 표현)"
- 가운데 흐름 인디케이터: 세로 2px `bg-gradient-to-b from-blue-50 via-blue-300 to-blue-50` 위로 5색 도트가 opacity [0,1,1,0], y [0,60,120,180], scale [1,1.2,1.2,1], 1.5s.
- 모바일 폴백 = 한글(HWPX) 창 목업 → "SMOAT_분석학습지.hwpx - 한글" / "파일 편집 보기 입력 서식 쪽 보안 검토 도구" / "함초롬바탕" / "10.0 pt" / "1쪽 1단 1줄 1칸 · 삽입" / "100%"

### 2-5. ExamPaper (`#paper`, 고스트 03)
- 흰 배경 + GRID_INK, max-w-[1600px]. **이 씬만 strong 색이 `#1E3A8A`(네이비)**.
- 카피 → "FEATURE · 1초 만에 시험지 파일로" / "웹에서 바로 편집하는 시험지!" / "워드(DOCX), 한글(HWPX), PDF로도" / "바로 다운가능!" / "폰트·여백·표지 양식까지 조판된 파일이라, 받아서 바로 인쇄하고 편집합니다."
- 체크 4항 → "100% 편집 가능 · 로고 삽입·문항 수정 자유" / "워드 · 한글 · PDF 출력 · 워드 안정 지원 · 한글(HWPX) 베타 · 인쇄(PDF)" / "자동 조판 시스템 · 웹 미리보기와 1:1 완성형 조판" / "정답 및 해설지 동시 생성 · 학생용·강사용 해설지 분리 생성"
- 폴백 목업 = "실전모의고사_문제지.hwpx - 한글" 창 + `/landing/samples/sample-mock-exam-page1.png`을 210/297 비율로.
- 라이브 데모(Step4)는 워크벤치 실제 렌더러 `PreviewPages`를 그대로 임베드(주석: "실제 시험지 미리보기 렌더러(PreviewPages)를 그대로 임베드한다. 문항을 빼고 다시 넣으면 실제 2단 조판이 즉시 재페이지네이션된다.").
  라벨 → "실제 조판 엔진 — 문항을 빼고 넣거나, 제목·발문을 클릭해 직접 고쳐보세요" / 헤더 초기값 "실전 대비 모의고사" · "영어 영역 — SMOAT 데모" · "이름" / 툴바 "워드 / 한글 / PDF" / "빠진 문항:" / "모든 문항을 뺐어요 — 위 칩으로 다시 넣어보세요"
  조판 옵션 고정: template `clean`, columns 2, density `comfortable`, passageStyle `plain`, showAnswerSpace, showPassageTitle, showQuestionMeta false, paperSize A4.
  PDF 버튼은 실제 `window.print()`를 호출하며 인쇄 직전 `@page{size:210mm 297mm;margin:0}` 주입 후 afterprint에 제거.

### 2-6. Intake (`#intake`, 고스트 04)
- `bg-[#F8FAFC]` + GRID_INK, lg 5fr/7fr.
- 카피 → "FEATURE · 자료 추출" / "교재를 찍어 올리면," / "지문이 텍스트로 들어옵니다." / "사진·PDF만 올리면 지문 추출부터 잘린 문장 복원까지 자동입니다." / 불릿 "사진 · PDF 자동 추출 — 휴대폰으로 찍은 교재 사진도 OK" / "잘린 지문 AI 복원 — 페이지 경계에서 끊긴 문장 자동 복원" / "텍스트 추출은 무료 — OCR에는 크레딧이 들지 않습니다"
- 2카드 + 원형 화살표 커넥터(`border-blue-100 bg-white text-blue-600 shadow-[0_8px_20px_-8px_rgba(59,130,246,0.6)]`), 카드 뒤 `bg-blue-300/15 blur-[56px]`(sm 80px).
- 좌 카드 → "업로드한 자료" / "교재_p.142.jpg" / "텍스트 추출 중" / "OCR 텍스트 추출 · 무료". 진행바 width 8%→100%, 1.6s easeInOut, delay 0.3s. 사진 `/landing/generated/uploaded-exam-photo.webp`.
- 우 카드 → "추출된 지문" / "잘린 문장 AI 복원" + 5줄(마지막 2줄 `restored=true` → `bg-blue-50` 하이라이트), 각 줄 0.5 + i×0.18s 지연.

### 2-7. Report (`#report`, 고스트 05)
- 흰 배경 + GRID_INK. **이 씬만 데모가 DOM상 먼저 오고 `order-last lg:order-2`로 우측 배치**.
- 카피 → "FEATURE · 시험 리포트" / "시험이 끝나면," / "학생별 분석 리포트가 완성됩니다." / "채점만 입력하면 학생별 리포트가 완성됩니다 — 수치는 채점 그대로, 코멘트만 AI가 다듬습니다."
- 체크 3항 → "유형별 취약점 분석 / 취약 유형과 다음 학습 방향이 한눈에" · "학부모 상담용 리포트 / 6가지 테마 · 그대로 인쇄해 전달" · "출제와 이어지는 보완 학습 / 취약 유형으로 변형문제 바로 재출제"
- 목업 데이터 TYPE_BARS → "빈칸 추론 92% / 어법 판단 84% / 글의 순서 61% / 문장 삽입 55% / 서술형 78%" (weak=true만 앰버). 바 애니: width 0→pct, 0.8s, delay 0.2 + i×0.12.
- 목업 헤더 → "Exam Report" / "중간고사 대비 모의고사 · 시험 리포트" / "김스모 학생" / "고3 · 영어". KPI 3셀 → "점수 87점 / 반 평균 대비 +9.5 / 취약 유형 2개". 하단 → "학습 코멘트 · 글의 순서와 문장 삽입 유형에서 연결어 단서를 놓치는 패턴이 보입니다. 이번 주는 순서·삽입 변형 세트로 보완 학습을 권합니다." / "6가지 디자인 테마" / "인쇄하기"
- 라이브 데모(Step5)는 워크벤치 실제 `ReportDocument` 임베드 + 6테마 스위처 → "실제 리포트 문서 — 테마를 바꿔가며 스크롤해 보세요" / "테마". 문서 폭 880px.

### 2-8. Webtoon (`#webtoon`, 고스트 06)
- `bg-[#F8FAFC]` + GRID_INK, max-w-[1480px].
- 카피 → "FEATURE · 지문 기반 웹툰" / "읽기 싫어하는 학생에게는," / "지문을 웹툰으로 만들어 주세요." / "같은 지문이 컷과 말풍선으로!" / "스토리로 먼저 이해하고 원문으로 돌아옵니다." / "지문 → 컷 분할 자동 · 장면·대사를 AI가 구성" / "말풍선 텍스트 편집 · 대사·해석을 강사가 직접 다듬기" / "수업 자료로 바로 활용 · 이미지로 저장해 프린트·배포"
- 목업 카드 → "The Gift of the Magi — 지문 웹툰" / "지문 기반 생성" / "전체 보기". 이미지 프레임 `rounded-lg border-2 border-slate-900/80`(만화 프레임 감각).
- 뷰어 모달: `fixed inset-0 z-[100] bg-slate-950/90`, Escape 닫힘, body overflow 잠금 → "위아래로 스크롤해서 전체 컷을 확인하세요"
- 라이브 데모(Step6): 래퍼 720px → "실제 지문으로 생성한 웹툰 — 확대해서 컷과 대사를 살펴보세요" / "이미지 저장"(파일명 `smoat-webtoon-gift-of-the-magi.webp`) / "실제 생성 결과 그대로입니다 — 컷 구성·원문 말풍선·한국어 해석 캡션까지 자동"

### 2-9. Folder (`#folder`) — 후반부 유일한 다크 씬
- `SCENE_NAVY_BG` + GRID_DARK + SceneGlow(`-top-10 h-[360px] w-[720px]`). 중앙 정렬 헤드(max-w-[900px]) + 하단 max-w-3xl 파일창.
- 카피 → "FEATURE · 아카이브와 학원 운영" / "이 모든 것들을 철저하게" / "파일 시스템 기반으로 관리합니다." / "모든 결과물이 학교·학년·연도 트리에 쌓여, 내년에 그대로 꺼내 씁니다." (H2 `clamp(24px,2.8vw,40px)`, 강조색 `#7DB0FF`)
- 파일창 → "시험지 보관함 › OO고등학교 › 2026학년도 1학기 › 3학년" / "현재 폴더" / "· 하위 폴더 2개"
- 목업 데이터 → 폴더 "중간고사 · 25개 문항"(selected) / "기말고사 · 18개 문항", 파일 "빈칸추론_세트A · 15문항 · 시험지 · 객관식" / "어법판단_세트B · 10문항 · 시험지 · 객관식" / "중간대비_심층분석 · 22쪽 · 학습지 · 분석"
- 하단 바 → "생성된 모든 분석·시험지 파일은 클라우드에 안전하게 보관됩니다"

### 2-10. Sample (`#samples`)
- `bg-[#F8FAFC]` + GRID_INK, 중앙 헤드 + md 2열 카드 2장(max-w-5xl).
- 카피 → "실제 결과물 샘플" / "말로만 설명하지 않겠습니다." / "직접 SMOAT AI의 우수한 품질을" / "확인해보세요." / "SMOAT가 실제로 생성한 두 자료입니다. 직접 열어 보고 품질로 판단하세요."
- 카드1 → "MOCK EXAM / 실전 모의고사 문제지 / 독해 28문항 (18~45번) · 7쪽 / 수능 독해 전 유형을 실전 구성 그대로 — 이대로 인쇄해 쓸 수 있습니다. / 수능 실전 구성 · 전 유형 출제 · 2단 조판"
- 카드2 → "PASSAGE ANALYSIS / 심층 지문 분석 학습지 / 지문 분석 + 실전 학습지 · 22쪽 / 지문 한 편을 해석·구조·어법·어휘·실전 학습지까지 한 권으로 완성했습니다. / 문장별 직독직해 · 논리 구조 분석 · 실전 학습지"
- 액션 → "클릭해서 전체 보기" / "브라우저 미리보기" / "PDF 다운로드" / 푸터 "학습 목적으로 제작된 샘플 자료입니다 · 회원가입 없이 열람할 수 있습니다"
- 카드 등장 y 24→0, 0.5s, delay index×0.12.

### 2-11. CTA
- 배경 `radial-gradient(120% 120% at 50% 0%, #1B2A4A, #0B1220 62%)` + GRID_DARK + SceneGlow(top-0, 760×400).
- 히어로 이미지 프레임 `h-[clamp(140px,24vw,300px)] max-w-[920px] rounded-2xl border-blue-300/20 bg-[#071426] shadow-[0_30px_90px_-34px_rgba(37,99,235,0.7)]`, 이미지 `/landing/generated/ai-english-system-hero-v5.png`(alt "알파벳과 영어 시험지가 분석되어 정돈된 문항으로 생성되는 과정").
- 카피 → "가장 진보된 방식의" / "영어 출제 시스템" / "분석부터 출제, 시험지, 리포트까지 — 모두 이곳에 있습니다." / "지금 바로 시작하기 →" / "가격 보기 →" (H2 `clamp(34px,3.8vw,56px)`, line-height 1.16, tracking -0.03em)
- Stagger amount 0.25 / gap 0.12, 브랜드 아이콘·버튼만 spring pop.

### 2-12. 공용 크롬
- **헤더 내비 9종** → "단체 세미나 / 25유형 출제 / 학습지 생성 / 시험지 / 자료 추출 / 시험 리포트 / 지문 웹툰 / 아카이브 / 샘플" + "로그인" / "회원 가입". 스크롤 8px 초과 시 h-20 → h-16, lg에서 `bg-transparent` → `bg-white/72 + backdrop-blur-2xl`.
  ⚠ `landing-header.tsx:45-62`에는 "항상 불투명 흰색(`bg-white shadow-[0_1px_0_rgba(15,23,42,0.08)]`)이고 lg 이상에서만 투명/블러 전환"이라는 서술과 "스크롤 8px 초과 시 전환"이라는 서술이 병존한다 — 데스크톱 기준으로만 인용할 것.
- **풀페이지 스냅 엔진**: LOCK_MS 1000, WHEEL_THRESHOLD 12, TOUCH_THRESHOLD 44, ALIGN_TOL 100. 데모 내부는 스냅 제외 — `SNAP_IGNORE_SELECTOR = "[data-landing-demo], [role='dialog'], input, textarea, select, [contenteditable='true']"`. 키보드 PageDown/ArrowDown/Space(아래), PageUp/ArrowUp/Shift+Space(위). 모바일에서 푸터(`[data-business-info]`)가 보이면 CSS scroll-snap-type을 none으로 해제.
- **DemoShell**: `rounded-2xl border-blue-100 shadow-[0_30px_80px_-30px_rgba(59,130,246,0.25)]`, 배지 "Live Demo", 버튼 "처음부터" / "크게 보기", 푸터 "예시 지문으로 체험 중 — 내 교재는 가입 후 바로" / "내 자료로 직접 해보기". 크게 보기 = `fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm`, `--demo-h`를 `calc(100svh - 250px)`로 확대, Esc 복귀.
- **DemoGate**: 뷰포트 <1024px면 데모 청크를 아예 받지 않고 목업만, ≥1024px에서 IntersectionObserver rootMargin 600px로 근접 시 dynamic 마운트. 모바일은 "라이브 데모 체험하기" 버튼 → 풀스크린 시트(`fixed inset-0 z-[80] bg-slate-100`, `--demo-h = calc(100svh - 92px)`, history.pushState로 뒤로가기 닫힘).
- **[추론]** 데스크톱 실제 방문자가 보는 우측 화면은 위에서 해부한 목업이 아니라 라이브 데모 컴포넌트다. 목업(UploadMock/AnnotationMock/MainStage+SideTracker/HwpWindowMock)은 모바일과 로드 전 폴백 경로에서만 렌더된다 — 코드 주석이 이를 반복 명시.
- **[추론]** 시험지·리포트·웹툰 세 데모는 모두 "기본 = 맞춤(fit) 줌 → 사용자가 확대"라는 동일 리듬. 시험지는 contain 맞춤(폭·높이), 리포트·웹툰은 폭 맞춤.

---

## 3. 문항 유형 카탈로그

### 3-1. 정확한 카운트 (⚠ 표기 불일치 있음)

| 관측 지점 | 표기 | 내역 |
|---|---|---|
| 랜딩 카피·헤더 내비 | **25유형** | 객관식 14 + 서술형 8 + 어휘 3 |
| `QUESTION_TYPE_GROUPS`(생성 UI 단일 소스) | **25종 노출** | 동일 |
| `QUESTION_TYPE_UI` 레지스트리 | **26 엔트리** | 25 + 레거시 `TOPIC_MAIN_IDEA` "주제/요지" |
| 문제은행 유형 필터 카테고리 | **객관식 15 / 주관식·서술형 8 / 어휘 3** | 객관식에 레거시 포함 |
| `about` 페이지 · `llms.txt` ⚠ | **19유형** | 내역 미기재 |
| ir-deck S07 ⚠ | **23종** | "수능·모의 객관식 / 내신 서술형 / 어휘" 3그룹 나열 |
| 국어(KO) 레지스트리 | **38종** | 독서 8 + 문학 9 + 문법 8 + 화작·매체 10 + 서답형 3 |
| 생성 UI 총계(영어+국어) | **63종** | 25 + 38 |
| 학습(듀오링고형) 별도 카탈로그 | **23종** | 어휘 9 + 해석 5 + 문법 5 + 이해 4 |
| DB `Question.type` 열거 | **6종** | 객관식/단답형/서술형/빈칸 채우기/순서 배열/어휘 (생성 UI에서 고르는 것은 이 type이 아니라 subType) |

**덱 권고: 코드·랜딩과 일치하는 "25유형"(객관식 14 / 서술형 8 / 어휘 3)만 사용.** 19·23은 구 자료로 보이나 어느 쪽이 최신인지 커밋 이력으로 검증하지 않았다(§12).

### 3-2. 영어 25유형 전량 (라벨 자구 그대로)

**수능/모의고사 객관식 14**
빈칸 추론 / 어법 판단 / 네모 어법 / 어휘 적절성 / 글의 순서 / 문장 삽입 / 주제 추론 / 요지·주장 / 제목 추론 / 함축 의미 추론 / 지칭 추론 / 내용 일치 / 요약문 완성(객관식) / 무관한 문장
⚠ 그룹 라벨 표기 2종 병존: 워크벤치 `GROUP_LABELS`는 "수능·모의고사 객관식", 랜딩 칩 셀렉터/`QUESTION_TYPE_GROUPS`는 "수능/모의고사 객관식". 요지 유형도 "요지/주장"(랜딩·필터)과 "요지·주장"(설명문)이 병존.

**내신 서술형 8**
조건부 영작 / 문장 전환 / 핵심 표현 빈칸 / 요약문 완성 / 요약문 영작 / 배열 영작 / 주제문 영작 / 문법 오류 수정

**어휘 3**
문맥 속 의미 / 동의어 / 반의어

**레거시(생성 UI 비노출)**: `TOPIC_MAIN_IDEA` "주제/요지" — "기존 저장 문제 호환용 통합 유형입니다. 새 출제는 주제 추론 또는 요지/주장을 우선 사용합니다."

**대표 유형 설명(자구 그대로, 발췌)**
- 빈칸 추론 — "지문의 핵심 표현을 빈칸으로 비워 문맥 추론력을 묻습니다."
- 네모 어법 — "(A)(B)(C) 각 네모 안의 두 표현 중 어법에 맞는 것을 골라 조합하게 합니다."
- 요약문 완성(객관식) — "지문을 한 문장으로 요약한 영어 문장의 (A)(B)에 들어갈 말의 조합을 고르게 합니다."
- 요약문 영작 — "지문 요약문의 빈칸을 [보기]·해석·단서를 활용해 영어로 직접 영작하게 합니다. (배열 영작과 달리 한 빈칸에 다단어 어구 전체가 들어갑니다.)"
- 주제문 영작 — "글의 주제를 주제문(12~14단어) 또는 명사구(≤12단어)로 만들어 제시어 배열 또는 빈칸 완성으로 영작하게 합니다."

### 3-3. 유형 선택 UI 구조

- 체크박스 그리드가 아니라 **[카테고리 아코디언 카드 → 1열(모바일)/2열(lg) 타일 그리드 → 타일마다 −/숫자/+ 스테퍼]**.
- 카테고리 닷 색: 국어 `bg-indigo-400`, 수능 `bg-blue-400`, 내신 `bg-emerald-400`, 어휘 `bg-amber-400`.
- 타일 드래그 정렬(GripVertical) — 같은 카테고리 안에서만. localStorage 키 `smoat.workbench.questions.generate.typeOrder.v1`(국어는 `.ko` 접미), 접힘 상태 `...groupCollapsed.v1`.
- `+` 클릭 시 문항 수 증가와 동시에 세부설정 팝오버 자동 펼침(주석: "문항 수를 늘리면 세부 설정(난이도 등)을 바로 만질 수 있도록 토글을 자동으로 펼친다.").
- 세부설정 팝오버는 타일 바로 아래 폭까지 동일하게 붙는다(`align='start'`, `sideOffset=0`, `width: var(--radix-popover-trigger-width)`, 타일 `rounded-b-none`).
- 난이도는 전역이 아니라 **유형별**. 섹션 제목 "난이도 · 이 유형만", 기본과 다르면 타일에 컬러 닷 + 툴팁 "이 유형만 개별 난이도".
- 문장 부족 지문에서 문장삽입 타일 비활성 → 배지 "문장 부족", 툴팁 "이 지문은 문장이 적어 문장삽입에 적합하지 않아요 (최소 N문장 필요)."
- 포인트 지정 진입점 상주 → 툴팁 "포인트 짚어주기 — 지문에서 출제 포인트를 직접 지정", 지정 시 배지 "포인트 3".
- 생성 모드 세그먼트 → "유형 지정" / "세트 생성"(국어) 또는 "장문 세트"(영어, FEATURE_FLAG 필요).
- 요약 바 → "총 12문제 · 5개 유형" / "초기화", 미선택 시 "+ 를 눌러 문제 수를 더하세요."
- 생성 CTA 4상태 **[추론: 코드 인용이나 실제 렌더 스크린샷 미확인]** → "지문을 선택하세요" / "유형을 선택하세요" / "12문제 생성"(다지문이면 "3개 지문 × 12문제 생성") / "생성 중…"

### 3-4. 세트 프리셋

**영어 장문 세트 10종**: 독해 핵심 2문항 / 독해 종합 3문항 / 어휘·의미 세트 / 요약 독해 3문항 / 수능 43~45형 / 문장 삽입 3문항 / 구조 독해 고난도 / 빈칸 추론 3문항 / 어법 판단 3문항 / 어법 수정 3문항.
(예: "수능 43~45형 — 글의 순서 + 지칭 + 내용 일치 — 정통 장문 세트(긴 지문 전용).")

**국어 세트 3종**: "수능 독서 4문항" / "수능 문학 4문항" / "내신 혼합 4문항". ⚠ 국어는 대외비(§12).

### 3-5. 크레딧 단가(유형 기준)

유형별 차등이 아니라 2단: **어휘 3종(문맥 속 의미/동의어/반의어) = 1크레딧**, **그 외 전 유형 = 2크레딧**. 총액 = 선택 지문 수 × Σ(단가 × 문항 수).

---

## 4. 시험지 생성 & 내보내기(워드/한컴/PDF)

### 4-1. 포맷 3종 × 2모드 = 6 산출물

다운로드 드롭다운 항목 순서와 자구: **"PDF" / "PDF 해설" / "DOCX" / "DOCX 해설" / "HWPX" / "HWPX 해설"**.
배지: PDF에 "미리보기 그대로"(`bg-rose-50 text-rose-600`), HWPX 2항에 "beta"(indigo/violet).
포맷 키컬러: pdf `#DC2626`, docx `#2563EB`, hwpx `#0EA5E9`.

- **PDF = 서버 생성이 아니라 브라우저 `window.print()`**. 인쇄 시 `@page size:{w}mm {h}mm; margin:0` + 760px 모델을 물리 용지에 균일 배율(`printScale = widthMm × 96/25.4 / modelWidth`)로 `transform:scale`. → "미리보기 그대로" 배지의 근거.
- **DOCX/HWPX = 서버 API**: `/api/exams/{examId}/export-docx`, `/api/exams/{examId}/export-hwpx`, 해설 포함은 `?answers=true`, 캐시 무효화 `&t=Date.now()`.
- 파일명 규칙: `{시험제목}{_정답포함}.docx` / `.hwpx`.
- 내보내기 1회마다 `exam.printCount` +1, 관리자 타임라인에 `EXAM_EXPORT` 이벤트 기록.
- 휴지통 가드: `where: { question: { deletedAt: null } }` — 삭제 문항은 절대 포함되지 않음. `maxDuration = 300`초(수백~1000+ 문항 대응).
- 다운로드 실행 시 미저장/변경 상태면 자동 저장 후 링크 발사, 그 다음 편집 라우트 이동(다운로드 끊김 방지 순서).

### 4-2. A4 조판 물리 스펙

| 항목 | 값 |
|---|---|
| 페이지 | `aspectRatio: 210/297` (B4는 257/364), `shadow-xl ring-1` |
| 폰트 | `"Malgun Gothic Exam", "Malgun Gothic", "맑은 고딕", sans-serif` |
| 여백 | comfortable `px-[34px] py-[28px]` / compact `px-[28px] py-[24px]` |
| 본문 | `grid grid-cols-2 gap-8`, comfortable `text-[11.5px] leading-[1.58]` / compact `text-[10.5px] leading-[1.46]`, 각 단 `space-y-4` |
| 상수 | `PREVIEW_PAGE_WIDTH 760`, `TWO_COLUMN_GAP 32`, `GROUP_GAP 16`, `ITEM_GAP 12`, `A4_HEIGHT_RATIO 297/210` |
| 용지 | A4(210×297mm) / B4(257×364mm) |
| 1p 헤더 | 부제 `text-[9px] font-bold tracking-[0.18em] text-blue-700` + 제목 `text-[28px] font-black`, 우측 정보 컬럼 `w-[168px] text-[10px]` 3행 "학교 / 반 / 이름", `border-b pb-3` |
| 2p+ 헤더 | 슬림 — 제목 좌, "N / M" 우, `text-[10px]` |
| 푸터 | 가운데 정렬 10px, 형식 "- 1 / 4 -" |
| 문항 번호 | `mr-1.5 font-black`, comfortable 13px / compact 12px |
| 메타 배지 | `[3점 · 빈칸 추론]` (9px, showQuestionMeta 토글) |
| 선지 | `flex items-start gap-1.5`, 번호 `min-w-[18px] font-bold`, ①~⑤ |
| 답란 | `h-[12px] border-b` × answerSpaceLines |
| 분할 힌트 | "(지문 계속)" / "(3번 계속)" — 인쇄 시 `visibility:hidden`으로 글자만 숨기고 높이 유지 |

**미리보기 px → DOCX pt 환산식(코드 주석)**: `pt = px × (210/760) / (25.4/72) = px × 0.78325`, half-pt = `px × 1.5665`. SIZE_TITLE 44(22pt), SIZE_BODY 18(9pt), SIZE_QNUM 20(10pt), SIZE_META 14(7pt). 행간도 1.58/1.46으로 1:1.

**HWPX 전용 보정 파라미터**: `firstPageHeaderPx`(한컴 실제 헤더 렌더 높이 오버라이드), `contentSafetyPx`(한컴 렌더가 추정보다 클 때 안전 여백) — 한컴 조판 정합 튜닝 레이어가 별도 존재.

### 4-3. 템플릿 · 설정

**디자인 템플릿 8종**: 클린 내신형 / 모의고사형 / 워크시트형 / 미니멀 / 학원 브랜드형 / 모던 컬러형 / 클래식 원고형 / 컬러 밴드형. (예: clean = `bg-white text-slate-950 ring-slate-200` + `border-slate-900` 헤더선; classic = `bg-[#fffdf8] text-stone-950 ring-rose-200`; academy = 상단 `h-2 bg-indigo-700` 밴드; colorband = 좌측 `w-3 bg-cyan-500`.)

**설정 패널 섹션 라벨**: "템플릿 설정" / "용지 크기" / "단 구성" / "밀도" / "배점 설정" / "지문 스타일" / "디자인 템플릿" / "학원 로고" / "표시 옵션" / "저장된 설정".
- 단 구성 4버튼: "1단 / 2단 / 쪽당 1문제 / 쪽당 2문제"
- 밀도: "표준" / "압축"
- 배점: "현재 총점" / "100점 · 20문항" / "자동" / "수동" / "총점을 입력하면 문항 수가 바뀔 때마다 배점을 다시 나눕니다." / "자동 배점 사용 중 · 목표 총점 100점"
- 표시 옵션 토글: "지문 제목" / "문항 메타"
- 표지: "표지 페이지" / "클래식 / 밴드 / 미니멀" / "학원 로고 표시" / "학교·반·시험일 표시" / "제목·부제·라벨은 미리보기의 표지에서 직접 클릭해 수정해요."
- **[추론]** 지문 스타일은 타입상 boxed/plain/underlined 3종을 지원하지만 현재 UI에는 `['plain','본문']` 하나만 렌더된다 — 사용자가 고를 수 있는 건 "본문" 하나뿐.

### 4-4. 정답표 · 해설지

- **정답표는 시험지 맨 뒤 별도 페이지**로 분리. 제목 "정 답 표"(공백 포함, `tracking-[0.3em]`, 18px/compact 16px), 슬림 헤더 우측에 "정답표" 또는 "정답표 1 / 2".
- 2모드: 가장 긴 정답이 20자 초과면 전체 폭 목록, 아니면 **5열 그리드**(`gridAutoFlow:'column'`, `ANSWER_KEY_COLS=5`).
- **해설지는 별도 파일이 아니라 '해설 포함' 모드에서 각 문항 뒤 인라인 블록**(이때 정답표 제외). 블록 순서 고정: "정답" → "해설" → "핵심 포인트" → "오답 분석". 정답 배지 `rounded-sm border border-slate-400 bg-slate-50 px-2 py-1`, 선지 있으면 라벨 "정답", 없으면 "정답:".

### 4-5. 워크스페이스

- 화면 타이틀 → 신규 "시험지 생성" / "문제 은행에서 문제를 고르고 용지 미리보기에서 편집해 시험지를 저장합니다." · 편집 "시험지 수정" / "저장된 시험지를 불러와 용지 구성과 문항 배치를 다시 편집합니다."
- PC = 3분할 동시 편집(문제관리 | 미리보기 | 템플릿 설정), 좌우 패널 드래그 리사이즈·클릭 접기, 접힌 핸들에 세로쓰기 "문제관리", 툴팁 "드래그하여 폭 조절 · 클릭하여 닫기".
- 모바일 = 2스텝: "문제 선택" → "미리보기 · 저장". 하단 CTA "다음으로 (미리보기 · 저장)", 장바구니 바 "담긴 문제 3개" / "탭하여 담긴 문제 보기·빼기" / "문제를 눌러 시험지에 담아보세요".
- 미리보기 툴바: "A4 미리보기" / "저장 필요" / "되돌리기" / "앞으로 돌리기" / "인쇄" / "다운로드" / "태블릿 시험 배포"(국어는 비활성 + "국어 시험지는 곧 지원됩니다").
- 전체 비우기 확인 → "정말로 삭제하시겠습니까?" / "이 시험지의 모든 문항·블록이 삭제되고 처음부터 다시 시작합니다. 이 작업은 되돌릴 수 없습니다."
- 시험지 상세(관리) 화면 다운로드 라벨은 다름 → "시험지 다운로드" / "시험지 (문제만)" / "시험지 + 정답 해설".
- 미리보기 가상화: IntersectionObserver rootMargin `1200px 0px`, 초기 2페이지 eager, 한 번 마운트된 페이지는 언마운트하지 않음.
- 좌측 네비 파이프라인 4단계: "문제 생성 → 시험지 생성 → 학습지 생성 → 자료 추출", 각 항목 하위에 "생성"/"관리".
- 시험지 기본 제목: `새 시험지 {YYYY-MM-DD}`. 부제 기본값 "영어 내신 대비", 안내문 기본값 "다음 물음에 알맞은 답을 고르거나 조건에 맞게 서술하시오."

---

## 5. 학습지 & 웹툰

### 5-1. 학습지 — 2개 층

**(A) 인쇄 A4 학습지에 즉석 삽입하는 '학습 활동' 9종 (AI 0콜)**
카탈로그 4카테고리:
- 빈칸/복원(4): 키워드 빈칸 / 전지문 빈칸 / 중첩 라운드 빈칸 / 직독직해 빈칸
- 직독직해(3): 끊어읽기 + 영작 / 해석 쓰기 (영→한) / 백지 영작 (한→영)
- 어순/배열(2): 어순 배열 / 문장 순서 배열
- 어휘: 단어 시험지 컨트롤(모드 "꺼짐 / 뜻 쓰기 / 단어 쓰기 / 동의어 쓰기 / 반의어 쓰기")

설명 자구(발췌): 키워드 빈칸 — "밀도를 정해 핵심 단어를 빈칸으로 — 품사 타깃·첫글자 힌트·단어은행" / 중첩 라운드 빈칸 — "회차가 오를수록 빈칸이 늘어나는 점증 복원 — 한 블록에 통암기 계단" / 백지 영작 (한→영) — "한국어 해석만 보고 영어 문장을 백지에서 복원 — 1등급 핵심 드릴 (전지문 모드)".

핵심 카피(활동 팔레트 상단, 자구 그대로):
> "추출된 지문 데이터로 즉석 생성 · AI 없음 · 무제한 다시 섞기. 카드를 누르면 문서에 추가되고 바로 설정이 열려요."
> "학습지 생성 후, 편집기에서 카드를 눌러 원하는 만큼 추가하는 학습 활동입니다. / 추출된 지문 데이터로 즉석 생성 · AI 호출 없음 · 추가 비용 없음 · 무제한 다시 섞기"

미리보기 모달 탭 3개: "기본 학습지 ◈N" / "실전 학습지 포함 ◈N" / "학습 활동 9종 무료". 모달 부제 "실제 AI가 생성한 학습지 원본입니다 — 이 모습 그대로 만들어져요".

인쇄 지면 소단원(한글+영문 키커): Key Phrase Cloze / No Translation / 어법 선택 · 단어배열 영작(Workbook Drills) / 주요문장 단어배열 영작(Word Order) / Workbook Training / Grammar Choice / Vocabulary Choice / Vocabulary Cloze / Suneung Inference / 지문 논리 구조 분석(Logic Map) / 정답 및 해설(Answer Key) / 단어 목록.

**(B) 학생 폰에서 푸는 인터랙티브 '스터디 스테이지' 11종**
지문 통독 / 어휘 카드 / 어휘 시험 / 동의어·반의어 / 직독직해 / 어법 점검 / 빈칸 복원 / 어순 배열 / 해석 쓰기 / 백지 영작 / 실전 문제
(각 설명 예: 지문 통독 — "문장별 해석과 끊어읽기로 지문을 익힙니다")

**학습 모드 4단**: "원본만 / 가볍게 / 표준 / 최대". 도움말 자구 그대로:
> "원본만: 학생은 A4 학습지 지면만 열람하고 '다 확인했습니다'로 완료합니다. / 가볍게: 지문 통독 · 어휘 카드/시험 · 직독직해 · 빈칸 복원 · 실전 문제 — 핵심만 가볍게. / 표준: 어휘·직독직해·어법·빈칸·어순·해석 쓰기·실전 문제 — 표준 코스. / 최대: 표준 코스 + 백지 영작 · 고밀도 빈칸 — 통암기 최대 훈련."

`intense`(최대) 상한 예: vocabQuiz 40, clozeSentences 20, grammarItems 20. 스킬축 7종: 어휘 / 직독직해 / 어법 / 빈칸 / 어순 / 영작·해석 / 독해.

학습지 생성 크레딧 = **5크레딧**, 소요 안내 "생성에는 1~2분 정도 걸려요".

### 5-2. 웹툰

- **프로덕션 파이프라인 = 지문 1편 → 세로 9:16 이미지 "한 장"**. 프롬프트가 6~8컷 통합 배치를 명시 지시(자구 그대로):
  > "위 영어 지문의 내용과 흐름을 한 장의 세로형(9:16) 교육용 웹툰으로 그려줘. 한국 웹툰처럼 위에서 아래로 읽는 6~8컷을 한 이미지에 통합 배치한다. · 컷 사이는 여백이나 가는 구분선으로 자연스럽게 나누고, 인물의 표정·동작과 배경으로 지문의 핵심 사건이 한눈에 이해되도록 구성한다. · 글자는 또렷하고 읽기 쉽게, 철자 오류 없이 정확하게 쓴다. 말풍선/자막이 그림을 가리지 않도록 배치한다."
  즉 컷별 개별 이미지 생성/합성이 아니다.
- **화풍 5종**(코드 상수): "한국 웹툰 — 현대 한국 교육 웹툰 느낌" / "3D 애니 — 밝고 입체적인 애니메이션 스타일" / "수채 애니 — 따뜻한 손그림 애니메이션 분위기" / "로맨스 만화 — 섬세하고 부드러운 순정만화 톤" / "실사풍 — 영화적인 조명과 사실적인 표현"
  ⚠ 마케팅 페이지(`/features/passage-webtoon`)는 **"6가지 웹툰 그림 스타일"**(프렌치 신문 일러스트·인물 중심 판타지 포함)이라고 쓴다. 코드 상수는 5종이며 두 이름에 해당하는 id가 없다. **덱에서는 코드 기준 5종으로 쓰는 것이 안전.**
- **대사 언어 4종**: "한국어 (한국어 전용) — 대사·나레이션 모두 한국어" / "한+영 (한국어 + 영어 병기) — 영어 말풍선 + 한국어 번역 캡션" / "영어 (영어 전용) — 지문 원문 그대로 영어" / "영(대사)·한(설명) (대사 영어 + 해설 한국어) — 대사는 영어, 장면 설명·나레이션은 한국어"
- **모델 2티어**: STANDARD `google/nano-banana-2`(9:16, 2k, thinking high) **5크레딧** → "일반 — 빠르고 합리적인 품질 · 대부분의 지문에 적합" / PREMIUM `openai/gpt-image-2`(2160×3840, quality high) **10크레딧** → "프리미엄 — 가장 정교한 묘사 · 디테일이 중요할 때"
- 소요 안내 → "생성에는 약 3분 정도 걸려요. 시작한 뒤 다른 작업을 계속하셔도 완료되면 결과 목록에 표시됩니다." 서버 타임아웃 기본 420초(7분), 재시도 2회, 실패 시 크레딧 자동 환불 후 status=FAILED.
- 추가 지시 placeholder → "예: 주인공은 고등학생, 배경은 한국 학교, 명대사는 큰 말풍선으로 강조..."
- 결과는 **세로 스크롤 뷰어가 아니라 9:16 썸네일 카드 그리드**(모바일 1~2열 토글, lg 3/4/5열). 상태 필터 5칩 "전체 / 완료 / 생성 중 / 대기 / 실패". 카드 문구 "대기 중" / "이미지 생성 중" / "완료되면 자동으로 표시됩니다." / "크게 보기" / "자막 편집됨" / "검수완료" / "미검수" / "수정하기" / "다운로드" / "다시 시도" / "생성에 실패했습니다."
- 모바일 워크스페이스 4스텝: "지문 입력 → 내 지문함 → 워크스페이스 → 웹툰 확인"
- 국어 지문이면 프롬프트가 자동으로 "위 국어 지문" + 한국어 대사 지시로 강등(영어 경로 출력 byte 동일 보장).
- **실물 샘플 웹툰(직접 열람)**: `public/landing/demo/webtoon/gift-of-the-magi.webp` — 1440×2580px, 2열 메이슨리 총 9컷(좌 5 / 우 4), 굵은 검정 테두리 + 흰 말풍선(검정 외곽선, 볼드 영문) + 컷 하단 흰 여백에 괄호 한국어 해석 캡션, 세피아/베이지 수채 톤(1905년 실내). 소품에 벽시계·"DEC 24, 1905" 달력, 효과음 "흐...", "쿵", "흐윽".
  말풍선 예: "One dollar and eighty-seven cents. That was all." / 캡션 "(일 달러 팔십 칠 센트. 그게 전부였다.)"
- **모든 랜딩 데모가 공유하는 단일 지문 정본**: O. Henry "The Gift of the Magi, 1905" 첫 문단 전문("One dollar and eighty-seven cents. That was all. ... And the next day would be Christmas.").
- **⚠ 실험 파이프라인 구분 필수**: `.tmp-webtoon-*` 및 `src/lib/exam-passages/codex-native-webtoon.ts` 경로는 지문을 **12컷 스토리보드 JSON**(id/title/cast/cuts[{dir,nar,bub}])으로 먼저 분해한 뒤 이미지화한다(나레이션 40~58자, 말풍선 한글 18자 이내 0~2개, 영어 핵심구 인라인 코드스위칭). 프로덕션(6~8컷 한 장)과 **다른 경로**이므로 덱에서 섞어 말하면 사실 오류가 된다.
- 국어 지문 상세의 학습자료 패널은 "국어 분석 학습지" + "지문 웹툰" 2카드 그리드(⚠ 국어는 대외비, §12).

---

## 6. 학생 모바일/태블릿 학습 UI (시각 스펙)

**⚠ 학생 표면은 두 갈래로 병존한다.**
1. **`/g` "SMOAT 학습"** — Capacitor 네이티브 셸이 원격 로드하는 실제 배포 표면. 앱 식별자 `kr.co.smoat.student`, 앱 이름 "SMOAT 학습", 스플래시/배경 `#f6f5f1`. 원격 URL `https://www.smoat.co.kr/g`. **덱 재현 1순위.**
2. **`src/app/(student-app)`** — Duolingo형 게이미피케이션 표면(3탭, XP/스트릭/미션). 핵심 CSS 변수(`--key-learn`, `--base-bg`)와 유틸(`.card-3d`, `.btn-3d`, `marquee-loop`)이 코드베이스에 **정의되어 있지 않아** 시각 재현 시 색을 확정할 수 없다(§12).

### 6-1. `/g` 시각 규격

- 디자인 시스템 이름 "시험지 × 계기판", 라이트 고정(다크 토글 영향 배제). 팔레트는 §1 표.
- 타이포 rem 고정: 10/11/12/13/14/15/17/20/24px. 영어 지문만 세리프(Georgia/Times New Roman/Noto Serif), line-height 1.72, letter-spacing 0.001em.
- 터치 타깃: `.gd-btn` min-height 44px, radius 12px, 13px/600, `:active scale(0.98)`. `.gd-option` min-height 48px, border 1.5px. 정사각 옵션 44×44. `.gd-tile` min-height 44px.
- 카드 라운드: `.gd-card` 14px + 1px `--gd-line`. `.gd-block` 16px + padding 16px(태블릿 20/24px). 하단 시트 상단만 20px + `box-shadow 0 -12px 40px rgba(22,32,46,0.14)`.
- 진행 미터 `.gd-meter`: 높이 4px, pill, 트랙 `--gd-line`, 채움 `--gd-blue`(good 톤이면 `--gd-good`), width 전이 400ms `cubic-bezier(0.22,1,0.36,1)`.
- 선택지 상태는 `data-state`로만: selected(파랑 테두리+`#eef2fe`) / correct(초록+`#ecfdf5`) / wrong(자주+`#fff1f2`) / dim(opacity 0.55).
- 모션: 시트 `gd-slide-up` 220ms(translateY 24px→0), 백드롭 `gd-fade-in` 160ms, 판정배너 `gd-pop` 180~200ms(scale 0.94→1), 오답 `gd-shake` 240ms(±3px), 사이드시트 `gd-slide-in-right` 220ms. `prefers-reduced-motion`에서 전부 무효화.
- **태블릿(768px+) 확장**: `.gd-page` max-width 28rem → 44rem, `.gd-page-wide` 42rem → 60rem, 본문 15px → 17px, 레슨은 **2컬럼 그리드**(`minmax(0,1fr) + 15rem 사이드레일`, gap 1.5rem). **[추론]** 태블릿 목업은 좌 본문 / 우 사이드레일 2컬럼이 정확한 재현.
- viewport는 확대를 막지 않는다(maximumScale 5, userScalable true, viewportFit cover, themeColor `#f6f5f1`) — 저시력 접근성 때문에 의도적.

### 6-2. 셸 · 내비게이션

- 상단 헤더 높이 3.8125rem(61px) 고정, 배경 `rgba(246,245,241,0.92)` + blur(8px). 좌측 "SMOAT · {학원명}" / "{학생이름}님"(홈에서는 이름 행 숨김), 우측 방패(상태창)·햄버거 각 40×40.
- **하단 4탭**: "홈 / 학습 / 과제 / 내 기록" → `/g/home`, `/g/track/grammar`, `/g/tasks`, `/g/me`. 아이콘 House / BookOpen / ClipboardList / BarChart3(활성 strokeWidth 2, 비활성 1.75). 라벨 10px/600, 기본 `--gd-ink-3`, 활성 `--gd-blue`. 배경 `rgba(255,255,255,0.96)` + blur(8px), 상단 1px `--gd-line`, z-index 35. 과제 배지 16×16 원형 `--gd-bad`, 9 초과 시 "9+".
- 햄버거 사이드시트(폭 `min(19rem, 84vw)`): "오늘 질문 3회 남았습니다" / 4탭 / "취약 단어장" / "로그아웃"(`--gd-bad`).
- 로그인: 학원코드 4자 + 학생코드 6자 원스크린 → "SMOAT 학습" / "스모트 모바일 학습 — 과제 · 시험 · 어법 훈련" / "학원코드" (예: A1B2) / "학생코드" (예: X7K2M9) / "학습 시작" / "확인 중…" / "코드는 담당 선생님께 받을 수 있습니다." / 오류 "학원코드 또는 학생코드가 올바르지 않습니다."
- 오프라인 폴백(`mobile/www/offline.html`) → "연결이 필요합니다" / "스모트 학습은 인터넷에 연결된 상태에서 이용할 수 있습니다. 네트워크를 확인한 뒤 다시 시도해 주십시오." / "다시 시도" / "연결되면 자동으로 다시 시도합니다."

### 6-3. 과제 목록 (`/g/tasks`)

- 타이틀 "과제", 부제 "오늘 마감 2건 · 이번 주 5건"(로딩 중 "선생님이 배포한 과제를 확인합니다").
- 필터 세그먼트 "해야 할 과제" / "완료". 그룹 헤더 "기한 지남"(`--gd-bad`) / "오늘 마감" / "이번 주" / "나중에 · 마감 없음".
- kind 칩 4종: 시험(`--gd-blue-soft`/`--gd-blue`, FileText) / 학습지(`#f1f5f9`/`#475569`, BookOpenCheck) / 문제 세트(`#eef2ff`/`#4338ca`, ListChecks) / 어법 훈련(`--gd-good-soft`/`--gd-good`, SpellCheck).
- 상태 칩 3종: "대기" / "진행 중" / "완료".
- D-day 규칙: 0 → "D-DAY", 양수 "D-N", 음수 "D+N", null "마감 없음". 24시간 이내면 60초 틱 카운트다운 "4시간 32분 남음" / "38분 전 마감".
- 안내 → "제출 완료 — 결과는 선생님 확인 후 공개됩니다" / "아직 열리지 않은 과제입니다. 시작일이 되면 풀 수 있습니다."
- 기한 배너 → "기한이 지난 과제가 2건 있습니다"(rose) / "오늘 마감 과제가 3건 있습니다"(blue).
- 빈 상태 → "모든 과제를 마쳤습니다. 훌륭합니다." / "지금 해야 할 과제가 없습니다. 훈련 탭에서 자유 학습을 이어가 보세요." / "아직 완료한 과제가 없습니다."

### 6-4. 문항 플레이어 (`/g/q/[taskId]`)

- `h-dvh` 3단: 헤더(뒤로 40×40 + 제목 + "응답 7/12" + 4px 진행바) / 스크롤 본문 / 하단바. 컨테이너 `max-w-2xl`.
- 문항 카드: 번호 배지 `h-8 min-w-8` 원형 `--gd-blue` 흰 글씨 + "3점"(mono 11px) + "다시 보기" 플래그(활성 `border #c4b5fd / bg #f5f3ff / text·fill #7c3aed`).
- 응답 위젯은 시험지 정본 컴포넌트 재사용 — 선지 행 `rounded-xl px-4 py-3 min-h-11`, 선택 시 border/bg 모두 `#3182F6` + 흰 글씨, 미선택 `border #E5E8EB / bg white / text #191F28`. 라벨은 위치 기반 원형숫자. 헤더 "답안 입력", 다중정답 "정답 2개를 고르세요" / "현재 1/2".
- 서답형: 자동 확장 textarea(autocomplete/autocorrect/spellcheck off, maxLength 4000), focus 250ms 후 `scrollIntoView(block:center)`로 가상 키보드 가림 방지. 수동 채점 안내 "이 문항은 선생님이 직접 채점합니다. 답안을 자유롭게 작성해 주세요."
- 본문 하단 h-10 페이드 `linear-gradient(to top, var(--gd-paper), rgba(246,245,241,0))`.
- 하단 번호 점프 스트립: 버튼 `h-10 w-9 rounded-lg`, 현재 = `--gd-blue` 테두리 + `--gd-blue-soft` 배경, 응답 완료 = 하단 1×1 `--gd-blue` 도트, 플래그 = 우상단 1×1 violet-500 도트.
- 버튼: "이전"(flex 1) / "다음"·"제출하기"(flex 1.4, 전 문항 응답 시에만 활성) / "제출 중…". 안내 "아래에서 답을 선택합니다" / "표시한 문항 3개가 있습니다. 제출 전에 다시 확인해 보세요." / "모든 문항에 답하면 제출할 수 있습니다. (남은 문항 2개)"
- 제출 시트 → "제출 전 마지막 확인" / "총 12문항 중 12문항에 답했습니다." / "다시 보기로 표시한 문항 3개가 있습니다." / "제출하면 답을 수정할 수 없습니다." / "다시 확인" / "최종 제출". 미응답은 "—", 서답형은 "입력함"으로 에코.

### 6-5. 채점 결과 화면

- 판정 4종: CORRECT "정답"(`--gd-good`/`--gd-good-soft`/`#a7f3d0`) / WRONG "오답"(`--gd-bad`/`--gd-bad-soft`/`#fecdd3`) / PARTIAL "부분 정답"(`--gd-blue`/`--gd-blue-soft`/`--gd-blue-line`) / NEEDS_REVIEW "확인 중"(`--gd-ink-2`/`--gd-paper`/`--gd-line-strong`).
- 점수 카드: `gd-pop` 진입, 점수 mono `text-5xl` bold, **400ms easeOutCubic rAF 카운트업**(reduced-motion이면 즉시 확정). 만점이면 `--gd-good` + "만점입니다". w-44 정답률 미터 + 통계 그리드("정답 n/N", "오답", "부분 정답", "확인 중").
- 서술형 안내 → "서술형 답안 2문항은 선생님이 확인한 뒤 점수에 반영합니다."
- 문항별 판정 그리드 `grid-cols-5 gap-1.5`, 타일 `h-9 rounded-lg`, 펼친 타일은 `inset 0 0 0 1.5px` 링. 탭 → 아코디언으로 문항 본문 + 내 응답 에코. **정답 텍스트·해설은 서버가 내려주지 않으며 화면도 표시하지 않는다.**
- 헤더 → "문항별 결과" / "번호를 누르면 문항과 제출한 답을 확인할 수 있습니다."
- 오답 복기 → 필터 "전체 12 / 오답 3 / 확인 중 2" + "오답 차례로 보기" + "이전 오답" / "다음 오답" + "과제 목록으로"

### 6-6. 학습지 허브 (`/g/w/[taskId]`)

- 구성: 헤더("학습지" + 제목 + D-day) / 파랑 안내 밴드("선생님 안내", 40자↑면 1줄 클램프 + 토글) / 진행 히어로("진행 상황", "3/5 단계 완료", "숙달도 72%", 미터, CTA) / 스테이지 리스트 / 하단 유틸 2버튼.
- CTA → "학습 시작하기" / "이어서 학습하기" / "결과 리포트 보기". 유틸 → "원본 학습지 보기" / "결과 리포트". 안내 "필수 단계를 모두 완료하면 과제가 자동으로 완료됩니다". legacy 완료 버튼 "다 확인했습니다" → "확인 완료".
- 스테이지 행: 좌 1.75rem 원형 번호(완료 `--gd-good-soft`/`--gd-good`, 그 외 `--gd-blue-soft`/`--gd-blue`), 메타 "8문항 · 12분", 우측 점수 pill 또는 CheckCircle2 또는 "진행 중" 칩.
- **원본 뷰어**: 디렉터와 동일한 A4 고정폭(210mm@96dpi = **793.7px**) 렌더러를 읽기 전용 재사용. 리플로우 없이 CSS zoom 변수 `--gw-zoom` 하나로만 스케일. 핀치줌·더블탭 1x~3x(step 0.25).

### 6-7. 스테이지 플레이어 문항 지시문(자구 그대로)

"빈칸에 알맞은 단어를 채우세요" / "이 문장이 어법상 맞는지 판단하세요" / "어법상 알맞은 표현을 고르세요" / "짝이 되는 것끼리 연결하세요" / "알맞은 것을 고르세요" / "조각을 순서대로 탭해 문장을 완성하세요" / "글의 흐름에 맞는 순서로 카드를 탭하세요" / "우리말로 해석해 보세요" / "우리말을 보고 영어 문장을 완성하세요" / "글의 핵심 한 줄"

판정/완료 → "정답입니다!" / "이 문항은 마지막에 다시 나옵니다" / "정답을 확인해 두세요" / "문제를 풀면 바로 채점됩니다" / "틀린 문항 다시 풀기" / "마치기" / "{stage.title} 완료" / "첫 시도 11 / 12 · 약 7분" / "전부 맞혔습니다. 훌륭합니다!" / "모든 필수 단계를 마쳐 과제가 완료 처리되었습니다" / "다음 단계로" / "학습 홈으로" / "학습을 잠시 멈출까요?" / "지금까지 푼 내용은 저장됩니다. 언제든 이어서 할 수 있습니다."

빈칸 위젯: 인라인 버튼 `min-width 52px, min-height 44px, radius 8px, border 2px`. 활성 `border/text #1d4ed8 + bg #eef2fe`, 채워짐 `bg #eef2fe`, 채점 정답 `border #047857 / bg #ecfdf5`, 오답 `border #be123c / bg #fff1f2`. 단어은행 칩 탭 → 활성 빈칸 순차 삽입, 채워진 빈칸 재탭 → 비움.

### 6-8. `/g` 홈

- 최상단은 CTA 하나 — "오늘의 한 수"(`data-tone="accent"`: `--gd-blue-soft` 배경 + `--gd-blue-line` 테두리). 라벨/한 줄 지시/대상/근거/전폭 CTA.
- 이하 순서: 3칸 계기판("오늘 푼 문항" / "오늘 정답률" / "연속 학습") → 주간 7도트("주간 학습 리듬" / "이번 주 4일 학습") → "오늘 할 일" + "전체 보기 →" → "학습 트랙" 4장 → "빠른 훈련" 3버튼("오늘의 드릴" / "오답 복습" / "내 기록") → "지금 가장 약한 개념" + "집중 드릴".
- 주간 도트 2.5×2.5, 활성 `--gd-blue`, 비활성 `--gd-line`, 오늘만 `box-shadow 0 0 0 2px var(--gd-card), 0 0 0 3.5px var(--gd-blue-line)`.
- 넛지 → "오늘 1문항만 풀어도 연속 5일이 이어집니다" / 새 결과 행 "시험 결과가 공개되었습니다 — {제목}"(h-2 w-2 `--gd-blue` animate-pulse 도트) / 푸터 "{학원명} · 총 1,240문항 풀이 · 오늘 질문 3회 남았습니다"
- **학습 트랙 4종**: 어법(LIVE) "문장을 판별하는 눈 — 기초 골격부터 수능 판별까지" / 듣기(준비 중) "들리는 대로가 아니라 구조로 듣습니다" / 어휘(준비 중) "외운 단어가 문장 속에서 살아나게" / 내신(준비 중) "내 학교, 내 시험 범위에 맞춘 대비". 카드 min-height 8.5rem, 우상단 "학습 중" / "준비 중" 칩, 준비 중 카드 하단 "준비 중인 내용 보기".

### 6-9. (student-app) 게이미피케이션 표면 (참고)

- 하단 3탭 "학습 / 홈 / 마이", 좌우 스와이프 전환(가로 60px 초과 && |dx|>|dy|), 가로 스크롤 요소 내부에서는 차단.
- 마퀴 30초 무한 루프 → "오늘도 한 걸음 더! 꾸준함이 실력이 됩니다 💪 ✦ 🔥 30일 연속 학습 달성하면 문화상품권 1만원! ✦ 상위 1%는 매일 학습합니다. 오늘도 시작해볼까요? ✦ 미션 달성하면 XP 배율 보너스! ✨ ✦ 어제보다 1문제 더! 작은 차이가 큰 변화를 만듭니다 ✦ 매일 3분 투자로 영어 실력이 달라집니다"
- 세션 피드백 리터럴 색: 정답 배경 `#D7FFB8` + 아이콘 `#58CC02`, 오답 배경 `#FFDFE0` + 아이콘 `#FF4B4B`. 계속 버튼 배경 동일. 문구 "정답!" / "오답" / "정답: ③. {선지}" / "계속" / "제출 중...".
- 문항 전환 framer-motion x축 슬라이드(x 30 → 0 → -30, 0.2s), 진행바 width 0.6s easeOut.
- 이탈 모달 → "세션을 중단할까요?" / "진행 상황이 저장되지 않습니다." / "계속하기" / "나가기"
- 결과 화면 → "훌륭해요!"(80↑) / "잘했어요!"(50↑) / "괜찮아요!" / "학습이 저장됐어요"(결과 비공개) / "8/10 문제 정답" / "오늘의 미션" / "미션 달성!" / "오답 유형 (3개)" / "레슨으로 돌아가기" / "학습 홈"
- 학습 탭 pill 토글 "내신집중" / "수능링고"(준비 중 — "수능/모의고사 기출 지문으로 학습하는 기능이 곧 추가됩니다")
- 레슨 4카테고리 색: 어휘 emerald / 해석 blue / 문법 purple / 이해 amber. 총 진행 "n/21", 마스터리 통과 시 Crown.
- **학생 표면에 웹툰 뷰어는 존재하지 않는다** — `/g`·`(student-app)` 전수 grep 결과 '웹툰' 0건(§12).

---

## 7. 리포트 & 취약점 분석 & 과제 재배포 루프

전체 루프: **채점 → AI 0콜 취약점 분해 → AI 상담 리포트 문서 → 취약 셀 클릭 → 그 범위로 과제 컴포저 → 배포 → 반 단위 문항 통계**.

### 7-1. AI 상담 리포트 문서 — 9섹션 고정

| # | heading | kicker |
|---|---|---|
| 01 | "성적 개요" | SCORE OVERVIEW |
| 02 | "유형별 성취도" | TYPE PERFORMANCE |
| 03 | "난이도별 결과" | DIFFICULTY MATRIX |
| 04 | "함정 분석" | TRAP ANALYSIS |
| 05 | "오답 심층 분석" | WRONG ANSWER DEEP DIVE |
| 06 | "개념 지도" | CONCEPT MAP |
| 07 | "강점과 보완점" | STRENGTHS & GAPS |
| 08 | "학습 계획" | STUDY PLAN |
| 09 | "선생님 총평" | TEACHER'S NOTE |

⚠ 랜딩 데모 fixture(`exam-report.ts`)의 섹션 heading은 미묘하게 다르다: "성적 개요 / 유형별 성취 / 난이도별 정오표 / 함정 선지 분석 / 오답 심층 분석 / 개념 지도 / 강점과 약점 / 3주 학습 계획 / 선생님 한마디". 덱에서는 어느 쪽을 쓰든 출처를 섞지 말 것.

- 문서 루트 880px 단일 컬럼, 섹션 번호는 CSS counter(`decimal-leading-zero`) → DOM 순서 = 번호. 색은 전부 `--rpt-*` 변수로만 주입되어 **테마 교체 = 변수 교체**.
- 섹션 헤더 문법: 메타 라인 `01 / SCORE OVERVIEW` → 헤딩 21px(≥640px 24px) → `mt-3` 1px 헤어라인 위 좌측 32px만 2px primary 세그먼트.
- 커버 3종(gradient-band / minimal-line / photo-frame). 공통 킥커 "EXAM ANALYSIS REPORT", 메타 라벨 "STUDENT / EXAM / ACADEMY / ISSUED". gradient-band 배경 `linear-gradient(150deg, var(--rpt-primary), color-mix(in srgb, var(--rpt-primary) 58%, black))`, 타이틀 34px → 52px extrabold.
- **모션 규약**: ease `cubic-bezier(0.22,1,0.36,1)`, `data-reveal` opacity 0/translateY(14px) → 600ms, 가로바 width 900ms(delay 150ms), SVG 원호 stroke-dasharray 900ms, 폴리곤 scale(0.72)→1 700ms. IntersectionObserver threshold 0.15로 섹션당 1회. CountUp 900ms easeOutCubic. 인쇄·reduced-motion에서 전부 즉시 최종값.
  ⚠ 학생앱 결과 화면 CountUp은 400ms(§6-5) — 다른 시스템이다.
- **프롬프트 강제 조항**: 각 내러티브(scoreOverview~studyPlan 8개)마다 **문항 번호를 최소 4개 실명 인용**(형식 "12번(빈칸추론)", "서답형 2"). "꾸준히 노력하면"·"기본기를 다지면" 같은 상투구 금지.

**섹션별 시각 문법 요약**
- 성적 개요: "Total Score" 킥커 + 총점 56/68px extrabold CountUp + "/ 만점" / 정답률 26px + 드로우온 바 / 보조 스탯 / 정오 분해 칩(✓정답·✗오답·△부분··미입력). 반평균 카드 "Class Average" + "내 점수"/"반평균" 2행 바 + "반평균 대비 +8점"(0이면 "반평균과 동일"). 하단 "한 줄 진단" 인용 카드(배경 `--rpt-tint`, 좌측 3px primary 바, 16px semibold 1.7). 각주 "※ 미입력 3문항은 채점에서 제외하고 정답률을 계산했습니다."
- 유형별 성취: **회계 원장** — 컬럼 "실점 유형 N | 정오 | 정답률 | 실점", 실점 상위 2개에 "실점 1위"/"실점 2위" rose 배지, "합계" 행 위 `border-top: 3px double var(--rpt-neutral)` 마감 이중선. 만점 유형은 "정복한 유형 4 — 출제 문항 전부 정답" 점선 리더로 접고, 미채점은 "채점 대기 N" 칩. 우측 레이더(유형 6개 이상일 때만, 최대 8축, 격자 4겹, 값 폴리곤 fillOpacity 0.16 + stroke 1.8px) 캡션 "유형 정답률 균형 · 실점 유형 우선 8개 표시".
- 난이도별 결과: 3악장 — ① 난이도 1~5 스탯 밴드(≥640px 5칸 타일 / <640px 풀폭 5행) ② **"문항 흐름 — 출제 순서"** 매트릭스(도트 = 상태색 + 번호 + 기호, 아래 난이도 5눈금 틱, 배점 4점↑는 이중 링 `0 0 0 2px surface, 0 0 0 3.5px neutral`) ③ 시그널 2카드 — "아까운 실점"(RECOVERABLE POINTS, "−9점") / "상위권 시그널"(TOP-TIER SIGNAL, "+12점").
  캡션 자구: "난이도 1~2 문항에서의 오답 — 실력보다 절차의 문제일 확률이 높고, 가장 빨리 회수할 수 있는 점수입니다." / "난이도 4~5 문항에서의 정답 — 상위권을 가르는 변별 구간에서 이미 득점하고 있다는 근거입니다."
- 함정 분석: 학생이 실제 고른 선지가 주인공 — 번호 칩 + "선택" + ①~⑤ 20px bold `--rpt-bad` + "▲ 설계된 함정" 또는 "· 일반 오답". TrapMeter 3세그먼트 "좋음 / 보통 / 주의" + ▲ 마커, 근거 "오답 9건 중 6건 설계 함정 적중". **표본 3건 미만이면 게이지를 그리지 않고 "판정 보류"로 강등** → "선지 기록이 남은 오답이 2건뿐이라 성향 판정을 보류했습니다 — 판정에는 3건 이상의 표본이 필요합니다."
- 오답 심층 분석: 임상 기록 카드 — 헤더(번호 칩 + 유형 + 개념 태그 4개 캡 "외 N") / 본문 "무엇이 일어났나"(관찰) → "이렇게 고친다"(처방, 좌측 2px primary 보더, `mt-auto` 바닥 앵커). 9문항 이상이면 앞 6개만 풀 카드 + "나머지 N문항 — 교정 포인트 요약" 다이제스트. 빈 상태 "이번 시험에는 심층 분석이 필요한 오답이 없습니다."
- 개념 지도: 좌 "△ 보완이 필요한 개념" + "우선 보강 1순위" 하이라이트(테두리·배경 color-mix로 bad 30%/6%) + 상세 최대 6 + "그 외 보완 개념 N개" 칩 / 우 "✓ 탄탄한 개념"은 칩 구름 24개 캡 + "외 N개 개념". 개념 옆 번호 칩("12번")이 근거.
- 강점/보완점: 2컬럼 극성 카드, 카드 상단 2px 룰(강점 ok / 보완점 bad) + ✓/△ 배지 + "N항목". 8개 초과 시 카드 내부 384px 스크롤(인쇄 전량 확장).
- 학습 계획: 좌측 2px 레일 타임라인 + 주차 번호 배지(01, 02…) + 마지막 주 "마무리 재점검" + 레일 종지부 ◆. 태스크에 **인쇄 후 손으로 체크하는 15px 빈 체크박스**.
- 선생님 총평: 서명형 편지 — 64px 인용부호 + 본문 15.5px/1.9 + 헤어라인 + "From" + "{학원명} 담당 선생님" + 작성일. 빈 상태 "총평이 아직 작성되지 않았습니다."

**랜딩 데모 fixture 실데이터(LANDING_EXAM_REPORT)**: 20문항 100점 만점, 82점(정답 16·정답률 80%), 반평균 74점, 오답 4문항(9·12·18·20번), 실점 18점. 커버 "학생 시험 분석 리포트" / "3월 학력평가 대비 · 유형별 성취 분석과 다음 3주 학습 처방" / "김민준" / "3월 학력평가 대비 모의고사 · 영어" / "SMOAT 영어학원" / "2026년 3월". themeId `indigo-consult`, cover `gradient-band`.
한 줄 진단 예: "반평균을 8점 앞선 82점, 정답률 80%로 상위권 진입 문턱에 선 시험입니다."
유형별 6행: 내용 일치 4/4 · 주제 추론 3/3 · 제목 추론 2/3 · 어법 2/3 · 순서 배열 3/3 · **빈칸 추론 2/4(24점 중 14점 실점, 최대 실점 유형)**.
난이도 정오표: easyMistakes ['12'], hardWins ['16','17','19'].
함정: 18번(③), 20번(②) 설계된 함정 / 9번(④) 함정 아님, trapSusceptibility 'MID'.
선생님 한마디 발췌: "민준아, 이번 시험에서 가장 반가웠던 건 82점이라는 숫자보다 네가 가장 어려운 17번 빈칸을 끝까지 붙들어 맞혀냈다는 사실이야."

### 7-2. 분석 탭 — AI 0콜

구성: ① 응시 메타 + 점수 히어로 ② 취약 하이라이트 ③ 다차원 취약점 분해 ④ 문항별 결과 그리드 ⑤ AI 상담 리포트 게이트웨이.

- 히어로 타임라인 라벨 "배포 / 응시 시작 / 제출 / 소요 시간 / 마감", 초과 시 rose "기한 지남". 상단 배지 "자체 시험지 응시" / "자체 시험지 · 수동 등록" / "외부 시험 분석", "OMR 입력" / "태블릿 응시", "채점 확정" / "채점 미확정" + 안내 "아래 분석은 현재 입력된 정오 기준입니다. 채점을 확정하면 결과가 고정됩니다."
- 정답률 = 92px SVG 링 게이지(stroke 9, track slate-100, progress blue-600, rotate −90) + 중앙 17px extrabold %.
- 취약 하이라이트 3카드: "가장 취약한 유형" / "가장 취약한 지문" / "보강할 개념" (각 rose 정답률 + h-1.5 3색 스택바 + 오답 번호 칩 6개 +N).
- **취약점 분해** = 4차원 탭("유형별 / 난이도별 / 지문별 / 개념별") × 3정렬("취약순 / 오답순 / 문항순") + 필터(항목 멀티셀렉트, "문항 표시" 정오 4토글, "오답 있는 유형만", "초기화"). 헤더 "취약점 분해" / "차원별 정답률 — 문항 번호를 누르면 원본 문항이 열립니다." / 주석 "지문 분석은 원본 문항이 있는 시험지에서만 제공됩니다."
- 버킷 행: 접힘 = 라벨 + 정답률 + N/M + "N문항 M점" + 50% 미만 시 rose "주의" 배지 + h-2 4색 스택바(emerald 정답 / blue 부분 / rose 오답 / slate-300 미상) + 문항 칩. 펼침 = (지문별이면 지문 발췌 line-clamp-4 mono) + 문항별 미니 행(상태 기호 → 번호 → 유형 → "학생답 → 정답" → "획득/배점점").
- 문항 상세 모달: 좌 = 원본 문항(시험지 생성과 동일한 QuestionCard 렌더러, 지문 포함) / 우 = 3카드 "채점"(학생 답 → 정답 → 판정 → 배점) · "해설" · "출제 분석"(출제 의도 / 출제 포인트 / 접근 전략 / 난이도 근거 / 핵심 개념 / 오답 함정). ←/→ 전 문항 이동, ESC 닫힘, Tab 포커스 트랩. 제약 "원본 문항 미리보기는 서비스에서 생성·배포한 시험지에서만 제공됩니다."
- 리포트 게이트웨이 → "AI 상담 리포트" / "이 분석 데이터를 바탕으로 학부모 공유용 상담 리포트를 생성합니다." / "AI 리포트 만들기"(CreditCostChip 동반) / "리포트 열기" / "생성 진행 중 — 보기" / "채점을 확정하면 생성할 수 있습니다." / 배지 "리포트 완성" / "공유 중" / "직전 생성 실패 · 크레딧 자동 환불".
- 생성 폼: "반 평균 (선택)"(예: 72), "등급/석차 (선택)"(예: 3등급) + **데이터 밀도 3단**: "정오만 — 정오 데이터로 리포트를 생성합니다. 오답 선지·반평균을 더하면 정밀해집니다." / "선지 포함 — 오답 선지가 포함돼 함정 분석이 가능합니다." / "정밀 — 충분한 정보로 정밀한 상담 리포트를 생성합니다."

### 7-3. 히트맵 → 원클릭 재배포 (루프의 클라이맥스)

- 학생 허브 시험 탭 "유형별 정답률" 히트맵: 행 유형 × 열 회차. **5단 색**: ≥80 `bg-emerald-600` 흰 글씨 / ≥60 `bg-emerald-400` 흰 글씨 / ≥40 `bg-emerald-200` `text-emerald-900` / ≥20 `bg-rose-200` `text-rose-900` / <20 `bg-rose-400` 흰 글씨 / 기록 없음 `bg-slate-100` `text-slate-400`. 규약 "낮을수록 붉다"(3탭 공통), 주황/앰버 금지. 툴바 "기록 없음" / "낮음 … 높음" / ⓘ "정답률은 맞고 틀림만 세는 단순 비율이에요".
- 셀 클릭 → `fixed` 팝오버(w-64): 유형명 + "정답률 33% (3/9) · 전체 회차 합산" + 회차 문맥 + 하단 CTA **"이 범위로 과제 보내기"**. 역매핑 실패 시 비활성 + 사유 "연결된 어법 훈련 개념이 없어 바로 보낼 수 없어요".
- 재배포 CTA 워딩 사전(단일 소스 `director-glossary.ts`): "과제 보내기" / "이 범위로 과제 보내기" / "다시 보내기" / "이 학습지 다시 보내기" / "미완료 학생에게 다시 보내기" / "빠르게 다시 보내기" / "보내기 화면에서 편집" / "보충 과제 보내기" / "이 개념으로 과제 보내기" / "복습 과제 보내기".
- 프리셋 매핑: GRAMMAR → conceptIds 합집합 + weakConcepts, QUESTIONS → subTypes 프리필터로 문제 피커 자동 필터, WORKSHEET → 같은 학습지 content 고정. 모든 경로에 `analysisSeed` 동반.
- **컴포저 분석 컨텍스트 스트립**(h-40px, `bg-blue-50/30`): "{학생명} · {취약 라벨} {지표 설명} · 마지막 오답 7/19 외 2개" + "이미 나간 관련 과제 3건" 칩 + "자세히" 토글(펼치면 "개념별 점수" + "최근 오답" 2컬럼). 관련 과제 0건이면 "이 개념으로 나간 과제는 아직 없습니다 — 첫 보충 과제예요". 로딩 "분석 기록을 불러오는 중…".
- **과제 컴포저 = 와이드 모달 3패널 위저드**: "① 누구에게" / "② 무엇을 · 언제까지" / "③ 실물 확인"(어법이면 "③ 출제 범위"). 미충족 패널에 rose 도트 + "필요한 입력이 남았습니다". 푸터 가이드 "① 왼쪽에서 받을 학생을 선택해 주세요" / "② 과제 종류를 선택해 주세요" / "② 배포할 콘텐츠를 선택해 주세요" / "② 보낼 문제를 선택해 주세요".
- ③ 패널은 **배포 전 실물 미리보기 강제**(주석: "실물 확인 없이는 배포 결정을 내리게 하지 않는다(전수검사 계약)"). 빈 상태 "가운데 목록에서 배포할 콘텐츠를 선택하면 문항·지면 실물이 여기에 표시됩니다." / "과제 종류를 선택하면 배포할 콘텐츠의 실물을 여기에서 확인할 수 있습니다."
- 확정 → "과제 보내기" / "보내는 중…" / 마감 미설정 시 "마감일이 없어요 — 마감 없이 보내려면 그대로 누르세요" / 성공 토스트 "12명에게 과제를 보냈습니다." (+ " (이미 제출한 3명은 기존 기록 유지)") / 닫기 가드 "닫으면 입력한 내용이 사라집니다."
- 어법 패널: "보충이 필요한 개념 (자동 추천)" + "모두 적용", 각 행에 숙달도 바 + 근거 "숙달도 27점 · 12회 시도 중 8회 오답"(점수 단독 노출 금지 규칙). 헤더 "출제 범위 구성 — 선택한 조건으로 학생마다 보충 필요 우선 문항이 자동 편성됩니다".

### 7-4. 배포 후 반 단위 집계

- **문항 통계 탭**: "취약 문항 순 · 제출 12명 기준", 행마다 번호 칩 + 발문 1줄 + h-1.5 정답률 바(3단: <50 rose-500, <80 blue-600, ≥80 emerald-500) + "4/12명 정답" + violet "확인 필요 3" + 오답 선지 분포 칩 상위 4개("② 5명"). **15초 자동 폴링** ("15초마다 자동 갱신"). 빈 상태 "아직 제출한 답안이 없습니다. 학생이 제출하면 문항별 정답률이 집계됩니다."
- **학습 현황 탭**(학습지): 학생×스테이지 진행 매트릭스 + 반 집계 4카드 "단계별 평균 점수 — 완주 학생 기준" / "최다 오답 문장 — 첫 시도 기준 상위 5" / "최다 오답 단어 — 상위 10" / "어법 포인트 오답률 — 출제 코드 전체". 헤더 "실시간 학습 현황" / "학습 시작 12명 · 완료 단계의 숫자는 첫 시도 정답률(%) · 진행 n/m 은 푼 문항/전체 · 학생 이름을 누르면 취약 단어를 볼 수 있습니다". 최근 3분 내 활동 학생은 animate-ping 라이브 도트.
- 학생 허브 시험 탭: 스코프 칩("전체 / 배포 시험 / 내신 분석") + KPI 3타일("총 응시" / "평균 점수율" / "추세" — 오름 emerald / 유지 slate / 내림 rose, "최근 3회 점수율 기준", "점수 확정 응시가 2회 이상 필요합니다"). 폴링 60초.
- 점수율 추이 = recharts LineChart, stroke `#2563EB` 2.5px, grid `#F3F4F6` dash 3 3 가로선만, Y 0~100 ticks [0,25,50,75,100], dot r 3.5 / activeDot r 5.5. 점 클릭 → 아래 응시 테이블 행 하이라이트. 안내 "점을 누르면 아래 응시 기록에서 해당 회차를 강조합니다".
- 리포트 탭 배지 4종 "리포트 없음 / 생성 중 / 리포트 완성 / 생성 실패" + 정오 요약 칩(○ N, ✕ N, 미확인 N). 채점 확정 전 "채점하기", 확정 후 "분석 보기". 공개 리포트는 `/r` 딥링크.

### 7-5. 지표 용어 사전 (단일 소스, 자구 그대로)

> "숙달도는 최근 풀이에 가중치를 둔 점수예요. 60점 미만이면 보충을 권장해요"
> "보충 필요는 3회 이상 시도했는데 숙달도가 60점 미만이거나, 오답률이 높은 항목이에요"
> "복습 대상은 숙달한 뒤 21일이 지나 다시 확인이 필요한 개념이에요"

지표 명칭: 숙달도 / 보충 필요 / 첫 시도 정답률 / 영역별 첫 시도 정답률 / 유형별 정답률 / 복습 대상 / 미완료 과제. **점수 단독 노출 금지, 항상 말 설명 병기(규칙 R10).** 디렉터 노출 어휘는 '취약'이 아니라 **'보충 필요'**로 통일.

---

## 8. 어법 드릴 & 콘텐츠 확장 로드맵

### 8-1. 커리큘럼 구조

**4개 PART (tagline 자구 그대로)**
> "기초 골격 / 문장이 어떻게 생겼는가 — 초·중등 도입 문법의 전 과정입니다"
> "골격기 / 문장의 뼈대 판별 — 이 5개로 선지의 60%가 커버됩니다"
> "연결기 / 절과 절의 관계 — 여기까지 오면 85%에 도달합니다"
> "정밀기 / 형태·호응의 미세 판단 — 실전 방어선을 완성합니다"

- 유닛 **19개** = 기초(BASIC) 7(b01~b07) + 판별(JUDGE) 12(u01~u12). 두 그룹 해금은 완전 독립(무회귀).
- 미세개념 **75개** = 기초 28 + 판별 47. 각 개념은 title + oneLiner.
  예: "u01-c1 본동사 하나 원칙 — 「한 문장(절)에는 본동사가 반드시 하나 있어야 합니다.」" / "u06-c1 선행사 유무 판단 — 「앞에 선행사(명사)가 있으면 that/which, 없으면 what입니다.」"
- 판별 유닛은 **수능 출제 빈도 별점(1~5) + 실측 근거 문구**를 갖는다:
  "U1 동사 vs 준동사 / 이 절에 본동사가 있는가 / 30회분 선지 약 28~30회 — 사실상 매회 출제"
  "U2 주어-동사 수일치 / 동사의 수는 진짜 주어가 결정한다 / 30회분 선지 약 22~25회 — 수식어 삽입 패턴과 결합 출제"
  "U6 관계사 ① — what vs that/which / 선행사가 있는가 없는가 / 30회분 선지 약 15~17회 — 최근 6년 오답 선택 1위 함정"

### 8-2. 문항 · 뱅크

- 문항 형태 6종: "괄호 택일 / 밑줄 OX / 미니 29번 / 지문 실전 / 서술형 변형 / 서술형 수정" (동일 계약 `(item, draft, setDraft, verdict)`로 렌더).
- 난이도 4단: "기초 / 표준 / 심화 / 킬러" (디렉터 표기 D1~D4). 4=`--gd-bad`, 3=`--gd-ink`, 1~2=`--gd-ink-3`.
- **문항 뱅크 실적재량: `items/*.json` 36파일 = 총 1,650문항**(choice 564 + reading 240 + support 846). u08만 choice 36·support 54, 나머지는 choice 48·support 72·reading 20. 복합 세트 set1 10 / set2 10 / final 12. 개념 레슨 JSON 75개.
- 문항 1개가 stem/options/answer + **translation(우리말 해석) + hints 2단 + explanation + trapTags**를 전부 데이터로 보유 — **AI 실시간 생성이 아니라 사전 저작 뱅크**.
- 채점은 100% 서버(`/api/grammar-drill/submit`), 클라이언트에 정답 없음. 제출 payload에 `hintUsed`·`conceptPeeked`·`timeMs`가 실려 **학습 행동까지 기록**.

### 8-3. 단계 게이트 · 임계값

- 유닛 6단: "개념 학습 → 드릴 → 실전 독해 → 서술형 → 유닛 테스트 → 마스터". 기초 유닛은 3단(개념 학습 → 드릴 → 마스터).
- 임계값 상수: 드릴 게이트 = 개념별 **8회 시도 & 숙달도 70**, 실전 독해 = 유닛 8회 & 정답률 0.6, 서술형 = 6회 & 0.6, 유닛 테스트 합격선 **70점**. 큐 1세트 = **10문항**. 숙달도 = **EWMA(α=0.25) + 라이트너 box(0~5)**.
- 유닛 테스트 결과 → "합격 — 유닛 마스터를 달성했습니다" / "70점 미만 — 취약 개념을 복습한 뒤 재응시해 주십시오"
- 취약 판정 상수 단일 소스: `WEAK_SCORE 60`, `MIN_ATTEMPTS 3`, `STALE_DAYS 21`.
- 유닛 훈련 모드 설명(자구 그대로): 드릴 "택일·OX 무한 훈련 — 개념 숙달도 70 도달" / 실전 독해 "미니 29번 · 수능 29번 지문" / 서술형 "어형 변형 · 오류 수정 직접 쓰기" / 유닛 테스트 "10문항 종합 — 70점 이상 마스터". 잠금 시 "개념 학습을 모두 마치면 열립니다".

### 8-4. 드릴 플레이어 UI

- 도구 3종: 힌트(2계단) / 개념 / 질문. 힌트는 "힌트 1 — 구조" → "힌트 2 — 판단 규칙"으로 인라인 계단식, 버튼 라벨 "힌트" → "힌트 2" → "힌트 끝". 우측 "정답 7/9". 하단 "제출하기" / "채점 중…" / "다음 문항" / "결과 보기".
- 판정 패널(`gd-pop` 200ms): good `border #a7f3d0 / bg #ecfdf5`, bad `border #fecdd3 / bg #fff1f2`. "정답입니다" / "오답입니다" / "바른 형태 {교정형}" / "밑줄별 판단 근거" / "지문 요지" / "해석" / "개념 숙달도"(w-24 미터, 70↑ good 색) / "3연속" / "단계가 열렸습니다 — 드릴".
- 밑줄 택일 문항: 지시문 "밑줄 친 부분 중, 어법상 틀린 것을 고르십시오." → 세리프 지문(밑줄 자체가 탭 가능) → 하단 원형숫자 정사각 버튼 5개(2.75rem). 밑줄 상태색 selected/correct/wrong = blue/good/bad soft 배경 + 동일색 underline-decoration.
- OX 문항: 2열 그리드 O/X + 보조 라벨 "옳다" / "틀리다", 지시문 "밑줄 친 부분이 어법상 옳으면 O, 틀리면 X를 고르십시오."
- 세트 종료 요약: mono `text-5xl` 점수 + 3열 "정답률 / 평균 풀이 / 문항" + "한 세트 더" / "재응시".
- 기능 게이트 `FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL`(기본 true), `/g/drill` 허용 모드 9종: drill / concept_check / reading / written / test / review / smart / mixed / assignment.

### 8-5. 학습지 어법 포인트 ↔ 드릴 개념 브리지

학습지(지문 분석)의 어법 포인트 코드 **a~m 13종** → 어법 드릴 개념 ID 정적 매핑 테이블 존재(현재 13코드 전부 매핑).
예: a 정동사 vs 준동사 → u01-c1~c4 / d 수일치 → u02-c1~c4 / e 능동태 vs 수동태 → u03-c1~c4 / i 병렬구조 → u05-c1~c4 / l 전치사 vs 접속사 → u08-c1~c3.
즉 **"학습지에서 틀린 어법 포인트 → 드릴 개념 과제"가 코드로 직결**된다.

### 8-6. 개념 숙달 지도(디렉터)

- 카드 고정 높이 420px. 범례 스와치 6단(위 히트맵과 동일 5단 + `bg-slate-100` "미시도 —").
- PART별 그룹 → 유닛 행 = 제목 줄(유닛 타이틀 + 단계 라벨) + 셀 줄(height 24px, flex-1, 숙달도 숫자). 복습 대상(숙달 60↑ & 21일 초과)은 `ring-1 ring-violet-300`.
- title 툴팁: "{개념명} · 숙달 72점 · 9회 시도 · 마지막 시도 26일 전 · 복습 권장".
- 우측 페어 카드 "보충 필요 개념" + rose 배지. 빈 상태 "지금은 보충 필요 개념이 없습니다." / "기록이 3회 이상 쌓이면 보충이 필요한 항목이 여기에 나타납니다".
- **어법 드릴 자체는 AI 0콜 → 무과금**(코드 주석: "할당·응시·결정론 채점·이력 시각화는 AI 0콜 → 전부 무과금(상수 자체가 없음)").

### 8-7. 콘텐츠 확장 로드맵 (관측된 것만)

- 학습 트랙 4종 중 **어법만 LIVE**, 듣기·어휘·내신은 "준비 중" 상태로 UI에 노출(§6-8).
- (student-app) 학습 탭 "수능링고"는 준비 중 — "수능/모의고사 기출 지문으로 학습하는 기능이 곧 추가됩니다".
- 시험지 태블릿 배포는 국어 미지원 — "국어 시험지는 곧 지원됩니다".
- 영어 장문 세트는 FEATURE_FLAG(`ENABLE_LONG_PASSAGE_SETS`) 게이트.
- 구독 요금제(`SHOW_SUBSCRIPTION_BILLING`)는 기본 false로 꺼져 있고, 크레딧 충전(`SHOW_CREDIT_TOP_UP`)만 기본 true.

---

## 9. 크레딧 & 쿠폰 등록 플로우

### 9-1. 기능별 크레딧 차감표 (`CREDIT_COSTS` 22개, 자구 그대로)

| 기능 | 크레딧 |
|---|---|
| 문제 생성 | 2 |
| 어휘 문제 | 1 |
| 자동 출제(문항당) | 2 |
| 학습 문제 생성 | 2 |
| 학습지 생성 | 5 |
| 문법 포인트 분석 | 1 |
| AI 재번역 | 1 |
| 해설 생성 | 1 |
| 문제 수정 | 1 |
| AI 튜터링 | 1 |
| **텍스트 추출 (OCR 무료)** | **0** |
| AI 지문 복원 | 1 |
| AI 지문 변형 | 1 |
| AI 지문 변형 (전체) | 2 |
| AI 지문 생성 | 2 |
| 웹툰 이미지 생성 (일반) | 5 |
| 웹툰 이미지 생성 (프리미엄) | 10 |
| 기출 웹툰 다운로드 | 3 |
| 시험지 문항 분석(문항당, 최소 15) | 1 |
| 학생 내신 리포트 | 5 |
| AI 심층분석 보강 | 1 |
| AI 추세변화 분석 | 5 |

과금 원칙(코드 주석): "모델 × 실호출 수. 할당·응시·결정론 채점·이력 시각화는 AI 0콜 → 전부 무과금(상수 자체가 없음)."
크레딧 소모 칩 규칙: 0 이하면 숫자 대신 "무료" → "이 작업은 크레딧을 차감하지 않습니다" / "이 작업은 크레딧 {N}을 소모합니다".

### 9-2. 충전 팩 4종

| 상품 | 크레딧 | 가격 | 원/C | 유효기간 |
|---|---|---|---|---|
| 스타터 | 150C | 19,800원 | 132 | 30일 |
| 스탠다드 | 450C | 49,500원 | 110 | 90일 |
| 프리미엄 | 1,500C | 132,000원 | 88 | 180일 |
| 엔터프라이즈 | 4,500C | 330,000원 | 73 | 365일 |

판매 설명 문구는 자동 환산(크레딧÷2): "자동출제 약 {N}문항을 생성할 수 있는 SMOAT AI 크레딧 디지털 이용권입니다." (75 / 225 / 750 / 2,250문항)
충전 패널 각주: "구매 단가와 별도 적용" / "큰 단위로 충전하면 1C당 구매 단가는 낮아질 수 있지만, 같은 기능을 실행할 때 차감되는 크레딧 수는 동일합니다."

### 9-3. 소멸시효 정책 (`/credits/products`, 자구 그대로)

> "크레딧 소멸시효(유효기간) 안내 / 연장 규칙 — 크레딧을 구매하거나 지급받으면 소멸 예정일이 "남은 …" / 사용과 무관 — 크레딧을 사용(차감)해도 소멸 예정일은 바뀌지 … / 만료 시 — 소멸 예정일이 지나면 남은 크레딧이 전액 소멸되며, 소멸된 크레딧은 복구·환불되지 않습니다. (계산은 24시간 기준)"

크레딧 관리 페이지 히어로: "현재 잔액" / "총 사용량" / "소멸 예정일" / "소멸까지"(실시간 초 단위 카운트다운 "128일 07시간 42분 09초", 마운트 전 "계산 중…", 지나면 "소멸됨").

### 9-4. 잔액 배지

- 사이드바 상시 노출 + **60초 폴링** + `CREDITS_CHANGED_EVENT` 즉시 재조회 + 탭 visible 복귀 시 재조회.
- 잔액 변동 시 방향별 **0.72초 플래시**: 차감 = scale 1→1.45, color `#ef4444` / 환급 = 동일 곡선에 `#2563eb`.
- 색: 정상 `text-emerald-600`, isLow `text-red-500`(+ TrendingDown 아이콘).
- 팝오버(280px): "크레딧 잔액" + 플랜 배지 + 28px extrabold 잔액 + "월간 사용량" 바(80%↑ red-400, 50%↑ blue-400, 그 외 emerald-400) + "월간 배정" / "보너스" 2칸 + "크레딧 관리" 링크.

### 9-5. 쿠폰 등록 플로우

**경로 2개**
1. QR 딥링크 `/coupon/register?t=<token>` → 미로그인이면 `/login?callbackUrl=...` → 로그인 후 `/director/coupons/register?t=<token>` → **화면 진입 즉시 자동 등록**(useEffect 1회 가드).
2. 로그인 상태에서 `/director/credits` 상단 "쿠폰 등록" 카드에 8자리 코드 직접 입력.

**제약**
- **DIRECTOR(원장) 계정만 가능** — 그 외 403 "쿠폰 등록은 원장 계정만 가능합니다."
- rate-limit: IP 분당 10회 / 학원 분당 15회.
- 코드 8자리, **혼동문자 I·O·0·1 제외 32자 알파벳**. QR 토큰 원본은 DB 미저장, SHA-256 해시만 저장.
- 등록 트랜잭션은 조건부 UPDATE(`WHERE status='ACTIVE'`) count 가드로 멱등성 + 지급 원장 `creditTxId` `@unique` 2차 방어.

**화면 3스텝**
1. 수동 입력 폼 — "쿠폰 등록" / "받으신 실물 쿠폰의 QR을 스캔했거나 8자리 코드를 입력해 등록하세요. 크레딧 지급형은 즉시 적립되고, 할인형은 다음 크레딧 충전 때 자동으로 적용됩니다." / "쿠폰 코드 (8자리)" / placeholder "예: ABCD2345". QR 진입 시 안내 바 "QR로 접속했습니다. 아래 “쿠폰 등록”을 누르면 바로 등록됩니다."
2. 자동 등록 로딩 — "쿠폰을 등록하는 중이에요…" / "잠시만 기다려 주세요."
3. 결과 2분기
   - 지급형(emerald) → "크레딧이 지급되었습니다" / "지급" / "현재 잔액 {N} 크레딧" / "보유 크레딧은 하나의 소멸일을 공유합니다 · 소멸 예정일 {날짜}" / "크레딧 내역 보기"
   - 할인형(blue) → "할인 쿠폰이 등록되었습니다" / "다음 크레딧 충전 결제 때 자동으로 적용할 수 있습니다." / "크레딧 충전하러 가기"

**실패 사유 8종(자구 그대로)**
"존재하지 않는 쿠폰 코드입니다." / "이미 등록되었거나 사용할 수 없는 쿠폰입니다." / "현재 사용할 수 없는 쿠폰입니다." / "등록 기간이 지난 쿠폰입니다." / "이 쿠폰의 학원당 등록 한도를 초과했습니다." / "방금 다른 요청이 이 쿠폰을 선점했습니다. 다시 확인해주세요." / "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요." / "등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."

**효과 문구 포맷터**: "무료 {N} 크레딧 지급권" / "{N}원 할인권" / "{N}% 할인권".
⚠ 지급 크레딧 수(예: 300)는 **하드코딩이 아니라 관리자 배치 생성 시 입력값**(`grantCredits`, 관리자 라벨 "지급 크레딧 *"). 세미나용 배치의 실제 값은 코드로 확인 불가(§12).

**실물 쿠폰 인쇄물 규격**: A4 2열×5행, 티켓 105mm×59.4mm. 좌 main + 우 stub(34mm), 사이 `border-left 0.3mm dashed #a9c4ef` 절취선. stub에 "LOGIN & GET" + QR 25mm×25mm(EC M) + "QR 스캔 후 코드 등록" + "smoat.kr/coupon". 코드 박스 `bg #eff6ff` + `0.3mm dashed #93c5fd` + mono 4.8mm/800/letter-spacing 1.4mm/`#1d4ed8`. 푸터 "더 스마트한 영어 수업, 스모트와 함께 시작하세요".
⚠ 인쇄물에는 `smoat.kr/coupon`이 하드코딩돼 있으나 SEO config 도메인은 `www.smoat.co.kr`, 목업 URL은 `smoat.co.kr/...` — 3종 병존(§12).

---

## 10. 재사용 가능한 실존 자산 목록

**직접 열람(내용까지 확인)**

| 경로 | 스펙 |
|---|---|
| `public/landing/demo/webtoon/gift-of-the-magi.webp` | 477KB, 1440×2580px, 2열 메이슨리 9컷, 세피아 수채 |
| `public/landing/samples/sample-mock-exam-thumb.png` | 실전 모의고사 1p — "2027학년도 대학수학능력시험 대비 실전 모의고사 문제지" / "제 3 교시" / "영 어 영 역" / "독해형" / 2단 조판 + 중앙 세로선 + 연한 'SMOAT' 워터마크 + "1 / 7" + "학습 목적으로 제작된 사설 실전 모의고사입니다." |
| `public/icon.svg` · `public/favicon.svg` | 바이트 동일. viewBox 0 0 100 100, rect rx=24 fill `#020617` + 흰 도형 3종(상단 방사 5선 stroke 3.4 / 5각 별 / 펼친 책), 전체 `translate(5 5) scale(0.9)`, aria-label "SMOAT" |
| `public/landing/demo/webtoon/panel-1~4.svg` | 400×300 viewBox 컷 프리미티브(팔레트 §1) |

**파일 실존 확인(내용 미열람 또는 부분 확인)**

| 경로 | 비고 |
|---|---|
| `public/landing/demo/smoat-demo-exam.docx` | 12,585B |
| `public/landing/demo/smoat-demo-exam.hwpx` | 9,206B |
| `public/landing/samples/sample-mock-exam.pdf` | 381KB |
| `public/landing/samples/sample-analysis-worksheet.pdf` | 5.15MB |
| `public/landing/samples/sample-mock-exam-page1.png` | 385KB, 내용 미열람 |
| `public/landing/generated/` | 10종 — `actual-smoat-exam-page1.webp`, `actual-smoat-worksheet-page1.webp`, `smoat-score-report-page.webp`, `printed-output-stack-real-docs.webp`, `teacher-marked-passage.webp`, `uploaded-exam-photo.webp`, `ai-english-system-hero-v5.png` 등 (내용 미열람) |
| `public/smoat-logo.png` / `favicon.png` / `apple-icon.png` / `og-image.png` | 각 19,830B — **네 파일 바이트 동일(동일 원본 500×500)**. `admin-favicon.png`만 17,759B |
| `public/fonts/exam/MalgunGothic-Regular.woff2`, `-Bold.woff2` | 시험지 조판 전용 |
| `public/fonts/webtoon/` + `font/` | 웹툰 말풍선 서체(그리운 체리 한스푼 / 그리운 규원체 / Ok단단체) |
| `public/marketing/campaign-2026/` | **실사 캠페인 31장(01~31, 각 1.5~2.2MB PNG) + `README.md` 카피 가이드**. 06~31은 실제 SMOAT 화면·출력물을 삽입 소재로 사용 |
| `public/features/shots/` | 7세트 — academy-erp 2장 / ai-question-generation·exam-builder·exam-report·passage-analysis·passage-webtoon·question-extraction 각 5장(hero + s1~s4). ⚠ 정찰 헤더는 "29장", 세부 합산은 32장 — 실측 필요 |
| `screenshots/site-page-kinds-2026-06-25_12-39-28/` | 전 페이지 스크린샷 **146장** + 팝업 상태 **245장** + `manifest.md` |
| `ir-deck/_qa/` | 검수 스크린샷 28장(s02~s27 + s09-gen/s09-wb + toc.jpeg) |
| `ir-deck/_pdf/` | 페이지 JPEG 27장 + `capture.mjs`(Playwright) + `assemble.py` |
| `ir-deck/smoat-IR-deck.pdf` | 10.6MB 완성 PDF |
| `smoat-offline-marketing/` | PDF 3개 — "4_SMOAT_세미나_결합 1.pdf"(218KB) / "2027_영어_실전모의고사_문제지.pdf"(444KB) / "전단지용 학습지.pdf"(6.6MB) |
| `.tmp-webtoon-final/{A-warm,B-noir}/` ⚠ | 8지문 × 2컨셉 png+webp + 폰뷰 축소본 + `_storyboards/` JSON 8 + `SPEC.md` + `_style-plates/plate-A,B.png`. **git 미추적**(gitignore도 아님) — 디스크에만 존재 |
| `.tmp-webtoon-layout/` ⚠ | 컷 레이아웃 비교 `g6-1x6.png` / `g6-2x3.png` / `g8-2x4.png` / `g12-2x6-이전버전.png` |
| `.tmp-webtoon-ab/` ⚠ | 톤 A/B `v1-cute-box` / `v2-cute-band` / `v3-macho-white` / `v4-macho-dark` full.png + phone |

**캠페인 README 카피(세미나 용도 명시 컷, 자구 그대로)**
> 01 세미나 오프닝 슬라이드 — "출제에 쓰던 밤을 돌려드립니다"
> 05 세미나 스크린 — "복잡한 자료를, 완성된 시험으로"
> 06 세미나 대형 스크린 — "보여주기 위한 AI가 아니라, 바로 쓰기 위한 결과물"
> 15 학원 설명회 — "좋은 시스템은, 교사진 전체의 기준을 높입니다"
> 21 세미나 엔딩 슬라이드 — "선생님의 저녁을 다시 돌려드립니다"
> 31 세미나 도입부 — "SMOAT 없이 출제한다는 것"

**캠페인 사용 원칙(자구 그대로)**: 웹에서는 `aspect-ratio:16/9` 유지 + `object-fit:cover`, 카피는 이미지에 재합성하지 말고 **HTML 텍스트 레이어**로 올릴 것, 흰색/옅은 청색 글자 + 코발트 CTA 조합.

**영상 자산**: 정찰 범위에서 **동영상 파일은 발견되지 않았다.**

---

## 11. 기존 ir-deck 엔진에서 가져올 검증된 패턴

`ir-deck/`은 27장 8막 구조의 **빌드 없는 정적 16:9 인터랙티브 덱**이며, PDF 캡처 파이프라인까지 완비되어 있다. 원본 `ir-deck/`, 운영 사본 `public/ir/`, `node scripts/sync-ir-deck.mjs`로 6개 파일 동기화. 운영 URL `https://smoat.co.kr/ir`(어디에도 링크되지 않은 비공개 경로).

**엔진 계약 (그대로 복사 가능)**
- 슬라이드 정의는 DOM 자동 수집 — `.slide`에 `data-steps`(스텝수), `data-act`(막), `data-theme`(light|night)만 붙이면 엔진·HUD·목차가 자동 반영.
- 스텝 리빌: `[data-s="n"]` → step ≥ n 일 때 `.on`. `data-s-until` 종료 스텝, `[data-dim-at="N"]`은 삭제 대신 `.dimmed`(opacity .32 + saturate .6)로 강등.
- 해시 딥링크 `#슬라이드.스텝`(예 `#5.2`), `history.replaceState`로 매 렌더 갱신.
- 네비: 클릭(좌 18% = 이전, 그 외 = 다음) + PageDown/→/↓/Space/Enter, PageUp/←/↑/Backspace, F 전체화면, Home/End, Esc(목차). `[data-ui]` 내부와 a/button/input/textarea/select는 네비 제외. 슬라이드 전환 `animLock` 520ms.
- 목차는 `data-act` 자동 그룹핑, 라벨 `data-title`, 번호 2자리 zero-pad.
- 리빌 이펙트 3종 자동 발화: `data-count`(카운트업, easeOutQuart, 기본 1300ms, `data-fmt=comma|plain`, ko-KR 콤마) / `data-draw`(SVG `stroke-dashoffset`) / `data-grow`(바 성장, `data-axis="y"`면 height).
- 타이핑 전역 `window.deckType(el, text, speed, done)`, 기본 14ms/자, 진행 중 `.typing`.
- **확장점: 슬라이드가 스텝 변경 시 자기 자신에게 `CustomEvent "deck:step"`(detail.step) 디스패치** — 차트/데모가 여기 훅을 건다.

**시각 토큰(ir-deck 전용, 앱 팔레트와 별개)**

| 토큰 | Hex |
|---|---|
| `--bg-0` / `--bg-1` / `--bg-2` | `#edf3fb` / `#e2ecf8` / `#d6e5f6` |
| `--ink` / `--ink-soft` / `--mute` / `--faint` | `#0b1c38` / `#33507a` / `#7e93b4` / `#aabdd8` |
| `--blue` / `--blue-deep` / `--sky` / `--cyan` / `--navy` | `#2f6df6` / `#1242b8` / `#5aa7f7` / `#2fb6d9` / `#0e2a66` |
| `--risk` / `--pos` | `#d8447c` / `#0fa37f` |
| `--glass` / `--glass-strong` | `rgba(255,255,255,0.52)` / `rgba(255,255,255,0.74)` |
| `--stroke` / `--stroke-soft` | `rgba(255,255,255,0.72)` / `rgba(143,170,210,0.35)` |
| `--r-lg` / `--r-md` / `--r-sm` | 26px / 18px / 12px |
| `--ease` | `cubic-bezier(0.16,1,0.3,1)` |
| `--shadow-card` | `0 18px 50px -18px rgba(15,45,105,.22), 0 4px 14px -6px rgba(15,45,105,.1)` |
| `--shadow-pop` | `0 30px 80px -24px rgba(10,35,90,.32)` |

- 폰트: Pretendard Variable(CDN) + IBM Plex Mono. `word-break:keep-all; overflow-wrap:break-word; user-select:none`.
- 배경: 3겹 radial/linear + `blur(70px)` 부유 오브 3개(`orb-drift` 26s/32s/38s alternate) + SVG `feTurbulence` 노이즈(opacity .5, `mix-blend-mode:overlay`).
- 나이트 테마는 슬라이드가 아니라 **배경 레이어 교체**(`.bg-night` opacity 0→1, 0.9s).
- 슬라이드 전환: 비활성 opacity 0 / scale(0.988) / blur(10px), `.active` 0.62~0.7s + 0.12s delay, 직전 `.was` scale(1.012).
- 스텝 기본 모션 translateY(26px)+blur(6px), 변형 `data-fx=left|right|pop|none`, 지연 `data-d="1~6"` = 0.08s 단위.
- HUD: 하단 고정 — 좌 막이름(mono 12px, tracking .3em, uppercase), 우 스텝 도트(4px) + 카운터("01 / 27") + 이전/다음/목차 원형 38px, 최하단 2.5px 진행바 `linear-gradient(90deg,--sky,--blue)`.
- 힌트: `body.ready` 1.2s 후 페이드인, 첫 이동(`body.moved`) 0.4s 만에 소멸 → "클릭 또는 → 키로 넘기기 · F 전체화면 · 우상단 ≡ 목차"
- 목차 패널: 우측 시트 `min(420px,92vw)`, `rgba(248,251,255,.92)` + blur(30px), translateX(40px)→0, 0.4s.

**검증된 인터랙션 데모 패턴**
- S09 2탭 데모: "문제 생성" / "워크북 변형 (AI 0회)".
  생성 시뮬레이션 = 4개 진행 문구를 520~800ms 랜덤 간격으로 순차 표시 후 완료:
  > "▸ 지문 구조 분석 중 — 문장 9개 · 논리 흐름 추출 / ▸ 출제 포인트 선정 중 — 유형 적합 스팬 탐색 / ▸ 오답 선지 설계 중 — 매력적 오답 · 함정 시나리오 / ▸ 품질 게이트 검증 중 — 정답 위치 다양성 · 힌트 누출 검사 / ✓ 생성 완료 — 품질 게이트 통과 · 2크레딧 차감"
  문제 카드 = 발문 타이핑(16ms/자) → 선지 5개 160ms 간격 translateY(8px)→0 → "정답 · 해설 보기" / "정답 · 해설 접기" 토글 시 정답 선지에 `.correct-reveal`(`--pos` + bold).
  워크북 탭 = mulberry32 PRNG 시드 셔플 + 5자↑ 내용어를 밀도(15~60%)만큼 빈칸 처리 → "AI 호출 0회 — 시드 기반 결정론 변환이라 같은 시드는 항상 같은 학습지(인쇄 재현 100%), 시드만 올리면 무제한 재출제."
- 계절성 차트(S05/S16): SVG 1040×360, 52주 폴리라인 절차 생성, `deck:step`에 맞춰 stroke-dashoffset 드로우(1600~1900ms, 260ms 스태거).
- S15: 서울 25개 자치구 그리드 + 6개 구(강남·서초·송파·노원·양천·마포)에 `.lit` — 지역 독점 슬롯 점등 연출.

**막 구조(8막 + 에필로그)**: SMOAT IR / ACT 1 — 시장 / ACT 2 — SMART / ACT 3 — 발견 / ACT 4 — MOAT / ACT 5 — 비즈니스 / ACT 6 — 해자 / ACT 7 — 팀 / ACT 8 — 플랜 / EPILOGUE.

**그대로 이식 가능한 카피**
- 커버: "가장 스마트한 해자를 만듭니다. / smoat는 smart × moat — AI가 영어 내신 수업의 콘텐츠 공장과, 학원만의 학생 학습 경험을 통째로 만들어내는 듀얼 SaaS입니다. / smart — 강사용 — AI 콘텐츠 스튜디오 / moat — 원장용 — 지역 독점 학습 AI"
- 클로징: "우리는 문제를 만드는 속도가 아니라, 학원이 학생을 지키는 방식을 바꿉니다. / smoat.co.kr · (주)네안데르 신규 사업 · Spark Claw Cohort 01 지원"
- **S08 파이프라인 5+1(세미나 덱 최상급 이식 자산)**: "01 추출 / 02 분석 / 03 출제 / 04 워크북 / 05 시험지 / +α 엔게이지 — "강사가 수업에서 쓰는 모든 산출물이 한 파이프라인에서 나옵니다 — 그래서 이탈할 이유가 줄어듭니다.""

**결론(권고)**: 세미나 덱은 ir-deck 엔진을 포크하면 스텝 리빌·해시 딥링크·TOC·HUD·카운트업·SVG 드로우·PDF 캡처 파이프라인(`_pdf/capture.mjs` + `assemble.py`)이 전부 무상 승계된다. **[추론]** 새 엔진을 쓸 이유가 없다.

---

## 12. 갭 & 불확실 항목 (덱 제작 시 언급하면 안 되는 것들)

### 12-1. 절대 언급 금지

- **국어 과목 기능 = 대외비.** `design-sync/foundations/brand.html:20` 명문: "※ 국어 과목 기능은 대외비 — 브랜드/마케팅 노출 금지." 본 문서 §3-1·§3-4·§5-2의 국어 38유형/국어 세트 프리셋/국어 분석 학습지는 **내부 참고용**이며 덱·발표에 노출하면 안 된다. 코드 구조도 이를 뒷받침한다 — `QUESTION_TYPE_GROUPS_KO`를 영어 그룹과 분리한 이유가 "영어 지문 UI에 국어 유형이 노출되는 회귀 방지"다.

### 12-2. 모순 — 어느 쪽도 단정하면 안 됨 (⚠)

| 항목 | A안 | B안 | 대응 |
|---|---|---|---|
| 문항 유형 수 | 랜딩·코드 **25유형** | about·llms.txt **19유형** / ir-deck **23종** | 코드 기준 25만 사용, 나머지는 구자료 가능성(커밋 이력 미검증) |
| 웹툰 화풍 수 | 코드 상수 **5종** | 마케팅 페이지 **6가지** | 코드 기준 5종 |
| 리포트 섹션 heading | 프로덕션 조립 상수(§7-1 표) | 랜딩 fixture 표기 | 출처 섞지 말 것 |
| 그룹 라벨 | "수능·모의고사 객관식" | "수능/모의고사 객관식" | 표면별 상이 |
| 도메인 표기 | `www.smoat.co.kr`(SEO config) | `smoat.kr/coupon`(인쇄물), `smoat.co.kr/...`(목업) | 실배포 호스트 미확정 |
| `features/shots` 장수 | 헤더 29장 | 세부 합산 32장 | 실측 필요 |
| 헤더 배경 | "항상 불투명 흰색" | "스크롤 시 전환, 비스크롤 시 투명" | 데스크톱 기준으로만 인용 |
| 학생 CountUp | 리포트 900ms | 학생앱 결과 400ms | 서로 다른 시스템 |

### 12-3. 코드에 정의가 없어 재현 불가

- `(student-app)` 표면의 `--key-learn` / `--key-home` / `--key-mypage` / `--base-bg` 변수 — 사용만 하고 **정의 0건**(globals.css·gd.css 전수 grep). 이 화면의 키 컬러·배경색은 확정 불가 → 덱에서 색을 추정하지 말고 인접 리터럴(orange-400/500 `#FB923C`/`#F97316`)로 대체하거나 이 화면을 피할 것.
- `.card-3d` / `.btn-3d` 유틸 — 정의 0건. 그림자·테두리·눌림 수치 확정 불가.
- `marquee-loop` 키프레임 — 정의 0건. 마퀴가 실제로 흐르는지 미확인(문구 자체는 확정).
- 히트맵 셀 폭 `w-13` — globals.css에 정의 없음. **[추론]** Tailwind v4 동적 spacing상 13×0.25rem=3.25rem(52px)로 보이나 실측하지 못했다.

### 12-4. 미확인 — 덱에서 단정하지 말 것

- **PC 실제 화면**: 데스크톱 방문자가 보는 랜딩 우측은 라이브 데모이며, `step1-crop` / `step2-analysis` / `step3-generate` / `step3-generate-mobile` / `fixtures/questions.ts` / `fixtures/analysis-report.ts`는 열지 않았다. §2의 목업 해부를 "실제 PC 화면"으로 소개하면 오류.
- **웹툰 컷 분할 LLM 스텝**: 프로덕션에는 컷 스토리보드를 만드는 별도 LLM 단계가 **없다**(지문 원문을 통째로 이미지 모델에 넘김). 12컷 스토리보드는 실험/기출 전용 경로. 섞어 말하면 사실 오류.
- **학생 앱 웹툰 뷰어 없음**: `/g`·`(student-app)` 전수 grep '웹툰' 0건. "학생이 폰에서 웹툰을 본다"고 말할 근거가 없다.
- **기초 유닛 드릴 문항 공급 경로**: `items/`에는 u01~u12만 있고 b01~b07 뱅크가 없다. 기초 유닛 문항이 레슨 내 인터랙션인지 별도 경로인지 미확인(`UNIT_EMPTY` = "이 유닛에는 아직 드릴 문항이 없습니다").
- **구독 요금제**: `SHOW_SUBSCRIPTION_BILLING` 기본 false, 플랜 티어명·월 배정·가격 상수를 코드에서 찾지 못했다. **"현행 과금 = 크레딧 선불 충전 4팩 단일"로만 말할 것.**
- **세미나 커리큘럼**: `/seminar` 페이지에 하드코딩 카피가 없다. 커리큘럼·혜택은 관리자 자유 텍스트(placeholder "커리큘럼·준비물 등 상세 내용"). 코드에 커리큘럼 데이터가 존재하지 않으므로 덱에서 "제품이 제공하는 커리큘럼"처럼 말하면 안 된다.
- **세미나 쿠폰 배치 실값**: `grantCredits`(예: 300)는 DB 값. 실제 배치명·수량·유효기간은 관리자 화면에서 확인해야 한다.
- **폰트 실렌더**: `body.smoat-large-ui` 20px 기준이 design-sync 문서 스케일과 어긋난다. "본문 14px" 단정 금지.
- **로고 PNG 내용**: `smoat-logo.png`(500×500)의 실제 그림은 확인하지 못했다(바이너리). SVG(검정 라운드 사각 + 별 + 책 + 광선)와 동일 디자인인지 미검증.
- **`yshin` 접두**: `--color-yshin-*`, `yshin-pulse/aurora/orbit`, `yshin-sidebar-collapsed` 등이 코드 전반에 남아 있으나 구 브랜드명인지 코드네임인지 코드 내 설명이 없다. 덱에서 언급 금지.
- **미열람 코드**: HWPX 렌더 XML 규칙, DOCX 2단 조판 구현 방식, 리포트 하위 6개 섹션 렌더러 시각 스펙, 채점 입력 UI(verdict-board), 공개 리포트 뷰어 `/r/[token]`, 상태창(status-window), `/g/me`·`/g/track`·`/g/vocab`·`/g/x`, 자막 편집기(webtoon-text-canvas), `worksheet-study/compile.ts`, `study-analytics-tab.tsx`, 커스텀 유형(`custom-question-types`), grammar-drill 개념/질문 시트, 레슨 블록 렌더러.
- **AI 질문 1일 한도**: "오늘 질문 3회 남았습니다" 문구로 한도 존재는 확인했으나 **정확한 숫자 미확인**.
- **`.tmp-webtoon-*`**: git 미추적 로컬 산출물. 덱 자산으로 쓰려면 별도 커밋/이관 판단 필요. 이미지 내용은 파일명·SPEC 문서 기준 서술이며 육안 확인하지 않았다.
- **`(teacher)` 경로**: 교사 계정이 학생 허브(히트맵·원클릭 배포)를 동일하게 보는지 확인하지 못했다. 해당 라우트는 구 `StudentDetailClient`를 렌더한다.

---

## 13. 덱 킬러 소재 TOP 12

세미나 청중 = **영어학원 원장·강사**(llms.txt 명시 주요 사용자). 후킹 순.

**1. "10시간을 10분으로" — 제품이 스스로 내건 단일 약속**
근거: 랜딩 히어로 확정 카피(`hero-scene.tsx:441-452`). 히어로 서브 두 번째 줄만 알약 강조(`bg-blue-100 text-blue-800`)로 시각 격상돼 있어, 제품이 이 문장을 핵심 주장으로 취급한다는 게 코드로 드러난다. 오프닝 한 줄로 그대로 사용.

**2. 지문 한 편 → 25유형이 몇 초 만에 (그리고 랜딩 데모가 그걸 실시간으로 증명)**
근거: `QUESTION_TYPE_GROUPS` 14+8+3=25종이 워크벤치·랜딩 단일 소스. 랜딩 QuestionBurst는 25유형을 25칸 트래커로 나열하고 발문 26ms/자 → 제시문 18ms/자 → 선지 16ms/자로 순차 타이핑, 2400ms 유지 후 다음 유형으로 자동 순환한다. **25유형 전부가 단 하나의 지문(HERO_PASSAGE)에서 파생**되도록 코드가 서사를 구현했다.

**3. "미리보기 그대로" — PDF가 서버 렌더가 아니라 화면 그 자체**
근거: PDF는 `window.print()` 기반이며 760px 미리보기 모델을 물리 용지에 균일 배율로 `transform:scale`한다. 그래서 드롭다운의 PDF 항목에만 rose 배지 "미리보기 그대로"가 붙는다. 강사가 가장 불신하는 "화면과 출력물이 다른 문제"를 구조적으로 제거했다는 증거.

**4. 3포맷 × 2모드 = 6개 산출물, 그중 한글(HWPX)이 실제로 있다**
근거: 드롭다운 6항 "PDF / PDF 해설 / DOCX / DOCX 해설 / HWPX / HWPX 베타". 한컴 정합을 위한 전용 보정 파라미터(`firstPageHeaderPx`, `contentSafetyPx`)까지 존재. 실물 데모 파일도 실재(`smoat-demo-exam.docx` 12,585B / `.hwpx` 9,206B). 국내 학원 청중에게 가장 즉물적으로 꽂히는 사실.

**5. 미리보기 px → DOCX pt 환산식이 코드에 박혀 있다 (`px × 0.78325`)**
근거: `sizes.ts:57-85` 주석의 실제 식과 SIZE_TITLE 44 / SIZE_BODY 18 / 행간 1.58·1.46. "1:1 조판"이 마케팅 수사가 아니라 계산식이라는 것을 숫자 하나로 증명한다.

**6. 클릭 한 번에 리포트 인격이 6번 바뀐다 — CSS 변수 교체 구조**
근거: 리포트 6테마(컨설팅 블루/모노크롬 프로/그로스 코치/클래식 저널/잉크 매거진/포레스트 멘토)가 전부 `--rpt-*` 변수로만 주입되어 레이아웃 이동 없이 색·폰트가 동시 교체된다. 주석에 "전 테마 인쇄 안전(밝은 배경 기반)"까지 명문화. 학부모 상담용 문서라는 용도가 색 규약에 반영된 사례.

**7. 리포트 AI에게 "문항 번호 최소 4개 실명 인용"을 강제한다**
근거: `prompts.ts:388,402` — 8개 내러티브 전부에 형식("12번(빈칸추론)", "서답형 2") 지정 인용 하한이 걸려 있고, "꾸준히 노력하면"·"기본기를 다지면" 같은 상투구는 금지어. 학원가가 AI 리포트를 불신하는 지점("두루뭉술")을 프롬프트 레벨에서 차단.

**8. 취약 셀을 누르면 그 범위 그대로 과제가 나간다 — 분석→액션 원클릭**
근거: 히트맵 셀 팝오버 → CTA "이 범위로 과제 보내기" → 프리셋 매핑(GRAMMAR는 conceptIds 합집합, QUESTIONS는 subTypes 프리필터) → 컴포저 3패널("① 누구에게 / ② 무엇을 · 언제까지 / ③ 실물 확인") → "12명에게 과제를 보냈습니다." 컴포저 상단에는 "이미 나간 관련 과제 3건"까지 붙는다. 시험→분석→재출제 루프가 UI 한 줄로 닫힌다.

**9. 배포 전 실물 확인이 강제된다 (전수검사 계약)**
근거: 컴포저 ③ 패널 코드 주석 "실물 확인 없이는 배포 결정을 내리게 하지 않는다(전수검사 계약)". 빈 상태 문구까지 이 원칙에 맞춰 2종으로 갈린다. "AI가 뭘 보냈는지 모른 채 학생에게 나간다"는 공포를 제품이 구조로 막는다.

**10. 어법 드릴은 AI 0콜 — 사전 저작 1,650문항 뱅크 + 서버 결정론 채점**
근거: `items/*.json` 36파일 = choice 564 + reading 240 + support 846 = **1,650문항**, 개념 레슨 JSON 75개. 문항마다 해석·힌트 2단·해설·함정 태그가 데이터로 존재. 채점은 100% 서버, 클라이언트에 정답 없음. 크레딧 상수 자체가 없다(무과금). 게다가 U1/U2/U6에는 "30회분 선지 약 28~30회 — 사실상 매회 출제" 같은 실측 근거가 붙어 있다.

**11. OCR·텍스트 추출은 0크레딧, 그리고 잘린 문장을 AI가 복원한다**
근거: `CREDIT_COSTS`의 "텍스트 추출 (OCR 무료) 0". 랜딩 Intake 불릿 "텍스트 추출은 무료 — OCR에는 크레딧이 들지 않습니다" / "잘린 지문 AI 복원 — 페이지 경계에서 끊긴 문장 자동 복원". 데모에서도 마지막 2줄이 `restored=true`로 파랑 하이라이트된다. 진입 마찰 0을 숫자로 말할 수 있는 유일한 지점.

**12. 학생 앱은 이미 네이티브다 — 코드 2개로 들어가고, 학습지 A4를 리플로우 없이 그대로 본다**
근거: Capacitor 앱 `kr.co.smoat.student`, 앱 이름 "SMOAT 학습", 스플래시 `#f6f5f1`. 로그인은 학원코드 4자 + 학생코드 6자 원스크린("코드는 담당 선생님께 받을 수 있습니다."). 하단 4탭 "홈 / 학습 / 과제 / 내 기록". 원본 학습지 뷰어는 디렉터와 **동일한 A4 793.7px 렌더러**를 읽기 전용 재사용하고 CSS `--gw-zoom` 하나로만 스케일 — "인쇄물과 폰 화면이 같은 지면"이라는 주장이 코드로 성립한다. 오프라인 폴백 화면까지 gd 팔레트로 만들어져 있다.

---

*문서 종료. 본 원장에 없는 수치·기능·카피는 덱에 쓰지 않는다.*
