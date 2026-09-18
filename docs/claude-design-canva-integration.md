# 클로드 디자인 × 캔바 연계 계획 (디자인 업그레이드 파이프라인)

> **트리거 문서.** 사용자가 "클로드 디자인으로 연계해서 하는 걸 구현하려고 해"라고 하면
> 이 파일을 읽고, 아래 [진행 상태](#진행-상태)를 확인한 뒤 다음 단계부터 대화를 이어간다.
> 단계가 진행될 때마다 이 문서의 체크리스트를 갱신할 것.

작성일: 2026-07-11 · 상태: **디자인 시스템 업로드 완료 (2026-07-11), 사용자 시각 작업 대기**

> 프로젝트: "SMOAT Design System" · projectId `784562e1-90a8-4bd0-bf57-d06283cb73b7`
> 번들 원본: 리포 `design-sync/` (16개 카드: Brand/Colors/Type/Components×7/Patterns×3/Generate Pages×3)
> 재업로드 절차: `design-sync/` 파일 수정 → finalize_plan(localDir=design-sync, writes=`foundations|components|patterns|generate/*.html`) → write_files(localPath)

---

## 목표

smoat의 디자인 작업(1차 대상: 원장 사용자 매뉴얼 SVG 185장)을 자연어 설명의 한계를 넘어
**시각적으로 보면서 반복**할 수 있게 만든다. 구조:

```
        DesignSync (양방향, 온디맨드)           커넥터/내보내기
Claude Code  ←──────────→  Claude Design  ──────→  Canva
     │                                              ↑
     └──────────── Canva MCP (양방향, 온디맨드) ─────┘
```

- 완전한 실시간 자동 동기화는 불가. **Claude Code가 허브**가 되어 "말하면 즉시 동기화"하는 온디맨드 파이프라인.
- Canva는 선택 사항: 마케팅/홍보성 일회성 자산용. 코드 파이프라인 자산(매뉴얼)의 원본은 리포에 유지.

## 워크플로우 (3단계)

1. **추출·업로드 (Claude Code)** — 리포에서 디자인 언어 추출(globals.css 색상 체계, 타이포,
   Toss형 필터 필·CreditCostChip·모달 표준 등 컴포넌트) → HTML 프리뷰 카드 번들 제작 →
   DesignSync로 claude.ai/design 디자인 시스템 프로젝트 생성·푸시.
2. **시각 반복 (사용자, 브라우저)** — claude.ai/design에서 디자인 시스템을 붙여놓고
   매뉴얼 페이지 템플릿 시안을 눈으로 보면서 다듬기. 시안 여러 개 비교 가능.
3. **반영 (Claude Code)** — 확정 템플릿을 DesignSync로 읽어와 매뉴얼 파이프라인에 이식.

## 역할 분담

### 사용자가 수동으로 할 것

| # | 할 일 | 언제 | 비고 |
|---|---|---|---|
| 1 | claude.ai/design 접속 확인 | 맨 처음 | 리서치 프리뷰, Pro/Max/Team 필요 |
| 2 | 권한 승인 2회 (디자인 스코프 추가 + 업로드 계획 승인) | Claude가 DesignSync 첫 사용 시 | 프롬프트 클릭만 |
| 3 | Claude Design에서 시각 작업 후 "가져와" 지시 | 업로드 완료 후 | 핵심 작업 구간 |
| 4 | (선택) Canva MCP 인증 — 인터랙티브 세션에서 /mcp 또는 `claude mcp add` + OAuth | Canva 붙일 때 | 비대화형 세션에선 불가 |
| 5 | (선택) Canva 브랜드 킷 등록 (색상·로고·폰트) | Canva 쓸 거면 | 온브랜드 생성 기준 |

### Claude Code에 시킬 것

| # | 작업 | 지시어 예시 |
|---|---|---|
| 1 | 디자인 시스템 추출 (HTML 프리뷰 카드 번들) | "디자인 시스템 추출 시작해" |
| 2 | Claude Design 프로젝트 생성 + 업로드 (DesignSync) | 1에 이어 자동 진행 |
| 3 | 변경분 풀 + 코드 반영 | "디자인 쪽에서 고른 거 가져와서 반영해" |
| 4 | (선택) 폴링 루프 — 작업 세션 동안 변경 감지→자동 반영 | "루프 켜줘" / "루프 꺼줘" |
| 5 | (선택) Canva 조작 (MCP 연결 후) | 자유 |

## 진행 상태

- [x] 0. 사용자: claude.ai/design 접속 확인 (2026-07-11)
- [x] 1. 디자인 시스템 추출 (색상/타이포/컴포넌트 → `design-sync/` HTML 카드 13장) (2026-07-11)
- [x] 2. Claude Design 프로젝트 "SMOAT Design System" 생성 + DesignSync 업로드 13장 (2026-07-11)
- [ ] 3. 사용자: Claude Design에서 매뉴얼 템플릿 시안 작업
- [ ] 4. 확정 템플릿 풀 + 매뉴얼 파이프라인 반영 방식 결정(아래 참조)
- [x] 6. "Generate Pages" 그룹 3카드 추가 업로드 (2026-07-17) — 문제·시험지·학습지 생성 3페이지 공통 기조 추출
  - `generate/generate-page-shell.html` 셸·레이아웃 토큰(배경 #F4F6F9, 흰 패널+우측 설정 패널+하단 CTA)
  - `generate/generate-buttons.html` 버튼 셋 통일 규칙(생성=파랑 blue-600+크레딧칩 bg-white/20, 저장=검정 SaveButton, 보조=slate 아웃라인, Toss 블루 배포, 모바일 이전/다음)
  - `generate/generate-selection.html` 선택 카드·옵션 컨트롤 상태("선택=파랑" 원칙, 세그먼트 2변형, 스테퍼, 드롭존/마키)
  - 용도: 학생관리 하위 페이지 디자인 시 참조 기준
- [x] 5a. Canva MCP 서버 등록 (user 스코프, `https://mcp.canva.com/mcp`) (2026-07-11)
- [x] 5b. Canva MCP OAuth 인증 완료 — `claude mcp list`에서 ✓ Connected 확인 (2026-07-11)
- [ ] 5c. (선택) Canva 브랜드 킷 등록

## 매뉴얼 → Canva 이관 트랙 (2026-07-11 방향 전환)

매뉴얼(188장, `public/manual/redesign-185`, 초안 배포됨)은 Canva에서 다듬고 타 Canva 유저와 협업하기로 함.
**Canva 이관 후에는 Canva가 원본** — 기존 SVG 파이프라인(probe-out 후처리, 2사본 동기)은 은퇴,
이후 흐름은 "Canva 수정 → 일괄 내보내기(Canva MCP) → public/manual 교체 배포".

> **✅ 2026-07-23 Canva 최신화 완료.** 최신 PDF v2 14종으로 Canva 문서 14개(⑫ 학생 관리 신규
> 포함)를 전량 재생성하고, 각 문서 페이지 수를 PDF와 MCP로 대조 검증(전 항목 일치).
> 14개 새 링크로 `src/lib/manual/canva-links.ts`를 전량 갱신함. 상세 절차는
> `docs/manual-canva-sync-guide.md` 0장 참조. 아래는 그 이전 경위 기록.
>
> **2026-07-23 콘텐츠 갱신 1·2차 — 리포 SVG가 다시 최신본, 총 188 → 196장.** Canva 다듬기 작업이
> 시작되기 전에 제품이 크게 앞서가(카드결제 오픈·내신 시험 분석 대개편·IA 재편 등) 리포 SVG를
> 제자리 갱신했고(1차: 37장 수정·재캡처 10장), 이어 2차로 **⑫ 학생 관리(BETA) 챕터 5장 신설 +
> ⑤ 기출 웹툰 다운로드 1장 + ② 시험 배포 2장 증보 + 구본 스크린샷 6장 교체 + 전량 재번호(N/196)**를 반영했다
> (상세는 `docs/manual-content-refresh-2026-07.md`). 따라서 **Canva의 7/11자 가져오기본은 전
> 챕터가 구본**이다(재번호 때문에 페이지 번호가 전부 다름). Canva 협업을 재개하려면:
> 1. `npm run build:canva-pdf all` → `~/Desktop/smoat-manual-canva-pdf-v2/`
>    - **14챕터 전량 생성해 둠 (7/23)**. 텍스트 오퍼레이터 보존 검증됨
> 2. Canva에서 기존 13개 문서에 새 PDF로 페이지 교체 + **`12-students.pdf` 신규 가져오기 →
>    편집 공유 링크 발급 → `src/lib/manual/canva-links.ts`에 추가**(현재는 주석 자리만 있음)
> 3. 이후부터 Canva가 원본, 완성본 일괄 내보내기 → public/manual 교체
> - 변환 스크립트는 세션 스크래치패드가 아니라 **리포에 영구 보존**: `scripts/manual-canva-pdf.mjs`
> - 기존 13개 링크·`/admin/manual`의 「Canva 편집」 버튼은 그대로 유효(챕터 슬러그 불변,
>   12-students는 링크 추가 전까지 버튼 미노출 — 컴포넌트가 링크 없음을 안전 처리)
> - 이번 세션 Canva MCP 토큰 만료 상태였음 — MCP로 밀어넣으려면 인터랙티브 세션에서 재인증 필요

- [x] SVG 188장 → 챕터별 PDF 13개 변환 완료 (2026-07-11). 산출물: `~/Desktop/smoat-manual-canva-pdf/`
  - 방식: SVG를 HTML에 인라인(슬라이드별 id 네임스페이스) → 헤드리스 Chrome 인쇄. 텍스트 오퍼레이터 보존 확인(Canva에서 텍스트 편집 가능 조건). 변환 스크립트: 세션 스크래치패드 `svg2pdf/build_html.py`
- [x] 사용자: Canva에 PDF 13개 가져오기 완료 (폴더 smoat-manual-canva-pdf) (2026-07-11)
- [x] 챕터별 편집 공유 링크 발급(링크 소지자 편집 가능) → `src/lib/manual/canva-links.ts`에 13개 기록,
      /admin/manual 목차별 노출 설정 카드에 "Canva 편집" 버튼 추가 (2026-07-11)
- [ ] 사용자: 협업자와 Canva에서 다듬기 작업

## 사이트 업그레이드 트랙 A-1: features 5페이지 리디자인 (2026-07-12 착수)

전역 조사 결과 최우선 대상 = features/* 5개 SEO 랜딩(공통 FeaturePageShell "잉크 에디토리얼",
텍스트·체크불릿만 있고 시각 자산 전무). 템플릿 1개 리디자인 → 5페이지 일괄 적용.

- [x] 프로덕션 5페이지 풀페이지 캡처 + 디자인 브리프 → `~/Desktop/smoat-features-redesign/` (2026-07-12)
- [x] 사용자: Claude Design에서 시안 3종 생성 → **시안 A(딥 네이비 지그재그 몰입형) 확정**, standalone HTML로 전달 (2026-07-12)
- [x] Claude Code: 시안 A 이식 완료 (2026-07-12)
  - `feature-page-shell.tsx` 전면 리디자인: 네이비 라디얼 히어로(센터+목업+플로팅 수치카드 3개),
    고스트 numeral 지그재그 챕터(브라우저 프레임 캡처), 센터 FAQ, 네이비 CTA 밴드. SEO 텍스트·구조 보존
  - 콘텐츠 타입 확장: heroHighlight/heroImage/heroStats/sectionsTitle/sectionsBody + 섹션별 image
  - 실제 제품 캡처 22장: 매뉴얼 SVG 임베드에서 추출 → `public/features/shots/<slug>/` (16:10, next/image)
  - 캡처 없는 섹션(academy-erp 2~4)은 AbstractShot 브랜드 폴백 — 추후 인증 캡처 하네스로 실물 교체 가능
  - 검증: tsc 통과, 데스크톱 1440·모바일 390 렌더 확인
- [x] 신규 기능 페이지 2종 추가 — 같은 시안 A 템플릿 재사용 (2026-07-12)
  - `/features/passage-webtoon` (지문 웹툰) · `/features/question-extraction` (자료 추출)
  - 캡처는 매뉴얼 05·04장에서 추출(각 5장), 사이트맵(public-routes)·마케팅 헤더 시트·기존 페이지 related 상호링크 등록
- [x] 모바일 전용 리디자인 — Claude Design 모바일 3시안 중 **A(딥 네이비 몰입형)** 확정·이식 (2026-07-12)
  - 히어로 좌측정렬+풀폭 CTA 스택, 글라스 수치카드 3열, 풀블리드 교차 배경 챕터(고스트 숫자 우상단),
    다크 FAQ 섹션. 전부 mobile-first(base=모바일, lg:=기존 데스크톱 고정) — 데스크톱 무변경 검증 완료
  - 모바일 캡처·브리프는 `~/Desktop/smoat-features-redesign/` (current-mobile-*.png)
- [x] 메인 랜딩 디자인 랭귀지 통일 — Claude Design 랜딩 시안 이식 (2026-07-12)
  - 공용 프리미티브 `landing/shared/scene-ui.tsx` (GRID_INK/GRID_DARK/SCENE_NAVY_BG/SceneGlow/SceneKicker/SceneGhost/Accent)
  - 히어로: 스카이 이미지 → 네이비 라디얼+그리드+글로우, eyebrow 칩, 그라데이션 브랜드 라인, 앰버 필, 글라스 버튼
  - 데모 씬 6개: 고스트 숫자(01~06)+킥커 칩+흰/틴트 교차 배경+밑줄 강조→플레인 블루 (라이브 데모 컴포넌트 불변)
  - 폴더·최종 CTA: 네이비 전환, 샘플: 틴트+그리드. 헤더: 데스크톱 비스크롤 상태만 라이트 텍스트로 조건 처리
  - ※ 데모들은 자체 LIVE DEMO 크롬을 이미 보유 — 프레임 중복 금지 (scene-ui 주석 참조)
  - 검증 하네스: 스크래치패드 `lp-capture/capture.js` (puppeteer-core — 팝업 억제+스크롤 리빌 트리거+풀페이지)
- [ ] 커밋·배포 (사용자 지시 대기)
- 조사 전체 결과(A~C 추천 목록)는 이 세션 대화 기록 참조; 차순위 = EmptyState+404, 배너 템플릿 팩+세미나 자동화
- [ ] Claude Code: 완성본 일괄 내보내기 → `public/manual` 교체 + 매뉴얼 페이지 연결 + 배포

## 사이트 업그레이드 트랙 A-2: 내신 시험 분석 "문항 분석" 리디자인 (2026-07-17 착수)

대상 = `/director/workbench/exam-report/[id]` 1단계(문항 분석). generate/* 카드 3장을 기조
기준으로 삼은 첫 "학생관리 하위 페이지" 작업.

**진단(코드 조사로 확인):** 화면이 복잡한 건 증상이고, 진짜 병은 **검수가 의식(ritual)일 뿐
아무것도 막지 않는다**는 것. `mapConfirmed`·`confirmedNumbers` 를 grep 하면 소비처가 자기 UI
뿐이라, 0/22 상태로 학생 관리에 들어가 틀린 정답으로 학생 전체를 채점할 수 있었다.
(+ 배점 미추출 시 "22문항 · 0점"으로 22번 수동 입력, 셀 blur 저장마다 표 전체 잠김,
count 1짜리 유형 칩 15~20개 벽, 총평만 수정 불가, 모바일 스크롤 3축)

- [x] 사용자: Claude Design 시안 3종 수령 → **데스크톱=시안 B(채점 지도 주인공) + 모바일=시안 A(스텝 플로우)** 확정 (2026-07-17)
  - 원본 보존: `design-handoff/exam-report-item-analysis/` (README.md = 구현 기준 핸드오프 스펙)
  - ※ 채팅 첨부본은 인코딩이 깨져 오므로 반드시 이 폴더의 UTF-8 원본을 볼 것
- [x] **1단계 기반 — 데이터 모델 + 승계 + 게이트** (2026-07-17)
  - `ExamReviewState.mapConfirmedNumbers[]` 신규(정답·배점 문항별 확인) — reviewState 가 Json 이라 마이그레이션 불요.
    기존 `confirmedNumbers`(분석 검수)와 **별개 축** — 게이트 근거는 정답·배점뿐(분석 검수는 게이트 조건 아님)
  - `lib/exam-report/map-gate.ts` 단일 판정(서버·클라 공용) + **레거시 승계**:
    `mapConfirmedNumbers` 가 비어 있을 때만 `mapConfirmed || studentCount>0` 이면 열어준다
    → 기존 운영 건이 배포 즉시 잠기는 사고 차단. 배열이 비어있지 않으면 승계 제외라
    "22/22 후 수정 → 21/22 → 재잠금"이 승계로 뚫리지 않는다
  - `setMapQuestionConfirmed()` 액션(번호 단위, **병합** 갱신 — 「전체 검수 완료」식 배열 덮어쓰기 금지)
  - `updateExamMap()` 에 **수정 시 확인 해제**(points/correctAnswer/kind 변경 문항만 제거) — 없으면 게이트가 무의미
  - **B1 규칙은 유지**: README 의 "부분 합산"은 화면 표시 요구라 클라 계산으로 만족시키고,
    저장 총점 신뢰 규칙(전 문항 non-null 일 때만)은 그대로 둔다 → 과거 총점 파괴 버그 부활 방지
  - 게이트 UI: 탭 `aria-disabled`+자물쇠+`n/N`, 막힌 클릭은 `triggerHintGlow`(`[data-exam-map-panel]`)로 유도,
    `isStepComplete` 를 "AI 완료"가 아닌 "사람 확인 완료"로 교정, `deriveInitialStep` 의 건너뛰기도 게이트 준수
  - 검증: 순수 로직 6케이스 전부 통과 + **실DB 24건 전수 적용 — 학생 있는 건 잠김 0** (12건 승계로 열림, 잠긴 12건은 전부 학생 0명)
- [x] **2단계 저장 재작업 — 디바운스 배치 + 낙관 반영 + 잠금 제거** (2026-07-17)
  - **핵심 발견: 그 잠금은 불편이 아니라 동시 저장 방지 장치였다.** map/analysis 저장이 같은
    version CAS 를 공유해, 잠금만 걷어내면 22행 연타 입력이 겹쳐 VERSION_CONFLICT 폭풍이 난다
    → **직렬화가 선결 조건**. 단일 인플라이트(`inFlightRef`) + dirty 코얼레싱 while 루프로 해결
  - **잠복 버그 수리**: `version` 을 await **전에** 낙관적으로 올려서, 네트워크 오류(catch) 시
    재페치도 없이 version 만 어긋난 채 남아 이후 모든 저장이 영구 충돌했다. 이제 **서버 성공 후에만** 증가
  - `updateExamMap` 이 확인 해제까지 반영된 `reviewState` 를 반환 → 클라 낙관 해제와 서버 판정이 어긋나지 않게 동기화(서버 권위)
  - 1회성 액션(확인 토글)은 `runOneShot` 으로 큐와 직렬화 — 예약 저장을 먼저 흘려 version 정합 확보 후 실행
  - `locked = analyzing || saving` → `locked = analyzing`. 저장 상태는 `SaveIndicator`(자동 저장됨/저장 중/저장 실패)로 **표시만**
  - 검증(실제 앱 구동): **22행 연타 입력 100ms 내내 잠김 0 · VERSION_CONFLICT 0 · 서버 22개 배점 전부 반영(null 0)**,
    전 문항 입력 완료 시 B1 경로로 totalPoints 0→75 정상 갱신(=기존 "22문항 0점" 증상 해소),
    **게이트 무결성**: 22/22 심은 뒤 1번 배점만 수정 → `["1"]` 만 확인 해제, 21/22 로 게이트 재잠금 확인
- [~] **3단계 데스크톱(시안 B) — 채점 지도 패널 완료 / 우측 시트 잔여** (2026-07-17)
  - [x] dev 서버 재시작 — **stale CSS 확인 사살**: 재시작 전엔 소스에 있는 신규 arbitrary
        클래스가 CSS 에 생성되지 않았고(구 클래스만 동작), 재시작 후 소스에 실제로 단
        `w-[137px]`·`md:min-h-[191px]` 가 정상 생성됨을 실측 확인 → 이제 신규 유틸 사용 가능
  - [x] **문항별 확인 UI** — 표에 「확인」 컬럼(초록) + 상태점(파랑 미확인/초록 확인/빨강 실패).
        `handleToggleMapConfirm` 배선 → 게이트가 실제로 동작(신규 분석도 통과 가능)
  - [x] **「전체 검수 완료」 제거** — 22번 검수를 한 클릭으로 없애는 우회로 삭제
  - [x] **헤더 배지 2개 분리** — `분석 완료`(AI) + `확인 전 n/22`(사람). STATUS_BADGE 는 허브
        카드와 공유하므로 건드리지 않고 `GateBadge` 를 별도 추가
  - [x] **부분 합계**(표시 전용) + `배점 N개 미입력` 칩 + 미입력 셀 파랑 강조(주황·앰버 금지)
  - [x] **배점 일괄 입력** 팝오버(객관식/단답·서술 × 점수, 소계 미리보기)
  - [x] **툴바** — 검색 + 유형 **드롭다운**(count 1 칩 벽 대체) + 상태 FilterPill 4 + 필터 초기화
  - [x] Enter 확인 후 다음 미확인 행 포커스 / Tab 다음 칸 / "저장 기다릴 필요 없음" 힌트
  - 검증(실제 앱): 확인 전 배지 1 · 학생 관리 탭 aria-disabled 1 · 전체 검수 완료 0(제거됨) ·
    일괄입력 1 · 확인 1클릭 → 미확인 22→21 · 헤더 `확인 전 1/22` 즉시 반영
  - [x] **우측 424px sticky 패널**(`question-side-panel.tsx` 신규) — `grid-cols-[1fr_424px]`.
        탭 3개(문항 분석 | 원본 사진 | 총평), 번호칩+이전/다음/닫기 헤더, 본문만 스크롤(축 1개)
  - [x] **총평 편집 가능** — `handleEditExamLevel` 신규(examLevel 은 analysis 의 일부라
        기존 updateAnalysisEdits 경로 재사용). 시험지 총평·함정 총평·출제 범위 추정 편집,
        난이도 프로필/유형 분포는 집계라 읽기전용 유지(`ExamSynthesisPanel hideOverview`)
  - [x] **아코디언 22장 + 유형 칩 벽 제거** — 문항 분석은 표에서 고른 하나만 우측에 뜬다.
        `QuestionAnalysisCard`·`AnalysisTypeFilter`·`PendingCard` 참조 해제(파일은 잔존)
  - 검증(실제 앱): 옛 "문항 분석 검수" 패널 0개 · 탭 3개 · 행 선택 시 편집 필드 5개 ·
    총평 탭 textarea 편집 가능 true · tsc/lint 0
- [x] **4단계 모바일(시안 A)** (2026-07-17) — `analysis-step-mobile.tsx` 신규
  - **PC 무변경 원칙 준수**: 모바일 트리 `lg:hidden` / 데스크톱 트리 `hidden lg:grid` 로 완전 분리
    (mobile-first 재작성 대신 트리 분기 — PC 출력이 바뀔 여지를 원천 차단)
  - 공용 `MobileStepHeader`/`MobileStepNav`(이미 `lg:hidden`) 재사용. 스텝 ①정답·배점 → ②분석 검수
    → ③학생 관리(게이트). PC 2탭과 달리 "한 화면 한 기능" 방침대로 문항 분석을 둘로 쪼갬
  - 문항 카드 1장씩 펼침(첫 미확인 자동 오픈) + 종류 세그먼트 + **배점 프리셋 칩(2·3·4·5점)** +
    「확인하고 다음」(초록) → 다음 미확인 카드 자동 오픈. 실패 카드는 재분석(무료)
  - 하단 고정 바: 미확인 잔여 시 `다음 단계로 — n/22 확인` + 힌트 문구, 탭 시 첫 미확인 카드로
    `triggerHintGlow`. 본문 하단 `h-24` 여백 예약(고정 바 겹침 방지)
  - 원본 사진은 모바일 전용 Sheet 로 분리(표 안의 시트가 모바일엔 없으므로)
  - **검증(실측)**: PC(1500) 표 보임·스테퍼 숨김·우측 패널 보임 → **PC 무변경 확인** /
    모바일(390) 표 숨김·스테퍼 보임·카드 22개 → **가로 넘침 0px = 스크롤 3축 → 1축 해소**
- [x] **5단계 워크스페이스를 팝업으로 전환 — 여백 문제 해결** (2026-07-17)
  - 계기: 별도 페이지일 때 좌우 거터가 32px(`xl:px-8`) 고정이라 1920px 에서도 콘텐츠가
    화면 끝까지 붙어 답답했다(실측 확인). 셸 패딩은 워크벤치 6개 화면 공용이라 단독 변경이 곤란.
  - **인터셉팅 라우트**(`@modal/(.)[id]`)로 구현 — 단순 클라이언트 모달이었으면 잃었을 것들을 지킴:
    URL 유지(`/exam-report/[id]`) · 딥링크(`?openAddStudent=1`·`?start=1`) 생존 · 뒤로가기로 닫힘 ·
    주소 직접 진입/새로고침은 전체 페이지로 폴백 · 허브가 뒤에 남아 목록 맥락 유지
  - 안쪽 학생 워크스페이스(`[id]/students/[studentId]`)는 **인터셉트하지 않음** → 모달-인-모달 회피
  - `WorkspaceModal`(신규): 사방 인셋(`m-2 → sm:m-4 → lg:my-6 mx-8 → xl:mx-12 → 2xl:mx-20`),
    배경 클릭·Esc·닫기 버튼 = `router.back()`, body 스크롤 잠금(팝업 내부만 스크롤)
  - `ExamReportWorkspaceClient({ embedded })` 추가 — 팝업 안에선 페이지 문맥 전제를 벗는다
    (`-m-6`·`min-h-[calc(100vh-56px)]`·중복 배경 제거). 전체 페이지 경로는 기존 그대로
  - ⚠️ **패러렐/인터셉팅 라우트는 dev 서버 재시작 없이는 route tree 에 안 잡힌다** — 처음엔
    인터셉트가 안 걸려 전체 페이지로 navigate 됨. 재시작 후 정상. **세션 중 2번 겪음** —
    컴파일 에러가 한 번 나면 인터셉트가 죽고 캐시에 남으므로, "팝업이 안 뜬다" = 재시작부터 의심
  - [x] **모든 진입 경로에서 팝업 유지** (2026-07-17) — `[id]/page.tsx`(직접 진입·새로고침)도
    `WorkspaceModal` 로 감쌌다. 같은 URL 이 새로고침 여부에 따라 다른 레이아웃(여백 넓은 전체
    페이지)을 주던 불일치 제거. 닫기는 경로별로 분기: 인터셉트=`router.back()`(허브가 뒤에 있음)
    / 직접 진입=`closeHref` 로 허브 `replace`(돌아갈 앱 히스토리가 없어 back() 하면 앱 밖으로 나감)
  - [x] **딥링크 팝업 두 겹 수리** — `?openAddStudent=1` 소비 후 URL 청소를 `router.replace()` 로
    하고 있었는데, 그건 Next 클라 내비게이션이라 **인터셉터가 그걸 가로채** 페이지로 뜬 팝업 위에
    팝업을 하나 더 얹었다(실측 2개). 라우팅이 아니라 주소창 청소가 목적이므로
    `window.history.replaceState` 로 교체 → 1개. (인터셉팅 라우트 도입 시 기존 `router.replace`
    URL 청소 코드가 지뢰가 된다는 교훈)
  - 검증(실측 5경로): 허브 클릭 1 · 새로고침 1 · 직접 진입 1 · 딥링크 1 · X→허브 복귀 0
  - 검증(실제 앱 4종): ①허브 카드 클릭 → 팝업 + URL 유지 + 허브 잔존 ✓ / ②주소 직접 진입 →
    전체 페이지 폴백 ✓ / ③뒤로가기 → 팝업 닫힘 + 허브 복귀 ✓ / ④딥링크 `?openAddStudent=1` → 학생 관리 탭 ✓
- [ ] 커밋·배포 (사용자 지시 대기) — 5단계까지 완료되어 배포 가능 상태
- [ ] 3단계 데스크톱(시안 B) — 표 + 우측 3탭 시트(분석/원본/총평) + 필터 4+유형 드롭다운 + 배점 일괄입력 + 총평 편집
- [ ] 4단계 모바일(시안 A) — `mobile-step-flow` 스텝 플로우
- [ ] 커밋·배포

## 결정 대기 사항

- **매뉴얼 185장 반영 방식** — 매뉴얼은 rebuild 금지 상태(수작업 검수·수정분이 rebuild 시 소실).
  새 템플릿 확정 후 택1:
  - ① 새 파이프라인으로 전면 재생성 + 재검수
  - ② probe-out fix 스크립트 방식으로 기존 SVG 제자리 후처리(스타일만 입히기)
  - 시안 확정 후 결정해도 됨.

## 기술 참고

- **DesignSync 순서**: `list_projects`/`get_project`(타입이 DESIGN_SYSTEM인지 확인) → `finalize_plan`(쓰기/삭제 경로 확정, planId 발급) → `write_files`(localPath 업로드, 256개/호출) →
  카드 인덱스는 프리뷰 HTML 첫 줄 `<!-- @dsCard group="…" -->` 주석으로 자동 구성.
- **매뉴얼 파이프라인**: `npm run build:slides`, 작업본 `manual-slides/` · 프로덕션본 `public/manual/`
  2사본 — 수정 시 항상 양쪽 동기 + diff 0 검증. 리디자인 검수·수정은 probe-out fix 스크립트로
  SVG 제자리 후처리(rebuild 금지).
- **Canva 연계**: Claude Design → Canva 내보내기(편집 가능한 구조로 열림). Canva MCP로는
  디자인 검색·생성·브랜드 템플릿 자동 채우기·내보내기 가능.
- **제약**: 국어 기능은 대외비 — 디자인 시스템 번들·시안에 국어 기능 관련 화면/문구 포함 금지.
