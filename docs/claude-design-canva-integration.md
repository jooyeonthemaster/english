# 클로드 디자인 × 캔바 연계 계획 (디자인 업그레이드 파이프라인)

> **트리거 문서.** 사용자가 "클로드 디자인으로 연계해서 하는 걸 구현하려고 해"라고 하면
> 이 파일을 읽고, 아래 [진행 상태](#진행-상태)를 확인한 뒤 다음 단계부터 대화를 이어간다.
> 단계가 진행될 때마다 이 문서의 체크리스트를 갱신할 것.

작성일: 2026-07-11 · 상태: **디자인 시스템 업로드 완료 (2026-07-11), 사용자 시각 작업 대기**

> 프로젝트: "SMOAT Design System" · projectId `784562e1-90a8-4bd0-bf57-d06283cb73b7`
> 번들 원본: 리포 `design-sync/` (13개 카드: Brand/Colors/Type/Components×7/Patterns×3)
> 재업로드 절차: `design-sync/` 파일 수정 → finalize_plan(localDir=design-sync, writes=`foundations|components|patterns/*.html`) → write_files(localPath)

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
- [x] 5a. Canva MCP 서버 등록 (user 스코프, `https://mcp.canva.com/mcp`) (2026-07-11)
- [x] 5b. Canva MCP OAuth 인증 완료 — `claude mcp list`에서 ✓ Connected 확인 (2026-07-11)
- [ ] 5c. (선택) Canva 브랜드 킷 등록

## 매뉴얼 → Canva 이관 트랙 (2026-07-11 방향 전환)

매뉴얼(188장, `public/manual/redesign-185`, 초안 배포됨)은 Canva에서 다듬고 타 Canva 유저와 협업하기로 함.
**Canva 이관 후에는 Canva가 원본** — 기존 SVG 파이프라인(probe-out 후처리, 2사본 동기)은 은퇴,
이후 흐름은 "Canva 수정 → 일괄 내보내기(Canva MCP) → public/manual 교체 배포".

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
