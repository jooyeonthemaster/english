# 클래스 스튜디오 (Class Studio) — 설계 정본 v1 (2026-08-09)

> 이 문서는 **규범(normative)** 이다. 이 기능을 만지는 모든 에이전트·작업자는 이 문서를 먼저 읽고,
> 여기 적힌 계약(라우트·타입·문구·금지사항)을 어기지 않는다.
> 문서와 코드가 충돌하면 **문서를 고친 뒤** 코드를 고친다(스펙 착지 원칙).
> 임의 숫자·명칭 창작은 critical 위반이다 — 이 문서에 없는 값이 필요하면 보고하라.
> 리포 루트: `D:\Desktop\2026project\nara`

---

## 0. 배경 · 한 줄 정의

**"클래스를 만들고 → 지문을 등록하고 → AI 분석 1회로 학습 모듈을 준비하고 → 원하는 모듈만
골라 모바일 학습으로 배포하고 → 학생을 초대한다"** — 이 다섯 걸음이 한 화면 체계 안에서
끝나는 디렉터용 신규 표면. 클래스카드(ClassCard)의 "클래스 → 세트 → 학생" 구조를 참조하되,
생성물은 전부 기존 모바일 학습 런타임(worksheet-study, `/g/w/[taskId]`)으로 배포된다.

동기(사용자 지시 2026-08-08):
1. 현행 학습지 생성은 지문 하나에 A4 20페이지급 문서를 한 번에 만든다 — 단어만/구문만 같은
   세분화 생성이 불가능하고, 모바일 학습을 전제로 설계돼 있지 않다.
2. 생성 UX 가 학생 관리와 완전히 분리돼 있어 "A 지문으로 어제 구문 분석, 오늘 단어 시험"
   같은 연결이 성립하지 않는다.
3. 어휘 시험 선지가 무설계 상태다(§9 — 같은 학습지의 다른 행에서 무작위 3개.
   `src/lib/worksheet-study/compile.ts` `pickDistractors`). 코퍼스 자산(표제어 27,011 ·
   sense 35,341 · 혼동어·문항팩 34,523)이 한 개도 소비되지 않는다.

**제1원칙: 쉽고 단순하게 — 그러나 기능이 단순하지는 않게.** 설정 항목은 최소(이름 하나로
클래스 생성), 복잡도는 기본값 뒤로 숨긴다. 학년·수강료·시간표 같은 ERP 필드는 노출하지 않는다.

**기존 경로 무접촉 원칙**: `/director/workbench/*` 의 기존 학습지 생성·자료 화면은 한 줄도
바꾸지 않는다(공유 라이브러리의 additive 확장은 §11 무회귀 조건 하에 허용). 스튜디오는
`/director/studio` 이하의 신규 테스트 표면이다.

---

## 1. 목표 / 비목표

**목표**
- G1. 클래스 단위로 지문 등록·학습 생성·배포·학생 관리·결과 확인이 **한 흐름**으로 통합.
- G2. 지문당 AI 분석은 **1회**(AnalysisReport). 모든 학습 모듈은 그 결과물에서 파생 —
  "오늘 단어, 내일 구문"이 추가 생성 비용 0으로 연결된다. 단, **새로 분석**도 항상 가능.
- G3. 배포 단위는 **모듈 조합**(단어만·구문만·풀코스…) — 학생 폰에서 지문당 10~15분 코스.
  배포 컴포저가 조합의 예상 학습 시간을 실시간 표시한다.
- G4. 학생 등록 즉시 **카톡 초대장**(안내문+학원 코드+학생 코드+접속 링크) 클립보드 복사.
- G5. 첫 사용자를 위한 **온보딩 코치마크** — 단계마다 다음 행동 버튼에 말풍선.
- G6. 어휘 시험 선지 품질 수술 — 코퍼스 자산 연결(§9). 스튜디오뿐 아니라 기존 배포분에도 적용.

**비목표 (v1)**
- 기존 `/director/workbench/*` 화면 개편·이관 — 건드리지 않는다.
- 국어(PRIME_KO)·Phase2(pages) 문서 — worksheet-study 미지원과 동일하게 제외.
- 실제 카카오톡 API 발송 — v1 은 "복사해서 붙여넣기" 키트만(자동 발송은 v2).
- 학부모(Parent) 연동, 결제·크레딧 정책 변경.

---

## 2. 라우트 지도

```
/director/studio                          클래스 목록 (엔트리)
/director/studio/c/[classId]              클래스 홈 — 탭: 지문 | 학생 | 결과 | 설정 (?tab=)
/director/studio/c/[classId]/p/[passageId]  지문 스튜디오 — 분석·모듈 그리드·배포·이력
```

- 신규 파일은 전부 `src/app/(director)/director/studio/**` + `src/actions/studio/**` +
  `src/components/studio/**` 아래에만 둔다.
- nav 등록: 「학습지 생성」 근처에 「클래스 스튜디오」 + `베타` 배지 (nav 관례는 정찰 결과 §12).
- 학생 쪽 신규 라우트는 **없다** — 배포물은 전부 기존 `/g/w/[taskId]` 로 흐른다.

---

## 3. 화면 UX 스펙 (버튼 위치·문구 포함 — 문구는 이대로 사용)

### 3.0 스튜디오 공통 셸 (2026-08-10 신설 — 사용자 지적: "페이지별 통일성 최악")

세 페이지(목록·클래스 홈·지문 스튜디오)는 **하나의 제품**으로 보여야 한다. 정본
`src/components/studio/shell.tsx` 의 `StudioShell` 이 공통 골격을 제공하고 세 페이지가
전부 이것으로 렌더한다:

- **배경**: `#F4F6F9` 전면(-m 시트 확장 관용구), 본문 폭 `max-w-5xl`(지문 스튜디오는
  에뮬레이터 레일 포함 `xl:max-w-[1200px]`), 패딩 `px-4 md:px-8 · pt-5 · pb-8`.
- **브레드크럼(정본 — 클래스 컨텍스트 상실 금지)**: 최상단 1줄,
  `클래스 스튜디오 › {클래스명} › {지문명}` — 각 조각은 해당 화면 링크, 현재 화면
  조각만 slate-900 볼드, 나머지 slate-400. 목록 화면은 루트 조각만. 구 뒤로가기
  화살표는 브레드크럼과 병존(모바일 관성 동선 유지).
- **타이틀 행**: `text-base md:text-lg font-bold` + 우측 액션 슬롯(원문 보기·학생 초대
  등 화면별 주입). 섹션 제목은 `text-sm font-bold` + 부제 `text-xs text-slate-400`.
- **카드 언어**: `rounded-xl border-slate-200 bg-white`, 강조는 blue 계열만(§10 하우스
  스타일 — Sparkles·주황 금지 유지).

### 3.6 학생 화면 에뮬레이터 (2026-08-10 신설 — 지문 스튜디오 우측 레일)

디렉터가 배포 전에 **학생이 받게 될 실물**을 조작해 본다. 위치: 지문 스튜디오
xl 이상에서 우측 고정 레일(폭 420px, sticky), xl 미만에서는 타이틀 행 우측
`학생 화면 미리보기` 버튼 → 전폭 시트.

- **프레임**: 폰(390×720)/태블릿(768×1000, 패널 폭에 맞춰 scale) 토글 — 상단 상태바
  (시간·와이파이·배터리 — tutor 에뮬레이터 관용구)·라운드 베젤. 토글 아이콘
  Smartphone/Tablet(lucide). (치수 개정 2026-08-10: 구 390×780/768×1024 는 구현 실측
  치수와 어긋나 코드 값으로 정본화.)
- **스케일 산식 정본(2026-08-10 개정 — 태블릿 베젤 잘림 수정)**: 베젤(좌우 border 6px씩,
  합 12px)은 스케일되지 않는 크롬이므로 **스케일 분모에서 선차감**한다 —
  `scale = min(1, (hostW − 12) / dev.width)`. 구식 `hostW / dev.width` 는 스케일 구간
  (태블릿)에서 프레임 총폭이 `hostW + 12` 가 되어 레일 그릇(overflow-y-auto — 다른 축이
  visible 이 아니면 overflow-x 가 auto 로 계산)의 우측 6px 베젤이 잘렸다(실측 확정:
  1440 레일에서 베젤 432px > 호스트 420px). 폰(scale=1)은 `390+12=402 ≤ 420` 이라
  증상이 없던 것 — 산식은 기기 공통으로 적용한다.
- **내용 = 실물**: 신규 액션 `getStudioEmulatorPlan`(deploy.ts) 이
  compileServerStudyPlan 로 **사용 가능 모듈 전체**의 스테이지를 컴파일해 내려주고,
  프레임 안에 학생 허브 재현(스테이지 행·문항 수·예상 분) → 행 탭 시 **실제 학생
  플레이어 `StudyPlayerClient` 를 `harness`(무전송) 모드로 마운트** — 판정·재도전·요약
  까지 실동작, 서버 기록 0. 플레이어의 나가기/다음 단계는 신규 optional 콜백
  (`onExit`/`onNextStage`, 부재 시 기존 라우팅 — 무회귀)으로 프레임 내부 내비로 연결.
- **선택 연동(2026-08-10 감사 개정 — 구 문구 "배포 바 요약과 항상 일치"는 자기모순이라
  폐기)**: 모듈 카드 체크 선택이 있으면 **그 조합만** 표시하고 배포 바 요약과 일치한다.
  선택이 **없으면** 사용 가능 전체를 표시하되, 프레임 위에 상태 라벨
  "선택한 모듈이 없어 전체를 미리 봅니다"를 띄워 배포 바의 "학습 모듈을 선택해 주세요"와
  어긋나 보이지 않게 한다. 사용 가능 모듈이 0이면 프레임을 축소하고(빈 프레임이 화면을
  통째로 비우지 않게) "모듈을 분석하면 학생 화면을 미리 볼 수 있습니다" 빈 상태.
- 상단 캡션: "학생 화면 미리보기 — 실제 배포와 동일한 문제입니다".
  단 사용 가능 모듈이 0일 때는 동일성을 주장하지 않는다(문항이 0인데 "동일"은 거짓).
- **허브 재현 범위**: 실제 학생 허브(`/g/w/[taskId]` hub-client)의 구조·타이포·간격을
  미러한다. 마감(D-Day)·안내문처럼 **배포 시점에 정해지는 값은 표시하지 않는다** —
  가짜 값을 넣어 "동일"을 참칭하지 말 것.

### 3.1 `/director/studio` — 스튜디오 워크벤치 (2026-08-10 전면 개정)

> **개정 배경(사용자 지시 2026-08-10 야간)**: "클래스 관리를 파일·폴더 관리자처럼,
> 가운데에 학습지 생성의 「내 지문함」을 그대로, 생성은 무엇을 만들지 체크한 뒤
> 하단 작업 큐로, 완료되면 바로 배포." — 구 "사이드바 240px + 카드 그리드" 홈은 폐기.
> 홈은 단어장 스튜디오(/director/workbench/wordbook)와 같은 **전고정 높이 3분할
> 워크벤치**가 된다.

#### 3.1.0 프레임 (단어장 관용구 이식 — wordbook-client.tsx:539 계보)

- 루트: `-mx-3 -mt-3 -mb-3 flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col overflow-hidden
  bg-white md:-m-6 md:h-dvh` — **블리드 값은 StudioShell 실측(-mx-3/md:-m-6)을 따른다**
  (wordbook 의 -m-4 는 studio 부모 패딩 실측 12px 와 어긋난다 — §3.0 주석). 페이지
  스크롤 없음, 열별 독립 스크롤. 이 화면은 StudioShell 을 쓰지 않는다(문서형 max-w 가
  3분할을 깨뜨린다) — §3.0 "한 제품" 요구는 상단바가 승계한다.
- 상단바: `h-12 shrink-0 border-b border-slate-200 pl-3 pr-16`(pr-16 = 전역 우상단
  플로팅 회피) — 좌측 [스튜디오 아이콘 + "클래스 스튜디오" 볼드 + 선택 클래스명 조각],
  우측 [클래스 N · 학생 N 메타(xl+)] + 보조 액션. 타이포·버튼 토큰은 단어장 실측
  (h1 text-[14px] font-bold · CTA h-8 rounded-md bg-blue-600 text-[12px])을 따른다.
- 본문: `flex min-h-0 min-w-0 flex-1` 한 컨테이너에 [클래스 트리 레일] [PanelHandle]
  [중앙 열] [PanelHandle] [클래스 패널 레일] — `useResizablePanels` 재사용, panelSpecs:
  트리 `{min:200,max:340,default:248,sign:1}`(md+), 클래스 패널
  `{min:320,max:480,default:360,sign:-1}`(xl+), minCenter 560,
  storageKey `"studio-workbench-panels"`. 접힘 = aside 언마운트(desktopWidth 0 분기).
- 하단 도크(§3.7): 본문의 **형제 flex 아이템**(`shrink-0 border-t`) — sticky·z 싸움 금지.
- 모바일(md 미만): 트리 = 오버레이 드로어(filter-rail 이중표면 패턴 — 백드롭
  bg-slate-900/25 + w-[264px] 패널, 본문 한 벌 공유), 클래스 패널 = 시트. 상단바에
  트리 토글 버튼.

#### 3.1.1 좌측 — 클래스 레일 (클래스 관리 전용 · 2026-08-11 v2 전면 개정)

> **v2 개정(2026-08-11 사용자 지시)**: "이 패널은 말 그대로 클래스만 관리한다 —
> 클래스를 추가하고, 그 클래스에 학생을 추가하는 곳. 지금처럼 결과물(자료)이
> 뜰 필요는 전혀 없다." 구 "클래스 = 폴더, 지문 = 파일" 트리는 **전면 폐기** —
> 「전체 자료」 루트 행·등록 지문 자식 행·지문 N 카운트 배지 전부.
> 자료 표시는 중앙 지문함·우측 패널(도시에/클래스 패널) 소관이다.
>
> **v2.1 개정(2026-08-12 사용자 지시)**: "펼치면 학생 목록이 떠야지." — 펼침
> 셰브론을 **복원**하되 자식은 **학생 목록**이다(지문 절대 아님). 클래스 관리
> = 클래스 + 그 안의 학생까지가 이 레일의 소관.

구성(위→아래):
- 헤더 행: `클래스` 라벨(SectionTitle 규약) + 우측 `+`(새 클래스, 아이콘 버튼).
- 클래스 행: 펼침 셰브론(자식=학생 목록, 선택과 독립) + Users 아이콘 + 이름 +
  우측 **학생 N명** 배지(title "학생 N명") + 케밥.
  행 상호작용은 folder-list-row 계약 축약 복제(유지): 클릭=선택, **선택 행
  재클릭=선택 해제**(중앙이 전체 지문함으로 복귀 — 구 「전체 자료」 루트 행의
  대체. 더블클릭의 2번째 클릭(e.detail≥2)은 토글에서 제외 — rename 진입 직전
  선택이 풀리는 역효과 방지, 더블클릭은 반드시 선택 상태로 진입), 더블클릭=
  인라인 이름변경(Enter 확정/Esc 취소, maxLength 60), 케밥(hover 노출 — 선택
  행·터치 포인터 상시)=**학생 추가**·이름 변경·보관, 선택 하이라이트
  `bg-blue-100/70` + 라벨 text-blue-800, 좌측 `absolute inset-y-1 left-0
  w-[2px] bg-blue-600` 인디케이터.
- **펼침 자식 = 학생 목록(v2.1)**: 학생 행(`pl-6`, UserRound 아이콘 + 이름
  truncate + 학생 코드 모노 + hover 초대장 아이콘 버튼 → 초대 키트 시트 §5) +
  꼬리 「+ 학생 추가」 행(케밥 항목과 동일 모달). 지연 로드
  listStudioClassStudents — 클래스당 1회 캐시(오케스트레이터 studentsByClass
  소유), 로딩 스피너 행·실패 시 「다시 시도」 행(강제 재조회). 로스터 변동
  (등록·연결) 시 해당 클래스 **자동 펼침 + 강제 재조회**(기존 목록 유지한 채
  갱신 — 깜빡임 방지). 빈 목록은 "등록된 학생이 없습니다" 1줄 + 꼬리 행 유지.
- **학생 추가(v2 신설)**: 케밥 「학생 추가」 → 학생 탭(§3.2)의 학생 등록 모달을
  그대로 재사용(기존 학생 검색-연결 + 신규 등록, 오케스트레이터가 호스팅). 신규
  등록 성공 시 초대 키트 시트(§5)가 자동 오픈(z-90 > 모달 z-70)되고 모달은 열린
  채 Enter 연속 등록 지원 — 학생 탭 동선 그대로. 로스터 변동 = 클래스 목록
  리프레시(레일 배지·상단바 메타) + 우측 클래스 패널 리마운트(rosterVersion 키
  — 패널 학생 미리보기는 마운트 시 1회 조회 계약 §3.1.3).
- 선택의 의미(불변): 선택 클래스는 중앙 담기 스코프(§3.1.2)·우측 클래스 패널
  (§3.9v2.1 위계 ③)·배포 기본 대상의 앵커다 — 레일이 자료를 보여주지 않아도
  스코프 앵커 역할은 유지한다. 등록 지문 id 집합(listStudioClassPassages)은
  클래스 **선택 시** 지연 로드해 중앙 스코프 칩과 공유한다(구 "트리 펼침 로드"
  의 승계 — 캐시 계약 동일).
- 하단 고정: `+ 새 클래스` 전폭 primary(`shrink-0 border-t p-2`) — 레일 컨테이너는
  `flex flex-col`, 목록은 `min-h-0 flex-1 overflow-y-auto`. 생성 모달은 기존 1필드
  모달 재사용(문구 불변). 생성 즉시 **레일에서 그 클래스 선택**(구 "클래스 홈 이동" 폐기).
- 보관 확인 문구는 §3.2 설정 탭 정본 그대로. 보관 후 레일에서 제거 + 선택 해제.
- 빈 상태(클래스 0): 레일에 안내 1줄 + 코치마크 1번(create-class)이 하단 `+ 새 클래스`
  버튼에 앵커(§4 개정).
- 지문 스튜디오 딥링크는 레일 소관이 아니다 — 클래스 홈(지문 탭)·지문 도시에
  경로가 맡는다(§3.1.4).

#### 3.1.2 중앙 — 「내 지문함」 완전 임베드 (⚠ 2026-08-11 §3.8 로 대개정 — 충돌 시 §3.8 우선)

학습지 생성 페이지의 인테이크 표면을 **그대로 재호스팅**한다(사용자 지시 "저 컴포넌트를
그대로"). 조립 정본 = custom-type-generate-panel 배선 + generate-page-client 슬롯 구성:
- `IntakeSurface` libraryLabel="내 지문함", 탭: 직접 입력(MultiPassagePaste — AI 원문
  복원·AI 지문 생성 포함) · 파일업로드(GenerateUploadPanel + useGenerateExtraction) ·
  기출 지문(ExamPassageLibrary) · 내 지문함(PassageCardGrid) · 워크스페이스(overlay —
  PassageWorkspace + useWorkspaceRows, AI 변형 지문 생성 포함).
- 상태 훅: passage-registration 판 `usePassageLibrary`(폴더 CRUD 포함 완전판).
- 컨테이너 계약: 중앙 열 `flex min-h-0 min-w-0 flex-1 flex-col` + 내부 스크롤
  (PassageCardGrid 는 `flex-1 min-h-0 overflow-hidden` 부모 전제). FolderSection 의
  sticky/-mx-6 크롬은 embedded 경로로 벗기고 크롬은 중앙 열이 소유한다.
- **클래스 스코프 칩**: 클래스 선택 중이면 그리드 상단에 `이 클래스 지문만 (N)` 토글 칩
  — 켜면 등록 지문만 필터(클라이언트 필터, 등록 id 집합은 레일 클래스 선택 시
  지연 로드와 공유 — §3.1.1v2).
- **담기 액션**: 클래스 선택 중 지문 선택 시 툴바에 `클래스에 담기` 버튼 추가
  (addPassagesToStudioClass — 멱등). 붙여넣기·AI 생성·추출로 새로 등록된 지문은
  클래스 선택 중이면 **자동으로 그 클래스에 담는다**(토스트에 명시).
- 생성 CTA: 그리드 하단 전폭 CTA·툴바 `학습자료 생성` 모두 **모듈 선택 시트(§3.7.1)를
  연다**(구 일괄 5크레딧 즉시 발사 아님). 라벨 정본: `학습 만들기`.
- **세로 예산 정본(2026-08-11 — "카드 최소 6장이 안 잘리고" 지시)**: 중앙 카드
  2행이 통으로 보이는 것이 이 화면의 1급 가치다. 이를 위해 스튜디오 임베드는
  ①폴더 칩 창 접힌 채 시작(`initialFolderCollapsed` — 펼치기 한 클릭) ②컴팩트
  카드(`compactCards` — 300→260px·미리보기 5→3줄) ③생성 도크 기본 접힘(발사 시
  자동 펼침·사용자 선호 영속)을 쓴다. 실측 게이트: 1750×930·1750×1000·1920×1000
  에서 온전 가시 카드 ≥6(.tmp-studio-qa/probe-card-visibility.mjs).
- PassageCardGrid·IntakeSurface 등 공유 컴포넌트는 **무수정 재사용이 기본**, 불가피한
  확장은 §11 무회귀(기존 6개 호스트 픽셀·동작 불변) 조건의 additive prop 만.

#### 3.1.3 우측 — 클래스 패널 (xl+, 접기 가능)

선택 클래스의 컨텍스트를 요약한다(파일 관리자의 "속성" 패널):
- 헤더: 클래스명 + `클래스 홈 열기` 링크(→ /c/[classId], 학생·결과·설정 탭 보유 화면).
- 지표 스트립: 학생 N · 지문 N · 배포 N (기존 카드 지표 3종 아이콘 그대로).
- 학생 미리보기: 상위 5명(이름·학생 코드) + `+ 학생 등록`·`학생 초대`(기존 초대 키트
  시트 재사용). 전체 관리 링크는 클래스 홈 학생 탭.
- 최근 배포 3건: 일시 · 모듈 조합 칩 · 완료 n/m + `결과 보기`(클래스 홈 결과 탭).
- ~~전체 자료(클래스 미선택) 상태: 학원 요약 + 안내~~ — §3.9 개편으로 폐기
  (OverviewPane 삭제, 미선택 분기는 오케스트레이터 소유 §3.9v2.1). 「전체 자료」
  루트 행 자체도 §3.1.1v2 로 폐기.

#### 3.1.4 클래스 홈·지문 스튜디오와의 관계

- `/c/[classId]`(4탭)·`/c/[classId]/p/[passageId]`(지문 스튜디오)는 **존치** — 워크벤치는
  진입·수집·생성·배포의 허브, 세부(학생 관리·결과 매트릭스·모듈 미세 조작)는 기존 화면.
- 지문 스튜디오 진입은 클래스 홈(지문 탭)이 맡는다(레일 지문 행 폐기 §3.1.1v2 ·
  도크 폐기 §3.8.9v4).

### 3.7 학습 만들기 — 모듈 선택 시트 · 작업 큐 도크 · 즉시 배포 (2026-08-10 신설 · ⚠ 2026-08-11 §3.8 로 대개정 — 시트→모달·도크 내용물 교체, 충돌 시 §3.8 우선)

#### 3.7.1 모듈 선택 시트

`학습 만들기` CTA → 우측 슬라이드오버 시트(basket-dock 관용구 — `fixed inset-0 z-50
justify-end` + `sm:w-[460px]` 패널). 구성:
- 헤더: "학습 만들기" + 선택 지문 N개 칩. 대상 클래스 표시(선택 클래스명 / 미선택 시
  "클래스 미지정 — 배포하려면 클래스를 선택하세요" 경고 톤 캡션, 시트 내 클래스 선택
  드롭다운 제공).
- 모듈 카드 7종(§3.4 표와 같은 라벨·부제): 체크박스 + 우측 **가격 배지**. 가격은
  섹션 종량제 정본(`module-sections.ts`)으로 지문별 실계산해 합산 — 시트를 열 때
  신규 액션 `getStudioPassageSectionStates(passageIds)`(§3.7.4)로 보유 섹션을 받아
  `이미 준비됨 M/N지문 · +K크레딧` 형태로 표기한다. 전 지문 보유 모듈은 `0크레딧 ·
  바로 사용 가능`.
- **실전 문제 특례**: 다른 모듈과 동시 선택 불가(fast 라우트가 targetSections+
  includeWorksheet 동시 지정을 400 으로 거절), 선택 지문 전부 분석 보유일 때만 활성 —
  비활성 캡션 "다른 모듈을 먼저 분석하면 생성할 수 있습니다"(§3.4 문구 정본).
- 푸터: 좌측 합계 `총 N크레딧`(0이면 "추가 비용 없음") + 우측 `생성 시작` primary.
  클릭 → 지문별로 fast 라우트 발사(§3.7.2) + 시트 닫힘 + 도크 펼침.
- 전 지문 보유(비용 0·부족 0)인 조합도 같은 `생성 시작` 으로 발사한다(라벨만
  `바로 준비하기 · 추가 비용 없음`) — fast 라우트가 missing=∅ 이면 과금·LLM 없이
  즉시 "이미 준비됨"을 응답하므로(§3.4.1-2) 도크에 완료 항목이 곧장 떠 `바로 배포`
  로 이어진다. 별도 안내 분기를 만들지 않는다(동선 1개 유지).

#### 3.7.2 발사·큐 엔진 (usePassageQueue additive 확장)

- 큐 엔진 = 기존 `usePassageQueue` **워크벤치당 정확히 1개 인스턴스**, cacheKey
  `studio-analysis:${academyId}`(§12 폴러 1개 규칙 — 좌/중/하단이 각자 훅을 부르면
  폴링 3배 egress 재발). 큐 상태는 컨텍스트로 발행하고 발행 시그니처에
  `streamPreview.tick` 를 반드시 포함한다(26-07-25 실사고).
- 훅 additive 확장: 발사 항목에 `targetSections?: SectionKind[]`·`sourceModule?: string`
  옵셔널 추가 — **부재 시 요청 body 바이트 동일**(기존 학습지 생성 페이지 무회귀,
  §11 계약 테스트 필수). 스튜디오 발사는 targetSections = 선택 모듈 필요 섹션 합집합,
  sourceModule 은 넣지 않는다(다중 모듈 발사 — 지문 스튜디오 카드 귀속 규칙은
  부분집합 폴백으로 동작).
- 지문당 활성 잡 1개 규칙은 서버가 보장(중복 요청 = 기존 jobId 반환) — 클라이언트는
  발사 전 진행 중 항목을 걸러 토스트로 알린다.
- 발사 시 클래스가 선택돼 있으면: ① 선택 지문을 그 클래스에 자동 등록(멱등)
  ② 큐 항목에 `{classId, modules}` 컨텍스트 스탬프(클라이언트 상태 — 도크 배포 버튼용).

#### 3.7.3 하단 생성 도크

- 접힘(기본): footer 스트립 `h-12 shrink-0 border-t bg-white` — 좌측 상태 요약
  ("생성 중 2 · 완료 1 — 완료되면 바로 배포할 수 있습니다" / 유휴 시 "선택한 지문으로
  학습을 만들어 보세요"), 우측 펼침 토글. **큐가 비어도 항상 렌더**(중앙 높이 튐 방지).
- 펼침(2026-08-11 개정 — 구 `max-h-[40vh]` 자동 팽창은 스트리밍 카드가 크면 중앙
  지문함을 납작하게 만들었다): 패널 높이는 **사용자 소유** — 상단 드래그 핸들
  (폴더 창 관용구: 가운데 그랩바 + 더블클릭 초기화 + 우측 `접기`)로 조절하고
  localStorage(`studio-dock-height:v2`) 영속, 기본 400px. **하한 220px = 카드 한
  행이 온전히 보이는 높이**(2026-08-11 개정 — 구 하한 150 은 카드보다 작아 내리면
  잘린 카드가 남았다). 하한에서 60px 이상 더 끌어내리는 제스처는 접기로 해석한다
  (짜부라진 중간 상태를 만들지 않는다). 어떤 값이어도
  `min(60vh, 뷰포트 − 380)` 클램프로 **중앙 최소 높이(≈284px — 탭·툴바·카드 한 행
  하한)를 침범하지 못한다**(2026-08-11 개정 — 구 500 예약은 짧은 화면에서 도크를
  과하게 눌렀다). 카드는 패널 안에서 스크롤된다. **도크는 기본 접힘**(2026-08-11
  재개정 — 「중앙 카드 최소 6장 온전 가시」 지시가 우선. 발사 시 onLaunched 자동
  펼침, 선호는 `studio-dock-expanded` 영속. 구 「기본 펼침」 문구 폐기), 펼침 시
  빈 상태도 같은 고정 높이에 중앙 정렬 안내를 채운다(상태에 따라 높이가 튀지 않는다).
  카드 열은 보수적으로(1열·lg 2열·1920+ 3열, gap-4) — 카드가 넓어야 스트리밍
  미리보기가 숨쉰다. 패널 내용은 큐 카드
  그리드(WorkbenchLoadingCard 계보:
  진행중 = 스피너 + 지문 제목 + 모듈 칩 + StreamPreviewPane tail, 실패 = 사유 +
  `다시 시도`, 완료 = emerald 체크 + 모듈 칩 + 액션 2개 `바로 배포` primary ·
  `지문 스튜디오` ghost).
- `바로 배포` = 배포 다이얼로그(§3.4 C 정본 — 대상/마감/강도/과제명, deployStudioModules)
  를 **공용 컴포넌트로 추출해 재사용**(`src/components/studio/deploy-dialog.tsx` 로 이동,
  지문 스튜디오도 같은 파일 import — 이중 구현 금지). 모듈 프리셋 = 큐 항목 스탬프의
  modules ∩ 사용 가능 모듈. classId 스탬프가 없으면(전체 자료에서 발사) 다이얼로그
  서두에 클래스 선택 단계를 추가한다.
- 배포 성공 토스트 문구는 §3.4 정본("N명에게 배포했습니다 — …"). 완료 항목은 배포 후
  `배포됨` 칩으로 남는다(제거하지 않는다 — 같은 항목 재배포 허용).
- 실전 문제 생성 잡(worksheet 라우트)은 fast 큐와 다른 계보라 도크에는 **동기 진행
  카드**(단일 지문 단위)로 표시하고 완료 시 동일한 `바로 배포` 를 제공한다.

#### 3.7.4 서버 계약 (additive)

- 신규 `getStudioPassageSectionStates({ passageIds })`(actions/studio/passages.ts):
  academyId 스코프, 최대 50개, 반환 `{ passageId, analyzed, stale, presentSections:
  SectionKind[], hasWorksheet }[]` — 시트 가격 계산·실전 특례 판정 전용(본문 미포함
  슬림 질의). 판정 술어는 기존 detail 경로와 동일 헬퍼를 재사용한다(신선도 술어 분기
  복제 금지).
- 배포·미리보기·에뮬레이터·초대는 기존 액션 그대로(deployStudioModules ·
  previewStudioDeployment · getStudioEmulatorPlan · 초대 키트).

### 3.8 통합 워크벤치 대개편 (2026-08-11 사용자 지시 — 문제 생성·학습지 생성 통합)

> **이 절이 §3.1.2·§3.7 과 충돌하면 이 절이 우선한다.** 배경(사용자 지시 2026-08-11):
> "클래스 스튜디오에 문제 생성 페이지와 학습지 생성 페이지를 통합하고 클래스 관리 기반으로
> 구축한다. 인테이크 탭 스트립 제거, 기본 화면 = 기출 지문(제목만·1클릭 진입), 지문 미리보기
> 전면 삭제, 워크스페이스 행 버튼을 [학습 워크북 생성]+[실전 문제 생성] 2개로 분리, 워크북
> 생성은 문제 생성 모달과 같은 규격의 모달로, 하단 큐는 문제 생성 페이지 기준으로 통일하고
> 학습지·문제 둘 다 표시+필터, 배포(과제 보내기)는 마감일까지 철저하게."
> **기존 경로 무접촉 원칙(§0) 유지** — 공유 파일 수술은 전부 additive prop(부재 시 바이트
> 동일)만 허용. 임의 숫자·문구 창작은 critical 위반.

#### 3.8.1 패널 정리

- ~~우측 「클래스 정보」 PanelHandle 제거·고정 폭 전환~~ → **2026-08-11 재개정**:
  §3.9v2 로 우측에 도시에·일괄 생성 패널이 상주하게 되면서 사용자 지시로
  **리사이즈·접기 복원**. `PANEL_SPECS` 에 `{ key: "dossier", min: 320, max: 560,
  defaultWidth: 360, sign: -1 }`(신규 키 — 구 `panel` localStorage 잔존값 부활
  방지). 핸들 세로 라벨은 표시 중인 판 동적(일괄 생성/지문 현황/클래스 정보/정보),
  접힘 시 mr-2. 고속 경로(data-panel-key 직접 DOM) 트리와 동일 계약.
- xl 미만 상단바 「클래스 정보」 버튼 + 슬라이드오버(studio-home-client.tsx:417-426,
  535-566)는 **존치**(좁은 화면 등록·초대 경로 소실 금지 — 감사 D1 재발 방지).
- 좌측 「클래스」 트리 핸들은 존치(이번 지시 대상 아님).

#### 3.8.2 중앙 소스 보드 — 탭 스트립 제거·기출 기본

- `IntakeSurface` 에 additive prop **`hideTabBar?: boolean`**(기본 false = 바이트 동일)
  신설 — true 면 탭 스트립(intake-surface.tsx:190-277)을 렌더하지 않는다. 슬롯·오버레이·
  pasteVisible 판정(144-158, AI 지문 생성 body 포털 실사고 계약)은 그대로 유지.
- 스튜디오는 hideTabBar 로 스트립을 끄고 **자체 소스 스위처**(신규
  `src/app/(director)/director/studio/workbench/source-switcher.tsx`)를 중앙 열 최상단에
  둔다. 구성(좌→우, 2026-08-11 사용자 지시 개정): 들여오기 필 3개
  **[기출 지문] [직접 입력] [파일 업로드]** + **구분선**(h-4 w-px bg-slate-200 —
  들여오기 ↔ 보관함 성격 분리) + **[내 지문함 (N)]** + 우측 끝 **[워크스페이스 (N)]**
  필(rows>0 일 때만 렌더 — 워크스페이스 재진입 경로 소실 금지). 활성 필 = `border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm`(기존 탭 활성
  토큰 계승), 비활성 = `text-slate-400 hover:bg-slate-50 hover:text-slate-600`. 높이 h-8,
  아이콘은 기존 탭과 동일(GraduationCap·FolderOpen·ClipboardPaste·ImageUp·FilePen).
- **기본 상태 = 기출 지문**: LibraryPane 초기값 `intakeView="intake"` / `intakeTab="exam"`
  (library-pane.tsx:97-98 개정).
- `showLibrary()` 자동 전환 정책 개정: 붙여넣기·추출 승격·기출 담기 성공 후 「내 지문함」
  으로 전환하는 현행 동작은 **유지**(등록 결과를 확인하는 자연 동선) — 단 전환 후에도
  소스 스위처가 현재 위치를 정확히 반영해야 한다(스위처 상태 = intakeView/intakeTab 파생,
  별도 상태 금지).
- 직접 입력(MultiPassagePaste — **AI 원문 복원·AI 지문 생성 포함**)·파일업로드
  (GenerateUploadPanel + useGenerateExtraction)·워크스페이스(PassageWorkspace overlay,
  **AI 변형 지문 생성 포함**)는 기존 컴포넌트 그대로 재호스팅(무수정).

#### 3.8.3 기출 지문 브라우저 재설계 (공유 컴포넌트 additive)

- `ExamPassageLibrary` 에 additive prop **`compactBrowser?: boolean`**(기본 false = 기존
  4개 호스트 바이트 동일) 신설. 스튜디오만 true.
- compactBrowser 시험지 목록: 카드 그리드 → **전폭 세로 행 리스트**. 행 구성(좌→우):
  주관 배지(평가원 blue-50/교육청 slate-100 — 기존 색 규약)·학년 배지 · **제목
  (`formatPaperTitle`, text-[13px] font-semibold, truncate 금지·break-keep)** · 우측
  `지문 N · 문항 qFrom~qTo` 메타(text-[11px] text-slate-400 tabular-nums) + ChevronRight.
  **썸네일(PaperThumbnail·A4 텍스트 조판)은 렌더하지 않는다.** 행 클릭 = **1클릭
  드릴인**(`drillIntoPaper`) — 시험지 단위 체크박스는 compact 모드에서 제거(전체 선택은
  드릴인 후 필터바 전체선택으로). 행 h-11, hover:bg-slate-50, 행간 divide-y.
- compactBrowser 지문 카드(드릴인·검색 결과 공통): 본문 미리보기 `<p>` 2곳
  (exam-passage-card.tsx:127-129, 169-171)을 렌더하지 않는 **배지 전용 행**: 체크박스 +
  문항번호 배지 + 학년 배지 + 연도·회차 배지 + 유형 배지 + 복원/검토요망 배지 + 우측
  상세(Maximize) 버튼. 클릭=선택 토글·더블클릭=상세(기존 계약 유지). 행 h-11 급 콤팩트,
  배지 크기·색은 기존 정본(format.ts:146-183) 그대로.
- 담기 동선 불변: 하단 선택 바 `다음으로 (내 지문함)`(handlePick → importExamPassages)
  그대로. **기출 담기에도 클래스 자동 담기 추가**(library-pane-intake.ts:165-214 에
  registerNewToClass 이어붙임 — 붙여넣기·추출과 정책 통일, 토스트에 명시).
- 필터바(연도·회차·학년·유형·복원·검색·전체선택)는 무수정 유지(narrowHost 병행).
  browsingProblems 파생 규칙(검색·유형 필터 시 지문 평면 목록 전환)도 유지 — 단 그 평면
  목록도 compactBrowser 면 배지 전용 행으로 그린다.
- **「담음」 배지 + 재담기 정책(2026-08-11 사용자 지시)**: ExamPassageLibrary·
  ExamPassageCard 에 additive `importedExamIds?: ReadonlySet<string>` /
  `imported?: boolean`(부재 = 기존 호스트 무회귀) — 이미 지문함에 담긴 기출 행의
  배지 클러스터 끝에 「✓담음」(border-blue-200 bg-blue-50 text-blue-600 + title
  안내). 데이터는 신규 액션 `listImportedExamIds`(importExamPassages 와 동일
  kice 태그 스캔)를 library-pane 이 마운트 1회 + 담기 성공 후 갱신. **재담기 =
  중복 생성 없이 담은 날짜만 최신화** — importExamPassages 가 existingIds 의
  passage.createdAt 을 현재 시각으로 갱신(지문함 표시 날짜·최신순 정렬 정본이
  createdAt — 연결·생성물·분석은 그대로), 토스트가 그 사실을 말한다.

##### 3.8.3-v2 담김 배지 **클래스 스코프화** + 마키 선택 (2026-08-15 지시)

- **결함(사용자 보고)**: 「담음」 판정이 `listImportedExamIds` = **학원 전역 지문함**
  스캔이라, 클래스를 고른 상태에서도 *그 클래스에 담지 않은* 기출까지 파란 「담음」
  으로 보였다. 스튜디오의 담기는 지문함 등록 + **클래스 자동 담기** 2단이므로,
  전역 판정은 화면의 스코프(선택한 클래스)와 어긋난다.
- **배지 3상태 정본**(exam-passage-card.tsx):
  ① 현재 스코프에 담김 → 파랑 `✓담김`(클래스) / `✓담음`(클래스 미선택 = 지문함 전역)
  ② 지문함에는 있으나 이 클래스엔 없음 → **앰버 `지문함`**(border-amber-200
     bg-amber-50 text-amber-700 + Inbox) — 툴팁이 "담으면 이 클래스에 추가됩니다"
  ③ 어디에도 없음 → 배지 없음
- **서버**: `listImportedExamIds` 가 `entries: {examId, passageId}[]` 를 additive
  반환(구 `examIds` 유지). examId 만으로는 클래스 등록 집합과 교집합을 낼 수 없다.
  한 기출이 지문함에 2건 이상일 수 있어 대응은 1:N.
- **호스트 파생**(library-pane): `imported = entries ∩ classCtx.registeredIds`,
  `libraryOnly = 지문함 − imported`. 재료는 스코프 세그먼트·「담김」 배지와 **동일한
  registeredIds**(listStudioClassPassages take 300)라 화면 간 표기가 항상 일치한다.
  `registeredLoading` 중에는 **무배지**(전건 앰버 → 파랑 깜빡임 = 오판이라 금지).
- **공유 additive**(부재 = 기존 3개 호스트 렌더 경로 불변): ExamPassageLibrary
  `libraryOnlyExamIds` / `importScopeLabel` / `enableDragSelect`, ExamPassageCard
  `inLibraryOnly` / `importScopeLabel`.
- **마키(드래그) 선택**: 지문 행 컨테이너를 `DragSelect deferCommit` 으로 교체
  (className 동일 = 픽셀 불변) + 카드 루트 `data-drag-item-id`. 선택 커밋은
  `applyDragSelection`(집합 교체라 EXAM_MAX_IDS 상한을 여기서 1회 절단 —
  toggleSelect 의 건별 상한과 별도 경로). 선택 행에서 시작한 드래그 = 해제
  (removeMode), 마키 직후 click 1회 삼킴으로 토글 오발 0.
- **게이트**: `.tmp-studio-qa/probe-exam-badge-drag.mjs` **6/6** — 배지를 **DB 진실**
  (kice 태그 ∩ studio_class_passages)과 전수 대조(실측 37/37, 담김 22·지문함 3·
  무배지 12), 마키 다중선택·해제·토글 오발 0. 계기: 배지는 두 재료(액션 응답 +
  registeredIds) 도착 후 그려지므로 **고정 sleep 금지 — 배지 등장 waitFor 로 판정**
  (초판 RED 는 이 계기 오류였다). 시험지 back 은 `button:text-is("시험지")`
  (has-text 는 「시험지 관리」·「시험지 조판」을 먼저 잡는다).
- ⚠ `probe-imported-resize.mjs` 는 **폐물**: 기본 화면=기출·CTA 「다음으로 (내
  지문함)」 등 §3.10.14 이전 자구 전제라 이 수술과 무관하게 이미 깨져 있다.

##### 3.8.3-v3 기출 담기 지연 수술 (2026-08-15 지시 — "존나 오래 걸린다")

**계측 정본 `.tmp-studio-qa/probe-import-timing.mjs`** — 클릭→토스트 + 그 구간의
왕복 전수를 간트로 찍는다(추측 금지). 실측 **8,583ms → 2,472ms(−71%)**,
왕복 11건 → 9건, 뮤테이션 POST 2건 → **1건**. (수치는 `next dev` 기준 —
프로덕션 절대값은 더 낮지만 아래 구조 개선은 그대로 이월된다.)

**진단(실측으로만 확정)**
1. **같은 갱신이 2벌** — `registerToClass` 내부 갱신 + 뒤이은 `onLibraryChanged`
   가 각각 `loadChildren`+`refreshClasses` 를 돌렸다(2.5s + 2.3s).
2. **Next.js 는 클라이언트 서버 액션을 직렬 처리한다** — `Promise.all([loadChildren,
   refreshClasses])` 가 병렬이 아니다(listStudioClassPassages 1,719ms 종료
   **직후** listStudioClasses 시작이 간트에 그대로 찍힘). 그래서 중복 갱신
   1건 = 체감 1.5~2.5초다. **이 판단 착오가 이 화면 지연의 뿌리였다.**
3. `refreshClasses` 가 주는 필드 중 화면이 쓰는 건 `studentCount` 뿐
   (class-tree.tsx:267). `passageCount`·`assignmentCount`·`lastActivityAt` 은
   **렌더·정렬 소비처 0건** — 지문 담기 후 부를 이유가 없다.
4. 토스트가 `/api/passages/list` **전량 재조회(2.4s)** 를 기다렸다 — 담기는
   이미 끝났는데 CTA 스피너가 그만큼 더 돌았다.
5. `addPassagesToStudioClass` 의 클래스 검증·지문 소유 검증·sortOrder max 는
   서로 의존이 없는데 **순차** 였다(원격 DB 왕복 3회).

**수술**
- `registerToClass`/`unregisterFromClass` 에 additive `opts.skipRefresh` +
  `refreshClasses()` 제거. 청크 루프(50개 캡)는 **마지막 청크만 갱신**
  (구: 청크마다 갱신 = 청크 수만큼 왕복).
- `refreshAfterLibraryChange` 에서도 `refreshClasses()` 제거(로스터 경로는
  종전대로 직접 호출 — 그쪽은 studentCount 가 실제로 변한다).
- **합본 액션 `importExamPassagesToStudioClass`**(studio/passages.ts) — 지문함
  등록 + 클래스 담기를 한 서버 액션으로. 왕복 1회·RSC 재렌더 1회로 접힌다.
  클래스 미선택 호스트는 종전 `importExamPassages` 직행(무회귀).
- 목록 재조회는 **await 하지 않는다** — 뷰 전환·토스트 즉시, 새 지문 선택만
  `listReload.then(...)` 으로 도착 시점에 얹는다.
- `addPassagesToStudioClass` 의 독립 조회 3건을 `Promise.all` 로(aggregate 에
  `academyId` 를 함께 걸어 병렬 실행분도 테넌트 스코프 유지).

**남긴 것(인지·수용)**: 합본 액션 내부 ~2.3s 는 `tags contains 'kice:'` 전수
스캔 + 트랜잭션 + revalidatePath 4벌이다. `revalidatePath("/director/workbench/
passages")` 는 **실제 RSC 서버 컴포넌트**(page.tsx 가 getWorkbenchPassages 호출)
라 제거 불가 — 지우면 그 페이지가 상해진다.

#### 3.8.4 내 지문함 — 가로 행 목록 (공유 컴포넌트 additive)

- `PassageCardGrid` 에 additive prop **`listRows?: boolean`**(기본 false = 기존 호스트
  바이트 동일) 신설. 스튜디오만 true — 데스크톱에서도 카드 그리드 대신 **전폭 가로 행**
  으로 렌더(기존 모바일 행 MOBILE_ROW_CLASS 계보를 데스크톱 규격으로 승격).
- 행 해부(좌→우): 드래그 핸들(폴더 이동 유지) · 체크박스 · **제목(text-[13px]
  font-semibold text-slate-800, `truncate 금지` — break-keep 줄바꿈 허용)** + 제목 수정
  연필 · 등록 일시(`formatMinuteTimestamp(createdAt)`, text-[10.5px] tabular-nums
  text-slate-400) · **생성 이력 클러스터**: `PassageReportsSummary`(생성된 학습자료 N) +
  `PassageQuestionsSummary`(생성된 문제 N) — 두 팝오버 전부 stopPropagation 래퍼 유지
  (행 클릭=선택 토글과 충돌 금지) · 분석 상태 배지 · 우측 검수/상세 액션(기존 그대로).
- 행에서 본문 미리보기는 **렌더하지 않는다**. content-visibility 고정 높이 클래스
  (DESKTOP_CARD/COMPACT_CARD h-300/260)는 listRows 경로에서 쓰지 않는다(가변 높이 행 —
  자체 `content-visibility` 불필요).
- **문제 이력 데이터 배선(스튜디오 결함 수복)**: LibraryPane 이
  `getWorkbenchQuestionsGroupedByPassage` 를 라이브러리 뷰 최초 진입 시 1회 로드해
  `questionsByPassage` Map 을 구성·전달한다(현재 미전달로 「생성된 문제 N개」가 영구
  미표시 — 정찰 확정). 로드 실패는 조용히 무시(이력은 부가 정보).
- 전체선택·폴더 창·툴바·필터·페이지네이션 계약 불변. 스코프 칩(이 클래스 지문만)과
  selectAll 의 scopedFilteredPassages 오버라이드 유지.

#### 3.8.5 지문 선택 → 워크스페이스 (「학습 만들기」 직행 CTA 폐기)

- 그리드 하단·툴바의 「학습 만들기」 직행 CTA(모듈 시트 즉시 오픈)는 **폐기**. 선택
  후 단일 CTA **「워크스페이스에 담기 · N개」**(primary, h-10, GraduationCap→FilePen
  아이콘)가 `handleLoadSelectedToWorkspace` 를 호출한다(기존 워크스페이스 이동 계약
  그대로 — draft 승격 resolveSelectionToPassageIds 관문 유지).
- rows>0 이고 오버레이 닫힘이면 보조 CTA 「워크스페이스 열기 (N)」 병행(기존 버튼 유지).
- 생성 진입은 **전부 워크스페이스 행 CTA(§3.8.6)로 일원화**된다. 워크스페이스 하단
  일괄 CTA 는 「전체 학습 워크북 생성 · N개」 1개만 유지(전 행 대상 워크북 모달 오픈 —
  일괄 실전 문제 생성은 만들지 않는다: 행별 유형 구성이 필요하므로).

#### 3.8.6 워크스페이스 행 CTA 2분기 (공유 파일 additive)

- `WorkspacePassageRow` 에 additive props 신설(부재 시 기존 단일 버튼 바이트 동일):

```ts
/** 학습 워크북 생성 — 존재하면 푸터가 2버튼 스택으로 바뀐다 (스튜디오 전용) */
onOpenWorkbook?: () => void;
/** 2버튼 모드에서 기존 버튼(실전 문제)의 라벨 오버라이드 */
generateLabel?: string;
```

- `PassageWorkspace` 에 additive prop `onOpenRowWorkbook?: (localId: string) => void`
  신설 — 존재 시 각 행에 `onOpenWorkbook={() => onOpenRowWorkbook(row.localId)}` 전달.
- 2버튼 푸터(onOpenWorkbook 존재 시): **세로 스택 2단**, 각 h-10 w-full rounded-lg
  text-[13px] font-bold gap-2. 순서(위→아래):
  1. **「학습 워크북 생성」** — primary `bg-blue-600 hover:bg-blue-700 text-white
     shadow-sm`, 아이콘 BookOpen h-4 w-4. title="어휘·직독직해 등 학습 모듈을 만듭니다".
  2. **「실전 문제 생성」** — secondary `border border-blue-200 bg-white text-blue-700
     hover:bg-blue-50`, 아이콘 Cpu h-4 w-4. title="이 지문의 유형을 선택하고 문제를
     생성합니다"(기존 문구). 클릭 = 기존 `onOpenSettings`.
- 두 버튼 모두 `stopPropagation`(행 루트 onClick=onSetActive 버블 차단 — 워크북 버튼이
  activeRowId 를 세울 이유가 없다). `data-generate-tour="row-generate-button"` 은 실전
  버튼에 유지(모바일 스텝 플로우 글로우 셀렉터 실소비 2곳).
- 스튜디오 행 카드는 중앙 열이 좁으므로 **행 그리드 1열 강제**가 필요 — `PassageWorkspace`
  에 additive prop `singleColumn?: boolean`(기본 false) 신설, 스튜디오만 true 로
  `xl:grid-cols-2` 를 끈다(뷰포트 미디어쿼리 임베드 함정 — §12 선례와 동형).
- 문제생성 페이지는 세 prop 모두 미전달 → 기존 단일 「다음으로 (유형선택)」 불변.

#### 3.8.7 학습 워크북 생성 모달 (시트 → 모달 규격 통일)

- `ModuleSelectSheet` 를 **`WorkbookGenerateModal`**(신규
  `src/app/(director)/director/studio/workbench/workbook-generate-modal.tsx`)로 대체.
  슬라이드오버 프레임을 버리고 **문제 생성 모달(passage-generate-modal.tsx:113-129)과
  동일 규격**: `fixed inset-0 z-50` + 오버레이 `bg-slate-900/40 backdrop-blur-[2px]` +
  중앙 카드 `w-full max-w-[1200px] max-h-[calc(100vh-2rem)] mx-4 my-4 rounded-2xl border
  border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden`.
- 헤더(규격 동일): `flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white
  px-5 py-3.5` — Layers 아이콘 + **「학습 워크북 만들기」** 볼드 + 「지문 N개」 칩 +
  우측 `size-7` 닫기. 지문 1개면 제목 토글 버튼(h-9 — 규격 계승)로 본문 팝오버.
- 본문: `flex-1 min-h-0 overflow-y-auto px-5 py-4` — ① 대상 클래스 셀렉트 행(기존 문구
  정본: 미지정 시 "클래스 미지정 — 배포하려면 클래스를 선택하세요" rose 캡션) ② 모듈
  카드 그리드 **sm 2열 · lg 3열**(시원시원 — 1열 세로 나열 금지, 사용자 지시). 카드는
  기존 ModuleCardRow 해부(체크 + 라벨 + 부제 + 가격 배지)를 그리드 카드형으로 재배치 —
  라벨·부제·가격 산식은 정본 그대로(STUDIO_MODULES / selectionCost / PriceBadge 3표기).
  실전 문제(exam) 카드 특례(상호배타·전지문 분석 보유 시만 활성·비활성 캡션) 유지.
- 푸터(규격 동일): `shrink-0 border-t border-slate-200 px-5 py-3.5` — 좌측 합계
  (`총 N크레딧` / 0이면 "추가 비용 없음") + 전폭 CTA `h-10 lg:h-12 w-full rounded-xl
  text-[12px] lg:text-[14.5px] font-bold` 활성 `bg-blue-600 shadow-md shadow-blue-200/50`
  비활성 `bg-slate-100 text-slate-400`(aria-disabled 관용구 — 모듈 0개 클릭 시 모듈
  그리드에 triggerHintGlowWithin, 셀렉터 `[data-workbook-module]`). 라벨 정본 기존 그대로
  (`생성 시작` / `바로 준비하기 · 추가 비용 없음`).
- 계약 유지(정찰 확정): open=false 본체 언마운트(직전 조합 잔존 금지) · 열림 동안
  passages 불변(오픈 1회 getStudioPassageSectionStates) · 가격은 module-sections 순수함수
  조합만 · exam 발사 hasWorksheet 제외·빈 발사 토스트 경로 · onLaunched(시트 닫기+도크
  펼침) · Esc 1중(실전 모달과 동시 오픈 상태를 만들지 않는다 — 한 번에 한 모달).
- 기존 `module-select-sheet.tsx`·`module-select-sheet-parts.tsx` 중 parts(가격 순수함수·
  PriceBadge)는 재사용, 시트 본체 파일은 삭제(호스트가 studio-home-client 하나뿐).

#### 3.8.8 실전 문제 생성 — 문제 생성 스택 재호스팅

- 신규 훅 `src/app/(director)/director/studio/workbench/use-studio-question-gen.ts`:
  문제 생성 전역 설정 상태(genMode/typeCounts/difficulty/customPrompt/generationPlan/
  questionTypeSettings — generate-page-client 의 useState 군 복제) + `useRowSettingsPanel`
  + `useWorkspaceGeneration` 조립. `useGenerationSessionQueue` 인스턴스는
  **studio-home-client 1곳**에서 호출해 setSessionQueue/sessionQueue 를 내려받는다
  (도크와 공유 — 폴러 1개 규칙의 문항판).
- 신규 컴포넌트 `studio-question-gen-modal.tsx`: `PassageGenerateModal`(무수정 재사용) +
  `GenerationConfigPanel`(47 props 전량 배선, `hideGenerateButtons` — CTA 는 모달 푸터)
  호스팅. configOnly 미사용(스튜디오 데스크톱 우선 — 모바일도 즉시 생성).
  장문 세트 모드는 기존 플래그 게이트 그대로(FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS).
- 발사 = 기존 `handleGenerateActiveRow` 체인 그대로(변형본 저장 → 낙관 큐 →
  scheduleFastGeneration ≤5 → md-stream/fast 폴백). **반드시 targetLocalId 를 넘긴다**
  (미전달 시 체크만 해둔 지문 오발사 — 정찰 함정).
- **스튜디오 발사 스탬프(문항판)**: setSessionQueue 래퍼가 낙관 카드 추가(id `fast:`/
  `set:` 프리픽스)를 가로채 tempId 를 `studio-qgen-stamps:{academyId}`(localStorage,
  TTL 48h·cap 40)에 기록. DB 병합 항목은 `id ∈ stamps ∪ config.clientTempId ∈ stamps`
  로 대조 — 도크 종결 필터(§3.8.9)의 재료.
- 행 rowStats(문항 수·크레딧 칩)는 `useWorkspaceGeneration.rowStats` 를 PassageWorkspace
  에 전달해 실전 버튼 라벨이 `실전 문제 생성`/`N문제 · 크레딧 칩` 으로 살아난다.

#### 3.8.9 통합 생성 도크 — 큐 카드 통일·필터·과제 보내기

- 도크 골격(높이 드래그·localStorage v2·h-12 상주 스트립·기본 펼침·클램프 — §3.7.3)은
  **불변**. 내용물을 문제 생성 큐 규격으로 재설계한다.
- 패널 헤더 행 신설(h-9, border-b border-slate-100): 좌측 **필터 세그먼트
  [전체 N] [학습지 N] [문제 N]**(ViewModeCycleButton 아님 — 명시 3필, 활성
  bg-slate-900 text-white rounded-md h-7 px-2.5 text-[11px] font-semibold, 비활성
  text-slate-500 hover:bg-slate-100). 카운트 = 표시 중 카드 수(진행+종결). 우측 「접기」
  기존 유지. 필터 상태는 세션 로컬(영속 불필요).
- **카드 통일 규격(문제 생성 계보 기준 — 사용자 지시)**: 전 카드 공통
  `rounded-xl border p-4 flex flex-col min-h-[190px]` —
  · 진행중(공통): `border-blue-200 bg-blue-50/60` + Loader2 스핀 + 상태 라벨 「생성 중」
    (text-[11px] text-blue-600) + 지문 제목(text-[13px] font-semibold, sanitize 적용) +
    종류 칩(학습지=모듈 칩 슬레이트 / 문제=유형·문항수 칩) + **StreamPreviewPane**(공유
    강제 — 새 구현 금지) 하단.
  · 실패(공통): `border-red-200 bg-red-50/30` + AlertTriangle + 「생성 실패」 + 사유
    line-clamp-3 + 「같은 조건으로 다시 생성하기」(학습지=retryAnalysis, 문제=재발사).
  · 완료 학습지: 백색 카드 + CircleCheck emerald + 모듈 칩 + 액션 [**바로 배포**
    primary h-8](DeployDialog — 무변 재사용) [지문 스튜디오 ghost]. 배포됨 칩 유지.
  · 완료 실전 워크시트: 동일 + 모듈 칩 「실전 문제」.
  · 완료 문항: 백색 카드 + CircleCheck emerald + 「문항 N개」 + 유형 요약 칩(최대 3 +
    +n) + 액션 [**과제 보내기** primary h-8 — AssignmentComposer(preset QUESTIONS,
    questionIds, 마감일 포함) 재사용, 용어 정본 「과제 보내기」(director-glossary — 문항
    과제에 「배포」 금지)] [문제 보기 ghost — WideModal 에 QuestionCard compact readonly
    목록].
- 표시 규칙(3계보 공통 — 소음 봉쇄): 진행중 = 전부 노출, 종결(done/error) = **스튜디오
  스탬프 보유분만**(학습지 = studio-queue-stamps, 문항 = studio-qgen-stamps §3.8.8).
- 어댑터: `dock-cards.tsx` 를 통일 카드 패밀리로 재작성 — 입력은
  `{kind: "analysis"|"worksheet"|"question", ...}` 유니온(3계보 상태 어휘 매핑:
  pending/analyzing→진행중, generating→진행중, done 공통, error 공통, reviewed→완료).
  카드 key 규칙 `analysis:{id}` / `worksheet:{id}` / `qgen:{id}` — 기존 배포됨 칩
  cardKey 로컬 Set 계약 유지.
- 스트립 요약 문구에 문항 계보 합산(counts 집계에 question 축 추가). 문항 완료 카드의
  questionIds 미하이드레이션 시 「과제 보내기」 비활성 + title "문항 정보를 불러오는
  중입니다".

##### 3.8.9v2 도크 크롬 재설계 — 문제 관리 패널 헤더 규격 (2026-08-11 지시)

- **지시 원문**: "아래에 그 영역이 넓어지는게 이게(스트립) 막고 있거든 — 아래에 생성
  큐가 나타나는걸 딱 이 컴포넌트(문제 관리 · 전체 문제 헤더)대로 해줘."
- 이중 크롬 폐기: 구 h-12 상주 스트립(하단) + 펼침 패널 내부 h-9 헤더 행(필터·그랩바·
  접기)을 **단일 헤더 행**으로 통합한다. 정본 = folder-section.tsx pageHeader 마크업
  (`flex flex-col gap-1.5 px-4 py-1.5` / 아이콘 칩 `h-7 w-7 rounded-lg bg-blue-50
  text-blue-600` / `생성 현황 ·` text-[13px] font-medium text-slate-400 + 굵은 상태
  타이틀 text-[13px] font-bold / 우측 size-7 rounded-md border 컨트롤). 헤더는 접힘·
  펼침 공통 상주, border-b 는 펼침일 때만.
- 배치 역전: 헤더가 **위**, 큐 그리드가 그 **아래**(id `studio-generation-dock-panel`
  유지) — 문제 관리 패널과 동형. 아이콘 칩 = 진행 중 Loader2 스핀 / 유휴 Sparkles.
- 타이틀·꼬리 분리: 굵은 타이틀 = 카운트 합성("생성 중 N건 · 완료 M건 · 실패 K건",
  전부 0 이면 "대기"), 꼬리(muted, sm 이상 노출) = 기존 안내 문구 우선순위
  (진행→배포 예고 / 완료→배포 가능 / 실패→재시도 / 유휴→워크스페이스 안내).
- 필터 세그먼트 3필은 헤더 우측으로 이사(펼침일 때만 렌더, 스타일 §3.8.9 불변).
  접기/펼치기 = 우측 끝 size-7 셰브론 버튼(aria-label "생성 현황 접기/펼치기",
  aria-expanded·aria-controls 계약 유지). 헤더 행 자체는 참조 컴포넌트와 동일하게
  비클릭.
- 높이 드래그는 푸터 상단 가장자리 그래버로 이사: absolute inset-x-0 -top-1.5 h-3,
  role="separator" + title "드래그하여 높이 조절 · 더블 클릭하여 초기화"(프로브 계약
  문구 유지), hover 시 중앙 필 발색. 클램프·영속 키(studio-dock-height:v2)·오버드래그
  접기 판정은 §3.7.3 불변.

##### 3.8.9v3 도크 패널 = 문제 관리 임베드 통째 이식 (2026-08-11 격노 재지시)

- **지시 원문**: "이거는 여기 생성 큐랑 **완전 통일** 하라니깐!!!! 왜 전혀 안 했어!!!!
  이렇게 아래로 쭉쭉 내려가야 한다고!!!! [선택 툴바 HTML] 이런 것도 있고!!!!"
  — v2 의 헤더 통일만으로는 미달. 큐 표면 자체가 문제 생성 페이지의
  EmbeddedQuestionBank(문제 관리 · 전체 문제 패널: FolderSection 헤더 + 폴더
  스트립 + 선택 툴바[검수완료·삭제·이동/복사·다음으로 (시험지 생성)·과제 보내기·
  필터·검색·그리드] + 큐 스트립 카드 + 실 문제 카드 그리드 + 페이지네이션)여야 한다.
- **구조**: 펼침 패널 내용물 = ①학습지 계보 스트립(분석 큐·실전 워크시트 카드 —
  기존 dock-cards 유지, 항목 있을 때만, 라벨 「학습 워크북」) ②그 아래
  **EmbeddedQuestionBank 통째**(신규 구현 절대 금지 — generate 페이지와 같은
  컴포넌트 임포트). 패널 스크롤 안에서 카드가 아래로 흐른다.
- **결선**: academyId 신규 prop(studio-home-client 전달) · sessionQueue =
  visibleQuestionQueue(스탬프 필터 §3.8.8 유지 — 진행중 전부·종결 스탬프만) ·
  queueCounts 도크 파생 · onRetryGeneration = onRetryQuestion ·
  setRefreshKey = 완료 카운트.
- **폐기**: 도크 자체 문항 카드 3종(QuestionRunning/Error/Done)·[전체|학습지|문제]
  필터 세그먼트·도크 AssignmentComposer·DockQuestionPreviewModal — 전부 뱅크가
  같은 기능(과제 보내기·상세·수정·검수)을 정본으로 제공한다. 빈 상태 분기도 폐기
  (뱅크는 항상 관리 표면). 헤더(생성 현황 v2)·학습지 배포 다이얼로그는 유지.
- **높이**: 키 v3(studio-dock-height:v3 — 구 v2 저장값 400 부활 방지), 기본 560,
  하한 320(뱅크 크롬 ~250 + 카드 한 조각), 상한 min(70vh, 뷰포트−340).

##### 3.8.9v4 도크 전면 폐기 (2026-08-11 최종 지시 — v2·v3 전부 소급 폐기)

- **지시 원문**: "하... ㅅㅂ 그냥 이 섹션 싹다 없애버려" — 생성 현황 헤더를 포함한
  하단 도크 섹션 전체 제거. v2(헤더 재설계)·v3(뱅크 임베드)는 이 지시로 소급 폐기.
- **삭제**: generation-dock.tsx·dock-cards.tsx 파일 삭제, studio-home-client 의
  dockExpanded/toggleDock/studio-dock-expanded localStorage·발사 후 도크 펼침 3곳
  (워크북 모달 onLaunched·일괄 패널·문항 onQuestionLaunched) 제거.
- **유지**: sessionQueue 참조 안정화·questionGenBridge(일괄 생성 패널 §3.9v2.5 와
  지문함이 소비)·use-studio-queue(발사 엔진)·LibraryPane onQuestionLaunched prop
  계약(no-op 전달). 진행·완료 표시 정본 = 지문함 행 생성 이력(5초 폴링) + 일괄
  생성 패널 재견적 + 문제 생성 페이지 큐.
- 게이트: probe-dock-gone.mjs 5/5(「생성 현황」 부재·패널 id 부재·지문함 정상·
  런타임 에러 0·본문 하단 사용). probe-dock-{header,bank}.mjs 는 폐물.

#### 3.8.10 파일 소유권 지도 (팬아웃 단위 격리 — 한 유닛 = 자기 파일만)

| 유닛 | 소유 파일 | 성격 |
|---|---|---|
| A1 행 CTA | workspace-passage-row.tsx · passage-workspace.tsx | 공유 additive |
| A2 소스 보드 | intake-surface.tsx(additive) · source-switcher.tsx(신규) | 공유+신규 |
| A3 기출 | exam-passage-library/index.tsx · exam-paper-card.tsx · exam-passage-card.tsx · exam-filter-bar.tsx | 공유 additive |
| A4 지문함 행 | passage-card-grid.tsx(+types) | 공유 additive |
| A5 워크북 모달 | workbook-generate-modal.tsx(신규) · module-select-sheet.tsx(삭제) | 스튜디오 |
| A6 문제생성 훅 | use-studio-question-gen.ts(신규) · studio-question-gen-modal.tsx(신규) | 스튜디오 |
| A7 도크 | generation-dock.tsx · dock-cards.tsx · use-studio-queue.ts(스탬프 확장) | 스튜디오 |
| B1 통합 | library-pane.tsx · library-pane-intake.ts · studio-home-client.tsx | 통합자(마지막) |

#### 3.8.11 함정 원장 (정찰 확정 — 위반 = critical)

1. memo 3종(ClassTree/LibraryPane/ClassPanel) 방어선 — 새 props 전부 참조 안정
   (useMemo/useCallback), 인라인 화살표·인라인 배열 금지(5초 폴링 리렌더 폭발).
2. WorkbookGenerateModal 에 passages 인라인 배열 전달 금지 — 조회 effect deps 가 배열
   참조(무한 서버 액션 루프). sheetPassages 상태 경유 유지.
3. 행 새 버튼 stopPropagation 필수(행 루트 onClick=onSetActive 버블).
4. `data-generate-tour="row-generate-button"` 실전 버튼에 유지(글로우 셀렉터 실소비).
5. 도크 종결 카드 스탬프 필터 유지·문항판 신설(무필터 = 학원 최근 100잡 소음, 실측 89건).
6. pasteVisible 계약(intake-surface.tsx:144-153) 훼손 금지 — AI 지문 생성 포털 실사고.
7. 워크북 발사는 `handleGenerateActiveRow` 재사용 금지(발사 후 typeCounts 소거 부작용 —
   실전용 유형 지정이 날아간다). 워크북 = queueApi.launchModules 직결.
8. `handleWorkspaceGenerate` 는 반드시 targetLocalId 전달(미전달 = 선택 지문 오발사).
9. exam 모듈 필터: 워크북 모달 그리드에서 exam 특례 분기 유지(§3.8.7) —
   isSectionBackedModuleId 로 발사 대상 분리.
10. QueueItem temp id 프리픽스(`fast:`/`set:`) 재작성 금지(낙관↔DB 병합 파괴).
11. 공유 파일 additive prop 은 부재 시 **바이트 동일** — 기존 6+ 호스트(generate·webtoon·
    passage-registration·wordbook 등) 픽셀·동작 불변. 계약 테스트 대상.
12. 학습지 카드 StreamPreviewPane 공유 재사용 강제(새 구현 = 실사고 재발).
13. 스튜디오 행 그리드 singleColumn 강제(§3.8.6) — 뷰포트 xl 2열이 좁은 중앙 열에서
    카드 폭 ~270px 붕괴.
14. launchWorksheet 의 worksheetBusy 가드와 launchModules 의 큐 가드 비대칭 인지 —
    2버튼 병치 시 실전 진행 중 워크북 발사는 허용(다른 계보), 같은 계보 중복만 차단.
15. 도구 문구: 디렉터면 합니다체 단일·이모지 금지·「과제 보내기」 정본(문항), 학습지
    배포 버튼 「바로 배포」 유지(§3.7.3 기존 정본).
16. 표기 정본(2026-08-11 검수 라운드 확정): 담기 CTA 카운트 = 「다음으로 (내 지문함)
    · 지문 N개」 상시(괄호 포맷·0개 숨김 폐기, 기출·직접 입력·업로드 3소스 공통) ·
    바스켓 카운터 명칭 「담긴 지문」 · 도크 유휴 요약 「워크스페이스에서 학습 워크북·
    실전 문제를 만들 수 있습니다」(구 「선택한 지문으로 학습을 만들어 보세요」 폐기 —
    §3.8.5 폐기 동선 어휘) · 워크스페이스 패널 헤딩(스튜디오) 「워크스페이스」.
17. 좁은 폭 방어 확정(재검증 라운드): listRows 우측 그룹 max-md:w-full 강제 낙하
    (globals.css smoat-large-ui 모바일 가드가 min-w-[220px] 를 무효화하므로 min-width
    비의존) · 워크스페이스 행 헤더 스페이서는 2버튼 모드에서 제거(제목과 자유 폭
    반분 함정) · 도크 그랩바는 흐름 내 flex-1(absolute 중앙 고정 금지 — 필 관통).

#### 3.8.12 검증 게이트 추가분

1. tsc 0 · lint 0 · 계약 무회귀: 기존 studio-workbench-contract 테스트 그린 + additive
   prop 부재 시 바이트 동일 스냅샷(문제 생성 페이지 최초 렌더 HTML 대조까지는 불요 —
   props 기본값 경로 코드 리뷰 렌즈로 대체).
2. 행동 게이트(크레딧 0 설계): ①기출 기본 화면 → 시험지 행 1클릭 드릴인 → 지문 배지 행
   전체선택 → 담기 → 클래스 자동 담기 확인 ②워크스페이스 행 2버튼 → 워크북 모달(규격
   토큰 확인) → 0크레딧 발사 → 도크 학습지 카드 → 바로 배포 다이얼로그 ③실전 버튼 →
   유형선택 모달 오픈 → 유형 1개 지정 시 푸터 활성(발사는 mock/스킵 — 크레딧 보호)
   ④도크 필터 3필 전환 ⑤내 지문함 행 목록 — 제목 무절단·이력 팝오버.
3. 3뷰포트+1024 캡처(390/768/1024/1440/1750) 전 상태(기출 목록·드릴인·지문함 행·직접
   입력·파일업로드·워크스페이스 2버튼·워크북 모달·실전 모달·도크 3필터) 시각 감사.

### 3.9 지문 도시에 — 우측 패널 개편 (2026-08-11 사용자 지시)

> 배경: "지문을 선택하면 우측 패널에 그 지문 기반 학습지·문제가 단어장 도시에처럼
> 깔끔하게 — 어느 클래스·어느 학생에게 배정됐고 학습 상태가 어떤지 철저하게."
> **「전체 자료」(학원 요약·최근 활동 OverviewPane)는 전면 폐기**(사용자 확정).

#### 3.9.1 패널 위계 (studio-home-client 소유)

1. **dossierPassageId 있음** → `PassageDossierPane`(신규) — 최우선.
2. 없고 클래스 선택 → 기존 `ClassPane` 유지(학생·최근 배포).
3. 둘 다 없음 → 중앙 정렬 빈 상태 1줄: "지문을 선택하면 생성·배정 현황이 표시됩니다"
   (text-[12.5px] text-slate-400 break-keep). OverviewPane 은 삭제.
- xl 미만 드로어(기존)도 같은 위계로 렌더. 상단바 드로어 트리거 라벨은 동적 정본:
  도시에 표시 중 「지문 현황」 / 클래스만 선택 「클래스 정보」(구현 확정 2026-08-11 —
  「클래스 정보」가 지문 도시에를 가리키면 오독). 트리거 노출 게이트는
  (selectedClass || dossierPassageId).

#### 3.9.2 도시에 트리거 (LibraryPane 업링크)

- LibraryPane 에 additive prop `onDossierPassage?: (passageId: string | null) => void`
  (QuestionGenBridge 업링크 선례 — setState 세터 안정 참조라 memo 안전).
- 갱신 규칙: **내 지문함(라이브러리 뷰) 선택 집합 변화 시** — 새로 추가된 지문이
  있으면 그 id, 집합이 비면 null. 기출 브라우저 선택은 대상 아님(임포트 전 —
  지문함 소속이 아니다). 상세 모달 열람(lastViewedPassageId)도 도시에 갱신.

#### 3.9.3 PassageDossierPane (신규 `studio/workbench/passage-dossier-pane.tsx`)

디자인 정본 = **lemma-dossier 이디엄**(§정찰: Sec 스트립·스탯 그리드 gap-px·HBarList·
접힘 카드 grid-rows 애니메이션). 공용 프리미티브는 panel-primitives.tsx 재사용(파일
헤더의 "클래스 패널 전용" 문구는 "우측 패널 유닛 공용(클래스 패널·지문 도시에)"로 개정).
차트 부품(HBarList 급)은 wordbook-ui 수정 금지 — 도시에 파일 안 슬림 복제.

구성(위→아래):
1. **헤더**: 지문 제목(text-[15px] font-bold break-keep — truncate 금지) + 상태 배지
   (분석 완료 emerald / 미분석 slate / 본문 수정됨 rose) + 등록일(fmtDay).
2. **스탯 그리드**(3열 gap-px rounded-lg border — lemma 토큰): 학습 모듈 N/7 ·
   문제 N · 배정 N.
3. **Sec「학습 모듈」**: 7모듈 칩(§3.4 매핑 — 보유 = border-blue-200 bg-blue-50
   text-blue-700, 미보유 = border-slate-200 text-slate-400) + 실전 문제 칩(worksheet-
   grade 판정). hint = 마지막 분석 시각(fmtDateTime).
4. **Sec「생성된 문제」**(0이면 body 에 "생성된 문제가 없습니다" 1줄): 유형별 가로
   바 리스트(HBarList 계보 — 라벨 w-[72px]·트랙 h-[7px] rounded-full bg-slate-100·
   값 tabular) + hint = 검수완료 n/전체. 하단 최근 문제 행 목록(문두 1줄 truncate,
   유형·난이도 칩) — **행 클릭 = 문제 상세 모달**(§3.9.5 ① 과 동일 모달 공유).
5. **Sec「배정 현황」**(핵심 — 0이면 "아직 배정된 학습이 없습니다"): 과제 접힘 카드
   리스트(SenseCard 계보 — grid-rows-[0fr→1fr] 300ms 애니메이션):
   - 카드 헤더(토글): kind 칩(**학습지** = 채움 blue / **문제** = 외곽 slate — 형태
     문법: 채움=평가 아님 주의, 여기선 종류 구분이므로 채움 blue vs 채움 slate-100
     text-slate-600 으로) + 과제명(break-keep) + 클래스명 칩(payload.studio.classId →
     Class.name / 없으면 "개별 배정") + 완료 n/m(tabular) + 마감 D-n(지남 = rose).
   - 펼침 본문: (WORKSHEET) 모듈 칩 + 평균 첫 시도 정답률(avgFirstTryPctByAssignment
     정본 — masteryPct 스냅샷 금지) · **학생별 행**: 이름 + 상태 배지(완료 emerald /
     진행 중 blue / 대기 slate — status ASSIGNED|IN_PROGRESS|DONE 매핑) + 정답률
     (WORKSHEET = stageStates 재계산 per-student, QUESTIONS = responses 정오 집계 —
     둘 다 서버 액션이 계산해 내려줌. null 은 "—").
   - 정렬: createdAt desc. 로딩 = SectionSkeleton, 실패 = SectionError(빈 상태와 구분).
6. 각주(lemma 이디엄): "배정 현황은 최근 30건(학습지)·200건 스캔(문제) 기준입니다".

#### 3.9.4 서버 계약 — `src/actions/studio/dossier.ts` (신규, 전부 academyId 스코프)

- `getStudioPassageDossier({ passageId })`:
  1. passage 스코프 검증(academyId 불일치 = null).
  2. 분석 상태 = getStudioPassageSectionStates 동일 헬퍼(신선도 술어 재사용).
  3. 문제 = prisma.question(passageId·deletedAt:null) 슬림 select(id·type·subType·
     difficulty·approved·questionText 1줄·createdAt) — 최대 50, byType 집계.
  4. WORKSHEET 배정 = 정본 raw SQL(passages.ts:685-693 계보)에서 classId 술어 제거,
     `payload->'studio'->>'passageId' = $2` LIMIT 30. classId 도 select → distinct
     Class.findMany 1회 배치로 이름 해석.
  5. QUESTIONS 배정 = kind='QUESTIONS' 최근 200(academyId+createdAt 인덱스) →
     JS 에서 payload.questionIds ∩ 지문 question ids 교집합(>0 만 채택).
  6. 상태 집계 = studyAssignmentTask.groupBy(assignmentId,status) +
     avgFirstTryPctByAssignment 배치(Promise.all — deploy.ts:373-381 패턴).
  7. 학생별 = 해당 assignment 들의 task rows + student.findMany 배치(이름, 스코프 밖
     "(삭제된 학생)" 폴백 정본) · WORKSHEET per-student pct = worksheetStudyState
     stageStates 재계산(computeStudyMastery 재사용) · QUESTIONS per-student pct =
     responses 정오 집계(stats.ts:127 판정식 재사용 — manualStatus ?? result.status).
  8. **getWorksheetStudyOverview 호출 금지**(1건 4쿼리 폭발 — §정찰 함정 4).
- `getStudioPassageAnalysis({ passageId })`(팝오버 ② 용 슬림): 스코프 검증 +
  {passage(제목·본문), analysis: analysisData} — PassageAnalysisModal 소비 형태.
  ⚠ getWorkbenchPassage 재사용 금지(academyId 미스코프 — §12 금지 목록).

#### 3.9.5 이력 팝오버 행선지 수복 (기존 결함 2건)

1. **문제 행**: library-pane 에 `detailQuestion` 상태 + 두 PassageCardGrid 에
   `onOpenQuestionDetail={setDetailQuestion}` — WideModal + QuestionCard(compact·
   readonly·suppressUnapprovedBorder, dock-question-preview-modal.tsx:82-108 계보 —
   변환 불필요, 이미 QuestionCardItem). 현행 router.push 이탈이 죽는다.
   도시에 「생성된 문제」 행 클릭도 같은 모달.
2. **학습자료 행**: handleOpenAnalysisModal 을 getStudioPassageAnalysis 경유로 교체 —
   analysis 있으면 PassageAnalysisModal(generate-page-client:2044-2057 배선 복제,
   analysisData 문자열/객체 양쪽 파스), 없으면 현행 PassageContentModal 폴백.

#### 3.9.6 함정 (§3.8.11 승계 + 신규)

- memo 방어선: 업링크는 setState 세터 그대로(안정) — 인라인 래퍼 금지.
- payload 인덱스 부재 — 질의는 전부 academyId+createdAt 정렬 커버 안에서 LIMIT.
  표현식 GIN 은 v2(수동 SQL — migrate 금지 규약).
- QUESTIONS 역조회 키 부재는 v1 스캔 수용 — 배포 payload 에 studio 스탬프 추가는
  v2(공용 mutations 접촉이라 이번 스코프 밖).
- deployments 류 실패를 빈 배열로 삼키지 말 것 — SectionError 로 구분.
- 도시에 데이터는 지문 전환 시 재조회(key={passageId} 스크롤 리셋 — lemma 선례),
  폴링 없음(v1 — 수동 재조회 버튼도 두지 않는다, 재선택이 곧 갱신).

### 3.9v2 도시에 v2 + 일괄 생성 패널 (2026-08-11 5차 사용자 지시 — 전량 이행 의무)

> 사용자 지시 원장(하나도 누락 금지 — 검수 게이트가 이 목록 대조로 판정한다):
> **D1** 지문 여러 개 선택 시 우측 도시에에 **선택 지문 전부** 표시 — 지문 단위 토글
> (아코디언)로 접었다 폈다.
> **D2** 도시에 「생성된 문제」 행 — 클릭 가능하다는 시각 어포던스가 없고 문두가
> 잘린다 → 클릭 신호 + 무절단(잘림 금지) 개선.
> **D3** 문제 상세 모달이 **접힌(compact) 상태로 뜬다** → 모달은 처음부터 완전히
> 펼쳐진 상태(전체 선택지·정답·해설 노출)로.
> **D4** 학습 모듈 칩이 클릭 불가(정보 나열뿐) → **칩 클릭 = 해당 모듈 미리보기**.
> **D5** 도시에에서 **클래스·학생에 바로 배포** 가능해야 — 학습지 보내기(모듈·마감
> 포함)·문제 과제 보내기 CTA. "저 정도 섹션을 차지하려면 기능이 있어야지."
> **D6** 워크스페이스 뷰에서 우측 "지문을 선택하면…" 빈 상태는 무의미(선택 단계가
> 없다) → 그 자리를 **일괄 생성 패널**로: 상단에서 학습지/문제 중 무엇을 만들지
> 선택 → 유형·난이도 등 설정(모달이 아니라 우측 탭에서) → 워크스페이스 **전 지문
> 일괄 생성**. 하단 「전체 학습 워크북 생성 N개」 버튼은 **폐기**. 전체 실전 문제
> 일괄 생성도 신설(현재 부재 자체가 결함).
> **D7** 학습 워크북 생성 모달 디자인이 문제 생성 모달 대비 저질 → 문제 생성 모달
> 규격(디자인 토큰·완성도)으로 재설계.
> **D8** 스튜디오 유형선택 모달이 문제 생성 페이지 원본과 다름(출제 포인트/겨냥
> crosshair 기능 등 누락) → **원본과 기능 100% 동일**하게.
> **D9** 직접 입력 섹션의 「사용 순서」 가이드 박스(smoat-text-empty-guide) 제거.
> **D10** AI 지문 생성: "지문은 그대로 붙여넣어도 돼요" 멘트 제거 후 그 자리에
> **분량·만들 편수만** 설정 노출. 우측 복잡 설정(읽는 사람·단어·문장·뼈대·소재·
> 겨냥 문항·용도) 전부 제거. "이렇게 나와요" 미리보기 섹션 제거. 「예시」는 더
> 다양한 예시 목록에서 골라 바로 넣어볼 수 있게.
> **D11** 전 섹션 미학·기능 적대 검수 — "이정도면 충분" 금지.

#### 3.9v2.1 다중 지문 도시에 — 아코디언 (D1)

- 업링크 개정: LibraryPane 의 `onDossierPassage` 를 **폐기하고**
  `onDossierPassages?: (items: { id: string; title: string }[] | null) => void` 로 교체
  (소비처는 스튜디오 1곳뿐이라 개명 안전). 발행 규칙: 내 지문함 선택 집합 변화 시
  **현재 선택 전체**를 선택 순서대로 발행(빈 집합 = null). 상세 열람은 단건
  `[{id,title}]` 로 발행하지 않고 — 선택 집합을 건드리지 않으므로 **발행하지 않는다**
  (열람만으로 도시에가 바뀌던 v1 동작 폐기 — 선택이 유일한 트리거). draft 의사 id 제외.
  제목은 PassageItem 에서 취득(usePassageLibrary selectedIds + byId 맵).
- 표시 상한 `MAX_DOSSIER_PASSAGES = 5`: 초과 시 최근 선택 5개 + 각주
  "선택 지문 N개 중 최근 5개를 표시합니다".
- 패널 구조: 지문마다 **아코디언 카드**(AssignmentCard 계보 grid-rows-[0fr↔1fr]
  300ms). 헤더 = 지문 제목(break-keep) + 분석 상태 배지 + ChevronDown. **마지막
  발행분(최근 선택)만 기본 펼침**, 나머지 접힘. 1개 선택이면 아코디언 1개 자동 펼침
  (별도 단수 모드 없음 — 렌더 경로 단일).
- 조회는 **펼침 시 지연 fetch**(지문당 5~11왕복 실측 — §정찰 R3-⑥): 오케스트레이터가
  `Map<passageId, DossierFetchState>` 캐시 + 지문별 취소 가드. 접었다 펴도 재조회
  없음(캐시), 재선택(집합 재발행)이 갱신. 폴링 없음 유지.
- 오케스트레이터 상태: `dossierPassages: {id,title}[] | null` (참조는 발행 배열
  그대로). 우측 위계 v2: **①워크스페이스 열림 → BatchGeneratePane(§3.9v2.5)
  ②dossierPassages → 도시에 아코디언 ③클래스 선택 → ClassPanel ④빈 상태 1줄**.
  드로어 트리거 라벨: ①「일괄 생성」 ②「지문 현황」 ③「클래스 정보」.

#### 3.9v2.2 문제 행 어포던스·무절단 (D2)

- 행 레이아웃 2줄 전환(passage-dossier-pane.tsx:372-391 개정):
  1줄 = 문두 `line-clamp-2 break-keep text-[11.5px]` + `title={r.stem}` /
  2줄 = 배지 행(유형·난이도 + **approved 시 emerald 닷+「검수완료」**(10px) —
  미사용 데이터 활용) + 우측 끝 `ChevronRight size-3.5 shrink-0 text-slate-300
  group-hover:text-slate-500`(lemma 링크형 행 정본 — lemma-dossier.tsx:306-320).
- 행 버튼: `group cursor-pointer`(TW v4 커서 관행) + `items-start` +
  hover:bg-slate-50 유지. 서버 stem 120자 절단은 유지(전문은 모달).
- 학생 이름 행(:191-194): h-8 → `min-h-8` + 이름 truncate 유지(title 존치 — 이름은
  절단 수용, 결정 근거: 한 줄 정렬 가치 > 긴 이름 희귀).

#### 3.9v2.3 문제 상세 모달 완전 펼침 (D3)

- QuestionCard 에 additive prop `explanationDefaultOpen?: boolean`(기본 false =
  바이트 동일, passageDefaultOpen 동형 — **감독이 직접 수술, 함대 접근 금지**).
- DossierQuestionModal(passage-dossier-pane) + QuestionItemPreviewModal(library-pane):
  `compact` **제거**, `readonly suppressUnapprovedBorder answerReveal="show-all"
  passageDefaultOpen explanationDefaultOpen` 조합(리포 정본 패턴 —
  variant-source-modal.tsx:227-235 계보). 도크 모달(dock-question-preview-modal)은
  N장 목록이라 **compact 유지**(변경 금지).

#### 3.9v2.4 모듈 칩 미리보기 + 바로 배포 (D4·D5)

- **D4**: 학습 모듈 칩 — ready(보유) 칩과 hasExam 실전 칩을 `<button>` 으로 승격,
  클릭 = `ModulePreviewSheet`(module-preview-sheet.tsx — props {passageId, moduleId,
  onClose} 라우트 의존 0, 그대로 import) 오픈. 미보유 칩은 span 유지 +
  title="분석 후 사용할 수 있습니다". ready 칩에 hover(bg-blue-100)·cursor-pointer.
  시트 상태는 도시에 패널 로컬 소유(오케스트레이터 무접촉).
- **D5**: 각 지문 아코디언의 스탯 그리드 바로 아래 CTA 행 2버튼(h-8, 1:1 분할):
  - [학습지 보내기](primary bg-blue-600, Send 계열 아이콘): DeployDialog
    (deploy-dialog.tsx) 오픈 — classId=null(클래스 선택 스텝), classes =
    오케스트레이터 보유 StudioClassRow[], modules = readyModules(+hasExam),
    passageId/Title = 해당 지문. **additive prop `onClassPicked?: (classId) =>
    void`**(감독 수술)로 클래스 선택 즉시 `addPassagesToStudioClass(classId,
    [passageId])` 멱등 등록 — deployStudioModules 의 링크 게이트(deploy.ts:242-250)
    통과. 게이트: readyModules 0 && !hasExam → aria-disabled +
    title="AI 분석 후 배포할 수 있습니다".
  - [문제 보내기](보조 — border-blue-200 text-blue-700): AssignmentComposer
    preset {kind:"QUESTIONS", questionIds: rows(최신 50) id 전량} — generation-dock
    선례(:397-402) 그대로. 게이트: questions.total 0 → aria-disabled. **50 절단
    고지(검수 D-02 개정)**: 각주를 "문제 목록·문제 보내기는 최신 50문항 기준"으로
    확장 + total>50 이면 CTA 클릭 시 "최신 50문항을 보냅니다" 토스트 1회.
  - 모달 3종(미리보기·배포·컴포저) 동시 오픈 금지 — 단일 모달 상태로 배타.
- DeployDialog·AssignmentComposer 호스팅은 오케스트레이터(studio-home-client) —
  도시에 패널은 업링크 콜백(`onDeployWorksheet(p)` / `onComposeQuestions(p,ids)`)만
  발행(안정 참조 규약).

#### 3.9v2.5 일괄 생성 패널 — BatchGeneratePane (D6, 신규 workbench/batch-generate-pane.tsx)

- 트리거: LibraryPane effect 업링크(QuestionGenBridge 동형)
  `onWorkspaceBridge?: (b: WorkspaceBridge | null) => void` —
  `WorkspaceBridge = { open: boolean; passages: {id,title,content}[] }`.
  passages 는 rows 시그니처(id·개수) 불변 시 참조 재사용(useMemo — memo 방어선).
  워크스페이스 오버레이 열림/닫힘·행 증감 시 재발행.
- 하단 「전체 학습 워크북 생성 N개」 CTA 바 **삭제**(library-pane workspacePane
  :688-707 + openWorkbookFromWorkspace :460-481 고아 제거. 행 단위
  openWorkbookFromRow 존치). §3.8.5 의 "일괄 실전 금지" 문장은 본 절로 **폐기 개정**
  — library-pane.tsx:688-690 주석도 함께 갱신.
- 패널 구성(360px, lemma 문법 + 문제 생성 모달 토큰):
  1. 헤더: 「일괄 생성」 + 「지문 N개」 칩(blue-50 필).
  2. 세그먼트 토글(문제 모달 정본 h-9 rounded-lg bg-slate-100 p-0.5):
     [학습 워크북] | [실전 문제].
  3. **학습 워크북 모드**: 대상 클래스 셀렉트(워크북 모달 계약 이식) → 모듈 7종
     슬림 체크 행(라벨+부제+PriceBadge — module-select-sheet-parts 순수함수
     정본: selectionCost 합집합 증분·exam 특례 C7 전량 이식: 상호배타·examEligible·
     hasWorksheet 제외) → 요약 스트립(「선택 N모듈 · 총 K크레딧」 + 초기화) →
     CTA 「지문 N개 워크북 생성」+CreditCostChip. 발사 = queueApi.launchModules
     1회(+exam 은 launchWorksheet 루프 — **동시성 3 제한 도입**, N 무제한 fire 금지)
     → onLaunched 3동작(도크 펼침 등) 동형. 견적 = getStudioPassageSectionStates
     배치(50 상한 — 초과 시 "50개까지" 안내 스트립, 발사 차단).
  4. **실전 문제 모드**: 난이도 세그먼트(BASIC/INTERMEDIATE/KILLER — DIFFICULTY_TONES
     토큰) + 플랜 세그먼트(STANDARD/PREMIUM) + 유형 선택 리스트(카테고리 그룹
     아코디언 + 타일·스테퍼 — 문제 모달 타일 문법 1열 슬림 복제, 등재 유형은
     QUESTION_TYPES 정본) + 요약 스트립(「총 M문항 × 지문 N = 총 K문항」+ 크레딧) +
     CTA 「지문 N개 문제 생성」+CreditCostChip.
     발사 계약(§정찰 R5-② 게이트): bridge 메서드
     `batchGenerateQuestions(settings: {typeCounts, difficulty, generationPlan})` —
     use-studio-question-gen 에 additive 반환 필드로 신설. 내부: 전 행
     workspaceApi.setOverride(localId, {typeCounts, difficulty, generationPlan})
     **덮어쓰기**(일괄 = 명시적 전체 적용 의미론) → handleWorkspaceGenerate() 무인자
     → 반환 후 발사 행 typeCounts `{}` 소거(연타 중복 발사 방지 — useRowSettingsPanel
     :115-130 의미론 미러). 크레딧 견적은 문제 생성 페이지 workspaceCreditCost
     산출부와 **동일 정본 헬퍼 재사용**(복제 금지 — generate-page-client 추적).
  5. 워크스페이스 0행: 안내 1줄 + CTA aria-disabled.
- 스탬프는 stampingSetSessionQueue 가 자동 처리(§정찰 R5 — 추가 작업 없음).

#### 3.9v2.6 워크북 모달 재설계 (D7)

- 셸은 passage-generate-modal 계보 유지(WideModal 전환 금지 — §정찰 R4 판정).
  §3.8.7 기능 계약 C1~C14 **전량 보존**. 격차 G1~G11 해소:
  - 그룹 카드: 모듈 그리드를 `rounded-xl border shadow-sm` 카드 + `h-10 bg-slate-50/80`
    헤더(「학습 모듈」 + 「선택 N」 배지) 안으로.
  - 요약 스트립(h-9 bg-slate-50 rounded-lg): 「선택 N모듈 · 총 K크레딧」 + 초기화
    버튼(전 해제).
  - 헤더: 제목 text-[14.5px] 통일 + **다지문 지문 목록 팝오버**(지문 N개 칩 클릭 =
    제목 리스트, 행 클릭 = 본문 미리보기 — 1지문 셀렉터의 일반화).
  - 푸터 CTA 3부 구성(아이콘 + 라벨 + CreditCostChip), `hover:bg-blue-700
    hover:shadow-lg`, Loader2 생성 중 상태, 크레딧 별도 캡션 행 폐지.
  - 섹션 라벨 `uppercase tracking-wider px-0.5`, 카드 hover `border-slate-300
    bg-slate-50/80`, transition-[max-width] 부여.
  - 모듈 카드에 아이콘/카테고리 닷 위계 부여(STUDIO_MODULES 순서 고정, 라벨·부제
    변형 금지). role=checkbox·aria-checked·data-workbook-module·글로우 계약 유지.
- CTA 라벨 정본을 현행 구현(「지문 N개 생성 시작」 계열)으로 **스펙 확정**(§3.8.7
  구 문구 폐기).

#### 3.9v2.7 유형선택 모달 기능 동일화 (D8)

- 수정 파일 2개 한정(공유 파일 0건 — §정찰 R1 판정): use-studio-question-gen.ts +
  studio-question-gen-modal.tsx(주석).
- use-studio-question-gen.ts: ① `teacherPointsByPassage` useState 를
  **useWorkspaceGeneration 호출보다 위에** 선언(순서 계약 — generate-page-client:
  422-430) ② useWorkspaceGeneration 에 전달(발사 페이로드 teacherPoints 복원)
  ③ usePointPicker 호출(파라미터 8종 — 기존 상태 7종 + 신규 state)
  ④ modalProps 에 pickerOpen/onPickerClose/picker/appliedPointCount/
  onPointChipClick/pointCountMissing 6종 ⑤ panelProps 에 onOpenPointPicker/
  teacherPointCounts 2종. configOnly 미전달(모바일 즉시 생성)은 **의도적 차이로
  유지**, headerLabel·sheetOnMobile 유지.
- §3.8.8 의 "47 props" 수치를 **57(전달 46+신규 2=48)** 로 정정.
- 검증: 스튜디오 모달에서 13개 등재 유형 타일에 과녁/포인트 배지 렌더 + 픽커
  2컬럼(1520px 모프) + Esc 사다리(픽커만 닫힘) + 발사 페이로드 teacherPoints 실림
  (프로브로 요청 바디 실측). 5초 폴링 × staleness effect 중복 토스트 실측 필수.

#### 3.9v2.8 인테이크 간소화 (D9·D10 — 스튜디오 호스트 한정, 부재 시 바이트 동일)

- **D9**: TextInputBoard additive `hideEmptyGuide?: boolean` — 가이드 박스 대신
  muted 1줄 "붙여넣은 지문이 여기에 쌓입니다". 체인: MultiPassagePaste →
  IntakeSurface → library-pane(true).
- **D10**: AuthoringBoard additive `simplified?: boolean` — true 면:
  ① AuthoringSpecRail 블록 미렌더(spec-rail.tsx:33-38 "레일 불소멸" 계약의 명시
  예외 — 근거 주석 필수) ② GhostProof 미렌더 ③ 컴포저 툴바 pasteHint 자리에
  분량·편수 컨트롤 2개(분량 = LengthControls export 승격 재사용 / 편수 = Segments
  3열 + CreditCostChip — 팝오버 버튼형). **3,600자 잔여 카운터는 보존**(컨트롤과
  병행 표기). spec state 는 보드가 계속 소유 — 나머지 7축은 서버 기본값(§정찰 R2:
  전 필드 default, 발사 성립 확인). diversify UI 생략 = 기본 true 고정(명시 결정).
  체인: MultiPassagePaste → IntakeSurface → library-pane(`simplifiedAuthoring`).
- 예시 다양화(전 호스트 공통): INSTRUCTION_EXAMPLES 6개 → **12개**(주제·장르·용도
  다양화 — 예: 과학 실험/역사 사건/그래프 해석/일기·편지/환경 이슈/심리 실험/경제
  개념/스포츠/전기문/우화/시사/학교 생활). **CI 예산 준수**(비공백 ≤20자·글리프
  ≤26 — copy-budget 테스트 그린 유지, 팝오버 폭 변경 금지).
- authoring/ 신규 문구는 전부 passage-authoring-glossary.ts 경유(CI 토큰 게이트).

#### 3.9v2.9 함정 승계·게이트

- 함정: memo 방어선(업링크 안정 참조·bridge useMemo) · passages 참조 불변(견적
  effect 무한 재조회 — §3.8.11 함정) · genMode==='set' 벌크 차단 가드 존중 ·
  워크북 모달 passages 안정 참조 · 50개 상한(getStudioPassageSectionStates) ·
  launchWorksheet 동시성 3 · 픽커 staleness 토스트 × 5초 폴링 실측.
- 게이트: tsc 0 · lint 접촉 파일 0 에러 · 계약 테스트(워크벤치 2/2 + copy-budget)
  · 행동 프로브(도시에 아코디언 2지문·모듈 미리보기·배포 다이얼로그·문제 모달
  완전 펼침·일괄 패널 학습지 0크레딧 발사·문제 모드 CTA 활성까지(실발사 스킵 —
  크레딧 보호)·유형 모달 포인트 UI) · 캡처 시각 검수(생성 페이지 무회귀 캡처 포함
  — additive 부재 시 바이트 동일).
- 부록(검수 R-3 등재 — 의도 변경으로 승인): v2 라운드에서 공유 표면 어투 통일
  스윕("~해요"→"~합니다": 워크스페이스 코치 힌트·TextInputBoard emptyTitle 기본값·
  generate-upload-panel 문구)이 비게이트로 함께 실렸다. 합니다체 정본에 부합해
  채택 — 다음 무회귀 라운드는 이 diff 를 재적발하지 말 것.

### 3.10 클래스-우선 워크벤치 대개편 (2026-08-12 사용자 지시 — 이 절이 §3.1.1·§3.9 계열과 충돌하면 **§3.10 이 우선**)

#### 3.10.0 지시 원장 (판정 기준 최상위 — 검수는 이 원장 대비로 판정한다)

- **E1 단계 안내**: 애초에 클래스를 먼저 선택하도록 단계가 직관적으로 드러나야 한다.
  "무조건 클래스를 등록하고 거기 클래스에서 문제를 만들도록."
- **E2 레일 디자인 개선**: 텍스트 좌측 정렬 · **아래로 토글 내리는 버튼 UI**(셰브론 다운) ·
  행이 너무 작아 가독성이 없다 → 확실히 키운다.
- **E3 레일 = 학생 선택기**: 펼치면 학생들이 쭈르르, **학생 개별 체크 + 클래스 단위 체크**.
  지금 선택된 클래스와 학생 구성이 왼쪽에서 완전히 직관적으로 보인다.
- **E4 우측 = 배포 실행대**: 지문 도시에는 가치 있음(중앙 지문 선택 → 시선이 오른쪽으로).
  「학습지 보내기」「문제 보내기」는 **모달 금지** — 토글 내리고 **배포 일정만 설정**해
  바로 배포. 대상은 왼쪽에서 선택한 클래스·학생이므로 다시 묻지 않는다.
- **E5 우측 클래스 정보 패널(ClassPanel)은 의미 없음** — 좌측이 학생 정보를 다 보여주므로 폐기.
- **E6 일괄 생성 패널(BatchGeneratePane) 전면 폐기** — 워크스페이스가 열려 있어도
  우측은 지문별 도시에가 유지된다.
- **E7 지문함 클래스 스코프 기본**: 자료도 기본이 클래스 단위로 등록·조회. 전체 자료
  단위 보기도 가능. 특정 지문의 클래스 소속 넣기/빼기가 쉬워야 한다.
- **E8 생성 큐 인라인**: 문제·학습지를 생성하면 **그 지문(도시에 카드)에 컴팩트한 작업
  항목이 붙어** 생성 토글이 돌아가고, 완료되면 이름을 유지한 채 자료로 정리, 상세 보기 가능.
- **E9 워크스페이스 = 도시에 공급원 (2026-08-12 2차)**: 「워크스페이스에 담기」를 해도
  우측 도시에는 **그대로 유지**되어야 한다. 워크스페이스에서 작업 중인 지문이 있는데
  우측이 "②에서 지문을 선택하면…" 빈 문구면 위반.
- **E10 실시간 생성 스트리밍 (2026-08-12 2차)**: 워크스페이스에서 문제/학습지를 생성하면
  우측 도시에의 그 지문 카드에 생성 큐가 **바로 떠서 실시간 스트리밍으로 생성되는 모습이
  보인다** — 납작·컴팩트·아름답게, 유형·난이도(킬러 등)·플랜이 깔끔히 보이게. 완료물은
  문제 스트립/모듈 칩(어휘·직독직해…·실전 문제)에 착지한다.
- **E11 문항 스트립 행 재설계 (2026-08-12 2차)**: 문두+지문 미리보기는 무의미(같은 지문에
  딸린 것들이므로) — 폐기. 대신 **난이도 · 생성일시 · 일반/프리미엄 여부 · 문제 유형**이
  깔끔하게 들어간다.
- **E12 레일 위저드 접힘 (2026-08-13)**: 클래스를 선택하고 다음 단계로 넘어가면 좌측
  레일은 필요 없다 — 스텝 스트립("대상 ✓ 2학년 · 2명") 정도 표시면 충분. 선택 시
  레일 자동 접힘(§3.10.12).
- **E13 지문관리 재설계 (2026-08-14 3차)**: 클래스 선택 직후 기출 지문 탭이 뜨는 건
  잘못 — **무조건 지문관리(구 내 지문함)로 안내**. "지문관리 탭과 기출 지문·직접
  입력·자료 첨부는 대등한 개념이 아니다" — 들여오기 3종은 지문관리 안의 **「지문
  추가」 액션**으로 격하. 하위 탭 이식이 아니라 구조 재설계(§3.10.14).
- **E14 지문함 검수·필터 정화 (2026-08-14 3차)**: 검수완료(벌크·행 토글)·분석완료
  배지 폐기 — "지문에다가 검수 체크를 왜 해". 학교 필터 등 스튜디오 문맥과 안 맞는
  필터 제거, 필터/검색 아이콘 2쌍 중복 해소, 벌크 툴바 각 버튼 존재 이유 재심사
  (§3.10.15).
- **E15 생성 문제 전체보기 = 시험지 스튜디오 (2026-08-14 3차)**: 문제들이 지문
  묶음에서 전부 빠져나와 "무슨 지문·무슨 유형·무슨 난이도·생성일시"의 평면
  리스트로 정리 + 필터 + 최적화 드래그 선택 → 선택 즉시 시험지 조판. **사실상
  /director/workbench/exams/create 를 /director/studio 안에 완벽 이식** — 조판·
  시험지 설정(용지·단·밀도·배점·템플릿·로고·표시 옵션·저장 설정)·출력까지 전부
  (§3.10.16).
- **E16 학습지 전체보기 (2026-08-14 3차)**: 학습지도 지문 경계 없이 클래스 단위
  평면 목록으로(§3.10.16).

#### 3.10.1 시선 흐름 원칙 — 좌(대상) → 중(자료) → 우(배포)

구 화면의 결함: 좌=클래스 관리, 중=자료, 우=**다시** 클래스 정보 — 시선이 우측에서
좌측 주제로 되돌아갔다. 새 모델은 한 방향이다:

```
① 좌  레일   = 누구에게 (클래스 선택 + 학생 체크 = 배포 대상)
② 중  지문함 = 무엇을   (클래스 스코프 자료 선택·생성)
③ 우  도시에 = 보내기   (생성물 확인 + 일정 설정 + 바로 배포)
```

- **상단바 스텝 스트립**(신규 `workbench/step-strip.tsx`): `① 대상` `② 자료` `③ 배포`
  3칩. 상태 = 완료(파랑 체크 + 요약: "2학년 · 3명")/진행(볼드)/대기(muted).
  판정: ①완료=클래스 선택됨, ②진행=①완료 & 도시에 닫힘, ②완료·③진행=도시에 열림.
  프레젠테이션 전용(클릭 없음 — 폭 좁으면 md 미만 숨김). 기존 h-12 상단바 좌측
  타이틀 뒤에 배치, 우측 메타(클래스 N·학생 N)는 유지.
- **클래스 미선택 = 중앙이 단계 가이드**(신규 `workbench/step-guide-pane.tsx`):
  LibraryPane 을 렌더하지 않고 가이드 패널이 중앙을 차지한다 — 큰 스텝 카드 3장
  (①클래스 선택: 기존 클래스 퀵 선택 버튼들 + 「새 클래스 만들기」 CTA / ②자료
  선택·생성(잠김) / ③배포(잠김)). 이것이 "무조건 클래스 먼저"의 구조적 강제다.
  클래스 0개면 ①카드가 「새 클래스 만들기」 단독 CTA.

#### 3.10.2 좌측 클래스 레일 v3 (E2·E3 — §3.1.1v2.1 전면 대체)

가독성 정본(구 h-8·12.5px 는 "존나 작아서" 기각):
- 클래스 행: **h-12(48px)** rounded-lg, 구조(좌→우):
  `[클래스 체크박스 size-[18px]] [이름 text-[13.5px] font-bold 좌측정렬 + 서브라인
  text-[11px] text-slate-400 "학생 N명"] [케밥(hover)] [펼침 ChevronDown size-4
  버튼 h-7 w-7 — 우측 끝]`.
  펼침 셰브론은 **ChevronDown**(접힘 = 0°, 펼침 = rotate-180) — "아래로 토글" 어포던스,
  행 우측 끝 고정. 구 좌측 ChevronRight 폐기.
- 선택 시각: bg-blue-100/70 + 좌측 인디케이터 w-[3px] + 이름 text-blue-800.
- 행 상호작용: 이름 영역 클릭=작업 클래스 선택(+**자동 펼침**), 선택 행 재클릭=해제
  (e.detail≥2 토글 제외·더블클릭 rename 진입 시 선택 유지 — v2 함정 승계),
  더블클릭=인라인 rename, 케밥=학생 추가/이름 변경/보관(유지).
- 학생 행: **h-10(40px)**, `pl-4` 들여쓰기 + 좌측 세로 가이드라인(border-l), 구조:
  `[학생 체크박스 size-4] [이름 text-[13px] font-medium 좌측정렬] [코드 mono 10.5px]
  [초대장 아이콘 버튼(hover — 자리 미점유 hidden→flex)]`. 꼬리 「+ 학생 추가」 행(h-9) 유지.
  압착 규칙(2026-08-12 실측 개정): 이름 min-w-[64px] 우선권, 코드는 min-w-0 truncate
  로 **부족할 때만** 압착 — max-w 하드 클램프 금지(넓은 레일에서도 항상 잘리던 결함).
- **로스터 성능 정본(2026-08-12 개정 — "토글 로딩이 오래 걸린다" 기각)**: 레일은
  슬림 로스터(listStudioClassRosters — 전 클래스 1왕복, 이름·코드·id만, 과제 집계
  없음)를 **마운트 시 프리페치**한다. 구 클래스별 지연 로드(listStudioClassStudents
  — payload→studio raw SQL + task groupBy 포함)는 펼침 토글 체감 1~3s 의 원인으로
  레일에서 퇴출(학생 탭·설정 탭은 완전판 유지). 펼침 토글은 순수 클라이언트
  (실측 평균 52ms), force 재조회(학생 추가·연결·재시도·신규 클래스)도 같은 액션.
  재진입은 inflight+again 큐 합류. 학생 0명 클래스도 서버가 빈 배열 프리필
  (엔트리 없음=미로드 오인 방지).
- 로딩/빈/에러 행 관용구는 v2.1 승계(스피너·"등록된 학생이 없습니다"·다시 시도).
- 헤더(「클래스」+`+`)·하단 「+ 새 클래스」·생성 즉시 선택·보관 문구 전부 유지.

#### 3.10.3 배포 대상 모델 (체크 상태의 의미론 — 오케스트레이터 소유)

- **작업 클래스** = selectedClassId (단일). 배포·생성·스코프의 앵커.
- **학생 체크** `checkedByClass: Record<classId, Set<studentId>>` — 그 클래스에서
  배포 대상으로 삼을 학생 집합. **기본 = 전원**: 엔트리가 없거나 로스터 미로드면
  전원으로 취급한다(펼치지 않고도 배포 가능해야 하므로 "미로드=전원"이 계약).
  로스터 첫 로드 시 전원 체크로 초기화, 재조회로 새 학생이 늘면 **새 학생은 체크**
  상태로 합류(기존 해제는 보존).
- 클래스 체크박스 = 트라이스테이트(전원 ✓ / 일부 ─ / 0명 ☐). 클릭 = 전원↔0 토글.
  0명 체크 상태로는 배포 불가(도시에 배포 버튼 비활성 + "대상 학생을 선택하세요").
- **표시 개정(2026-08-12 감독 감상)**: 체크 표시는 **작업 클래스에서만 유의미**하다
  — 비선택 클래스의 클래스·학생 체크박스는 빈 상태로 그리고, 클릭하면 그 클래스가
  작업 클래스로 선택된다(전원 기본). 전 클래스가 파랗게 체크된 화면은 "지금 선택된
  클래스가 뭔지 직관적으로"라는 E3 와 충돌한다(기각). 배지 k/N 강조도 선택 클래스만.
- 체크는 **작업 클래스가 아닌 클래스에도 저장은 유지**되나(재선택 시 복원), 배포
  대상은 언제나 작업 클래스의 체크만 쓴다(다중 클래스 동시 배포는 비목표).
- 클래스 행 배지: 전원이면 `N명`, 일부면 `k/N명`(파랑 강조) — 대상이 좁혀져 있음을
  레일에서 즉시 인지.

#### 3.10.4 중앙 — 클래스 스코프 지문함 (E7)

- 클래스 선택 시 「내 지문함」 그리드 기본 = **그 클래스 등록 지문만**(구 스코프 칩
  기본 OFF 를 뒤집는다). 그리드 상단 세그먼트 `[이 클래스 N | 전체 자료]`:
  - 이 클래스: 등록 지문만. 빈 상태 "전체 자료에서 담거나, 위 탭에서 새로 만드세요".
  - 전체 자료: 학원 전 지문 + 각 행에 등록 상태 표시·**담기/빼기 토글**(멱등).
    빼기 = 신규 서버 액션 removePassagesFromStudioClass(§3.10.8) — 링크 해제만,
    지문·생성물은 보존.
- 붙여넣기·AI 생성·추출·기출 담기의 **자동 클래스 귀속은 유지**(기존 §3.1.2 계약).
- 클래스 미선택이면 중앙은 가이드(§3.10.1)라 지문함이 아예 없다 — "생성은 반드시
  클래스 맥락"의 구조적 보장.

#### 3.10.5 우측 — 도시에 = 배포 실행대 (E4·E5·E6)

- **패널 위계 v3**: ①dossierPassages → 도시에 아코디언 ②없으면 빈 상태 1줄
  ("②에서 지문을 선택하면 여기서 배포합니다"). ~~workspaceBridge 일괄 생성~~(E6 폐기),
  ~~ClassPanel~~(E5 폐기 — class-panel.tsx·batch-generate-pane.tsx **파일 삭제**,
  단 panel-primitives 는 도시에가 계속 쓰므로 존치). 워크스페이스가 열려도 우측은
  도시에 그대로다. 드로어 트리거 라벨 위계도 동일하게 축소.
- 도시에 카드 CTA 행 `[학습지 보내기][문제 보내기]` → **모달 폐기, 인라인 확장**
  (신규 `workbench/dossier-deploy-inline.tsx`, 카드당 한 번에 하나만 펼침,
  grid-rows 0fr↔1fr 접힘 관용구):
  - 공통 헤더: 대상 요약 `→ {클래스명} · {k}명` (좌측 레일 상태 읽기 전용 —
    "대상은 왼쪽 레일에서 바꿉니다" 캡션). 클래스 미선택/체크 0명이면 배포 버튼
    비활성 + 사유 1줄.
  - 학습지 폼: 준비된 모듈 칩(기본 **전체 선택**, 탭하여 제외 — 최소 1개) +
    일정 필드(§3.10.9 바인딩) + `[바로 배포]`.
  - 문제 폼: 문항 요약(최신 50 기준 N문항·유형 분포 — 추가 선택 UI 없음, E4
    "복잡하게 선택할 필요 없이") + 일정 필드 + `[바로 배포]`.
  - 성공 시: 확장 접힘 + 토스트 + 해당 지문 fetchDossier 강제 재조회(배정 현황 반영).
  - DeployDialog·AssignmentComposer 는 **다른 화면이 쓰므로 파일 존치**, 스튜디오
    워크벤치 경유만 제거한다.
- 도시에 기존 섹션(스탯 그리드·모듈 칩 미리보기·생성된 문제·배정 현황)은 유지.

#### 3.10.6 생성 큐 인라인 (E8)

- 도시에 카드에 **「생성 중」 스트립**: 이 지문(passageId)의 활성 작업 —
  학습지(워크북) 잡 + 문항 세션 큐 — 을 컴팩트 행으로 표시:
  `[spinner] {라벨: 모듈 조합 | 유형·N문항} · {상태}`. 데이터 소스·필드 경로는
  §3.10.9 바인딩. 완료 감지 시 해당 지문 fetchDossier 강제 재조회 → 모듈 칩·
  문제 목록이 "이름을 유지한 채" 카드에 정리되고 스트립 항목은 사라진다.
  실패 항목은 rose 톤 1행(재시도는 발사 지점 소관 — 스트립은 표시만).
- 스트립 데이터는 오케스트레이터가 조립해 props 로 내린다(도시에 판은 표시 전용,
  §3.9 폴링 금지 계약은 "도시에 자체 폴링 금지"로 유지 — 큐 폴링은 기존 엔진 재사용).

#### 3.10.7 폐기·존치 원장

| 대상 | 처분 |
|---|---|
| workbench/class-panel.tsx | **파일 삭제** (E5) |
| workbench/batch-generate-pane.tsx | **파일 삭제** (E6) |
| workbench/batch-types.ts (WorkspaceBridge) | LibraryPane 업링크 포함 제거(스튜디오 소유 파일이라 안전) |
| 도시에 → DeployDialog/AssignmentComposer 경유 | 제거(인라인 폼 대체). 파일은 존치(타 화면 사용) |
| WorkbookGenerateModal·studio-question-gen-modal | **존치** (생성 설정 — E4 는 "배포" 모달만 금지) |
| 워크북/문항 생성 CTA·큐 엔진(useStudioQueue·sessionQueue) | 존치 (E8 스트립의 데이터 소스) |
| InviteKitSheet·StudentAddModal 오케스트레이터 호스팅 | 존치 (레일 v3 도 동일 동선) |

#### 3.10.8 서버 additive (전부 academyId 스코프·기존 계약 무회귀)

- deployStudioModules: 학생 부분집합·일정 필드 — §3.10.9 정찰 바인딩에 따라 additive 확장.
- 문항 과제: 컴포저 UI 를 우회해 같은 생성 액션을 직접 호출하는 스튜디오 래퍼
  (§3.10.9 — 필수 필드 최소 집합 확정 후).
- removePassagesFromStudioClass 신설: studioClassPassage 링크 해제(멱등, 링크만).

#### 3.10.9 정찰 바인딩 (2026-08-12 정찰 함대 6기 확정 — 함대는 이 절의 시그니처만 신뢰)

**서버 계약 (전부 기존재 — 수술 최소)**
- deployStudioModules(StudioDeployInput) — **학생 부분집합·dueAt·title 이미 1급 입력**
  (deploy.ts:219-330). 게이트: studioClassPassage 링크 필수("이 클래스에 등록된 지문이
  아닙니다") + ENROLLED 교집합 + PRIME 리포트 + 서버 viable 재컴파일. studentIds 는
  dedupe 후 200 캡. targets 는 항상 `{type:"STUDENT",id}` 개별 — CLASS 전개 아님.
  payload.worksheet.studio 3필드 스탬프가 결과 역조회의 유일 근거(유지 의무).
- **deployStudioQuestions(신설 완료 — 감독 수술)**: deploy.ts, 워크시트와 동일 편성
  검증 + createStudyAssignment(kind QUESTIONS, questions.questionIds ≤50 서버 정본,
  title 미지정 시 `문제 세트 N문항`) + /director/studio 2경로 revalidate.
- previewStudioDeployment({passageId, modules, mode}) — classId·studentIds 무관.
  **350ms 디바운스 + `modules.join(",")` 문자열 키 구독**(배열 참조 함정 — 위반 시
  서버 액션 무한 재호출, deploy-dialog.tsx:207-230 정본).
- addPassagesToStudioClass({classId, passageIds}) — 멱등·50 캡·revalidate. 배포 직전
  **멱등 선등록 필수**(링크 게이트 — 미호출 = 배포 100% 실패).
- removePassageFromStudioClass({classId, passageId}) 단건 기존재(passages.ts:351).
  **복수형 removePassagesFromStudioClass({classId, passageIds}) → {removedCount} 신설**
  (감독 수술 — deleteMany + revalidate 1회, 50 캡 대칭).
- listStudioClassStudents(classId) — **위치 인자 string**. ENROLLED+ACTIVE, take 300.
  StudioStudentRow 7필드(studentId·name·studentCode·grade·taskTotal·taskDone·lastStudyAt).
- 날짜 헬퍼 재사용(파일 존치): deploy-dialog-dates.ts — DuePreset("today"|"tomorrow"|
  "week"|"custom")·resolveDueYmd·dueYmdToIso(`T23:59:00+09:00`)·dueLabelKo·thisSundayYmd.
  강도 정본 STUDIO_INTENSITY(lib/studio/modules).
- 성공 토스트 정본(DeployDialog 이관): `` `${taskCount}명에게 배포했습니다 — 결과
  탭에서 확인할 수 있습니다` ``.

**공유 클라 계약 (신규 파일 `workbench/deploy-target.ts` — 감독 작성, 함대는 import 만)**
```ts
/** 좌측 레일 체크 상태를 배포 실행대가 소비하는 형태로 접은 것 — 오케스트레이터 조립 */
export interface StudioDeployTarget {
  classId: string;
  className: string;
  /** 체크 확정 학생(로스터 로드 완료 후) — 배포 버튼은 loading 동안 비활성 */
  studentIds: string[];
  count: number;      // = studentIds.length
  total: number;      // 로스터 전체 수(미로드면 클래스 studentCount)
  partial: boolean;   // count < total
  loading: boolean;   // 로스터 로딩 중(선택 즉시 자동 로드라 짧다)
}
/** 도시에 카드 「생성 중」 스트립 항목 — 오케스트레이터가 3원천을 접는다(표시 전용) */
export interface DossierQueueItem {
  id: string;                              // 잡/큐 항목 id(키)
  kind: "modules" | "exam" | "questions";
  label: string;                           // "어휘·빈칸 복원 생성 중" | "실전 워크북" | "빈칸 추론 외 2유형"
  status: "running" | "error";
  detail?: string;                         // streamPreview.stage 등 라이브 라벨
}
```

**레일 v3 계약 (class-tree.tsx 전면 재작성 — B1 소유)**
- ClassTreeProps v3 = v2.1 계약(§3.1.1v2.1 — classes·selectedClassId·onSelect·onCreate·
  onRename·onArchive·onAddStudents·expanded·onToggleExpand·studentsByClass·
  onInviteStudent·onRetryStudents) **+ 신규 3종**:
  `checkedByClass: Record<string, ReadonlySet<string>>` ·
  `onToggleStudent: (classId: string, studentId: string) => void` ·
  `onToggleClassAll: (classId: string) => void`.
- 클래스 행 체크박스(트라이스테이트)는 `role="checkbox" aria-checked="true|false|mixed"`,
  학생 행 체크박스는 `role="checkbox" aria-checked` — native input 대신 버튼+아이콘
  (기존 batch-generate-pane 체크 관용구 계승). 체크 클릭은 행 선택과 독립(stopPropagation).
- 배지: 전원 체크 `N명`, 일부 `k/N명`(text-blue-700 강조), 0명 `0/N명`(rose 톤).
  미로드 클래스는 cls.studentCount 로 `N명`.
- memo(ClassTree) 유지 — 모든 신규 콜백 useCallback, checkedByClass 는 상태 객체
  그대로(토글 시에만 참조 변경).

**오케스트레이터 계약 (studio-home-client.tsx — B6 감독 소유. 함대는 이 동작을 전제만)**
- selectClass(id) 확장: loadChildren + **loadStudents(id) + setExpanded(자동 펼침)**.
- checkedByClass 초기화: studentsByClass[id] 가 배열로 처음 전이할 때 엔트리 없으면
  전원 체크. force 재조회로 새 학생 유입 시 **새 학생은 체크 합류·기존 해제 보존**.
- deployTarget 파생(useMemo): selectedClass + studentsByClass + checkedByClass →
  StudioDeployTarget | null. 참조 안정.
- 큐 스트립 조립(useMemo, 도시에 표시 지문 한정):
  ①모듈 생성 = `queueApi.queue.find(q => q.id === passageId)` status pending|analyzing,
  라벨 = stamps.get(passageId)?.modules 라벨 합 + streamPreview?.stage
  ②실전 = `queueApi.worksheetJobs.filter(j => j.passageId === passageId)` running|error
  ③문항 = `sessionQueue.filter(q => q.passageId === passageId && q.status === "generating"
  && questionGenBridge?.isStamped(q))` (스탬프 필터 필수 — 무필터 = 학원 소음 89건 실측).
- 완료 → **조용한 재조회**: fetchDossier(passageId, {silent:true}) — ready 유지·성공 시
  교체(무깜빡임)·silent 는 진행 중 조회가 있으면 보류(토큰 경쟁 차단, 검수 L1-5).
  신호는 ⓑ **활성 시그니처 전이 단독**이 정본(2026-08-12 검수 개정 — 구 ⓐ
  onJobsChanged 연결은 생략: 모든 로컬 변이가 queue state 변경을 동반해 ⓑ가
  포착함을 발화 지점 전수로 확인, use-passage-queue.ts:909-1046). 표시 중 지문의
  활성 시그니처(pending|analyzing|generating, 토큰에 pid 인코딩)가 소멸 전이할 때
  — 단 **현재 발행 집합에 살아 있는 지문만** 재조회(표시 이탈 소멸은 완료가
  아니다 — 청산 캐시 재유입 금지, 검수 L4-2).
  ⚠ usePassageQueue 폴링은 onJobsChanged 를 발화하지 않는다 — ⓑ가 정본 회수선.
- 폐기 정리(누수 0): workspaceBridge 상태·핸들러·import 제거(LibraryPane
  onWorkspaceBridge 는 옵셔널이라 미전달), rosterVersion 제거, openClassHome·useRouter
  제거, composeTarget/composePreset/AssignmentComposer 배선 제거, deployTarget(구 모달)
  ·DeployDialog 배선 제거. **questionGenBridge 는 존치**(스트립 isStamped 소비).
  우측 게이트 조건은 파생 boolean 1개로 단일화(:888·:1019 중복 기술 해소).
- queueApi·WorkbookGenerateModal·StudentAddModal·InviteKitSheet·DossierQuestionModal·
  CreateClassModal·CoachMark 존치.

**도시에 개편 계약 (passage-dossier-pane.tsx — B4 소유 / dossier-deploy-inline.tsx — B3 소유)**
- PassageDossierAccordionProps 확장(구 onDeployWorksheet·onComposeQuestions **삭제**):
  `deployTarget: StudioDeployTarget | null` ·
  `queueItemsByPassage: ReadonlyMap<string, readonly DossierQueueItem[]>` ·
  `onDeployed: (passageId: string) => void`(성공 업링크 — 오케스트레이터가 조용한
  재조회 + refreshAfterLibraryChange).
- 카드 본문 삽입 지점: 스탯 그리드와 CTA 행 사이에 **생성 중 스트립**(항목 있을 때만),
  CTA 행 아래에 **인라인 배포 폼**(grid-rows 0fr↔1fr 3중 래퍼 관용구 그대로,
  본문 상시 마운트). CTA 행은 [학습지 보내기][문제 보내기] 토글 트리거로 전환
  (aria-expanded, 재클릭 접기, 카드당 하나만 펼침 — 로컬 상태
  `openForm: Record<passageId, "worksheet"|"questions"|null>` 은 pane 로컬).
- CTA 활성 판정 승계: deployDisabled = readyModules 0 && !hasExam /
  composeDisabled = questions.total === 0. aria-disabled + onClick 초입 return +
  title 사유 관용구(native disabled 금지 — §3.9v2 정본).
- DossierDeployInline(신규 파일) props:
  `{ mode: "worksheet" | "questions"; dossier: PassageDossier; target:
  StudioDeployTarget | null; onDeployed: (passageId: string) => void }`.
  - 공통: 대상 요약 행 `→ {className} · {count}명`(partial 이면 `k/N명` 표기) +
    캡션 "대상은 왼쪽 레일에서 바꿉니다". target null → 배포 비활성 + "①에서
    클래스를 먼저 선택하세요" / count 0 → "대상 학생을 선택하세요" / loading →
    스피너. 마감 프리셋 4칩(기본 tomorrow·23:59 서울 — dates 헬퍼 재사용).
  - worksheet: 모듈 칩 다중선택(기본 ready 전체+exam, 최소 1) + 강도 세그먼트
    (기본 표준) + 라이브 미리보기 1줄(`총 N문항 · 약 M분`, viable false 면 사유) +
    [바로 배포]. 제출 = addPassagesToStudioClass 멱등 선등록 → deployStudioModules
    (title 생략 — 서버 자동). canDeploy = 대상≥1 && 모듈≥1 && viable && dueIso.
  - questions: 요약(전체 N문항·유형 분포 칩·total>50 이면 "최신 50문항을 보냅니다"
    각주) + [바로 배포]. 제출 = addPassagesToStudioClass 선등록 → deployStudioQuestions
    ({questionIds: rows(≤50) 전량, title: `[지문제목] 문제 N문항`}).
  - 성공: 토스트 정본 → 폼 접힘 → onDeployed(passageId). 실패: toast.error(res.error).
- PassageDossier 는 그대로(진행 중 잡 정보 없음 — 스트립은 전적으로 클라 큐).
  ⚠ 타입 실명은 `PassageDossier`(StudioPassageDossier 라는 타입은 없다).

**지문함 스코프 계약 (library-pane.tsx — B5 소유)**
- LibraryClassCtx additive: `registeredLoading?: boolean`(3상태 — 기본 스코프 첫
  프레임 "0개 깜빡임" 방지). 오케스트레이터가 childrenByClass 로 파생.
- scopeOnly 반전: 초기값·클래스 전환 리셋 모두 **true**(classCtx 존재 시).
  칩 → 세그먼트 `[이 클래스 (N) | 전체 자료 (M)]`(N=classScopeCount, M=passages.length
  — 새 데이터 불필요). 그리드 모바일 resetKey 에 스코프 토큰 추가.
- 스트립 확장: 선택 중 등록 지문이 있으면 `클래스에서 빼기 (K)` 보조 버튼(담기와
  병렬) — onUnregisterFromClass 업링크(신규 옵셔널 prop, 오케스트레이터 구현 =
  removePassagesFromStudioClass + loadChildren(force) + refreshClasses). 확인은
  window.confirm 1회(클래스 홈 관용구 승계 — 링크만 해제·자료 보존 문구).
- PassageCardGrid additive(공유 파일 — 기본값 미전달 시 바이트 동일):
  `classBadgePassageIds?: ReadonlySet<string>` — listRows 행 제목 옆 소형 「담김」
  배지(bg-blue-50 text-blue-600). 다른 6개 호스트 무회귀.
- 자동 담기 3경로·registerNewToClass 관문 불변. 등록 상한 50 은 담기 실행부에서
  50개 초과 시 청크 순차 호출로 해소(B5).

**단계 안내 계약 (step-strip.tsx·step-guide-pane.tsx — B2 소유)**
- StepStrip props: `{ step1Done: boolean; step1Label: string | null; step2Done: boolean;
  step3Active: boolean }` — 프레젠테이션 전용. 상단바 :887 직후 삽입(`hidden md:flex`,
  좌측 클러스터 뒤 ml-3 — ml-auto 클러스터 정렬 불변).
- StepGuidePane props: `{ classes: StudioClassRow[]; onSelectClass: (id: string) => void;
  onCreateClass: () => void }` — 클래스 미선택 시 중앙 전체를 차지. 스텝 카드 3장
  (①활성: 클래스 퀵 선택 그리드 + 「+ 새 클래스」 / ②③ 잠김 프리뷰). 클래스 0개면
  ①은 생성 CTA 단독. 코치마크 create-class 앵커와 충돌 금지(기존 앵커는 레일 하단 유지).

**함정 원장 (§3.8.11·§3.9 승계 + 신규)**
1. memo 방어선 — 신규 props 전부 참조 안정(인라인 리터럴 금지). sessionQueue 는
   시그니처 안정화본만 구독(raw 구독 = 5초 전역 리렌더).
2. previewStudioDeployment 구독은 디바운스+문자열 키 필수.
3. 멱등 선등록 누락 = 배포 전량 실패("이 클래스에 등록된 지문이 아닙니다").
4. fetchDossier 기본형은 loading 덮어쓰기 — 자동 재조회는 silent 변형만.
5. 문항 스트립은 isStamped 필터 필수.
6. exam(worksheetJobs) running 은 메모리 전용(새로고침 소실) — v1 수용, 스트립은
   있는 동안만 표시.
7. 도시에 자체 폴링 금지 계약 유지 — 스트립 데이터는 props, 재조회는 오케스트레이터.
8. 클래스 전환 시 이전 클래스 체크는 보존하되 배포 대상은 작업 클래스만.
9. listStudioClassStudents 는 위치 인자. 로스터 300 vs 배포 200 캡 비대칭 —
   스튜디오 클래스 capacity 200 이라 실질 무해(스펙 기록만).
10. 부분 비편성 학생은 서버가 조용히 드롭(taskCount 로만 표시) — v1 수용.
11. QUESTIONS 과제는 studio 스탬프 자리가 없다 — 클래스 결과함(listStudioClassAssignments)
    에 문항 과제 미표시는 기존 동작(v1 수용, 도시에 휴리스틱이 표시).
12. 중앙 행 생성 이력 클러스터는 완료 후에도 스테일(기존 동작) — 도시에가 정본 표면.

#### 3.10.10 게이트

- tsc 0 · eslint 접촉 파일 0 · 기존 계약 테스트 그린.
- 행동 게이트(.tmp-studio-qa/behavior-overhaul2.mjs 신설): 가이드 패널(미선택) →
  클래스 선택 → 스텝 스트립 상태 전이 → 학생 체크 해제(부분집합 배지 k/N) →
  지문 선택 → 도시에 인라인 학습지 배포(실배포 → DB 대상 학생 검증 → 청소) →
  문항 인라인 배포 동형 → 전체/이 클래스 토글·빼기 → 큐 스트립 표시.
- 3뷰포트 캡처 + 감독 감상. 기존 레일 게이트(behavior-class-rail.mjs)는 v3 규격으로 개정.

#### 3.10.11 워크스페이스-도시에 실시간화 (E9·E10·E11 — 2026-08-12 2차 지시)

**a) 도시에 공급 합집합 (owner: library-pane.tsx)**

- 발행 집합 = **워크스페이스 행 ⊕ 지문함 선택**:
  `items = [...rows.map(r => ({id: r.passageId, title: r.title})), ...선택(행에 없는 id 만, 선택 순서)]`.
  행은 이미 실지문(담기 관문이 draft 를 승격)이라 draft 제외는 선택분에만 적용.
- 기존 시그니처(id:제목 쌍 순서 목록) 재발행 계약·수신부(handleDossierPassages)는 **무수술**:
  담기 = 선택 청산 + 행 추가로 **집합 불변** → hasNew=false → 펼침·캐시가 자동 보존된다
  (E9 의 구현이 이 순서 배치 하나로 성립 — 행이 앞, 선택이 뒤: 신규 선택·신규 행 모두
  "마지막 항목"이 되어 기존 자동 펼침 규칙이 그대로 맞는다).
- 행 편집(setContent 매 타)마다 발행 effect 가 재실행되지만 시그니처 동일 → 발행 0(수용).
  rebindToVariant(행 passageId 교체)는 집합 변화 → 신규 id 자동 펼침(기존 규칙 승계).
- 언마운트 null 발행 2차 방어선·상세 열람 무발행 계약 존치.

**b) 스트림 스토어 (신규 src/lib/studio/stream-tail-store.ts + workbench/queue-stream-line.tsx — 감독 견본)**

- `createStreamTailStore()` — 키별 구독 외부 스토어. `StreamSnapshot = {tail, phase:
  "thinking"|"generating", stage?, startedAt}`. `set` 은 내용(tail·phase·stage) 변화
  시에만 해당 키 구독자 notify(슬라이딩 420자 tail 전문 비교가 tick 카운터와 등가라
  tick 필드는 계약에서 제외 — 26-08-12 검수 반영). `prune(alive)` 로 종료 스트림
  정리(전량 notify). 구독 해지는 세대 가드 멱등(해지→재구독 후 옛 해지 재호출이
  새 세대 구독자를 지우는 오삭 방지).
- `QueueStreamLine` — useSyncExternalStore **키 구독** 컴포넌트: 고정 높이 1줄 라이브 꼬리
  (최신 끝이 보이게 우측 정렬·좌측 페이드, CLS 0) + 경과시간(mm:ss, 1s interval) +
  phase 라벨(생각 중/생성 중). **델타 리렌더 반경 = 이 컴포넌트 1개** — 시그니처 메모
  (queueItemsSig)는 tail 미포함을 유지해 memo(PassageDossierAccordion) 방어선 무침범.
- 오케스트레이터가 스토어를 ref 소유. effect([queueApi.queue, rawSessionQueue])가 활성
  항목 스냅샷을 적재+prune — **반드시 rawSessionQueue**(스트림 보존 원본), 안정화본
  (sessionQueue)은 streamPreview 갱신이 참조에 반영되지 않아 금지(§3.10.9 함정 계열).
  오케스트레이터는 델타마다 이미 리렌더되므로(기존 실측) 신규 부담은 문자열 비교뿐.

**c) 큐 스트립 v2 (owner: deploy-target.ts 확장 + studio-home-client 조립 + passage-dossier-pane 표시)**

- `DossierQueueItem` additive 확장: `streamKey?: string`(스토어 키) ·
  `badges?: {type?: string; count?: number; difficulty?: string; plan?: "STANDARD"|"PREMIUM"}` ·
  `startedAt?: number`(경과 표시용).
- 조립(오케스트레이터): 문항 항목 — streamKey=`qg:${pid}:${s.id}`, badges = 유형 라벨
  (2+ 유형이면 "첫 유형 외 N유형")·총 문항 count·s.config.difficulty·s.config.generationPlan.
  모듈 항목 — streamKey=`wa:${pid}`, **running 은 detail 미적재**(stage 는 스트림 라인
  전담 — detail=stage 존치는 「시그니처는 생멸-정적 값만」 계약과 자기모순이라 26-08-12
  검수로 폐기, error 의 detail=오류 메시지는 존치). startedAt 은 로컬 SSE 보유분
  (streamPreview.startedAt)만 — 폴링 복원 잡의 createdAt 은 지문 생성 시각이라 금지.
  라벨의 stamp.modules 는 섹션 분석 모듈로 한정(exam 합류분 제외 — 실전은 별도 항목).
  실전 워크북 — 스트림 없음(스피너+경과 ElapsedClock). 시그니처에 badges·streamKey
  직렬화 포함(항목 생멸 시에만 변동).
- 표시(도시에 판) 스트립 행 2단, 납작·컴팩트 — **v2 생동감 개정(26-08-12 사용자
  지적 "밋밋해서 생성되는지 모르겠다")**: running 행은 블루 톤(border-blue-100 ·
  bg-blue-50) + 흰 시광 스윕(`.studio-strip-sheen` — globals.css, 2.4s 무한) +
  라이브 꼬리 말미 타이핑 캐럿(기존 `caret-blink` 자산 `▍`):
  1행 `[spinner] [라벨 bold blue-800] [난이도 배지 — 킬러=rose] [프리미엄 violet 배지
  (일반은 미표시)] [N문항] ......... [경과 mm:ss]` / 2행(streamKey 有) =
  QueueStreamLine 라이브 꼬리(from-blue-50 페이드 — 컨테이너 톤과 동기 의무).
  실패 rose 1행 기존 유지. 배지 관용구: 프리미엄 = violet-50/violet-700
  (workspace-passage-row.tsx:1770-1779 정본), 킬러 = rose 계열.
- **배지 실효값 도출(v2)**: 난이도·플랜은 config 전역이 아니라 **유형별 설정**
  (`questionTypeSettings[typeId]` — 모달 「이 유형만」)이 우선 —
  `readQuestionTypeDifficultySetting`/`readQuestionTypeGenerationPlanSetting`
  정본 리더로 발사 경로와 동일 해석(전역만 읽으면 킬러 발사가 중급 배지로 오표시,
  26-08-12 사용자 실측). 유형 간 값이 갈리면 해당 배지 생략.
- **접힌 카드에서도 보이게**: 카드 헤더에 queueItems>0 이면 Loader2 스핀 미니 표시
  (에러만 있으면 rose dot). 아코디언 접힘이 생성 중임을 숨기지 않는다.

**d) 생성 시작 = 자동 펼침 (owner: studio-home-client)**

- **펼침 트리거는 이 표면 발사분에 한정**(26-08-12 검수 개정): 큐 원천이 학원 전역
  폴링이라 「토큰 신규 등장 ≠ 이 표면의 발사」다 — 펼침용 launchSig 는 wa=stamps 보유·
  qg=isStamped(브리지 부재=제외, 스트립 §3.10.9 함정 5 와 동일 자구)·ex=로컬 전용
  토큰만으로 별도 조립하고, 그 전이의 신규 토큰 pid 가 **표시(절단 후) 집합**에 있으면
  setExpandedDossierId(+미조회면 fetchDossier). 발사 순간 1회 전이라 이후 수동 접기를
  재펼침으로 뒤엎지 않는다.
- 소멸 전이(완료→silent 재조회)는 기존 activitySig(무필터) 유지하되, 토큰 순회 기준은
  표시 절단본이 아니라 **발행 전체 집합**(dossierPassages — 생존 가드와 동일 기준,
  절단분 완료도 회수) — 완료물이 문제 스트립·모듈 칩에 "이름 유지한 채" 착지(E8·E10).

**e) 문항 스트립 행 재설계 (owner: actions/studio/dossier.ts + dossier-types + passage-dossier-pane)**

- 서버: `DossierQuestionRow` additive `premium: boolean`. 도출(26-08-12 검수 개정) =
  **문항 tags 의 플랜 태그 우선**(상세 모달 QuestionCard 배지와 동일 정본 —
  `structuredData._generationPlan`/tags 는 fast·md-stream·AI 수정 경로 전부가 기록),
  플랜 태그 없는 구세대 행만 workbenchAiJob(PREMIUM, take 100) `result.questionIds`
  역교집합 **폴백**. 조회 실패 = 전부 false(방어 — 도시에 본체는 살린다). `stem`
  필드는 존치(타 소비처·툴팁 무회귀).
- ⚠ 인지된 트레이드오프(26-08-12 실측): 서버 단일 상품 모드
  (`QUESTION_GENERATION_SINGLE_TIER` 기본 on — `resolveEffectiveGenerationPlan`)가
  켜져 있으면 프리미엄 **요청**도 STANDARD 로 생성된다 — 큐 스트립 배지는 사용자
  선택(요청 플랜)을, 완료 행 배지는 DB 진실(tags)을 각각 말하므로 이 모드에선 둘이
  갈릴 수 있다. env 는 클라이언트에서 읽을 수 없어 배지 통일은 불가(제품 결정 대상).
- 표시: 행 1줄 — `[유형 라벨 font-semibold] [난이도 배지(킬러 rose)] [프리미엄 violet]
  [검수완료 emerald dot] ..... [생성일시 fmtDateTime tabular] [Chevron]`. 문두(stem)는
  title 툴팁으로만. byType 미니 바 차트·검수완료 카운터 존치.
- **신규 생성분 글로우(v2 — 26-08-12 사용자 지시 "최근 생성한 것 파악")**: 방금/최근
  생성 행은 `.studio-fresh-glow`(globals.css — 은은한 파란 링 무한 펄스) +
  bg-blue-50/50. 판정 = 세션 diff(오케스트레이터 fetchDossier settle 의 ready→ready
  행 id diff 누적, freshQuestionIds prop) **∪** 최근 30분(createdAt — 새로고침 직후
  diff 증발 폴백). **판정은 전부 settle(비-렌더)에서** — 렌더 중 Date.now() 는
  React Compiler 순수성 위반(실측 경고). 행 간격은 글로우 링 여유로 space-y-1.
- **v3(26-08-12 3차 지시)**: ①유형 미니 바 라벨은 그리드 공유 컬럼(auto)으로 무절단
  (구 w-[72px] truncate 폐기, 160px 캡은 병적 라벨 방어선 — % 캡은 auto 트랙 순환
  무효) ②유형 분포는 접이식(기본 접힘, 0fr↔1fr — 세로 공간) ③**생성된 문제 필터**:
  유형(byType 라벨)·난이도·검수 3셀렉트 + 차트 라벨 클릭=유형 필터 토글 + 필터 각주
  ("N개 중 M개 표시")·빈 결과 초기화 버튼. 판정은 행 렌더와 같은
  questionRowTypeLabel/필드(클라 필터, 서버 왕복 없음) — 카드 본문 상시 마운트라
  지문별 세션 유지. ④워크스페이스 행 CTA 2버튼은 **가로 양옆·동색**(둘 다 primary
  파랑 — 흰 바탕 보조 버튼 가독성 문제로 폐기, workspace-passage-row 의
  onOpenWorkbook 게이트 블록이라 문제 생성 페이지 무회귀).

**f) 게이트 (behavior-workspace-stream.mjs 신설)**

- ①클래스 선택→지문 선택→도시에 등장 ②「워크스페이스에 담기」→**도시에 유지**(카드·펼침
  보존 실측) ③실전 문제 생성(어법 1문항 STANDARD 실발사)→큐 스트립 등장(배지: 유형·문항
  수)→**스트림 꼬리 텍스트 폴링 2회 내용 변화 실측**→완료→스트립 소멸+문항 행 신규
  등장(새 디자인: 유형·난이도·생성일시 존재, stem 부재) ④학습 워크북(1모듈 실발사)→스트립
  +스트림 표시(완료 대기 상한 4분 — 초과 시 표시 실증까지만 필수, 모듈 칩 점등은 로그).
- tsc 0 · eslint 접촉 파일 0 · 기존 게이트(behavior-class-rail·behavior-overhaul2) 무회귀.

#### 3.10.12 레일 위저드 접힘 (26-08-13 지시 — "클래스 선택하고 넘어가면 레일은 없애는거지")

- **클래스 선택(①완료) = 레일 자동 접힘**: 다음 단계(자료·배포)에서 레일은 불필요 —
  스텝 스트립 ① 칩("대상 ✓ 2학년 · 2명")이 대상 요약의 유일 상시 표면이 된다.
  해제(가이드 복귀) = 자동 펼침. 중앙·우측이 레일 폭만큼 넓어진다.
- **재진입 2경로**(대상 수정 — 학생 체크·클래스 변경·학생 추가): ①스텝 스트립 ① 칩
  클릭 = 레일 토글(버튼 승격, title "클래스·학생 패널 열기/접기") ②접힘 핸들
  (PanelHandle 세로 「클래스」 라벨) 클릭. **수동 재펼침은 선택 유지 중 되접지
  않는다** — 자동 개입은 선택 "전이"에서만(다른 클래스 선택 시엔 다시 접힘).
- 구현(1차 게이트 G11 실측으로 개정): 접힘은 **명시적 선택**(selectClass — 레일
  이름 클릭·가이드 퀵선택·생성 모달)에서만 발화. 레일 내부 조작(rename 진입
  dblclick·비선택 클래스 체크)은 **quiet 선택**(ClassTree.onSelectQuiet additive —
  미전달 시 onSelect 폴백)으로 분리해 접힘 미발화 — 통합 전이 effect 로 접으면
  rename 의 해제→재선택 아티팩트가 입력째 레일을 소멸시킨다(G11 실측 결함).
  해제·첫 마운트 정렬(미선택인데 접힘 = 가이드 동선 고아 → 자동 펼침)만 effect.
  접힘 실행은 toggleCollapsed 경유(훅에 collapse 원자 API 없음 — 직전 드래그
  suppressClick 가드에 1회 삼켜질 수 있으나 "열린 채 남는" 무해 방향).
- lg 미만은 기존 드로어 동선 그대로(자동 접힘은 lg+ aside 에만 의미).
- 게이트 개정: 레일 조작 게이트는 선택 전이 후 접힘 핸들/① 칩으로 재진입해 잇는다
  (behavior-class-rail G2·G10, behavior-overhaul2 G2 에 신계약 검증 내장).

#### 3.10.13 문항 체크 → 하단 실행 바 「모바일 배포·시험지 조판」 (26-08-14 지시)

- **문항 행 체크박스**: 도시에 문항 행(E11)에 선행 체크박스. 행 전체가 상세 모달
  버튼이라 **중첩 인터랙티브 금지** — 행을 div 로 감싸고 체크 버튼(role=checkbox)·
  상세 버튼을 형제로 나란히 둔다. 체크 행 = bg-blue-50/70 + inset ring(신규 글로우
  와 겹치면 체크가 우선). 목록 상단 「전체 선택」(필터 표시분만 대상 — mixed 는
  Minus 아이콘) + 우측 "N개 선택" 카운트.
- **선택 상태 = 오케스트레이터(studio-home-client) 소유**(적대 검수로 개정 —
  rightPanelBody 는 aside(xl+)·슬라이드오버(xl 미만) 두 트리 위치에 렌더돼 별개
  인스턴스가 되므로, 패널 로컬이면 드로어 닫기/패널 접기 한 번에 선택 전량
  소실): Map<questionId, meta(지문 id·제목·유형 라벨·난이도·프리미엄)> 스냅샷.
  **Map 삽입 순서 = 체크 순서 = 시험지 시드 순서.** 프룬 2계(오케스트레이터,
  렌더 중 조건부 setState 패턴): ①표시 집합(visibleDossierPassages, 최근 5
  절단) 이탈 지문의 체크 제거 ②states 교체 시 ready 스냅샷 rows 부재 문항
  제거 — 단 **rows 는 최신순 50 절단본이라 total > rows.length 지문에서는
  판정 보류**(창 이탈 ≠ 삭제 — 생성 완료 silent 재조회가 멀쩡한 체크를 걷어가던
  검수 major). loading/error·미조회도 보류. 아코디언 props 는 picked·
  onTogglePick·onPickRows·onClearPicked·onPickBarDeployed additive(전부 참조
  안정 — memo 방어선 무해).
- **하단 실행 바(dossier-pick-bar.tsx)**: 패널 flex-col 의 스크롤 영역 밖 형제라
  항상 하단 고정. 선택 ≥1 에서만 grid-rows 0fr↔1fr 로 등장 — 접힘 래퍼(바
  전체·내부 폼)에 **React 19 불리언 inert 필수**: 0fr 는 시각 클립일 뿐이라
  무방비면 내부 버튼·칩 ~10개가 보이지 않는 탭 스톱으로 남는다(검수 major).
  구성 = 요약 행(「문항 N개 선택됨 · 지문 M개」 + 선택 해제) → 유형 요약 칩
  (6종 초과 "+N종") → **동등 폭·동등 위계 2버튼**(grid-cols-2, 파란 채움 —
  사용자 지시 "동등하게 나란히"): [모바일 배포][시험지 조판] → 상한 초과 rose
  안내(아래) → 다음 단계 1줄 안내.
- **모바일 배포** = deployStudioQuestions(체크 id 전량). passageId 는 서버
  미사용 계약이라 지문 여러 개를 **한 과제로** 묶는다(대표 1개만 싣는다).
  **50문항 상한 사전 게이트 필수**(MOBILE_DEPLOY_MAX=50 — createStudyAssignment
  QUESTIONS 서버 정본 미러): 다지문 집계(지문당 50행 × 표시 5지문 = 최대 250)
  가 처음 연 실패 경로로, 무게이트면 51+ 제출이 항상 서버 거부되고 멱등 선등록
  부작용만 남는다(검수 major). 초과 시 canDeploy false + title 사유 + 바에
  rose 안내(시험지 조판은 상한 무관). 제출 전 addPassagesToStudioClass 멱등
  선등록(관련 지문 전부). 인라인 폼 = 대상 요약(좌측 레일 읽기 전용·E4) + 마감
  프리셋(서울 달력·23:59) + 「선택 N문항 바로 배포」. title 정본: 단일 지문
  `[제목] 선택 문제 N문항`(제목은 표시 스냅샷 passageTitleById 우선 — 체크
  시점 스냅샷은 제목 수정 시 stale), 복수 `선택 문제 N문항 (지문 M개)`.
  성공 = 토스트 정본 → onPickBarDeployed: 선택 비움 + 지문별 silent 재조회 +
  refreshAfterLibraryChange **1회**(지문별 onDeployed 반복이면 최대 5×2 중복
  왕복 — 검수 minor).
- **시험지 조판** = seedExamAndNavigate(워크벤치 정본 통로 재사용): 체크 id 를
  sessionStorage 시드로 싣고 /director/workbench/exams/create 이동 — 빌더가
  1회 소비해 미리보기(시험지)에 체크 순서대로 조판. 이동 전 토스트(토스터는
  루트 공유라 이동 후에도 남는다) + 버튼 스피너.
- React Compiler 주의: 바의 submitDeploy/composeExam 은 **일반 함수**(수동
  useCallback 은 파생값 dueIso 탓에 preserve-manual-memoization 에러 실측).
- 알려진 한계(검수 판정 수용): total > 50 지문에서 삭제된 문항의 체크는 프룬
  보류로 잔존할 수 있다(배포 시 서버 검증이 최종 방어) · 시드 실패(setItem
  예외)는 기존 정본 통로의 침묵-저하 계약을 따른다(빈 빌더로 열림).
- 게이트: `.tmp-studio-qa/probe-pickbar.mjs` P1~P8 (체크→바 등장→동등 폭·오버플로
  0→전체 선택→실배포+DB(kind QUESTIONS·대상·문항 전량)→배포 후 바 0fr 퇴장
  실측(Playwright visible 은 0fr 클립을 통과 — G7 함정)→빌더 이동+시드 소비).

#### 3.10.14 지문관리 재설계 (E13 — 26-08-14 3차 지시)

핵심 전환: 중앙 열의 소스 "탭 4개 대등 나열"을 폐기하고 **지문관리가 홈, 들여오기
3종은 「지문 추가」에서 갈라지는 일시적 태스크**라는 위계로 재배치한다.

- **기본 진입 = 지문관리**: `LibraryPane` 초기 상태를 `intakeView:"library"` 로
  (구 `intake`+`exam`). 클래스 선택 즉시 그 클래스의 지문 목록이 보인다 — 이게
  "클래스 관리"라는 멘탈모델의 홈이다. `intakeView/intakeTab` 상태기계 자체는
  유지(공유 IntakeSurface 의 슬롯 계약 — upload 상시 마운트·paste hidden 마운트가
  진행 중 추출/작성을 보존한다. intake-surface.tsx:331-361 불변식 준수).
- **이름 변경**: 「내 지문함」→「지문관리」. 실렌더 라벨 3곳 —
  source-switcher(스위처 필), library-pane `breadcrumbRootLabel`,
  기출 브라우저 `pickLabel`/`headerHint` 문구 계열. 토스트 문구(library-pane-intake)도
  동반 개정("지문관리에 담았습니다" 계열). generate·webtoon 등 타 화면의 「내
  지문함」은 **불변**(스튜디오 한정 개칭).
- **헤더 재구성(source-switcher.tsx 전면 개작 — 스튜디오 전용 파일)**:
  - 좌측: 「지문관리」 타이틀 필(FolderOpen, 건수 병기) — 지문관리 뷰에서 활성.
  - 우측: **파란 채움 primary 「+ 지문 추가」 버튼** + (조건부) 워크스페이스 필
    (기존 sticky 계약 유지 — 재진입 유일 경로).
  - 「지문 추가」 클릭 = 팝오버 메뉴 3항목(아이콘+제목+한 줄 설명):
    ①「기출 지문에서 가져오기」(GraduationCap — 25개년 기출 DB에서 골라 담기)
    ②「직접 입력」(ClipboardPaste — 붙여넣기·직접 작성)
    ③「파일 업로드」(ImageUp — PDF·이미지에서 AI 추출).
    항목 선택 = `setIntakeView("intake") + setIntakeTab(k)`.
- **들여오기 = 집중 모드(takeover)**: intake 뷰에서는 헤더가
  「← 지문관리」 뒤로가기 + 현재 방법 타이틀 + 방법 전환 세그(3필 축소형)로
  바뀐다. 본문은 기존 IntakeSurface 슬롯 그대로. 성공 경로는 기존
  `showLibrary()` 훅 호출들이 이미 지문관리로 자동 복귀시킨다(무개조).
- **빈 상태 개정**: 지문관리가 비었을 때 "아직 이 클래스에 담긴 지문이
  없습니다" + 3방법 인라인 버튼(팝오버와 같은 목적지) — "전체 자료에서 담거나,
  위 탭에서 새로 만드세요" 문구 폐기(탭이 사라지므로 자구 자체가 깨진다).
- **개칭 잔존 함정(실측)**: 스튜디오 표면의 「내 지문함」은 스튜디오 파일
  3곳만이 아니었다 — IntakeSurface 에 **상시 hidden 마운트**된 공유 컴포넌트의
  하드코딩 문자열이 집중 모드에서 실노출된다. additive 라벨 prop 4종으로 수술:
  ①exam-passage-preview-modal `pickLabel`(index.tsx 패스스루)
  ②generate-upload-panel `pickLabel` ③multi-passage-paste `startLabel`
  ④intake-surface `pasteStartLabel`(→③). 전부 기본값 = 기존 문자(타 호스트
  무회귀). 검증 = 게이트 G1 의 페이지 전역 "내 지문함" 0건 판정.
- memo·참조 안정 계약 유지: 스위처 onSelect/onOpenWorkspace 는 useCallback,
  팝오버 상태는 스위처 내부 시각 상태(active 는 여전히 전부 controlled).

#### 3.10.15 지문관리 검수·필터·툴바 정화 (E14 — 26-08-14 3차 지시)

대상 실체(정찰 확정): 중앙 지문 목록 = 공유 `PassageCardGrid`(generate 페이지 소유,
호스트 7곳 — 스튜디오·generate·지문등록·similar·custom·webtoon·튜터). **스튜디오만
정리하고 타 호스트 픽셀 불변** — ①스튜디오 측 prop 미전달 ②additive optional
prop 신설(기본값 = 현행) 두 수단만 사용한다.

- **벌크 「검수완료」 폐기** = library-pane 에서 `onBulkCompleteExtractionReview`/
  `reviewBulkActionRunning` 미전달(grid :1236 게이트가 통째 미렌더 — 무개조).
  `data-generate-tour="library-review-complete"` **속성 정의는 삭제 금지**(generate
  투어 스텝이 영구 대기 상태로 깨진다 — 정찰 확정).
- **이동/복사·삭제·폴더에서 삭제 폐기** = `onCopySelectedToCollection`/
  `onMoveSelectedToCollection`/`onDeleteSelectedPassages` 미전달
  (`canManageSelectedPassages` AND 게이트가 액션 블록 :1217-1358 통째 미렌더).
  근거: 스튜디오의 조직 축은 「클래스에 담기/빼기」 스트립이지 폴더 벌크가 아니고,
  파괴적 삭제는 지문등록·문제생성 화면에 그대로 남는다. **전체선택 체크박스는
  유지**(:1199-1214, 블록 밖) — 담기/빼기·워크스페이스 CTA 의 재료다.
- **행별 검수 토글 폐기** = grid 신설 prop `hideReviewToggle?`(listRows :1726 ·
  mobile :1826 · desktop card :2055 3경로 + 미검수 붉은 테두리 :1546-1547 동반
  게이트 — 해제 수단 없는 경고색만 남기지 않는다). ⚠ `onToggleExtractionReview`
  미전달은 해법이 아님(disabled 회색 버튼이 잔존 — 정찰 함정).
- **「분석 완료」 배지 폐기** = 사용자 DOM 실체는 우측 도시에 헤더 배지
  (passage-dossier-pane analysisBadge — 스튜디오 전용, 회귀 0). 미분석 상태
  안내(amber 계열)도 함께 재검토하되 분석 유도 CTA 는 유지.
- **필터 팝오버 폐기 + 필터/검색 2쌍 중복 해소** = 학교(학원 학교 마스터 전건이라
  스튜디오 문맥 불일치)·분석상태 필터는 팝오버째 제거. grid 신설 prop
  `hideToolbarFilterSearch?` 로 툴바 쌍(:1360-1394 + 인라인 검색 :1397-1420)을
  통째 게이트 — **살아남는 유일 쌍 = 폴더 헤더의 정렬+검색 팝오버**(쌍 A,
  `PassageSortSearchPopover` — 기존 전달 유지). 정렬 아이콘이 ListFilter 라
  필터로 오인되는 문제는 쌍이 하나가 되면 소멸. `passage-filter-popover.tsx`
  파일 자체는 타 호스트가 쓰므로 삭제 금지.
- **담기 게이트 문구 정정**: "검수 완료된 지문만 클래스에 담을 수 있습니다"
  (library-pane :406) 는 실조건(추출 draft 승격 여부)과 어긋남 — 담기 경로에
  `resolveSelectionToPassageIds`(생성 경로 정본, markReviewed:false 자동 승격)를
  적용해 draft 도 담기 가능하게 하고 문구 자체를 소거한다. 불가하면 문구만
  "AI 추출 지문은 워크스페이스에서 확정 후 담을 수 있습니다"로 정정.
- 무회귀 검증: generate 페이지에서 벌크 검수완료 버튼·행 토글·필터 팝오버·정렬
  검색 쌍이 **전부 기존대로 렌더**되는지 게이트에 포함(prop 기본값 경로).

#### 3.10.16 생성 문제·학습지 전체보기 + 시험지 스튜디오 (E15·E16 — 26-08-14 3차)

한 줄: 중앙 열을 **자산 3뷰**(지문관리 · 생성 문제 · 학습지)로 승격하고, 생성
문제 뷰에서 체크한 문항을 **스튜디오를 떠나지 않고** 기존 시험지 조판기
(`ExamPaperBuilderClient` — 조판·페이지네이션·8종 템플릿·배점·로고·표지·인쇄·
DOCX/HWPX 전부)로 흘려보낸다. 재작성 금지 — 이식은 additive prop 화로만.

> ⛔ **E24(§3.10.23)로 이 「자산 3뷰」의 구성은 무효** — 필 개수 3은 남지만 구성이
> `[지문관리 | 학습지 조판 | 시험지 조판]` 으로 재편됐다. 「생성 문제」는 §3.10.17-e 에서
> 「문제관리」로 개칭됐다가 E24 에서 **필 자체가 소멸**했고, 「학습지」/「학습지 관리」는
> 「학습지 조판」 뷰로 흡수됐다. 두 조판 뷰의 목록판은 `ComposerListPane` **단일 인스턴스**이며
> `class-questions-pane.tsx`·`class-worksheets-pane.tsx` 는 **파일째 삭제**됐다.
> (시험지 조판기를 additive prop 으로만 임베드한다는 이 절의 계약 자체는 유효.)

**(a) 중앙 3뷰 스위처**
- §3.10.14 헤더의 좌측이 세그먼트 3필 [지문관리 | 생성 문제 (N) | 학습지 (M)]
  로 확장. 「+ 지문 추가」 primary 버튼은 지문관리 뷰에서만. 워크스페이스 필
  계약 불변. 뷰 상태는 LibraryPane 소유(intakeView 확장 또는 병렬 상태),
  클래스 전환 시 선택·뷰 리셋(classId effect — scopeOnly 선례).

**(b) 생성 문제 전체보기 — 평면 리스트**
- 데이터: 신규 서버 액션 `listStudioClassQuestions({ classId })`
  (src/actions/studio/questions.ts 신설, `StudioActionResult` 규약) — 정본 3단:
  ①`class.findFirst({id, academyId})` 소유 검증 ②`studioClassPassage.findMany
  ({academyId, classId}, take 300)` ③`question.findMany({passageId:{in},
  academyId, deletedAt:null}, orderBy createdAt desc, take 1000)`. 행 타입
  `StudioClassQuestionRow = DossierQuestionRow + {passageId, passageTitle}`
  (src/lib/studio/dossier-types.ts 에 additive). 유형 라벨·프리미엄 판정
  (tags 우선 + 구세대 잡 역교집합 폴백)은 dossier.ts 로직과 **동일 구현**
  (불일치 = 배지 어긋남). stem 120자 절단 동형. ⚠ deletedAt 게이트 직접
  조립 시 누락 금지, StudioClassPassage 는 relation-free(2단 질의 필수).
- 행 = E11 행 문법 계승(카드 폐기 — 사용자 지시): 체크박스 · 지문 제목(축약) ·
  유형 라벨 · 난이도 배지(킬러 rose) · 플랜 배지(프리미엄 violet) · 생성일시 ·
  상세(문두+선지 펼침 또는 기존 상세 모달 재사용).
- 필터 = 이 화면 문맥에 맞는 것만: 유형 · 난이도 · 일반/프리미엄 · 지문 ·
  검색(문두). 클라이언트 필터(클래스 스코프라 소량) + 「N개 중 M개 표시 ·
  필터 초기화」 각주(§3.10.11-e 문법 재사용).
- 선택 = 리포 정본 드래그 선택 계약(직접 DOM+rAF+캡처+커밋 1회) + 체크박스 +
  전체 선택. 선택 상태는 LibraryPane 소유(뷰 전환 생존, 클래스 전환 리셋).
- 하단 실행 바 = **DossierPickBar 재사용**(중앙 열 하단 — §3.10.13 바와 컴포넌트
  공유, 표면별 인스턴스). deployTarget 을 LibraryPane 에 additive 전달.
- **「시험지 조판」의 착지 변경**: 두 표면(도시에 픽바·평면 뷰 픽바) 모두
  `onComposeExam?` additive prop 경유로 **인스튜디오 시험지 스튜디오 오버레이**를
  연다(기존 seedExamAndNavigate 라우팅 아웃 폐기 — 스튜디오 한정. generate 쪽
  기존 호출부 불변).

**(c) 시험지 스튜디오 — ExamPaperBuilderClient 오버레이 이식 (정찰 A 확정)**
- 마운트: 오케스트레이터 소유 오버레이(fixed inset-0 z-[70] bg-white flex-col).
  상단 슬림 바(「← 스튜디오로」 + 클래스명 + 저장 상태) + 빌더 본체.
- 빌더 additive prop 5종(전부 기본값 = 현행 → 기존 5개 라우트 픽셀 불변):
  1. `shellClassName?` — 뷰포트 고정 셸(`-m-4 h-[calc(100dvh-3.5rem)] md:-m-6
     md:h-[100dvh]`)을 오버레이용 `h-full` 로 대체(:2446-2459).
  2. `onSavedExam?(examId)` — 신규 저장·다른 이름 저장 후 `router.replace`
     (:2222·:2265, 스튜디오 밖 이탈) 대신 호출. 오버레이는 유지, 이후 저장은
     내부 savedExamId 로 같은 시험지 UPDATE(입력 스키마 examId 확인 필수).
  3. `draftScope?` — IndexedDB 초안 키 `exam-paper-builder:create:${academyId}`
     단일 슬롯 쟁탈 해소(스튜디오 접미사 — 오버레이 닫아도 초안 생존·재개).
  4. `initialClassId?` — 저장 폼 반 셀렉트 프리셋(스튜디오 선택 클래스).
  5. `onDirtyChange?(dirty)` — 오버레이 닫기 가드 재료(dirty 시 confirm —
     beforeunload 는 인앱 언마운트를 못 막는다: 정찰 G-5).
- 데이터: 오버레이 열림 시 `getExamPaperBuilderData(academyId)` 클라이언트 호출
  (이미 "use server"). 시드 = 열기 직전 `EXAM_SEED_QUESTION_IDS_KEY` sessionStorage
  주입 → 빌더 마운트 효과가 1회 소비(기존 통로 무개조, :1126-1145).
- 함정 원장(정찰 G): DOM id 충돌(exam-builder-shell·print-root — **동시 2마운트
  금지**, 오버레이 단일 인스턴스 보장) · print 는 window.print+포털이라 오버레이
  내 동작 · styled-jsx @page 전역 설치는 마운트 중 한정(수용) · localStorage 패널
  키 공유(의도 수용 — 같은 도구·같은 사용자) · 사이드바 강제 접기는 no-op 폴백.
- 저장 후 revalidatePath 스튜디오 경로 부재 — 스튜디오는 자체 액션 조회라 무영향
  (수용, 명기만).

**(d) 학습지 전체보기** — 스튜디오의 "학습지" 실체 = `PassageReport`
(generationPlan ∈ PRIME_REPORT_MARKERS = PRIME·PRIME_KO·PRIME_FINAL,
deletedAt:null). 클래스 관계가 없어 StudioClassPassage 경유 2단 질의.
- 신규 액션 `listStudioClassWorksheets({ classId })`(src/actions/studio/
  worksheets.ts 신설) — 링크 지문의 리포트를 updatedAt desc 로 평면 조회.
  행 = `{reportId, passageId, passageTitle, title, status(DRAFT|PUBLISHED|
  ARCHIVED), planMarker, updatedAt, publishedAt}`. pages Json 은 싣지 않는다
  (무겁다 — select 제외).
- 모듈 뱃지는 v1 제외(개정): getStudioPassageSectionStates 는 지문당
  compileServerStudyPlan 까지 도는 무거운 질의라 목록 표면에 부적합 — 행은
  슬림 8필드만. 종류 배지 = planMarker 환산(PRIME 학습 워크북 · PRIME_KO
  국어 워크북 · PRIME_FINAL 파이널 원페이지), 상태 배지 = DRAFT 초안 ·
  PUBLISHED 발행됨 · ARCHIVED 보관됨(미지값 원문 폴백).
- 행 액션: 클릭 = 지문 스튜디오(`/director/studio/c/[classId]/p/[passageId]`)
  이동(편집·인쇄·배포의 기존 정본 표면). 마지막 수정 표기.

**(e) 실측 결함 원장(초판 → 수정 확정)**
- **평면 fetch 자기유발 취소(critical)**: fetch effect 가 status 를 deps 로
  두고 effect 안에서 loading 전이 → 그 전이가 자기 cleanup(cancelled=true)을
  발화시켜 응답이 영원히 버려짐(스켈레톤 고착 실측). 수정 = 키 ref(클래스당
  발사 1회) + 시퀀스 ref(최신 응답만 반영) + reload 카운터, cleanup-취소 폐기.
  클래스 전환 리셋 effect 가 **키 ref 도 함께 비운다**(A→B→A 재선택 고착 방지).
- **오버레이 시드 StrictMode 소실(critical)**: 시드 잔재 정리를 언마운트
  cleanup 에 두면 StrictMode 이중 마운트 1회차 cleanup 이 빌더 마운트 전에
  시드를 지워 조판 0문항(실측). 수정 = 정리를 **명시적 닫기 경로**로 이관
  (소비 후 removeItem 은 멱등).
- 빌더 헤더는 mousemove 자동 숨김 — 게이트에서 저장 클릭 전 상단 마우스 이동
  + :visible 필터 필수. generate 페이지는 5초 폴링이라 networkidle 미도달
  (게이트 대기 전략 함정).

**(e2) 적대 감사 확정 15건(critical 0·major 6·minor 9) — 전량 수정 완료**
- [major] 클래스 전환 리셋 3종 불완전: ①시퀀스 ref 미증가(인플라이트 타 클래스
  응답이 현재 클래스로 ready 커밋 — 리셋에 seq++ 추가) ②판 로컬 필터 잔존
  (A 의 passageFilter 가 B 에서 0건 화면 — 판 2종에 key=classId) ③intakeView
  잔존(전 클래스 집중 모드가 새 클래스 첫 화면 탈취 — 리셋에 library 정렬).
- [major·공유 인프라] 빌더 시드-초안 경합: 시드 즉시 적용이 IndexedDB 초안
  복구 배너와 경합(복구 클릭 = 시드 무통보 소실) — 시드 소비를 2단 분리(회수
  즉시 / **적용은 초안 판정 해소 후**, 복구 채택 시 초안→시드 append 결정적).
- [major] 프리미엄 폴백 예산 괴리: 클래스 300지문이 take 100 총예산 공유 →
  dossier(지문당 100)와 배지 갈라짐 — 구세대 행 보유 지문으로 좁혀 지문 수
  비례 상한(×100, cap 1000).
- [major×2+minor] 평면 행 a11y: 루트 role=checkbox 가 자손 상세 버튼 시맨틱
  무효화(Children Presentational) + 루트 onKeyDown 이 자손 Enter/Space 가로챔
  + 행 aria-label 동명 — 루트 무롤 div + 체크 실버튼(도시에 E11 문법) +
  지문 제목 포함 고유 라벨로 개편.
- [major] 오버레이 다이얼로그 a11y: role/aria-modal/초기 포커스/Escape 부재 +
  배경 포커스 누수 — role=dialog + 복귀 버튼 초기 포커스 + Escape(defaultPrevented
  존중) + 오케스트레이터 배경(헤더·3분할 본문) inert.
- [minor] 워크스페이스 고아(마지막 행 삭제 시 open 잔존 — 반대 전이 닫기),
  담기 승격 후 selectedIds 유령(실지문 id 재바인딩), 비-닫기 이탈 시드 잔존
  (오케스트레이터 열림-가드 언마운트 정리), worksheets 입력 가드·take 900,
  픽바 카피 "이동해" 정정 등.
- 감사 원장: 발견 30건 → 확정 15·기각 15(오탐 필터). 수정 후 전 게이트 재검증
  GREEN(신규 11/11 + 픽바 9/9 + overhaul2 11/11 + rail 11/11 + 스트림 7/7).
- 스트림 게이트 드리프트 2건(앱 무결): 행 셀렉터가 §3.10.13 이전 구조(행=버튼)
  와 §3.10.11-e v3 차트 라벨 필터 버튼을 오집 — 래퍼 div(체크 버튼 직계) 기준
  으로 게이트 개정.

#### 3.10.17 생성 문제 탭 실행대 재설계 (E17 — 26-08-14 4차 사용자 격노 지시)

사용자 판정 5건("너무 대충했다") — 전부 이행 의무:

**(a) 오버레이 폐기 → 인-플로우 조판(구조 핵심)**: "시험지 조판을 누르면
exams/create 화면이 뜨게 하라는게 절대 아니라고" — 전체화면 오버레이를 버리고,
조판 모드에서 **스튜디오 3열 구조를 유지한 채** 중앙+우측 영역에 빌더를
인-플로우로 마운트한다: 좌측 클래스 레일·상단 헤더 불변, 빌더 자체의 3열
그리드(문항 라이브러리(접힘 시작)·A4 미리보기·시험지 설정 aside)가 중앙~우측을
채워 **시험지 설정 aside 가 정확히 구 도시에 자리에 앉는다**(사용자가 붙인
DOM 그대로). 구현: 오케스트레이터 composeMode 상태 — on 이면 중앙 LibraryPane
래퍼 hidden(유지 마운트 — 인테이크·선택 보존)·우측 aside/핸들 숨김·빌더
컨테이너(flex-1 h-full) 렌더. ExamStudioOverlay → ExamComposeSurface 개조:
fixed inset-0/z/배경 inert 전부 제거(인-플로우), 슬림 바 「← 문제 목록으로」
복귀·저장됨 칩 유지, Escape 유지. 시드 통로·additive prop 5종·초안 scope 는
그대로. 빌더에 initialLeftCollapsed(문항 라이브러리 접힘 시작) additive prop
1종 추가(스튜디오 = 평면 리스트가 라이브러리 역할이므로 접고 시작, 펼치면
전체 문항은행 보너스).

**(b) 생성 문제 탭 = 우측 패널이 항시 실행대**: 생성 문제 뷰에서 우측 패널은
도시에가 아니라 **QuestionsActionRail**(신규) — ①선택 요약(N문항·지문 M·유형
칩) ②[모바일 배포] 인라인 폼(마감 프리셋·대상=레일, 픽바 재료 이관)
③[시험지 조판]. **두 버튼은 선택 0에서도 항시 노출**(사용자: "선택 하기
전부터 계속 있어야") — 0이면 aria-disabled + "위 목록에서 문항을 체크하세요"
안내. 중앙 하단 픽바는 생성 문제 뷰에서 제거(실행대가 승계). 이를 위해
**flatPicked·assetView 를 오케스트레이터로 승격**(우측 패널은 aside/슬라이드
오버 이원 렌더 — §3.10.13 소유권 규칙과 동일 근거). LibraryPane 은 controlled
(flatPicked·onChangeSelection·assetView·onAssetViewChange props).

**(c) 지문관리 전체선택 고아 행 수복**: 벌크 액션 소멸로 체크박스 하나가
가로 행을 독점 — 그리드에 additive prop(예: inlineSelectAllInHeader)로
전체선택 체크박스를 폴더 브레드크럼 행(정렬·검색 옆)에 인라인하고 툴바 행
자체를 접는다(타 호스트 기본값 불변).

**(d) 평면 행 지문 제목 무절단**: max-w-[9.5rem] 고정 캡 폐기 — 지문 제목이
flex-1(주 정보)로 가용 폭을 갖고, 유형 라벨은 shrink-0. 제목 절단은 진짜
공간 부족에서만(min-w-0 truncate 최후 방어).

**(e) 도시에 「최근 5개」 캡 폐기**: "누구 마음대로 최근 5개만" — 선택 지문
전부를 아코디언 접힘 헤더로 나열(MAX_DOSSIER_PASSAGES 절단 제거). 조회는
기존 fetch-on-expand 그대로라 성능 무해(접힘 헤더 = 제목 1줄). 절단 각주
소거. 프룬 ①의 기준 집합은 전체 선택 목록으로 자동 확장.

**(a-v2) 최종 확정 — 우측 패널 "그 자리" 내장 + 체크 라이브 동기화 (5차
사용자 정정: "페이지 전환이 절대 이루어지는게 아니라… 딱 이 섹션에 부드럽게
들어가는거라고 · 체크하면 바로바로 문제가 시험지에 그대로 렌더링")**
- 중앙 목록은 조판 중에도 **상시 활성**(중앙 스왑 방식도 폐기) — 우측
  rightPanelBody 위계: **조판 표면 > 실행대 > 도시에 > 빈 상태**. 조판 진입
  = 우측 패널 내용만 교체(「← 돌아가기」로 실행대 복귀, Escape 동형).
- **라이브 동기화 = 빌더 additive `syncQuestionIds`**: 배열 참조 변화 시
  직전 동기 집합과의 **증분(diff)만** 반영(dead-reckoning — 시험지 현재
  내용과 비교하면 빌더 내부 편집과 싸움). 체크 = 즉시 조판, 해제 = 즉시
  제거, 첫 전달 = 전체 추가(초기 시드). **sessionStorage 시드는 스튜디오
  경로에서 폐기**(이중 주입 방지 — 워크벤치 라우트는 기존 시드 유지).
- 조판 소스 2계(composeSource): 실행대 발사 = flatPicked 라이브, 도시에
  픽바 발사 = pickedQuestions 라이브.
- 폭 정본(v2.1 — "핸들이 훨씬 더 왼쪽으로"): 조판 중 **폭 역전** — 중앙
  목록 = 고정 420px 입력면(shrink-0), 시험지 aside = flex-1 잔여 전폭
  (1720 뷰포트 실측 1026px, A4 100% 줌). 닫으면 원 폭 복귀. 빌더 additive
  `initialRightCollapsed`(편집 패널 접힘 시작, 저장 우회 계약 동일) +
  PANEL_SPECS dossier max 560→960. 클래스 전환 = 조판 자동 닫힘.
- 알려진 한계: <xl 에선 aside 가 display:none 이라 조판이 보이지 않는다
  (숨은 마운트 — 데스크톱 우선 기능, 후속 필요 시 슬라이드오버 변형).

**(f) 구현 확정·검증**: 빌더 additive 3종 추가(initialLeftCollapsed·
initialRightCollapsed — 제공 시 localStorage 복원·영속 모두 우회 ·
syncQuestionIds), 그리드 additive `inlineSelectAllInHeader`,
ExamComposeSurface(우측 내장 — 컴팩트 헤더 + "체크하면 즉시 올라가고" 안내
줄), QuestionsActionRail(항시 실행대 — 픽바 제출 정본 이관),
flatPicked·centerAssetView·composeSource 오케스트레이터 승격(LibraryPane
controlled — Set→Map 재조립만 판 소유), 중앙 하단 평면 픽바 제거.
게이트: behavior-exam-studio **11/11**(G6 = 우측 내장 + 라이브 동기화 실측:
체크→본문 4956→7043자 증가·해제→원복, G7 저장 DB 앵커, G8 실행대 복귀) ·
probe-pickbar **9/9** GREEN.

**(f) 검증 게이트** — `.tmp-studio-qa/behavior-exam-studio.mjs` **11/11 GREEN**:
G1 기본 진입=지문관리·검수/필터 소멸·"내 지문함" 0건·전체선택+정렬 잔존 →
G2 팝오버 3항목→집중 모드→복귀 → G3 평면 행(119)+필터 실동작 → G4 픽바
실가시 → G5 상세 모달 → G6 오버레이 빌더 실마운트+시드 2문항 조판 → G7 저장
실발사(오버레이 유지+저장됨 칩+DB Exam: 문항 2·classId 프리셋·DRAFT·청소) →
G8 닫기 복귀+선택 보존 → G9 학습지 평면 행+종류 배지+딥링크 → G10 도시에
분석완료 배지 소멸 → G11 generate 무회귀(벌크 검수완료·필터·정렬 잔존).
선행 계약 재검증: probe-pickbar 9/9(P8 을 §3.10.16 오버레이 착지로 개정) ·
behavior-overhaul2 11/11(G2·G5 신계약 자구 개정, G10 viable 폴링) ·
behavior-class-rail 11/11(G2 신계약 자구 개정).

**(g) v2.3 마감 폴리시 (26-08-14 6차 지시 — "강박적 디테일·찌그러짐 금지·
문제관리 핸들 불요")**

- **① 평면 행 폴리시(class-questions-pane)**: 2단 구조(v2.2)는 유지하고
  디테일만 조인다 — `items-start` + `py-2` 로 체크박스(16px)·상세 버튼
  (`-mt-1`)이 제목 첫 줄 라인박스(16.5px)와 광학 동축(1줄/2줄 제목 혼재에도
  좌우 리듬 불변). **체크박스 안 조판 순서 숫자**: Set 삽입 순서(= §3.10.13
  체크 순서 = 조판 순서)를 ≤99 까지 숫자로 렌더(초과 시 체크 아이콘 폴백,
  title 「체크 순서 N번」). 선택 상태 = 얇은 단일 보더(border-blue-300/80 +
  bg-blue-50/60 — 종전 보더+인셋 링 이중선 폐기) + 제목 slate-800 승색.
  배지 py-px·rounded-[4px]·9.5px 축소, 유형 라벨 semibold→medium(제목과의
  위계 분리), 행 간격 gap-1.5, 스켈레톤 h-14(실행 근사). **게이트 계약
  불변식**: 행 루트 `data-drag-item-id` · 직계 자식 체크 버튼 aria-label
  접미 「문항 선택」은 **체크 상태와 무관하게 불변**(behavior-exam-studio
  G3·G8 셀렉터) · `span.line-clamp-2` 존치.
- **② 스위처 컴팩트 모드(source-switcher) — v2 확정(사용자 "아이콘만 남기지
  말고 텍스트도 다")**: 조판 중 중앙 420px 에서 내부 가로 스크롤로 필이
  찌그러지던 것을 폐기 — 컨테이너 실측 폭(RO 경유 stripWidth) 이 임계
  (`560 + (워크스페이스 필 ? 130 : 0)`) 미만이면 **전 필 라벨 유지**한 채
  건수 (N) 만 툴팁·aria-label 로 옮기고 패딩·간격을 조인다(px-2·gap-1 —
  v1 의 아이콘 정사각 축약은 사용자 지시로 폐기). 420px 실측: 3필+무CTA
  스크롤 0. 극단 폭(도시에 조판+워크스페이스 필 동반)은 스크롤+페이드
  안전망. 판정을 콘텐츠 폭으로 하면 축약 즉시 임계 미달 → 모드 진동이라
  금지. **Tailwind 함정**: px-2/px-3 동그룹 유틸은 클래스 나열 순서가 아니라
  스타일시트 순서로 승부 — px 를 BASE 에서 빼고 분기로만 부여. 게이트
  (`div.h-11` + aria-pressed + has-text)는 라벨 상시 유지로 컴팩트에서도
  성립(aria-label 폴백 로케이터는 겸용 유지).
- **③ 빌더 additive `hideQuestionLibrary`**: 스튜디오 인-플로우 조판은 중앙
  평면 리스트가 라이브러리 역할이라 좌측 문제관리 패널·여닫이 핸들이 소음
  (사용자 판정 "이녀석은 필요가 없어") — 패널·핸들 양태(열림/접힘 버튼)를
  렌더하지 않고 1·2번 그리드 컬럼(패널·핸들 24px)을 0 으로 지운다. **5컬럼
  템플릿 자체는 유지**(자식 슬롯 정렬 계약 — 컬럼을 빼면 뒤 슬롯이 밀린다),
  드래그 커밋 경로(flush)의 템플릿 문자열도 동일 분기 미러 의무.
  `bothBuilderPanelsOpen` 사이드바 접힘 판정에도 `!hideQuestionLibrary`
  가드(저장된 좌측 열림 상태의 유령 접힘 방지). ExamComposeSurface 가
  `initialLeftCollapsed`(저장 우회 계약)와 병행 전달. 미전달 = 픽셀 불변.
- **적대 검수(25기, wf_b1e1c262) 후속 수리 2건**: ⓐ `clampPanelWidths` 에
  `opts.hideLeft` additive — 좌측 소멸 임베드에서 종전 산식이 유령 좌측 몫
  (최소 280px)+핸들 2개(48px)를 예약해 우측 드래그 범위를 조이던 것 교정,
  left 는 저장값 통과(클램프 = 공유 저장값 오염만 남음). 호출 2곳(RO 마운트
  클램프·우핸들 드래그) 전달 ⓑ `bypassLayoutPersistence`(임베드 신호 =
  initialLeft/RightCollapsed·hideQuestionLibrary 중 하나라도 제공) — 패널 폭·
  썸네일 폭/접힘 공유 키 영속 우회. **조판을 한 번 열기만 해도**(드래그 불요)
  임베드 RO 클램프가 560/320→280/260 축소값을 공유 키에 써 독립 라우트 시작
  폭을 덮던 결함의 봉합(접힘 키 계약의 완성형).
- **검수 확정·미수정(선재 결함 — 사용자 결정 대상, v2 라이브 동기화 설계 계열)**:
  ①(major) sync 첫 전달이 IndexedDB 초안 판정 게이트 미대기 — 초안 복구
  클릭이 체크 문항을 무통보 소실(시드 경로엔 게이트 있음, 1204행 비교)
  ②(major) sync add(비동기 서버 왕복)·remove(동기) 미직렬화 — 빠른 체크→해제
  시 해제 문항 잔류 + 순서 숫자 어긋남(마키 경로 reconcile 루프와 달리 무방비)
  ③(major) 세트(inSet) 문항이 평면 리스트에 개별 행으로 떠 체크 1개=세트
  전체 조판·해제 1개=세트 전체 제거(listStudioClassQuestions setId 미필터)
  ④(major) xl 미만 rightPanelBody 이원 렌더 시 조판 표면 2중 마운트(print-root
  중복 id·초안 이중 기록 — 기존 "숨은 마운트 한계"의 구체화) ⑤(minor) 도시에
  소스 조판 중 평면 리스트 체크는 동기화 대상이 아닌데 순번·안내문 노출
  ⑥(minor) 삭제 문항 유령 선택이 순번을 실제 조판 순서와 어긋나게 함(무프룬
  설계의 대가) ⑦(minor) window Escape 가 빌더 내부 Escape(캐럿 해제)와 충돌
  ⑧(minor) 임베드가 EXAM_SEED_QUESTION_IDS_KEY 를 여전히 소비(주석과 불일치).
  기각 1건: 컴팩트 전환 후 페이드 스테일(전역 커스텀 스크롤바 6px 가 높이
  변화로 RO 재발화 — 재실측 성립).
- **게이트**: behavior-exam-studio **11/11** 재확인(수리 후 재주행) +
  `.tmp-studio-qa/probe-polish-v23.mjs` **12/12** 신설(P2·P7 첫 줄 광학 동축
  ±2px 실측 Δ0.5/0.7 — 한글 글리프 박스 19px 실측 기반 체크박스 mt-0.5·상세
  -mt-1 · P3 순서 숫자 1,2,3 · P3b 체크 후에도 aria-label 접미 불변 · P4~P4c
  컴팩트 420px 스크롤 0·CTA 축약·활성 라벨 유지 · P5/P5b 핸들 부재+그리드
  `0px 0px …` 실측 · P8 복귀 풀 모드 복원). 계기 함정: dirty 조판 닫기
  confirm 은 dialog accept 필수 · 빌더는 지연 마운트라 그리드 검증 전
  `#exam-builder-shell` 대기 필수.

**(h) §3.10.17-e 뷰별 우측 위계 + 개칭 (26-08-14 7차 격노 지시 — "탭마다
우측에 필요한 정보가 다 다르다")**

- **개칭**: 자산 3뷰 = [지문관리 | **문제관리**(구 생성 문제) | **학습지
  관리**(구 학습지)] — 스위처 ASSET_VIEWS 라벨만(뷰 키·내부 문자열 불변).
  게이트 자구 개정 의무: `has-text("생성 문제")` → `("문제관리")`
  (behavior-exam-studio G3 개정됨. "학습지" 는 부분 일치라 그대로 매치).
  구 자구 프로브(probe-compose-width·probe-detail-in-compose·probe-overhaul3·
  probe-overlay-builder·probe-row-design)는 폐물.
  > ⛔ **E24(§3.10.23)로 이 개칭 전체가 무효** — 「문제관리」·「학습지 관리」 필은 사용자
  > 확정("걷어낸다")에 따라 **삭제**됐고, 자산 3뷰는 `[지문관리 | 학습지 조판 | 시험지 조판]`
  > 이다. 이번에는 라벨만이 아니라 **뷰 키·내부 문자열도 함께 바뀌었다**
  > (`"questions"`/`"worksheets"`/`"studio"` → `"sheet"`/`"exam"`). 게이트는 라벨이 아니라
  > `data-asset-view` 속성으로 필을 특정한다(§3.10.23 E24-4).
- **「+ 지문 추가」 = 지문관리 뷰 전용**: 문제관리·학습지 관리에선 스위처
  sticky 클러스터에서 제거(지문이 그 화면의 재료가 아니다). 워크스페이스 필은
  전 뷰 유지(재진입 유일 경로 계약).
  > ⛔ **E24(§3.10.23)로 뷰 이름만 무효** — 제거 대상 뷰는 **「학습지 조판」·「시험지
  > 조판」** 두 조판 뷰다. **계약 자체는 유효**하며 `probe-polish-v23` P1(두 조판 뷰에
  > 지문 추가 부재)이 그대로 이어받는다. 「워크스페이스 필 전 뷰 유지」는 E24 가 아니라
  > **§3.10.18(E18)** 이 워크스페이스 표면을 폐기하며 이미 소멸시킨 항이다.
- **조판 표면은 발사한 뷰의 것**: flat 발사(실행대) = 문제관리 뷰 · 도시에
  픽바 발사 = 지문관리 뷰. `composeVisible = examStudioOpen && (source 별
  해당 뷰)` — 우측 패널·중앙 420px 접힘·aside flex-1 폭 역전이 전부
  examStudioOpen 이 아니라 **composeVisible** 을 따른다. 다른 탭으로 가면
  조판은 **숨김 마운트로 보존**(`hidden` 래퍼 — 언마운트하면 초안 복구 경합
  (g)①에 노출)되고 그 뷰의 원래 패널(지문관리=도시에·문제관리=실행대·학습지
  관리=도시에/빈 상태)이 우측을 갖는다. 재진입 = 조판하던 시험지 그대로.
  > ⛔ **E24(§3.10.23)로 「발사한 뷰의 것」 규칙은 무효** — 조판 표면의 소속은 **발사 지점이
  > 아니라 축**이다: `composeVisible = examStudioOpen && 뷰==="exam"` ·
  > `sheetComposeVisible = sheetComposeOpen && 뷰==="sheet"`. 어디서 발사해도 **자기 뷰로 강제
  > 전환**된다(E24-0 ②-a 최상위 불변식). 우측 패널 소유도 재편됐다 — 지문관리=도시에 ·
  > 학습지 조판=학습지 실행대(+문항 요약 스트립) · 시험지 조판=문항 실행대(+학습지 요약
  > 스트립). **숨김 마운트 보존 계약과 `active` prop 계약은 그대로 유효**하며, 오히려
  > E24-0 ②-c 에서 「`active` 는 반드시 가시 파생값을 먹는다」로 **강화**됐다.
- **ExamComposeSurface additive `active`**: 숨김 동안 window Escape 닫기·
  진입 포커스 비활성(숨은 표면이 타 뷰 Escape 를 가로채 confirm 을 띄우는 것
  방지), true 복귀 시 뒤로가기 버튼 재포커스. 기본 true(무회귀).
- **게이트**: behavior-exam-studio **11/11**(G3 자구 개정판) +
  probe-polish-v23 **13/13** 확장 — P0 개칭+지문관리 지문 추가 · P1 문제/
  학습지 관리 지문 추가 부재 · P7 조판 중 지문관리 탭 = 조판 숨김·중앙 원폭
  (실측 1086px)·지문 추가 복귀 · P7b 타 뷰 Escape 무반응 · P8 문제관리
  재진입 조판 보존(본문 7053자 동일) · P9 돌아가기 실행대·풀 모드 복원.
  > ⛔ **E24(§3.10.23)로 P0·P1·P8 은 계약이 소멸** — 「개칭이 되어 있는가」를 재던 항이라
  > 셀렉터 치환이 **불가능한 유일한 항**이었다. 폐기하지 않고 **E24 완료 게이트로 승격
  > 재작성**했다(P0 = G1 3필·`data-asset-view` 집합·레거시 필 0개 / P1 = **두 조판 뷰**에
  > 지문 추가 부재 / P8 = **시험지 조판 탭** 재진입 보존). 같은 프로브는 **13/13 PASS** 확정.
  > ⚠ P5 의 「문제관리 패널」은 **시험지 빌더 내부** 좌측 패널이라 **무개변**(동명이인).
  **계기 메모**: 컴팩트 v2(라벨 상시 유지)부터 `has-text` 가 컴팩트에서도
  성립하나, 필 로케이터의 `[aria-label^=…]` 폴백은 겸용 유지(회귀 내성).
  probe-polish-v23 P4b = 컴팩트 전 필 라벨 유지 계약(13/13 재확인).

**(i) 미리보기 툴바 각형 + 편집 패널 기본 펼침 (26-08-14 8차 지시)**

- **PreviewToolbar 각형 문법**: 버튼 전부(배포·되돌리기·앞으로·저장(SaveButton
  className="rounded-none" — split rounded-l/r-md 는 twMerge 평탄화)·인쇄·
  다운로드·비우기) rounded 제거. 상태 배지(저장 필요·템플릿 pill)와 플로팅
  드롭다운 메뉴는 라운드 유지(배지·부유면 문법은 별개). 이 툴바는 독립
  라우트와 공유 — 전 호스트 공통 적용(사용자 미학 확정).
- **조판 = 편집/설정 패널 기본 펼침**: ExamComposeSurface 가
  `initialRightCollapsed={false}` **명시 전달**(저장 우회 계약 유지) — 조판
  aside 가 잔여 전폭이라 여유 있음. 그리드 실측
  `0px 0px minmax(420px,1fr) 24px 320px`(probe P5b 개정 = 우측 컬럼 >0 계약).
- **후속 실측 결함 즉시 수리**: 패널 기본 펼침으로 툴바가 682px 로 줄자
  compactLabels 임계(620)가 미달 — 「태블릿 시험 배포」 풀 라벨이 「저장
  필요」 칩과 겹침(overlap 실측). 임계 620→**720** 상향: 682px 에선 아이콘
  축약("A4"+아이콘)으로 겹침 0 실측(overlap:false·rounded 버튼 0개 프로브).
- **빌더 additive `hideBuilderHeader`(9차 지시 "이거 좀 없애라고")**: 내부
  자동 숨김 헤더(「시험지 생성」 WorkflowPageTitle)가 숨은 뒤 좌상단에 남는
  **「헤더 보기」 삼각 돌기**(clip-path 4px 탭)가 지적 대상 — 임베드는 조판
  표면 컴팩트 헤더가 정체를 이미 표기하므로 헤더+돌기를 통째 미렌더.
  ExamComposeSurface 전달, 미전달 = 독립 라우트 픽셀 불변. 실측: 임베드
  revealBtn 0·내부 타이틀 0.
- 게이트: behavior-exam-studio 11/11 · probe-polish-v23 13/13(P5b 개정판) 재확인.

**(j) 조판 재료 캐시 — "매번 로딩" 폐지 (26-08-14 10차 지시 "빠릿빠릿하게")**

- **구조**: exam-compose-surface 모듈 캐시(학원 단위 builderDataReady/Inflight)
  + `prefetchExamBuilderData(academyId)` export. 오케스트레이터가 **클래스
  선택 시점**에 선조회 → 첫 [시험지 조판] 진입도 스피너 없이 열린다. 표면
  useState 초기화가 캐시 적중 시 곧장 ready(스피너 렌더 자체가 없음).
- **신선도 규약**: 캐시 적중 진입은 표시는 캐시 그대로, **백그라운드 재조회가
  다음 진입분만** 갱신한다 — 빌더 마운트 중 questions/classes prop 라이브
  스왑은 내부 캐시·폼과 싸우므로 금지. 스튜디오는 라이브러리 숨김이라 문항
  1페이지 스테일은 표시 무관, 저장 폼 반 목록만 최대 1진입 뒤처짐(수용).
  재시도(reload>0)는 캐시 우회 신선 fetch(오류 UI 소유).
- **실측**: 첫 진입 스피너 0·셸 414ms, 재진입 스피너 0·267ms(잔여는 빌더
  마운트 비용). 게이트 11/11 · 프로브 13/13 재확인.

**(k) 조판 발사 단일화 + 조판 중 워크스페이스 필 숨김 (26-08-14 11차 지시 —
"조판 버튼은 무조건 문제관리에서 누른 거랑 똑같이 · 워크스페이스 필요 없어")**

- **문제 재현**: 도시에 픽바 발사 조판이 지문관리 뷰 소속((h) 규칙)이라,
  워크스페이스 오버레이가 열린 채면 중앙 420px 열에 워크스페이스 카드가
  낑겨 뜨고 스트립에 워크스페이스 필까지 노출("막 이상한게 떠있어").
- **단일화 정본**: 발사 소스 2계(composeSource flat/dossier) **폐기** — 도시에
  픽바 「시험지 조판」은 ①도시에 선택(pickedQuestions)을 평면 선택
  (flatPicked)으로 **승계**(Map 삽입 순서 = 조판 순서 보존, 도시에 픽은 비움 —
  선택의 거처 이동) ②LibraryPane 이 올린 뷰 강제 명령
  (`onComposeViewControl` additive — **handleSelectView("questions") 경로
  그대로**라 워크스페이스 닫기·인테이크 복귀·최초 진입 fetch 불변식 공유)
  ③open. 이후는 언제나 flatPicked 단일 라이브 동기화.
  `composeVisible = examStudioOpen && questions 뷰` 로 단순화.
  > ⛔ **E24(§3.10.23)로 인자·산식이 무효** — 뷰 강제 채널의 인자는
  > `handleSelectView("questions")` → (E22)`("studio")` → **`("exam")`** 로, 학습지 축은
  > `("worksheets")` → `("studio")` → **`("sheet")`** 로 재조준됐다. 산식은
  > `composeVisible = examStudioOpen && centerAssetView === "exam"`. **채널 2개 유지**
  > (어느 조판을 켜는지가 정보다)와 「발사 소스 2계 폐기 · flatPicked 단일 동기화」는 유효.
- **워크스페이스 필**: 조판 표시 중(composeActive→SourceSwitcher
  hideWorkspacePill) 숨김 + 컴팩트 임계 가산에서도 제외. 조판이 숨는 다른
  뷰에서는 복귀(재진입 유일 경로 계약 §3.8.2 존중).
- **실측**: 도시에 2개 체크 → 조판 = 문제관리 활성 필·평면 목록 체크 2(순서
  1·2 승계)·시험지 2블록·워크스페이스 필 부재. 게이트 3벌 GREEN
  (behavior-exam-studio 11/11 · probe-polish-v23 13/13 · probe-pickbar 9/9).
  > ⛔ **E24(§3.10.23)로 착지 필 이름이 무효** — 같은 동선의 착지는 이제 **「시험지 조판」
  > 활성 필**(`[data-asset-view="exam"]`)이다. 순서 승계·2블록이라는 결과 자체는 불변이고
  > `probe-e24-split.mjs` G9(도시에 행 액션 → 올바른 탭 착지)가 이어받는다.
- **계기 함정(재확인)**: 도시에 아코디언 접힘 카드(0fr)의 체크박스는
  Playwright visible 오탐 — 반드시 펼친 카드(`:has(> button[title="접기"])`)
  스코프로 클릭.

**(l) 도시에 문항 행 = 평면 목록 문법 통일 (26-08-14 12차 지시 — "클릭하면
선택 · 드래그 선택 · 깔쌈한 상세보기 버튼")**

- **행 인터랙션 전환**: 구조는 「행 전체가 상세 모달 버튼」이었다(클릭=상세,
  체크는 좌측 버튼만) → **행 루트 = 무롤 div + onClick 토글**(마키 시작면 겸용),
  본문은 **무버튼 스팬**(버튼·제어 커서면 마키가 안 켜진다 —
  class-questions-pane 헤더 주석 계약 승계), 체크 시맨틱은 좌측 실버튼
  (role=checkbox, stopPropagation) 유지. ChevronRight(행=링크 어포던스) 제거.
- **마키(드래그) 선택**: `DragSelect deferCommit` 도입. **아코디언 다지문
  함정**: DragSelect 의 next 는 비-additive 시 빈 집합에서 시작하고 히트는
  자기 컨테이너 안뿐이라, 그대로 커밋하면 **다른 지문의 선택이 통째 소멸**
  한다(평면 목록은 단일 컨테이너라 무해). 그래서 커밋은 **스코프(이 지문의
  표시 행) 안쪽만 diff** 해 `onPickRows(remove,false)` + `onPickRows(add,true)`
  2콜(둘 다 함수형 업데이터 — 순차 합성 안전, Map 삽입 순서=조판 순서 보존).
- **체크 순서 숫자**: 평면 목록과 동일하게 체크박스 안 번호(≤99) — pickedIds 는
  전 지문 공통이라 번호도 지문 경계를 넘어 이어진다(하단 바·조판 적재 순서와 일치).
- **상세보기 버튼**: 행 우측 전용 아이콘 버튼(size-6·Maximize2 size-3) — 평시
  투명 테두리 고스트, 행 hover 에서 테두리(blue-200)+흰 배경+그림자가 올라오는
  단계적 어포던스. `data-drag-select-ignore` 로 이 위에서 마키 시작 차단 +
  stopPropagation 으로 토글 오발 차단. aria-label 은 행별 고유(유형 포함).
- **실측**: 본문 클릭 → 선택 1·모달 0 · 상세 버튼 → 모달 1·선택 불변 · 마키
  4행 가로지르기 → 6개 선택(순서 1~6 연속). 게이트 3벌 GREEN
  (probe-pickbar 9/9 · behavior-exam-studio 11/11 · probe-polish-v23 13/13).

**(m) 조판 재료 비용 수술 — 캐시 폐기·중복 스캔 제거·2중 마운트 봉합
(26-08-14 13차 "철저하게" 지시. 선행: 비용 감사 20기 + 수술 정찰 8기)**

- **동기**: (j) 의 모듈 캐시·선조회는 **느린 걸 빠르게 만든 게 아니라 기다림을
  옮긴 것**이었고, 정작 무거운 질의는 그대로 뒀다. 실측(문항 3,927 학원):
  `getExamPaperBuilderData` 1회 = SQL 37~41문·6,138행·DB→서버 1.76MB·
  서버→브라우저 976KB, 그중 **99.96% 가 hideQuestionLibrary 로 렌더조차 안 되는
  문항 100건**. 요금 폭탄 계열은 아니었으나(타이머·SSE·루프 0, 유휴 베이스라인
  216회/시 대비 추가분 2.7%) 설계가 틀린 방향이었다.
- **(A) 중복 전량 스캔 제거** — `loadBuilderSurfacePage` 가 `loadBuilderSurfaceItems`
  를 **동일 인자로 2회** 돌던 것을 1회로. statusCounts 는 approved-free 모집단이
  필요하므로 그쪽 1회만 남기고 목록은 메모리 필터로 파생한다. **비트 단위 동일
  증명**: ①세트 질의는 이미 `filtersWithoutApproved` 로 approved 를 벗겨 양쪽이
  같은 SQL ②세트의 approved 판정도 SQL 이 아닌 메모리 사후 필터 ③standalone 의
  유일한 차이 `where.approved` 는 `Question.approved` 가 NOT NULL Boolean 이라
  JS `===` 등가 ④비교자가 (kind,id) 전순서라 "정렬 후 필터"="필터 후 정렬".
  **approved 가 실제로 걸리는 경로(검수 세그먼트)에서도** 2회→1회가 된다.
  이 함수를 공유하는 **모든 호출자**(독립 라우트 SSR·페이지네이션·전체선택)가
  같이 절반이 된다. 종전 주석은 "한 번의 groupBy" 라 적혀 있었으나 실제 구현은
  두 번째 전량 findMany 였다 — 그 오기가 감사 전까지 중복을 은폐했다.
- **(B) 임베드 전용 경량 액션 `getExamPaperBuilderEmbedData`** — 반·학교 2건만
  읽고 반환 형태는 동일(문항·폴더·카운트는 빈 값). 기존 액션 본문은 **한 글자도
  건드리지 않는다**(독립 5라우트 SSR 바이트 불변 + ISO-5 가 국어 호출 리터럴을
  소스 문자열로 고정). 조판 문항은 빌더가 `syncQuestionIds` →
  `getExamPaperBuilderQuestionsByIds` 로 **필요한 id 만** 가져온다(계약 불변).
  동반 클라이언트 가드 4종(전부 `hideQuestionLibrary` 조건, 미전달 시 바이트
  불변): 목록 조회 effect(isMobile 승격이 전량 스캔을 되살리는 경로) · 페이지
  점프 effect(pageQuestions 가 항상 비어 **미리보기 클릭마다** 전량 스캔) ·
  폴더 하이드레이트 2액션 · setMemberMap(소비처가 폴더 배지뿐).
- **(C) (j) 의 캐시·선조회 전면 폐기** — 질의가 경량이 되면서 캐시가 존재 이유를
  잃었다. 이로써 ①반 목록 스테일(새 클래스가 저장 폼에 안 뜸) ②`builderDataInflight
  = null` 이 inflight 중복제거를 깨 2중 마운트 시 전량 스캔 2배 발사 — **두 결함이
  코드째 소멸**하고 신선도는 항상 최신이 된다.
- **(D) 2중 마운트 봉합** — `rightPanelBody` 를 aside·슬라이드오버 두 트리에
  그대로 렌더하던 탓에 xl 미만에서 ExamComposeSurface 가 2인스턴스였다(서버 액션
  2배 + IndexedDB 초안 동시 2 writer + `#exam-builder-shell`·
  `#exam-paper-print-root` id 중복 → 인쇄 포털이 `getElementById` 로 첫 노드만
  잡아 서로의 노드를 옮김). 조판은 **aside 전용**으로 두고 드로어는
  `drawerPanelBody`(조판 중이면 "넓은 화면에서 표시됩니다" 고지)로 분리.
  스펙 (g) 의 미수정 major ④가 여기서 해소됐다.
- **(E) 잠복 결함 2건 동반 수정**: ①빌더 ResizeObserver 에 `width <= 0` 가드 —
  display:none 서브트리(xl 미만 aside·접힌 패널·숨김 탭)가 폭 0 을 흘리면
  clampPanelWidths 가 좌우 폭을 하한으로 누르고 clamp 는 상한만 풀어 **다시 보여도
  원복되지 않는 편도 고착**이 된다 ②숨은 조판 표면의 전역 Escape — `active` 는
  호스트가 아는 숨김(자산 뷰)만 잡으므로 CSS 숨김은 자기 DOM 의 `offsetParent`
  null 로 판정(뷰포트 무관).
- **실측 결과(신규 게이트 `.tmp-studio-qa/probe-builder-payload.mjs` **5/5**)**:
  P1 조판 진입 무거운 문항 페이로드 **0건**(maxStems 0) · P2 진입 총 응답
  **18KB**(종전 976KB+ → 약 54배 감소) · P3 미리보기 블록 클릭 서버 POST **0건**
  (종전 전량 스캔 100% 발사) · P4 xl 미만 드로어에서 셸 **count 1**(종전 2) ·
  P5 독립 생성 라우트 무회귀(카드 18·카운트·핸들 실렌더 — **커버리지가 0이던
  지점**을 이 게이트가 처음 덮는다).
- **회귀 전판 GREEN**: tsc 0 · eslint 에러 0 · 수술면 잠금 단위테스트 13/13
  (ISO-5 포함) · behavior-exam-studio 11/11 · probe-polish-v23 13/13 ·
  probe-pickbar 9/9 · behavior-overhaul2 11/11 · `npm run build` 성공.
- **알려진 잔여**: `npm run test:unit` 스크립트가 이 Node 버전에서 디렉터리
  인자를 못 받는다(선재) — `node --test "tests/unit/*.test.mjs"` 로 우회.
  전체 640 pass / 5 fail 이며 5건은 전부 수술면 밖(HWPX 조판·랜딩 픽스처·티어
  플랜 등, 그중 1건은 소스에 pre-existing 으로 명시).
- **계기 함정 신규**: `npm run build` 직후 dev 서버는 `.next` 를 다시 컴파일하므로
  첫 게이트의 `page.goto` 가 25s 타임아웃으로 **가짜 RED** 를 낸다(overhaul2 실측).
  빌드 뒤 게이트는 1회 워밍 후 판정할 것.

**(n) 빈 클래스 인테이크 = 대형 액션 카드 (26-08-15 지시 "완전 빡 보이게")**

- 구 `max-w-[280px]` 세로 h-9 아웃라인 버튼 3개 → **대형 카드 3장**(size-12
  아이콘 타일 + 15px extrabold 제목 + 설명 1줄 + hover 화살표). 헤드라인도
  19px extrabold + size-16 아이콘 타일로 승격. 빈 상태는 이 화면에서 사용자가
  다음 행동을 고르는 유일한 지점이라 시각 무게를 여기에 몰아준다.
- **폭 적응은 뷰포트가 아니라 컨테이너 쿼리**(`@container` + `@[620px]:`) —
  조판 중 중앙 열이 420px 로 접혀도 1열로 정상 낙하한다. 뷰포트 미디어쿼리는
  "넓은 화면의 좁은 열"에서 3열을 강제해 붕괴하는 §3.8.11 함정 계열이다.
- 설명 자구는 헤더 팝오버(source-switcher `INTAKE_METHODS`)와 **동일 문자열** —
  같은 목적지는 같은 표현으로.
- 실측(QA 전용 빈 클래스 생성→캡처→삭제): 1720/1280/1024 세 폭 모두 3열 유지,
  카드 292×185 / 205×212 / 233×212, 가로 스크롤 0, 1024 에서 제목만 2줄 접힘.
  회귀 GREEN: behavior-exam-studio 11/11 · overhaul2 11/11 · class-rail 11/11 ·
  probe-polish-v23 13/13 · probe-builder-payload 5/5.

#### 3.10.18 지문관리 직행 생성 + 행 인라인 지문 수정 (E18 — 26-08-15 사용자 지시)

> **이 절이 §3.8.2·§3.8.5·§3.8.6·§3.9v2·§3.10.11-a·§3.10.17-h 와 충돌하면 이 절이 우선한다.**
> 지시 원문: "워크스페이스에 담기라는 표현이 마음에 안 들어 … 애초에 이 버튼으로
> 그 앞단에서 해줘 … 이 [상세보기]를 지문 수정 버튼으로 구현해줘 … 모달이 뜨는게
> 아니라 완전 부드럽게 극도로 최적화된 형태로 [편집 툴]이 생성되는거야."
> 사용자 확정 2건(26-08-15 질의): ① **워크스페이스는 스튜디오에서 완전 제거**
> ② 인라인 수정 저장은 **명시적 「저장」 버튼**(자동 저장 아님).

**E18-a 「워크스페이스」 표면 전량 폐기.** 스튜디오에서 "워크스페이스"라는 낱말이
보이는 표면을 전부 제거한다: ① 하단 전폭 CTA 「워크스페이스에 담기」 ② 보조 버튼
「워크스페이스 열기 (N)」 ③ 소스 스위처의 워크스페이스 필 ④ `IntakeSurface` overlay
슬롯에 실리던 `PassageWorkspace` 오버레이 전체. §3.8.2 의 "워크스페이스 재진입 유일
경로" 계약, §3.8.5 의 "그리드 CTA 는 「워크스페이스에 담기」로 일원화", §3.8.6 의
"생성 진입은 전부 워크스페이스 행 CTA" 는 **이 절로 폐기**된다.
→ 워크스페이스가 소유하던 편집 기능(AI 복원·변형 지문 생성·앞 맥락 문단 추가·
출제 범위·undo/redo)은 **E18-d 행 인라인 에디터가 전량 승계**하므로 기능 손실 0.

- ⚠ **`useWorkspaceRows` 자료구조 자체는 존치한다** — 화면에서만 사라진다.
  실전 문제 생성 모달이 `openForRow(localId)` / `activeRow: WorkspaceRow` 로 행에
  묶여 있기 때문이다(use-studio-question-gen.ts:207-218 계약 불변). 이 판은 이제
  **헤드리스 스테이징 스토어**다: 렌더되지 않고, 발사 직전에만 채워진다.
- `workspaceVisible` 인자는 `workspaceOpen`(폐기됨) 대신 **`launchHostOpen`**
  (직행 발사 호스트 열림 상태)에 물린다. 이 한 줄이 "오버레이를 열지 않고 모달만
  띄우는" 열쇠다 — 넓히지 않으면 `activeRow` 가 self-null 되어 모달이 즉시 닫힌다.

**E18-b 하단 CTA = 생성 2분기 직행.** 지문관리 뷰 하단 전폭 바는 워크스페이스 행
푸터와 **동일한 2버튼**(`grid grid-cols-2 gap-1.5`, 각 `h-10 rounded-lg bg-blue-600
text-[13px] font-bold`)을 항상 렌더한다 — 토큰 정본 = workspace-passage-row.tsx:2687-2741.

- ① 「학습 워크북 생성」(BookOpen h-4 w-4) — title "어휘·직독직해 등 학습 모듈을 만듭니다"
- ② 「실전 문제 생성」(Cpu h-4 w-4) — title "이 지문의 유형을 선택하고 문제를 생성합니다"
- 선택 N≥1 이면 각 버튼에 `{N}개` 칩(bg-white/20). 선택 0 이면 **native `disabled`
  금지 · `aria-disabled` 만** — 클릭 시 `hintSelectCards()` 로 행을 글로우해 선택을
  유도한다(§3.10.11 관용구 유지, `triggerHintGlow` 는 클릭 가능해야 발화한다).
- **워크스페이스 왕복 0**: 오버레이는 존재하지 않으므로 모달만 뜬다.

**E18-c 직행 발사 관문(무회귀 필수 경로).**

1. **draft 승격** — `resolveSelectionToPassageIds`(markReviewed:false)로 AI 추출
   의사 id 를 실지문으로 올리고 `setSelectedIds` 를 실 id 로 재바인딩한다. 이
   관문을 건너뛰면 존재하지 않는 passageId 가 생성 액션에 나간다.
2. **학습 워크북** — `onOpenModuleSheet(passages)` 직결. 모달이 원래 다지문 계약
   이라 `workbook-generate-modal.tsx` 는 **한 줄도 고치지 않는다**. 배열은 인라인
   리터럴 금지(§3.8.11 함정 2) — 핸들러 안에서 만들어 즉시 넘긴다.
3. **실전 문제** — ① `workspaceApi.replaceWithPassages(resolved)` 로 스테이징을
   **통째 교체**하고 반환된 localId 를 그 자리에서 받는다 ②
   `setLaunchHostOpen(true)` → `openForRow(localIds[0])`.
   - ⚠ **`clear()` + `loadPassages()` 조합 금지**(적대 검수 확정 critical):
     `clear` 는 `setRows` 를 큐잉만 하고, `loadPassages` 는 deps `[rows]` 클로저의
     **직전 커밋 rows** 로 중복 제거를 한다. 그래서 같은 지문을 두 번째로 적재하면
     전건 skip → `newRows.length > 0` 가드에 걸려 `setRows` 가 아예 안 불리고 행이
     빈 채로 커밋된다. 호출부가 passageId→localId 역조회로 기다리면 그 신호가
     영원히 오지 않아 **CTA 가 조용히 죽는다**(재발사가 한 번 걸러 한 번씩 무반응,
     N>1 이면 영구 교착). `replaceWithPassages` 는 이전 rows 를 읽지 않고 localId 를
     동기 반환하므로 역조회 핸드셰이크 자체가 존재하지 않는다.
   - **rows ≡ 선택 집합**이 이 절의 핵심 불변식이다. 워크스페이스가 사라져 무관한
     잔존 행이 있을 수 없으므로, "전 행 발사"인 `batchGenerateQuestions` 가
     **정확히 선택 집합에만** 작용한다(구 설계에서 이것이 위험했던 이유가 소멸).
   - 선택 N>1 이면 모달 푸터 발사는 batch 경로로 간다(E18-e).
4. **Esc 1중(§3.8.7) 양방향** — 워크북 CTA 는 진입 초입에 `closeGenModal()`,
   실전 CTA 는 진입 초입에 `onCloseWorkbookModal?.()`(오케스트레이터의
   `setSheetPassages(null)` — additive prop, useCallback 안정 참조)를 부른다.
5. **선택은 발사 성공 시에만 청산한다.** 모달을 취소했는데 선택이 사라지면 재시도가
   불가능하다(구 `handleLoadSelectedToWorkspace` 는 담는 즉시 청산했다 — 그 계약은
   폐기). 도시에 발행 집합(§3.10.11-a)은 "행 ⊕ 선택" 그대로 두되, 행이 헤드리스
   스테이징이 되었으므로 **실질 공급원은 선택**이다.

**E18-d 행 액션 = 「지문 수정」(구 「상세보기」) + 인라인 에디터.**

- listRows 행 우측 `CardDetailIconButton`(기본 Maximize2 · "상세보기")은 스튜디오
  한정으로 **PencilLine · "지문 수정"** 으로 바뀐다. **공유 컴포넌트
  (`src/components/ui/card-detail-icon-button.tsx`)의 기본값은 절대 건드리지
  않는다** — 22개 파일이 공유한다. 호출부에서 `icon`/`title`/`aria-label` 만
  오버라이드하고, 분기는 그리드 additive prop 으로 건다(E18-f).
- 클릭 = **모달 아님**. 그 행 바로 아래에 인라인 에디터가 펼쳐진다. 동시 확장은
  **최대 1행**(`expandedPassageId: string | null` 단일값).
- 에디터 본체는 **새로 만들지 않는다** — `WorkspacePassageRow` 의 `embedded`
  옵트인을 재사용한다. 선례 정본 = `authoring-passage-editor.tsx`(AI 지문 생성
  결과 카드가 이미 같은 방식으로 이 편집기를 호스팅한다). 이로써 AI 복원 ·
  변형 지문 생성 · 앞 맥락 문단 추가(1~5문장 스테퍼) · 하이라이트 백드롭 4겹 ·
  undo/redo · 단어 수 · 고친 자리 diff 가 **전부 같은 코드로** 딸려 온다.
  - ⚠ 복제 금지 근거: 편집기 본체는 선택 무대·백드롭 좌표 계산이 맞물린 1,000줄
    이며, 한 벌 더 만들면 "여기서만 하이라이트가 밀린다" 계열로 갈라진다
    (workspace-passage-row.tsx:334-341 · authoring-passage-editor.tsx:11-15).
  - ⚠ `embedded` 를 반드시 켠다 — 끄면 `maxHeight: calc(var(--ws-body-h,600px) - 130px)`
    가 걸려 `WorkspaceShell` 밖에서 카드가 ~470px 에 잘린다.
- **저장은 명시적 버튼**(사용자 확정). `embedded` 의 `footer` 슬롯에 저장 바를
  그린다: 「저장」(dirty 일 때만 활성) + 「되돌리기」(원본 복원) + 「닫기」.
  저장 = **전용 액션 `updatePassageBody(passageId, { content })`** → 성공 시
  로컬 `setPassages` 반영 + `savedContent` 갱신.
  - ⚠ **`updateWorkbenchPassage` 를 쓰면 안 된다**: 그쪽은 `schoolId` 를
    `data.schoolId && … ? data.schoolId : null` 로 계산해 **미전달 시 null 을 실제로
    기록**한다(undefined 가 아니라 null 이라 Prisma 가 무시하지 않는다) — 본문만
    고치려다 학교 연결이 지워진다. `updatePassageBody` 는 `renamePassage` 와 같은
    관용구(academyId 스코프 `updateMany`, 지정 필드만 기록)의 본문 판이다.
  - **제목은 이 편집기가 소유하지 않는다** — 행의 연필(`renamePassage`)이 정본이고
    저장 payload 에 제목을 싣지 않는다. 편집기가 제목 사본을 들면, 편집기를 열어
    둔 채 행에서 개명했을 때 저장이 그 개명을 되돌린다(스테일 덮어쓰기).
  - 미저장 상태로 접으려 하면 확인을 거친다(작업 유실 방지). ⚠ 확인 관문은
    편집기 내부 「닫기」뿐 아니라 **부모가 몰고 가는 접기 경로**(아이콘 재클릭
    토글·다른 행 펼침·행 더블클릭/Enter)에도 걸어야 한다 — 편집기의 `onDirtyChange`
    업링크를 부모가 받아 같은 확인을 묻는다(적대 검수 확정 critical).
  - 저장 전에는 DB 가 바뀌지 않으므로 AI 복원·변형을 마음껏 실험하고 버릴 수 있다.
- **편집 본문과 생성 대상의 정합**: 저장하면 원본 Passage 본문이 바뀌므로, 이후
  생성(워크북·실전)은 자동으로 편집본을 쓴다. 구 워크스페이스의 "편집분은 발사
  직전 변형본으로 저장" 우회(§3.8.6)는 불필요해져 폐기한다. **미저장 편집분은
  생성에 반영되지 않는다** — 이것이 명시적 저장 모델의 계약이다.

**E18-e 다지문 발사 의미론.**

- 워크북: 선택 N개 전량을 한 모달이 배치 처리한다(모달 기존 계약).
- 실전: 모달은 단일 행 기준 UI 다. 선택 N>1 이면 **모달에서 정한 같은 설정을 N개
  지문 전부에 적용해 발사**한다(`batchGenerateQuestions` 경로 — rows ≡ 선택이라
  안전). 선택 1개면 기존 단건 경로(`handleGenerateActiveRow`) 그대로 — 바이트 동일.
- 훅 변경은 **additive 1건**: `UseStudioQuestionGenArgs.directTargetLocalIds?:
  string[]`. 미전달/길이≤1 이면 기존 코드 경로와 완전히 동일하다.

**E18-f 공유 그리드(`PassageCardGrid`)는 additive prop 3종만.** 미전달 시 기존
7개 호스트(generate-page-client · passage-registration-client ·
embedded-question-bank · similar-question-generator-client ·
tutor-program-builder-client 등)의 렌더 결과가 **바이트 동일**해야 한다.

| prop | 타입 | 기본 | 의미 |
| --- | --- | --- | --- |
| `rowPrimaryAction` | `"detail" \| "edit"` | `"detail"` | listRows 우측 아이콘 버튼의 정체 |
| `onEditPassageInline` | `(p: PassageItem) => void` | – | edit 모드 클릭 핸들러 |
| `renderRowExpansion` | `(p: PassageItem) => ReactNode` | – | 행 아래 확장 노드 |

- 분기는 **listRows 분기의 CardDetailIconButton 한 곳(passage-card-grid.tsx:1809-1816)
  에만** 건다. 같은 파일의 모바일 행(1909)·데스크톱 카드(2139) 호출부는 손대지 않는다.
- `rowPrimaryAction === "edit"` 이면 행 더블클릭·Enter 도 상세 모달 대신 인라인
  토글로 재바인딩한다(같은 행에 두 의미가 공존하면 거짓말이 된다).

**E18-g 인라인 확장 노드의 마운트 위치와 격리(실사고 예방 4종).**

확장 노드는 **행 루트 div 의 형제**로, 같은 그리드 셀 흐름의 바로 다음 항목으로
그린다(행 안에 넣지 않는다). 근거 4가지:

1. 행 루트가 `overflow-hidden` — 안에 넣으면 에디터의 절대배치 팝오버·툴팁이 잘린다.
2. 행 루트가 `flex-row flex-wrap items-center` — 전폭 자식이 래핑된 flex 아이템으로
   앉아 레이아웃이 무너진다.
3. 행 루트에 `data-drag-item-id` 가 있어 마키(DragSelect) 히트 사각형이 곧 행
   `getBoundingClientRect()` 다 — 안에 넣으면 에디터 높이만큼 히트 영역이 부풀어
   무관한 드래그가 이 행을 선택한다.
4. 행 루트 `onClick` = 선택 토글, `onDoubleClick` = 상세 열기, `onMouseDown` =
   `preventCardDoubleClickTextSelection`(더블클릭 시 `preventDefault`) — 안에 있는
   textarea 는 타이핑 중 선택이 토글되고 더블클릭 단어선택이 죽는다.

그럼에도 확장 노드 루트에는 방어를 **전부** 건다:
`data-card-click-ignore="true"` · `data-drag-select-ignore="true"` ·
`onMouseDown`/`onClick` stopPropagation.

**E18-h 성능 계약("완전 부드럽게" 요구의 실체).**

- 확장 노드는 `expandedPassageId === p.id` 인 행에서만 **생성**한다(미확장 행 비용 0).
- 본문의 진실은 **에디터 어댑터 로컬 state** 다. 부모(그리드·라이브러리 판)는
  타이핑마다 리렌더되지 않는다 — `PassageCardGrid` 는 memo 도 가상화도 없고 행마다
  `JSON.parse(analysisData)` 를 돌리므로, 타이핑이 부모까지 올라가면 즉시 버벅인다.
  부모 통지는 **저장 시점 1회**뿐이다(authoring-passage-editor.tsx:26-29 계약 승계).
- `renderRowExpansion` 은 `useCallback` 으로 참조 안정화한다(memo(LibraryPane) 방어선).
- 펼침 모션은 `grid-rows-[0fr]→[1fr]` 보간(높이 auto 애니메이션의 정본 관용구,
  §3.10.17 계열 선례) + `motion-reduce` 존중. 접힘 상태 노드에는 `inert`.

**E18-i 폐기되는 기존 문장(스펙 정합).** 아래는 이 절로 **거짓이 된다**:
§3.8.2 워크스페이스 재진입 유일 경로 · §3.8.5 "그리드 CTA = 워크스페이스에 담기로
일원화" · §3.8.6 "생성 진입은 전부 워크스페이스 행 CTA 2분기" · §3.9v2 하단 일괄
CTA 잔여 서술 · §3.10.17-h 워크스페이스 필 존치. library-pane.tsx 파일 헤더 주석의
동일 서술도 함께 개정한다.

**E18-j 검증 게이트(이 절 전용).**

1. `npx tsc --noEmit` 0건(변경 전 기준선도 0건 — 계기 음성테스트 완료).
2. 행동 게이트(Playwright): ① 선택 0 → 두 CTA 가 `aria-disabled="true"` 이고 클릭 시
   행 글로우 발생 ② 선택 1 → 두 CTA 활성 + `1개` 칩 ③ 「실전 문제 생성」 클릭 →
   실전 모달 오픈(오버레이 미출현) ④ 「학습 워크북 생성」 클릭 → 워크북 모달 오픈
   ⑤ 「지문 수정」 클릭 → **모달 0개** + 인라인 에디터 출현(AI 복원 버튼 · 앞 맥락
   문단 추가 · textarea · undo/redo · words 푸터 전부 가시) ⑥ 지문관리 화면 어디에도
   "워크스페이스" 문자열이 없음 ⑦ 타 호스트 무회귀(문제 생성 페이지 상세보기 유지).
3. 회귀 전판 재주행: behavior-exam-studio · behavior-overhaul2 · behavior-class-rail ·
   probe-polish-v23 · probe-builder-payload.

#### 3.10.19 학습지 3상품 생성 전환 + 도시에 「학습지」 섹션 (E19 — 26-08-15 사용자 지시)

> **이 절이 §3.4·§3.7.1·§3.8.7·§3.9.3·§3.9v2.4(D4)·§3.9v2.6(D7)·§3.10.18 E18-b 와
> 충돌하면 이 절이 우선한다.**
> 지시 원문: "학습 워크북 생성 … 이런 모달이 뜨는데, 이게 아니라, 기본 학습지 혹은
> 파이널 원페이지 학습지를 생성하게 해줘. 기본 학습지나 원페이지 학습지가 생성되는
> 컴포넌트로 바꿔줘. … 그러면 이거[모듈 칩 필 행] 대신에 애초에 문제 생성에서 하는
> 것처럼 그 작업 큐들이 여기에 아주 깔끔하게 생성 큐가 돌아가도록 해주는거야. …
> 학습지가 다 만들어지면 여기로 들어와지는 느낌이야. … 일단 기본 학습지 생성에서
> 그 실전 학습지 포함 선택도 같이 가능하게 해줘."

---

**E19-0 무엇이 바뀌는가 (한 문장).**
클래스 스튜디오의 생성 단위를 **「학습 모듈 7종 체크박스(섹션 종량제)」에서
「학습지 3상품 라디오(기본 / 실전 학습지 포함 / 파이널 원페이지)」로 전환**하고,
도시에 카드의 회색 모듈 칩 벽을 **「학습지」 섹션(생성 큐 → 완성 학습지 착지)**으로
교체한다.

**[무효화 조항]** 이 절은 다음을 명시적으로 폐기한다:
- §3.7.1 모듈 선택 시트의 7종 체크박스 + 섹션 종량제 가격 배지 — **스튜디오 표면에서**
  폐기(라이브러리 함수 `module-sections.ts` 는 존치: 도시에 ready 칩 판정이 계속 쓴다).
- §3.8.7 / §3.9v2.6(D7) 의 워크북 모달 본문 계약(`role="checkbox"` ·
  `data-workbook-module` 그리드 · `selectionCost`/`PriceBadge` 조합 가격 ·
  실전 문제(exam) 상호배타 특례 · CTA 라벨 「지문 N개 생성 시작」) — 전량 재정의.
  **셸 규격(fixed inset-0 z-50 · slate-900/40 backdrop-blur-[2px] · max-w-[1200px] ·
  sm 미만 전면 시트화 · 헤더 지문 팝오버 · aria-disabled CTA 관용구)은 그대로 승계**한다.
- §3.9.3 / §3.9v2.4(D4) 도시에 Sec「학습 모듈」의 **미보유(회색) 칩 7개 상시 노출**과
  `IDLE_CHIP_TITLE = "분석 후 사용할 수 있습니다"` — 폐기.
  **보유(ready) 칩의 미리보기 버튼 승격(ModulePreviewSheet)은 존치**한다.
- §3.10.18 E18-b 하단 CTA 라벨 「학습 워크북 생성」 → **「학습지 생성」**으로 개명
  (아이콘 `BookOpen` · title 문구도 함께 교체). 「실전 문제 생성」 버튼은 **불변**.

**[무회귀 불변식]** 이 개편은 다음을 **한 바이트도** 바꾸지 않는다:
- 학습지 생성 페이지(`passage-registration-client.tsx` 계열)의 3상품 발사 경로.
- `usePassageQueue` / `buildAnalysisRequestBody` / fast 라우트의 요청·응답 계약.
  (스튜디오는 **기존 필드만** 쓴다 — 새 서버 필드를 만들지 않는다.)
- `launchModules`(섹션 종량제) 함수 자체 — 호출부가 사라져도 **삭제하지 않는다**
  (영속 스탬프 복원분의 `modules` 배열 호환·§3.4 지문 스튜디오 표면 존치).

---

**E19-1 상품 정본 (3종 — 이 표가 가격·조합·라우팅의 단일 진실원).**

| id | 라벨 | 부제(정본) | 단가/지문 | 요청 필드 | 산출 행 |
| --- | --- | --- | --- | --- | --- |
| `basic` | 기본 학습지 | 원문 필기 캔버스 · 논리 구조 · 요약 · 어법 · 출제 포인트 · 어휘 · 구문 분석 | ◈5 | `includeWorksheet:false` | `PassageReport(PRIME)` |
| `practice` | 실전 학습지 포함 | 기본 구성 + 어법 선택 워크북 · 어휘 빈칸 · 배열 영작 + 수능형 추론 5문항 | ◈10 | `includeWorksheet:true` | `PassageReport(PRIME)` (실전 섹션 포함) |
| `final` | 파이널 원페이지 | 시험 직전 족집게 · 손필기 원문 분석 · 유형별 출제 포인트·함정 · A4 딱 1장 | ◈5 | `finalOnepage:true` | `PassageReport(PRIME_FINAL)` |

> 각주: 1장 = 생성 산출 본편 시트. 사용자가 덧붙인 활동·웹툰 별지는 별개(파이널 스펙 F1 개정·§6-3, E23). 상품 라벨 자구는 불변.

- 라벨·부제 문자열은 `passage-input-stack.tsx:454-477` 정본을 **자구 그대로** 쓴다
  (두 표면이 갈리면 같은 상품이 다른 물건으로 보인다). 단가는 임의 숫자 금지 —
  `PASSAGE_ANALYSIS_BASE_CREDIT_COST` / `PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST`
  조합으로만 산출한다(`getPassageAnalysisCreditCost({includeWorksheet})`).
- **조합 금지(서버 강제)**: `finalOnepage` 는 `includeWorksheet` · `targetSections`
  어느 쪽과도 함께 실을 수 없다(fast/route.ts:291-303, 400). 3상품 라디오는 정확히
  하나만 선택되므로 클라이언트에서 조합이 발생할 수 없다.
- **`targetSections` 절대 금지**: 스튜디오 학습지 발사는 **전체 분석 경로**다.
  `targetSections` 를 실으면 `final` 이 400 으로 죽고 `practice` 도 400 으로 죽는다.

**E19-2 지문별 자격·가격 판정(서버 진실원).**

새 서버 액션 `getStudioSheetStates({ passageIds })` (`src/actions/studio/worksheets.ts`)
가 지문당 아래를 내린다. **모달의 가격 표기와 실제 청구가 어긋나면 안 되므로 판정
술어는 fast 라우트와 동일 구현을 쓴다.**

```ts
export interface StudioSheetState {
  passageId: string;
  /** 국어 지문 — practice·final 불가(fast/route.ts:317-329 가 400) */
  korean: boolean;
  /** 활성 PASSAGE_ANALYSIS 잡 존재 — 발사 제외(지문당 동시 1잡) */
  analyzing: boolean;
  /** PRIME 행 보유(기본 학습지 존재) */
  hasBasic: boolean;
  /** PRIME_FINAL 행 보유(파이널 존재) */
  hasFinal: boolean;
  /** 실전 섹션 보유(worksheet-grade — §3.4 특례 술어와 동일) */
  hasPractice: boolean;
  /**
   * basic 재요청이 **캐시 단락으로 무과금**인가. fast/route.ts:937 술어의 정확한
   * 미러: PassageAnalysis 존재 && contentHash === hashContent(content) &&
   * !isPartialAnalysisData(data) && (tone 부재 || tone === DEFAULT_ANALYSIS_TONE).
   * true 면 basic 단가 0 으로 표기한다(정확한 견적 — 추정 금지).
   */
  basicCached: boolean;
}
```

- `practice` · `final` 은 **항상 신선 생성 = 항상 과금**이다(fast/route.ts 가 캐시
  단락을 명시적으로 건너뛴다). 보유하고 있어도 0크레딧으로 표기하면 **거짓 견적**이다.
- 총액 = `Σ 발사대상 지문의 단가`. 발사 대상 = `!analyzing && (상품이 국어 지문을
  허용하거나 !korean)`.

**E19-3 모달 재정의 — `workbook-generate-modal.tsx` → 「학습지 만들기」.**

파일 경로·export 이름(`WorkbookGenerateModal`)·props 시그니처 8개는 **불변**
(오케스트레이터 배선 무접촉). 본문만 교체한다.

레이아웃(위→아래, §3.9v2.6 리듬 승계):
1. **헤더** — `FileText` 아이콘 + 「학습지 만들기」 + 지문 N개 칩(다지문=목록 팝오버,
   1지문=제목 토글 전문 팝오버). **현행 그대로 유지**.
2. **요약 스트립**(h-9 rounded-lg border-slate-200 bg-slate-50) — 좌: 「{상품명} ·
   지문 N개 · 총 K크레딧」(0이면 "추가 비용 없음"), 우: **「실제 생성 예시 보기」**
   (Eye size-3.5, text-blue-600) → `LearningSheetPreviewModal` 오픈.
   선택은 항상 1개이므로 「초기화」 버튼은 폐기한다(끌 수 있는 상태가 없다).
3. **대상 클래스** 셀렉트 — 현행 그대로.
4. **학습지 구성** 그룹 카드(h-10 slate 헤더 + p-2) — 안에 3상품 라디오.
   - 라디오 카드 토큰은 `passage-input-stack.tsx:491-533` 정본 이식:
     선택 = `border-blue-400 bg-blue-50/60 ring-1 ring-blue-200`,
     미선택 = `border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60`,
     라디오 닷 `size-3.5 rounded-full border-2`, 가격 칩 「지문당 ◈N」.
   - 그리드 `grid-cols-1 gap-2 sm:grid-cols-2`, `final` 은 `sm:col-span-2`.
   - **`data-sheet-variant={id}` 필수** — CTA 글로우 유도(`triggerHintGlowWithin`)와
     행동 게이트가 이 훅으로 잡는다(구 `data-workbook-module` 계승).
   - 국어 지문이 섞여 있으면 `practice`/`final` 카드에 캡션
     「국어 지문 N개는 이 상품을 지원하지 않아 제외됩니다」(text-slate-400 10.5px).
     **전 지문이 국어면 그 카드는 `disabled`**(점선 라디오 + `cursor-not-allowed`).
   - `basic` 카드는 `basicCached` 지문 수를 캡션으로 알린다
     「N개는 저장본을 불러와 추가 비용 없음」.
5. **푸터 CTA** — 3부(`FileText` + 라벨 + `CreditCostChip`). 라벨 정본:
   - 발사 대상 0 → 「학습지 생성」(비활 톤)
   - 총액 0 → 「지문 N개 바로 준비하기」
   - 그 외 → 「{상품명} · 지문 N개 생성」
   - `aria-disabled` 관용구 유지 — 비활 상태 클릭 시 `[data-sheet-variant]` 글로우.

**Esc 사다리(2중 → 3중)**: 미리보기 모달(z-[70]) 열림 → Esc 1회 = 미리보기만 닫힘.
그 다음이 지문 팝오버, 마지막이 모달 닫기. **이 게이트가 없으면 미리보기를 닫으려던
Esc 한 번에 모달 전체가 닫힌다**(§3.8.7 팝오버 사다리와 동형 근거).

**초기 선택값**: `basic` 고정. 학습지 생성 페이지의 localStorage 키
(`smoat:passages-create:sheet-variant`)를 **공유하지 않는다** — 다른 표면의 마지막
선택이 스튜디오의 과금 조작으로 새면 안 된다(표면 간 상태 누출 금지).

**E19-4 큐 엔진 확장 — `use-studio-queue.ts` (additive).**

```ts
/** 학습지 3상품 발사(전체 분석 경로 — targetSections 없음) */
launchSheets: (
  passages: StudioLaunchPassage[],
  variant: StudioSheetVariant,       // "basic" | "practice" | "final"
  classId: string | null,
) => { launched: number; skipped: string[] };
```

- promptConfig = `{ ...EMPTY_PROMPT, ...(variant === "practice" ? { includeWorksheet: true } : {}), ...(variant === "final" ? { finalOnepage: true } : {}) }`.
  **`targetSections` 키를 절대 넣지 않는다**(E19-1 마지막 항목).
- `StudioQueueStamp` 에 **additive** `sheet?: StudioSheetVariant` 를 더한다.
  스트립 라벨과 완료 후처리가 "무엇을 만들었는가"를 알아야 한다.
  영속(`loadPersisted`)은 `sheet` 부재를 허용한다(구 스탬프 무회귀).
- `launchModules` 는 **존치**(위 무회귀 불변식). 호출부만 사라진다.
- 진행 중 지문 제외 규칙(`pending`/`analyzing` 필터 + `skipped` 반환)은 그대로.

**E19-5 도시에 「학습지」 섹션 — 회색 칩 벽의 대체물.**

`Sec title="학습 모듈"`(passage-dossier-pane.tsx:671-718)을
**`Sec title="학습지"`** 로 교체한다. 내용은 위→아래 3층:

1. **생성 큐 행** — 이 지문의 `queueItems` 중 `kind ∈ {"modules","exam"}` 만.
   렌더는 **현행 큐 스트립 JSX(525-614)를 그대로 재사용**한다(별도 컴포넌트로
   추출해 두 자리에서 호출 — 토큰 복제 금지). `studio-strip-sheen` 시광 스윕 ·
   `QueueStreamLine` 라이브 꼬리 · `ElapsedClock` 전부 승계.
2. **완성 학습지 행** — `dossier.sheets` 배열(E19-6). 행 = `[종류 배지] 제목 …
   [상태 배지] [수정 시각]`, 클릭 = `/director/studio/c/{classId}/p/{passageId}`
   딥링크(`deployTarget.classId` — null 이면 링크 없이 정적 행).
   - 종류 배지 라벨은 `class-worksheets-pane.tsx:35-39` `PLAN_LABEL` 정본 재사용:
     `PRIME`→「기본 학습지」 / `PRIME_KO`→「국어 워크북」 / `PRIME_FINAL`→「파이널 원페이지」.
   - 상태 배지는 같은 파일 `STATUS_BADGE` 정본 재사용.
   - **방금 착지 글로우**: 큐 항목 소멸 직후 재조회로 새로 등장한 행은
     `studio-fresh-glow`(문항 행 선례)를 1회 입힌다.
3. **보유 모듈 칩** — `analysis.readyModules` 의 **보유분만**(미보유 회색 칩 폐기).
   `hasExam` 이면 「실전 문제」 칩 추가. 전부 `MODULE_CHIP_BUTTON`(미리보기 승격).
   보유 0이면 이 층 자체를 렌더하지 않는다.

**빈 상태**(큐 0 + 학습지 0 + 보유 칩 0):
`「아직 만든 학습지가 없습니다」` (text-slate-400 11.5px, py-1) 한 줄.
회색 칩 7개를 되살리지 않는다 — 그것이 이 개편이 없앤 소음이다.

**스탯 그리드 「학습 모듈 N/7」** → **「학습지 N」**(= `sheets.length`)로 교체한다.
7 고정 분모는 모듈 체크박스 시절의 유물이라 상품 축과 어긋난다.

**문항 계열 큐(`kind === "questions"`)는 현행 위치(스탯 그리드와 CTA 행 사이)에
그대로 남긴다** — 학습지와 문제는 다른 산출물이고, 한 자리에 섞으면 사용자가
"내 학습지가 어디 갔나"를 다시 묻게 된다.

**E19-6 도시에 서버 계약 — `PassageDossier.sheets` (additive).**

```ts
export interface DossierSheetRow {
  reportId: string;
  /** "PRIME" | "PRIME_KO" | "PRIME_FINAL" */
  planMarker: string;
  title: string;
  /** "DRAFT" | "PUBLISHED" | "ARCHIVED" */
  status: string;
  updatedAt: string; // ISO
}
```

`actions/studio/dossier.ts` 의 `Promise.all` 배열에 질의 1건을 **추가**한다
(`generationPlan: { in: PRIME_REPORT_MARKERS }`, `deletedAt: null`,
`orderBy: { updatedAt: "desc" }`, `take: 10`, **`pages`/`theme` select 금지 — 수 MB**).
기존 `report` findFirst(PRIME) 는 **분석 상태 판정용으로 존치**한다(술어 변경 금지).

**E19-7 완료 → 착지 배선.**

기존 `activitySig` 소멸 전이 감지(studio-home-client.tsx:1293-1311)가
`fetchDossier(pid, {silent:true})` 를 이미 호출하므로 **새 배선이 필요 없다** —
`sheets` 가 그 재조회에 실려 들어오면 행이 나타난다. 확인만 하고 손대지 않는다.

`onLaunched` 도 현행(모달 닫기 + `refreshAfterLibraryChange`) 유지. 발사 순간
`launchSig` 신규 토큰 전이가 해당 지문 카드를 자동 펼침하므로(§3.10.11-d)
사용자는 **모달이 닫히자마자 큐가 도는 카드**를 본다 — 이것이 지시의
"아주 깔끔하게 생성 큐가 돌아가도록"의 실체다.

**E19-8 하단 CTA 개명.**

`library-pane.tsx:1602` 「학습 워크북 생성」 → 「학습지 생성」,
title 「어휘·직독직해 등 학습 모듈을 만듭니다」 → 「기본 학습지·파이널 원페이지를 만듭니다」.
`class-worksheets-pane.tsx:219` 빈 상태 안내 문구의 「학습 워크북 생성」도 함께 교체
(**사실 정정은 전 표면 grep 스윕** — 낱말이 여러 파일에 복제돼 있다).

---

**E19-9 검증 게이트(이 절 전용).**

1. `npx tsc --noEmit` 그린 · `npm run lint` 신규/수정 파일 스코프 그린.
2. **행동 게이트**(Playwright, 실제 클릭): 클래스 선택 → 전체 자료 → 지문 2개 체크 →
   「학습지 생성」 → 모달에 `[data-sheet-variant]` 3개 존재 · `[data-workbook-module]`
   **0개**(구 계약 소멸 확인) → 각 상품 클릭 시 CTA 라벨·크레딧 칩 변화 캡처 →
   「실제 생성 예시 보기」 오픈 → **Esc 1회에 미리보기만 닫히고 모달은 살아 있음**.
3. **큐 게이트**: 실제 발사 1건(basic, 저장본 있는 지문 = 무과금)으로
   도시에 「학습지」 섹션에 큐 행이 뜨는지 → 완료 후 학습지 행으로 바뀌는지 캡처.
4. **무회귀 게이트**: `/director/workbench/passages/create` 3상품 라디오·발사 경로가
   픽셀·바이트 불변인지 확인(이 개편은 그 파일을 건드리지 않는다).
5. **회색 칩 소멸 게이트**: `span[title="분석 후 사용할 수 있습니다"]` 카운트 0.
6. 3뷰포트(1750/1024/390) 캡처로 라디오 그리드 붕괴·CTA 줄바꿈 없음 확인.

**E19-10 모달 마감 폴리시 (26-08-15 사용자 지시 + 실측 비교로 확정).**

- **「대상 클래스」 셀렉트 폐기.** 지시 원문: *"애초에 클래스를 선택한 것이 선행되는데,
  여기에서 클래스 선택을 왜 또 하지?"* 두 가지가 모두 참이라 셀렉트는 도움이 아니라 함정이었다:
  ① 스텝 게이트상 클래스 선택 없이는 자료 단계에 못 오므로 **항상 중복**이고,
  ② `onSelectClass` 는 오케스트레이터 `selectClass`(studio-home-client.tsx:370-382)라
  모달 안에서 값을 바꾸면 뒤에서 `loadChildren`·`loadStudents` 가 돌아 **방금 고른 지문
  선택이 발밑에서 갈린다**. → 대상 클래스는 **헤더의 읽기 전용 칩**(`Users` 아이콘 +
  클래스명, title「스텝 1에서 고른 대상 클래스입니다」)으로만 확인시킨다.
  `onSelectClass` prop 은 시그니처만 남기고 `@deprecated` — **되살리지 말 것**.
- **셸 폭 1200 → 940.** 1200 은 7모듈 3열 그리드를 담던 값이라 3상품 라디오에는 과해
  "넓고 납작한 바"로 읽혔다. 소스 무수정 CSS 오버라이드로 1200/940/820 을 실측 비교해
  940 확정(820 은 카드 부제가 한 칸 더 접혀 어절이 쪼개진다).
- **카드 부제 `break-keep` 필수** — 없으면 940 폭에서 「구문 분/석」처럼 어절 중간이 쪼개진다.
- 하단 CTA 명칭은 **「학습지 생성」 유지**(26-08-15 사용자 결정). 좌측 nav 의 동명 메뉴와
  겹치지만 같은 계열 기능이라 수용한다 — ⚠ 자동화 하네스는 이름으로 잡으면 nav 를 먼저
  집으므로 `button[title="기본 학습지·파이널 원페이지를 만듭니다"]` 로 특정할 것(실사고).

**E19-11 캐시 단락의 리포트 축 결손 (실측 확정 — critical).**

> **이 조항은 §3.4.1 및 fast 라우트 캐시 계약을 개정한다.**

fast 라우트의 전체-분석 캐시 단락은 `PassageAnalysis`(파생 캐시)만 보고 응답하면서
`PassageReport(PRIME)` — 사용자가 말하는 "학습지" — 는 **만들지 않는다**. 그래서
「분석 캐시는 신선한데 PRIME 행이 없는」 지문은 몇 번을 요청해도
`COMPLETED · cached=true · 차감 0` 으로 끝나고 학습지가 **영원히 생기지 않았다.**

- **실측**: 실DB 표본 400개 중 **208개(52%)** 가 이 상태였고, 스튜디오가 보내는 것과
  바이트 동일한 body 로 실제 POST 해 재현했다(`primeRows=0`, 잔액 불변).
- **수정**: 캐시 단락 조건에 **`primeReportExists` AND** 를 넣는다. 캐시 단락은
  "산출물이 이미 있을 때 재생성을 아끼는 것"이 목적이므로 산출물이 없으면 단락해서는 안 된다.
  적용처는 2곳 — `ai-jobs/passage-analysis/fast/route.ts` 와 `trigger/workbench-passage-analysis.ts`
  (같은 술어를 쓴다. 워커의 구 workaround `config.forcePrimeReport` 는 존치하되 이제 불필요).
- **재검증**: 동일 프로브가 수정 후 `primeRows=1 · 차감 5`, PRIME 보유 지문은 여전히
  `cached=true · 차감 0`(캐시 무회귀).
- **billing 거동 변화**: 지금까지 무과금·무산출이던 경로가 **과금·산출**로 바뀐다.
  누구도 "동작하던 무료 기능"을 잃지 않는다 — 애초에 산출물이 없었다. (사용자 승인 완료.)
- **모달 견적도 같은 축을 본다**: `basicCached` 는 **3축 AND** 다 —
  ① `hasBasic`(PRIME 행 보유) ② `!korean`(KO 게이트는 캐시 조회 **이전에** 무조건
  청구하고 자기완결 return 하므로 국어 basic 은 구조적으로 무과금 불가) ③ 캐시 술어.
  한 축이라도 빠지면 표기와 청구가 갈린다. **두 수정은 같은 커밋으로** — 하나만 넣으면
  증상이 「표기 5 / 무산출」 또는 「표기 0 / 실청구 5」로 옮겨갈 뿐이다.

**E19-12 적대 검수 확정 결함(수정 완료분 — 재발 금지).**

1. `StudioSheetState` 는 **pages 를 절대 select 하지 않는다.** 초판은 소비처 0인
   `hasPractice` 를 위해 PRIME `pages` Json 을 최대 100행 끌어왔다(§12 슬림 계약 자체 위반).
   보유 판정은 **행 존재**로 충분하다.
2. **보유 학습지 덮어쓰기 경고 필수.** 전체 분석 경로는 PRIME `pages` 를 **통째 교체**한다
   (부분 분석만 `mergeReportPreservingExtras` 로 보존) — 되돌릴 UI 가 없으므로 카드에
   amber 캡션「N개는 기존 학습지를 새로 만들어 덮어씁니다(편집분 소실)」를 띄운다.
3. **배포 CTA 사유 문구는 문서 축과 모순되면 안 된다.** 스탯·행은 PRIME **계열 전량** 축이고
   `deployDisabled` 는 PRIME **단일** 축이라, 파이널·국어만 만든 카드가 「학습지 1」 + 행 착지 +
   「AI 분석 후 배포할 수 있습니다」를 동시에 띄웠다. 게이트 술어는 그대로 두고 **title 만** 분기한다.
4. **상품 카드 `disabled` 축은 국어 전용.** 「발사 대상 0」으로 잠그면 전 지문이 *분석 중*일 때도
   사유 없이 잠긴다(그때 `koreanExcluded === 0` 이라 캡션도 안 붙는다).
5. **미리보기 「이 구성으로 생성하기」에도 카드와 같은 잠금 게이트**를 걸 것 — 아니면 잠긴 상품이
   선택돼 CTA 가 잠긴 막다른 상태가 된다.
6. **무과금 발사는 화면 변화가 0**이다(서버가 캐시로 즉시 COMPLETED — 큐가 1초도 안 돈다).
   총액 0 발사에 한해 `toast.success` 로 착지를 알린다. 유료 발사는 큐 스트립이 이미 말한다.
7. **`stamp.sheet` 는 담을 때와 꺼낼 때가 대칭이어야 한다.** 초판은 `loadPersisted` 에서만
   좁혀 담고 state 초기화가 옮기지 않아 그 좁힘이 사문이었다 — 새로고침 후 큐 라벨이
   상품명을 잃었다.
8. **상태 배지 정본은 `sheet-products.ts` 하나**(`SHEET_STATUS_BADGE`) — 값 복제 금지.

**E19-13 남은 권고(미적용 — 사용자 결정 대기).**

한 카드 안에서 「학습지」가 **문서 축**(행·스탯)과 **모듈 배포 축**(「학습지 보내기」 CTA)을
동시에 가리킨다. 검수 중재는 배포 CTA 를 「모바일 학습 보내기」로 개명해 축을 분리할 것을
권고했으나, 26-08-15 사용자 결정(「학습지 생성」 명칭 유지)의 취지를 넘는 개명이라 **보류**한다.


#### 3.10.20 지문 행 「생성 중」 활동 테두리 (E20 — 26-08-15 사용자 지시)

> "학습지나 문제를 생성하면 **그 지문 행에도** 살짝 테두리에 로딩되는 느낌을 주라.
>  학습지 생성도 문제 생성도 마찬가지."

발사 진행은 우측 도시에 큐 스트립(§3.10.6·§3.10.11-c)만 말했다 — **선택해서 발행된 지문**
에 한해서. 정작 사용자가 발사 버튼을 누르는 자리인 **중앙 지문관리 행**은 아무 말도 하지
않아, 발사 후 시선이 좌→우로 건너뛰어야 "돌고 있다"를 확인할 수 있었다. 행 자신이 말한다.

**E20-1 계약 (`src/lib/passage-activity.ts` — 호스트 중립).**

- `PassageActivity = { kind: "sheet"|"exam"|"questions"; label: string; jobs: number }`,
  `PassageActivityMap = ReadonlyMap<string, PassageActivity>`.
- `collectPassageActivity(entries)` — 평면 항목을 지문별로 접는다. **원천(잡) 1패스라
  O(잡)**이다(스트립의 지문×잡 find 루프와 정반대 방향 — 목록이 508행이라 이 방향만 싸다).
  대표는 `KIND_RANK`(sheet 0 < exam 1 < questions 2) 최소, 동률은 **먼저 들어온 것**.
- `passageActivitySignature(map)` — 참조 고정용. 값 객체까지 통째로 재사용해야
  `memo(PassageListRow)` 가 산다.
- **라이브 값 금지**가 계약이다. 경과 시계·스트림 꼬리는 이 계약에 **없다** — 초당 갱신이
  곧 초당 508행 리렌더다. 그 정보는 스트립(QueueStreamLine)이 정본으로 갖는다.

**E20-2 표시 (`src/components/workbench/passage-activity-ring.tsx` + globals.css).**

- `PassageActivityRing({ kind })` — 행/카드 루트 직속 오버레이(`absolute inset-0`,
  `pointer-events:none`, `aria-hidden`). 루트가 `relative overflow-hidden` 전제.
  prop 이 객체가 아니라 **원시 kind** 인 이유: 두 번째 호스트(도시에 접힌 카드)는
  `PassageActivity` 를 만들지 않고 자기 큐 항목에서 종류만 뽑기 때문(memo 생존).
- `PassageActivityLabel({ activity })` — 행 메타줄(등록 일시 옆). 링이 "돈다"를,
  라벨이 "무엇이"를 말한다. `max-w`+`min-w-0 truncate` 로 제목 블록을 압착하지 않는다.
- 모션 = **정적 마스크 링 + 자식 `::after` 의 `transform` 스윕**. `.learning-generating-glow`
  (conic `@property` 회전)를 재사용하지 **않은** 이유 둘: ①각도 애니메이션은 매 프레임
  리페인트라 가상화 없는 508행에서 동시 진행 행 수만큼 비용이 붙는다 ②그쪽은
  `border-radius: 0.75rem` 고정이라 `rounded-lg` 행에서 모서리가 어긋난다. 이쪽은
  `border-radius: inherit` 라 행·카드 어디에 붙여도 맞는다.
- 톤은 `--pa-track`/`--pa-comet` **두 변수**로만 결정(`data-activity-kind` 로 분기) —
  questions 만 인디고, 나머지는 스트립과 같은 파랑.

**E20-3 조립 (studio-home-client — 스트립과 원천은 같고 커버리지가 다르다).**

- 스트립 `queueItemsByPassage` 는 **도시에 발행 지문만**, 활동 표식은 **학원 전체**를 덮는다
  (행 목록은 선택되지 않은 지문도 그리므로). 그래서 별도 useMemo 다.
- 원천 3개는 스트립과 **같은 자구·같은 필터**를 쓴다: ①분석 큐(스탬프 필터 없음 — 다른
  표면 발사분도 "이 지문은 묶여 있다"는 사실) ②실전 워크북(로컬 전용) ③문항 세션 큐
  (**`isStamped` 필수** — §3.10.9 함정 5, 브리지 부재 = 제외가 자구).
- 분석 running 자구는 `analysisRunningLabel(stamp)` **한 곳**에서 나온다 — 스트립과
  행이 같은 함수를 읽는다(상품 개명 시 한쪽만 고쳐지는 표류 봉인).
- **실패는 행에 싣지 않는다(running 전용).** 행에는 해제 수단이 없어, 「해제 수단 없는
  경고색만 남기지 않는다」(§3.10.15 미검수 붉은 테두리 소등 · 영속 error 복원 폐기 L1-6)와
  정면으로 부딪힌다. 실패 자구·상세·재시도는 스트립이 정본.
- 도시에 카드는 **접힘일 때만** 링을 그린다 — 펼침에는 본문 큐 스트립이 이미 있어 중복이고,
  수백 px 카드를 두르는 링은 "살짝"이 아니다.

**E20-4 배선 (전부 additive — 미전달 호스트 렌더 경로 불변).**

`PassageCardGrid.rowActivity?: PassageActivityMap` → 행 루프에서
`rowActivity?.get(p.id) ?? null` → 링(루트 직속) + `PassageListRow.activity`(라벨).
`learningGeneratingPassageIds`(지문등록 화면의 초록 conic 채널)와 겹치면 **기존 채널이
이긴다** — 선주민 우선이고, 두 모션이 겹치면 테두리가 두 겹으로 돈다.

**E20-5 게이트 (`.tmp-studio-qa/probe-row-activity*.mjs` — 크레딧 0).**

실제 발사 없이 `ai-jobs` 폴링 응답만 가로채 전 경로(폴링 → 큐 → 활동 인덱스 → 링)를 태운다.
26-08-15 실측 전항 통과: 링 기하(행 테두리 안쪽 1px·반경 10px 일치)·대상 행에만(stray 0)·
`pointer-events:none`·잡 소멸 시 소등·무스탬프 문항 잡 차단·동시 2건 대표 선정("외 1")·
**508행에서 진행 잡 유무 롱태스크 0/0**(시그니처 메모 생존)·`transform` 단독 애니메이션·
reduced-motion 정지 폴백·도시에 접힘/펼침 불변식.

> ⚠ 소등 검사는 그냥 기다리면 안 된다 — `adaptive-poll` 이 시그니처 무변동에 5s→5분으로
> 백오프한다. `visibilitychange` 를 쏴서 즉시 폴링시키는 것이 정본 자구다.


#### 3.10.21 학습지 조판 (E21 — 26-08-17 사용자 지시)

> "학습지 행을 클릭하면 지문 스튜디오로 **가버린다**. 내가 원하는 건 이게 아니야.
>  문항 행처럼 [모바일 배포][학습지 조판] 두 버튼이 뜨고, 학습지 조판을 누르면
>  학습지 관리 탭으로 가서 **시험지 조판처럼** 우측 그 자리에 조판이 뜨는 것.
>  기존 그 **모달 컴포넌트를 그대로** — 학습 활동 패널·페이지 레일·편집/설정 탭 전부
>  살아 있는 채로, 모달이 아니라 우측 섹션에서. 그리고 여러 학습지를 추가하면
>  **A 지문 학습지 뒤에 B 지문 학습지가 실시간으로 이어붙어야** 한다.
>  어느 폭에서든 찌그러지거나 잘리면 절대 안 된다."

§3.10.13(문항 체크 → 실행 바)·§3.10.17(인-플로우 시험지 조판)이 **문항 축**에 준 것을
**학습지(문서) 축**에 그대로 준다. 시험지 조판이 `ExamPaperBuilderClient` 를 additive prop
으로만 임베드했듯, 학습지 조판은 `AnalysisReportEditor`(= 학습지 모달의 본체)를 additive
prop 으로만 임베드한다. **편집기 재작성 0 · 독립 라우트(지문 스튜디오·학습지 생성 모달)
렌더 경로 불변**이 이 절의 최상위 판정 기준이다.

##### E21-0 최상위 계약 — 조판은 합성 **뷰**이지 합성 **문서**가 아니다

N개 학습지를 한 레코드로 저장하는 길은 **영구히 없다**. 근거 2건(코드 확정):

- `schema.ts:1016`·`1062` `sections: z.array(analysisSectionSchema).min(1).max(12)` —
  문서당 5~7섹션이라 N=2 부터 저장·배포·학생 노출 관문이 전부 막힌다.
- `section-slots.ts:81` `const findIdx = (k) => report.sections.findIndex(s => s.kind === k)`
  — 슬롯을 **kind 첫 occurrence** 로만 잡으므로, sections 를 이어 붙여도 **두 번째 문서는
  슬롯이 한 개도 생성되지 않아 아예 렌더되지 않는다**.

→ 따라서 **저장은 끝까지 문서별 PATCH `/api/workbench/passage-reports/prime/{passageId}`**
이고, 조판 표면은 「편집 중인 활성 문서 1개 + 읽기전용 부착 문서 N개」를 **1 par-root ·
1 페이지네이션**으로 합성해 보여 준다. 이 사실을 헤더가 **상시 문자로 고지**한다
(「편집 중: {문서명} · 부착 {n}건 · 저장 대상은 현재 문서」). 고지 없는 합성은 즉시 신뢰 사고다.

기각된 대안 2개(재검토 금지):
- **sections 병합** — 위 2건으로 사망.
- **par-root 세로 스택** — `report-styles.ts:1878-1885`
  `.par-root:not(.par-cover-preview):not(.par-print-exclude){position:absolute!important;left:0;top:0}`
  때문에 다중 루트는 인쇄에서 같은 좌표에 겹친다(26-08-11 21루트 백지 실측 이력이 주석에 있음).

##### E21-1 합성 파이프라인 (`analysis-report/compose/` 신설 — 순수층)

`ReportPages` 는 상위 계산 `flowItems` 주입구를 **이미 갖고 있다**(`pages.tsx:30-39`) —
스트림만 이어 붙이면 A4 분할·러닝헤더·인쇄는 공짜다. 절차를 이 순서로 고정한다.

1. 문서별 `reportFlowItems(doc.report, undefined, perDocCache)` — **SectionFlowCache 는
   docKey 마다 분리**(슬롯키가 `sec:{si}:{key}` 라 문서 간 충돌). 캐시는 호스트가
   `Map<docKey, SectionFlowCache>` 로 소유 → 활성 문서 타이핑 시 부착 문서 재계산 0.
2. 문서별 `visibleFlowItems(doc.report, docNatural)` **선적용** — 각자의 blockOrder/hidden 으로
   자기 문서만 정리한다.
3. 부착 문서 전 아이템에 **접미** 네임스페이스 + `sectionIndex += (docIndex+1)*1000`.
4. 각 부착 문서 첫 아이템에 `breakBefore = true`(`items.ts:216 || !!it.breakBefore` 가
   blockMeta 경유 없이 받는다 — 더미 spacer 삽입 금지).
5. 활성 문서의 **정답 페이지 아이템에도** 접미를 적용해 `isActivityAnswerId` 판정을
   무력화한다. 안 하면 `items.ts:84-88` 이 활성 정답지만 **묶음 전체의 맨 끝**으로 뽑아
   A 정답지가 C 문서 뒤에 붙는다. 접미 후엔 composite blockOrder 가 순서를 지배해
   문서별 정답지가 각 문서 끝에 앉는다(answer 아이템은 `describeItems` 제외 대상이라
   접미해도 편집 계약 무손상).
6. `pagesReport` 조립 —
   `blockMeta = {...활성, ...부착 접미 리맵 병합}` · `blockOrder = [...applyBlockOrder(활성), ...부착 순차]`.
7. 반환 직전 개발 모드 `assertUniqueIds`.

**id 네임스페이스는 반드시 접미 `__d{n}`. 접두 금지** — 파괴 게이트가 전부 앞자리 앵커다:
`editor-mutations.ts:49,261` `/^s(\d+)-(.+)$/` · `items.ts:13` `id.startsWith("c-")` ·
**`items.ts:102` `isAutoFitItem = /^s\d+-annotated-snt\d+/` 는 `packFlow` 내부(`items.ts:206`)라
부착 문서도 반드시 통과한다.** 접두를 쓰면 부착 문서 필기분석 조각이 autoFit 판정을 잃고
저장된 stale `breakBefore`/`minHeight` 가 되살아나 **그 문서만 페이지가 폭발한다**.
docKey 문자셋은 `[A-Za-z0-9_]` 강제(`AnalysisReportEditor.tsx:745-747` scrollToBlock 이
`CSS.escape` 없이 선택자를 문자열 결합).

`nsFlowItem` 은 **`id`·`editId`·`orderId` 3필드 전부** 접미한다. 한 필드라도 새면
`pages.tsx:100-104` heightById(**먼저 만난 것 우선**)와 `pages.tsx:58` itemsById(**나중 것이 이김**)의
규칙이 서로 반대라 측정과 렌더가 다른 블록을 가리켜 **페이지 넘침으로만** 드러난다.

**수용된 한계**: `tableColWidths` 는 group 키가 wrap 종류(grammar/exam/vocab)라 id 축이
아니어서 문서별 분리가 원리적으로 불가하다 — 부착 문서는 활성 문서 열 너비를 상속한다.

##### E21-2 편집기 additive (기존 6 prop 무접촉 → 소비처 5곳 바이트 동일)

`composeDocs?` · `embed?{storageNamespace,initialCollapsed,narrow,printRootId,printExclude}` ·
`onRequestActiveDoc?` 3개만 추가하고 합성 로직은 전부 순수층에 둔다(배선 순증 ~50줄 상한).

- `EditorCanvas` 에 `report={composed?.pagesReport ?? report}` · `flowItems={composed?.flowItems ?? natural}`
  — **편집 상태 `report`(useReducer present)는 절대 건드리지 않는다.**
- **썸네일 소스는 합성분과 합류해야 한다** — 안 하면 pageList 엔 부착 문서 페이지 id 가 있는데
  `thumbItemsById` 는 활성 문서 것뿐이라 **부착 문서 썸네일이 전부 빈 시트**로 뜨고
  coverFlags 가 어긋나 레일 페이지 번호가 캔버스와 불일치한다.
- **descriptors(속성 패널·목차)는 `readOnlyFlowItems` 그대로 유지** — 부착 문서 블록이 섞이면
  활성 report 에 없는 id 를 편집하려 든다.
- **【P0】합성 모드에서는 `onDeletePage`/`onMovePage` 를 내리지 않는다(undefined).**
  `pages.tsx:215` PageControls 는 모든 페이지에 렌더되고, 부착 문서 페이지의 휴지통은
  `hideOrDeleteIds`(`editor-mutations.ts:289-303`)가 외래 id 에 대해 **활성 report 의 blockMeta 에
  `{hidden:true}` 를 써 넣는다**. `blockMeta` 는 `z.record(z.string(), …)`(`schema.ts:1020`)라
  키 제한이 없어 **스키마를 통과해 그대로 저장된다**. movePage 쪽은 조용히 무동작.
- **`isMobile`(`:586`)·`report-edit-styles` 의 1023.98px 미디어쿼리 계열은 건드리지 않는다** —
  훅만 바꾸면 JS 판정과 CSS 판정(`:15,237-240`·`:1208` 캐럿 핸들러 독립 재선언)이 갈라져
  「크롬은 숨었는데 인라인 편집은 pointer-events:none」 반쪽 상태가 난다.
- **학습 활동 팔레트는 파이널 원페이지 를 문서 종류로 게이트하지 않는다**(E23, 26-08-20 —
  KO 문서의 영어 전용 카탈로그 은닉은 별개 계약, koMode 유지) — 렌더·저장이 이미 문서
  종류 무관이기 때문: `assemble.tsx:373-395` customBlocks 루프는 finalOnly 무관이고, PATCH 자기감지
  (`schema.ts:563-565 isFinalOnepageReportShape` · `route.ts:102-106`)는 sections 만 봐서 활동·웹툰
  블록이 붙어도 PRIME_FINAL 행이 유지된다. 파이널에서는 **개별 게이트만** 건다 — 활동은
  `activityAvailabilityByKind` 가용성 판정, 단어 시험지는 소스(같은 지문 기본 리포트의 vocabulary
  섹션) 존재 조건.

##### E21-3 전역 오염 차단 (임베드 필수 4종)

| 오염원 | 증상 | 차단 |
|---|---|---|
| `id="exam-paper-print-root"` 하드코딩(`editor-canvas.tsx:77`) — 시험지 빌더(`:2897`)와 동일 | 시험지 조판이 숨김 마운트로 상시 보존되므로 DOM 에 2개 공존 → `use-paper-item-drag` 의 `getElementById` 가 첫 매칭만 잡아 **남의 캔버스를 오토스크롤** | `printRootId` prop(기본값 현행) → 학습지 조판은 `sheet-compose-print-root` |
| `printExclude` 미전달 — 편집기 루트는 **항상 인쇄 대상** | par-root 2개 공존 시 인쇄 백지 | `EditorCanvas` → `ReportPages` 패스스루, `active` 와 동기로 내림 |
| localStorage 폭 3키·패널 섹션 순서/접힘 2키 | 임베드에서 줄인 폭이 지문 스튜디오에 영구 누수 | `usePanelWidths(ns?)` + `reportEditorWidthKeys(ns?)` |
| `defaultApplied.v1`(passageId 배열) | **임베드가 어떤 지문을 먼저 열면 독립 라우트에서 그 지문에 기본 템플릿이 영영 자동 적용되지 않는다** | `hasAppliedDefaultFor(passageId, ns?)`/`markAppliedDefaultFor(…, ns?)` |

> **하지 말 것(검증 완료)**: `use-panel-widths.ts:97-99` 의 `document.querySelectorAll('[data-panel-key]')`
> 를 스코프로 좁히지 마라 — 편집기 키(rail/panel/activity)와 스튜디오 키(tree/dossier)는
> 교집합이 0이라 현행이 이미 안전하다. `pointercancel` 복구 경로도 `:143,166` 에 **이미 있다**.

##### E21-4 폭 무붕괴 — 컨테이너 접힘 사다리

편집기의 `isMobile` 은 100% 뷰포트(`matchMedia('(max-width:1023px)')`)이고 레일 표시는
Tailwind `lg:` 로 이중 게이트다 — **컨테이너가 아무리 좁아도 뷰포트가 넓으면 크롬이 전부
렌더된다.** 그래서 표면이 자기 컨테이너를 `ResizeObserver` 로 재고 접힘을 **강제**한다.

- 임계: `<1120` activity 접기 → `<880` panel 접기 → `<700` pages 레일 접기 → 전 구간 `narrow`.
- **`if (width <= 0) return;` 0가드 필수** — 숨김 서브트리(display:none)가 폭 0 을 물어 접힘이
  **편도 고착**한다(시험지 빌더 `:1964-1968` 선례).
- 세 레일은 접히면 각각 **20px 세로 탭**으로 수축하므로 크롬 하한 ≈ **60px** 이다.
  요구「레일 생존」과 요구「폭 무붕괴」가 양립한다. 캔버스는 `fitZoom` 하한 0.2 로 항상 살아 있다.
- `narrow` 는 셸 루트 `data-embed-narrow` 로 내려가고, `report-edit-styles.ts` 에
  **`.are-shell[data-embed-narrow]` 스코프 규칙만** 추가한다(비스코프 전역 규칙 신설 금지).
  대상: `editor-top-bar.tsx` 가 `sm:`(뷰포트 640px) 유틸로 라벨을 숨겨 **컨테이너가 좁아도
  뷰포트가 넓으면 장문 라벨이 남아 툴바가 넘치는** 유일한 미해결 지점.

##### E21-5 표면·행·오케스트레이터

> ⛔ **E24(§3.10.23)로 아래 「2표면」 중 두 번째 소유자가 무효** — `class-worksheets-pane.tsx`
> 는 **파일째 삭제**됐다. 학습지 평면 행의 현재 소유자는 「학습지 조판」 뷰의 병합 목록판
> `composer-list-pane.tsx`(문항 `q:` + 학습지 `w:` 단일 판, `lockedKind` 로 축 고정)다.
> **행 계약 자체(무롤 div 루트 · `data-drag-item-id` · chevron `<Link>` +
> `data-drag-select-ignore` · 본문 스팬 `cursor-pointer` 금지)는 한 글자도 안 바뀌었고**
> §3.10.23 E24-1-5 에서 무회귀 계약으로 재확인됐다.

- **행(2표면 공통)**: 도시에 Sec「학습지」행(`passage-dossier-pane.tsx:852-907`)과 학습지 관리
  평면 행(`class-worksheets-pane.tsx:233-263`) 둘 다 루트 `<Link>` → **무롤 `div` 로 강등**하고
  체크 실버튼(+체크 순번 숫자) · 우측 액션 [모바일 배포][학습지 조판] 을 붙인다.
  지문 스튜디오 이동은 **우측 chevron 을 작은 `<Link>` 아이콘으로 남겨** 근육기억을 보존한다.
  **anchor 제거는 부수효과가 아니라 전제조건** — `src/components/ui/drag-select.tsx:276` hardInteractive 에 `"a"` 가
  있어 조상에 anchor 가 있으면 마키 선택이 시작되지 않는다. 본문 스팬에 `cursor-pointer` 금지
  (CONTROL_CURSOR 게이트가 마키를 차단).
- **[모바일 배포]는 `PRIME` 행만 활성** — `deploy.ts:219-230 StudioDeployInput` 에 reportId 가 없고
  `deploy.ts:42-53 loadPrimeReport` 가 `generationPlan: PRIME_REPORT_MARKER`(단수)로 **행을 다시
  찾는다**. save-as 가 사본마다 새 passage 를 만들어 PRIME_KO/PRIME_FINAL 의 passageId 에는
  PRIME 행이 아예 없으므로, 열어 두면 「먼저 AI 분석을 완료해 주세요」라는 **오해를 부르는 실패**로
  끝난다. 정본 = `src/lib/studio/sheet-deploy-eligibility.ts` 1곳.
  (자구·정책은 도시에 「학습지 보내기」 CTA 의 기존 게이트와 **같은 계열**이다 — §3.10.19 E19-5.)
- **[학습지 조판]** → 학습지 관리 뷰 강제 전환 + `sheetComposeOpen`. 도시에서 발사해도 같은
  화면으로 수렴한다(§3.10.17-e (k) 문항 축 단일화와 동형).
  > ⛔ **E24(§3.10.23)로 목적지 이름이 무효** — 강제 전환 대상은 **「학습지 조판」 뷰**
  > (`[data-asset-view="sheet"]`)다. 「수렴한다」는 성질 자체는 오히려 **불변식으로 승격**됐다:
  > 조판 개방 함수는 (a) 자기 open 플래그와 (b) 자기 뷰 강제를 **한 커밋에** 한다(E24-0 ②-a).
- **오케스트레이터 소유가 계약**(`studio-home-client.tsx:1409-1414` 주석 — 우측 본문이
  aside/드로어 2트리에 렌더되어 별개 인스턴스가 된다): `sheetComposeOpen` ·
  `pickedSheets(Map, 삽입 순서 = 조판 순서)` · `activeSheetId`.
- **레이아웃 뒤집기는 신규 코드 0줄**: 기존 `composeVisible` 분기 2곳(중앙 `w-[420px] shrink-0` ·
  aside `flex-1`)을 `anyComposeVisible = composeVisible || sheetComposeVisible` 로 교체하면
  요구「좌측 컴팩트」가 그대로 성립한다.
- **조판 표면은 aside 한 곳에서만 마운트**(드로어엔 안내 문구) — 2인스턴스 금지 근거는
  `:1683-1688` 주석이 이미 명문화한 그대로(전역 DOM id·초안 경합).
- **클래스 전환 리셋 effect(`:1479-1482`)에 3상태 전부 합류** — 비대칭이면 A 클래스 학습지가
  B 클래스 조판에 남는다.
- `onDraftChange` 는 **넘기지 않는다**(`:232-234` 가 타이핑 1글자마다 발화 → 스튜디오 전역 리렌더).
- 저장·사본저장·실전학습지·인쇄 버튼은 **표면 헤더가 직접 렌더**한다 — 편집기 안에는 저장
  버튼도 Ctrl+S 도 없고 `onToolbarStateChange` 소비 호스트만 그린다.
- **웹툰 귀속 주의(E23)**: 조판의 지문 웹툰 생성은 활성 문서 passageId 로 발사된다
  (`sheet-compose-surface.tsx` 의 `passageId={activeDoc.passageId}` 전달 지점 — 줄번호는
  드리프트하므로 내용 앵커로 찾을 것). save-as 사본은 새 passage 이므로 **사본 파이널에서 생성한
  웹툰은 사본 지문에 귀속**되어 원본 지문 보관함에서는 보이지 않는다 — v1 은 스펙 주의로
  수용(UI 고지 후속).

##### E21-6 확정 정책 (감독 결정 — 심판 열린 질문 대응)

1. **모바일 배포 범위** = PRIME 한정 + 툴팁(위 근거). `StudioDeployInput` 확장은 배포 경로
   전체 회귀를 부르므로 v1 범위 밖.
2. **문서 상한 6** — `pages` JSON 이 수 MB 급이고 문서마다 JSX 1벌 + 측정 클론 1벌이 돈다.
   상향은 **실측 선행 필수**(무근거 상향 금지). 초과는 성공이 아니라 명시 실패.
3. **부착 문서 표지** = 그대로 둔다(문서 경계가 선명해진다). 대부분 문서는 `cover.enabled=false`
   가 기본이라 실사용 영향이 작다.
4. **활성 문서 전환** = v1 포함. 헤더 문서 칩 클릭 → dirty confirm → 편집기 `key` 교체.
   undo 히스토리·줌·활성 블록이 초기화된다는 사실을 confirm 자구가 말한다.
5. **인쇄** = 표면 헤더에 노출하되, 합성 par-root 1개 전제에서 **실측으로 검증**한다.
   `report-styles.ts:1887 .par-sheet:last-child{break-after:auto}` 가 편집 모드에서 모든 시트에
   매칭되는 **선행 결함**은 전역 CSS(학생 뷰어까지 닿음)라 스코프 최소 수정 외 손대지 않는다.
6. **AnalysisReportEditor 파일 분할**은 별건(이번엔 배선만).

##### E21-7 재발 금지 함정 (전부 코드 실측)

1. `applyBlockOrder`(`editor-mutations.ts:173-186`)는 order 에 없는 id 를 **자연 순서상 앞 이웃의
   저장된 위치 뒤**로 splice 한다 — 활성 문서가 blockOrder 를 한 번이라도 가지면 **부착 문서
   전체가 활성 문서 한가운데로 들어간다.** 에러 없음, 인쇄에서만 발견. → `pagesReport.blockOrder`
   사전 확정이 유일한 차단책(공유 파일 `pages.tsx` 무개변).
2. `heightById` 선점(먼저 만난 것) vs `itemsById` 후승(나중 것) — **규칙이 반대**라 id 중복은
   에러 없이 페이지 넘침·푸터 침범으로만 드러난다. → 3필드 접미 + `assertUniqueIds`.
3. `ResizeObserver` 0폭 고착(숨김 서브트리) → `width <= 0` early return.
4. 합성 모드 페이지 컨트롤이 `hideOrDeleteIds` 로 **활성 report blockMeta 를 오염**시키고
   스키마를 통과해 저장된다 → 합성 시 두 콜백 undefined.
5. `runs.tsx:32-34` 런 병합은 `(wrap, sectionIndex)` 쌍 비교 — 오프셋 없으면 A 의 s0 표와 B 의 s0
   표가 **한 표로 병합**된다.
6. deploy 는 passageId → PRIME 재조회라 non-PRIME 배포 불가(위 E21-5).
7. saveAs 성공은 **언마운트 시점에 `router.refresh()` 를 지연 발화**한다
   (`AnalysisReportEditor.tsx:1574-1579`) — 조판을 닫는 순간 스튜디오 상위 서버 트리가 리프레시된다.
   목록 재조회는 자체 reload 카운터로 하고 파급을 실측 확인할 것.
8. **【반증 완료 · 재조사 금지】「조판에만 생기는 빈 본문 페이지」는 존재하지 않는다** (26-08-18 실측).
   `nsAttachedFlowItem`(`compose/compose-ids.ts`)의 `showGrip:false` 가 `shells.tsx:75-81 Grip` 을
   봉인하는데 그 버튼 본문이 **글리프 `⠿`(U+283F)** 라, 부착 문서 페이지는 `.par-sheet-body` 의
   `textContent` 가 블록당 1글자씩 짧다. 그래서 **이미지 전용 페이지**(커스텀 `wrap:"image"` =
   지문 웹툰)가 단독에선 `bodyLen === 1`, 조판에선 `bodyLen === 0` 이 되어 **텍스트 길이 기반
   빈-페이지 검출기가 조판에서만 오탐**한다. 반증 근거: 3건 조판 34p = 단독 5p+5p+24p **완전 가산**
   (삽입 페이지 0), 문서 3의 페이지별 아이템이 단독 pi=0..23 ↔ 조판 pi=10..33 에서 접미를 뺀 값까지
   **1:1 일치**, 문제의 페이지는 양쪽 모두 같은 블록 `c-6e0f4c90-…` 이고 이미지도 정상 로드
   (naturalSize 2160×3840 · 렌더 556×989px · 본문 박스 695×996px = 전면 웹툰).
   → 빈 페이지는 텍스트가 아니라 **`.par-sheet-body` 자식 요소 수 / 렌더 박스 높이**로 판정할 것
   (`.tmp-worksheet-compose/_blank-dump.mjs`·`_blank-img.mjs`).

##### E21-8 게이트 (`.tmp-worksheet-compose/`)

`probe-sheet-compose.mjs` — ①행 2버튼 렌더·PRIME 외 배포 비활성 ②체크 → 우측 실행대
③조판 발사 → 학습지 관리 뷰(⛔ **E24(§3.10.23)로 「학습지 조판」 뷰 =
`[data-asset-view="sheet"]`** — 프로브 진입 셀렉터도 그 속성으로 이행됐다) + 우측 조판 +
중앙 420px + aside flex-1 ④**2번째 문서 체크 →
페이지 수 증가·문서 경계 새 페이지·부착 문서 썸네일 비지 않음** ⑤체크 해제 → 즉시 제거
⑥id 유일성 assert 무발화 ⑦4뷰포트(1280/1440/1720/2560) `scrollWidth == clientWidth` ·
크롬 겹침 0 ⑧접힘 사다리 실측 ⑨Escape·dirty confirm ⑩클래스 전환 청산 ⑪시험지 조판
무회귀(behavior-exam-studio 11/11) ⑫독립 라우트(학습지 생성 모달) 무회귀.
(E23 신설) ⑬파이널 활성 문서에서 학습 활동 패널 생존(`probe-sheet-compose` G14)
⑭파이널+활동 1블록 → `.par-sheet-cover` 1장 유지 + 총 시트 증가(`probe-final-activity` F2)
⑮파이널+웹툰 → 빈 페이지 오탐 0(`probe-final-activity` F3-b — 판정 축 = `.par-sheet-body`
자식 요소 수 + 렌더 박스 높이, E21-7 8항, 텍스트 길이 금지) ⑯팔레트 노출 후
4뷰포트(1280/1440/1720/2560) `scrollWidth == clientWidth`(`probe-final-activity` F6).


#### 3.10.22 조판실 — 문제·학습지 합본 조판 (E22 — 26-08-18 사용자 지시)

> "왜 니 마음대로 학습지 조판은 6장까지만 되는거야? 제대로 해결해.
>  문제 선택하면 실행 바 뜨는 것처럼 **학습지 선택해도 조판되게** 해줘.
>  그리고 **시험지 조판이랑 학습지 조판이 동시에 가능한 형태** — 애초에
>  **문제랑 학습지랑 같이 조판해버릴 수 있는 구조**를 만드는거지."
>
> 사용자 확정(질의 응답): 산출물 = **A4 한 묶음 합본 인쇄** ·
> 위치 = **자산 뷰를 통합하고 그 탭을 조판실로**.

##### E22-0 확정 계약 4개

1. **합본은 「한 묶음 인쇄」이지 「한 레코드 저장」이 아니다.** 학습지 문서 뒤에 문항이
   이어붙어 **A4 한 묶음으로 1회 인쇄**된다. 저장은 그대로 분리 — 학습지는 문서별 PATCH,
   문항은 시험지 세트. 문항은 **리포트 문서에 저장될 수 없다**(코드 확정:
   `schema.ts:660` `questions.max(8)` · `:331-341` no≤12·choices 2~6·explanation 필수 ·
   `:799-812` activityKind 닫힌 enum 12종 · `:815-826` activityItem 에 **선지 필드 없음**).
   → 문항은 **in-memory FlowItem, 읽기 전용**으로만 존재한다.
2. **자산 뷰에 「조판실」을 추가하고 문제관리·학습지 관리를 그리로 접는다**(2단 이행).
   > ⛔ **E24(§3.10.23)로 이 계약 2번만 무효** — 사용자가 "지금 내가 시험지 조판에 있는지,
   > 학습지 조판에 있는지 구분이 안 돼"라고 판정해 **「조판실」 필을 없애고 그 자리를 2필
   > `[학습지 조판 | 시험지 조판]` 로 교체**했다(최종 3필). 「2단 이행」과
   > `SHOW_LEGACY_ASSET_PILLS` 도 함께 소멸했다. **계약 1·3·4 와 합본 산출물 정의(A4 한
   > 묶음 인쇄)는 전부 유효**하며, 합본은 E24-1-1 에서 **최우선 무회귀 대상**으로 승격됐다.
3. **학습지 6장 상한 폐기.** 근거였던 「pages JSON 이 문서당 수 MB」는 **반증됐다** —
   실측 중앙값 **49KB** · 최대 458KB · 40건 합계 **1.9MB**. 렌더 곡선도 초선형이 아니다
   (조판 아이템 30→300, 토글 890ms→**883ms**; 아이템당 약 1.3ms). 하드 상한 대신
   ①서버 **요청 배치 상한 12** ②클라 청크 로딩 ③콘텐츠 축 **소프트 경고**(총 아이템 600 /
   A4 100p 초과 시 「무거워질 수 있습니다」 — **막지 않는다**).
4. **도시에 학습지 체크 → 하단 실행 바**(문항 축과 동형).

##### E22-1 문항 → FlowItem 변환 = 하이브리드 (신규 파일 3개, 공유 파일 개변 0)

- **데이터·인라인은 시험지 순수층 재사용**: `paper-item-utils.tsx` 의 `makePaperItem` ·
  `renderFormattedInline` · `renderQuestionTextInline` + `option-display.ts`
  (이 파일에 `"use client"` 가 없음을 확인 — 그대로 import 가능).
- **조판 껍데기는 리포트 `wrap:"ws-list"` 재사용**. 신규 wrap 금지 —
  `types.ts WrapKind` · `items.ts isStandalone` · `runs.tsx RunBlock` · `packFlow` 4개
  공유 파일이 무개변으로 남고, ACTIVITY_PAD 예산·`metaMinHeight=0`·페이지 경계 분할이 공짜다.
- **`a4-paper-page.tsx`(1630줄) 분해는 기각** — 문항 단위 export 가 없고(export 2개, prop 이
  이미 페이지네이션된 `pageColumns`), 독립 라우트 렌더 경로라 무회귀 위반이며,
  px 모델 페이지네이션을 mm 실측 파이프라인에 끌고 들어오는 엔진 이중화다.
- **합류 지점은 `buildComposedView` 안**(companions 루프 직후 · blockOrder 사전 확정 직전)이
  유일한 정답. 밖에서 append 하면 `applyBlockOrder` splice 폴백이 **문항 묶음을 활성 학습지
  한가운데로 빨아들인다**(에러 0 · 인쇄물에서만 발견).
- id 접두 **`qb-`**, 조각 `::p{n}`. 5대 판정을 전부 회피함을 확인:
  `/^s(\d+)-/` 불일치 · `startsWith("c-")` 회피 · `endsWith("-ans")` 회피(**`qb-…-ans` 금지**) ·
  `isAutoFitItem` 불일치 · `isComposedNsId`(`includes("__")`) — **`__` 절대 금지**.
- `sectionIndex` 는 `900_000 + i`(문서 stride 1000 과 영구 비충돌).

##### E22-2 재발 금지 함정 (정찰 오류 정정 4건 포함)

1. **`getExamPaperBuilderQuestionsByIds` 는 입력 id 순서를 보존하지 않는다**
   (`orderBy: [{starred:desc},{createdAt:desc}]`). 어댑터가 **ids 순서로 재정렬**하지 않으면
   체크 순번 배지와 인쇄 순서가 어긋난다.
2. **`makeLocalId` 는 `Date.now()+random`** — FlowItem id 로 쓰면 매 렌더 바뀌어
   `itemsById`/`heightById` 가 전부 미스, 「조용한 페이지 넘침」이 된다. 반드시 버릴 것.
3. **조각에 `.par-ws-question` 을 달지 마라** — 그 클래스는 `border+padding+break-inside:avoid`
   통짜 원자 박스다. 박스는 `runs.tsx` 의 `par-ws-block par-ws-run` 래퍼가 이미 제공하고
   **그 래퍼만 `break-inside:auto`** 라 페이지 경계에서 나뉜다.
4. **문항 조각은 전부 `showGrip:false`** — `worksheet-flow.tsx` 의 `showGrip: idx===0` 을
   그대로 베끼면 문항마다 그립이 남아 `onReorder` 가 활성 report 의 blockOrder 를 오염시킨다.
5. **시험지 클래스 어휘 반입 금지** — `exam-a4-page`·`exam-preview-*`·`continuation-hint` 및
   id `exam-paper-print-root`. `print-styles.tsx` 의 호스트 스코프 없는 `@media print` 가
   리포트 시트 안에서 297mm 강제·`transform:scale()`·강제 개페이지를 건다.
6. **`AnalysisReportEditor` 의 진짜 관문은 `composeActive`** — 이 값 하나가 6곳
   (`composeActiveRef` 관문 · railDeletePage · onDeletePage/onMovePage · composed ·
   composedThumb · flowItems)을 켠다. `composeDocs` 만 보면 「학습지 1 + 문항 N」에서
   문항이 화면에 아예 안 나온다.
7. **`composedThumb` 에도 문항을 전달**하지 않으면 레일 썸네일의 문항 페이지가 전부 빈 시트가 된다.

##### E22-3 조판 상호배제를 뷰 값에서 **명시 상태**로 이사 (최우선) — ⛔ **무효**

> ⛔ **E24(§3.10.23)로 이 절 전체가 무효(되돌려짐)** — `ComposeMode` 타입 · `composeMode`
> state · `setComposeMode` 호출 **11곳**이 전부 **삭제**됐다. 이 이사의 유일한 근거는 「두 조판이
> 같은 뷰(조판실) 소속이 되어 뷰 값이 더는 상호배제를 못 준다」였는데 E24 가 조판실을 2필로
> 해체해 **그 전제를 소멸**시켰다. 현재 상호배제의 근거는 다시 뷰 값이다 —
> `composeVisible = examStudioOpen && 뷰==="exam"` ·
> `sheetComposeVisible = sheetComposeOpen && 뷰==="sheet"`.
> ⚠ **아래에 적힌 dev `console.error` 감시자도 그대로 두면 안 된다** — 뷰 분할 후
> `composeVisible && sheetComposeVisible` 은 **구조적으로 불가능**해져 계기가 *vacuous* 가 되고,
> 그것을 재는 `probe-compose-room` R6(「위반 경고 0건」)이 **계기가 죽었는데 초록**이 된다.
> E24 는 이를 **DOM 실측 감시**(인쇄 대상 루트 개수)로 재작성했다(E24-0 ②-b).
> ⚠ 다만 이 절이 경고한 **실패 모드 자체(두 print-root 동시 가시 = 인쇄 백지, 에러 0 · PDF 로만
> 확인)는 여전히 실재**한다 — 방어 수단만 바뀌었다. 아래 원문은 이력 보존용이다.

현재 두 조판이 절대 동시에 보이지 않는 유일한 근거는 `centerAssetView` 값 비교 **하나**다.
조판실 통합은 그 근거를 소멸시키므로 `#exam-paper-print-root` / `#sheet-compose-print-root`·
`.par-root` 가 동시 가시가 되어 **인쇄 백지**가 열린다(에러 0 · PDF 로만 확인 가능).

```ts
type ComposeMode = null | "exam" | "sheet";
const composeVisible      = examStudioOpen  && centerAssetView === "studio" && composeMode === "exam";
const sheetComposeVisible = sheetComposeOpen && centerAssetView === "studio" && composeMode === "sheet";
```

이 이사만 하면 `anyComposeVisible` · 레이아웃 뒤집기 · 숨김 마운트 2블록 · `rightPanelBody` 는
**한 글자도 바뀌지 않는다.** dev 전용 `console.error` 로 「둘 다 visible」 불변식을 감시한다.
**U13(오케스트레이터)은 U11/U12(뷰 통합)와 같은 릴리스에 들어가야 한다.**

##### E22-4 선택 모델 — 행 어댑터 + **타입별 델타 커밋**

- 키는 **문자열 태그** `q:{questionId}` / `w:{reportId}`. 복합 객체 키 금지(Map 은 참조
  동일성 조회라 매 렌더 새 객체가 되면 has/delete 가 전부 미스).
- 단일 `DragSelect` 가 내보내는 `Set` 을 **이전 집합과 diff** 해 타입별로 갈라 보낸다:
  문항은 `handleFlatSelectionChange`(Set), 학습지는 `handleSheetPickRows(entries, pick)`.
  **「Set 전량 교체」로 통일하면** `guardSheetPickRemoval` dirty confirm 을 우회해
  **E21 의 편집 증발이 재발**하고, 이미 담긴 항목 재삽입으로 조판 순서가 마키 한 번에 뒤집힌다.
- **두 실행대는 합치지 않고 쌓는다.** 배포 서버 계약이 원리적으로 다르다
  (문항=다지문 1과제 / 학습지=passageId 단수 + 클래스 링크 + PRIME 한정) —
  단일 CTA 는 「눌렀는데 절반만 갔다」를 만든다.

##### E22-5 인쇄 — 선결 수정 **완료**(감독 직접, 실측 검증)

`report-styles.ts` 의 `.par-sheet:last-child { break-after: auto }` 는 편집·조판 모드에서
**전 시트에 매칭**됐다(`pages.tsx` 가 시트를 `par-sheet-wrap` 로 감싸므로 모든 시트가 자기
래퍼의 마지막 자식). 즉 **강제 페이지 분할이 통째로 무효**였고, 지금까지 멀쩡해 보인 이유는
모든 시트가 정확히 297mm 라 자연 흐름이 페이지 격자와 우연히 일치했기 때문이다(여유 0).

→ `.par-root > .par-sheet:last-child, .par-sheet-wrap:last-child > .par-sheet` 로 교체 +
`.par-sheet { break-inside: avoid }` 2차 방어선 추가. **26-08-18 실측 검증 완료**:

| 항목 | 결과 |
|---|---|
| computed `break-after` | 마지막 1장만 auto, 나머지 9장 page |
| PDF 페이지 수 == 라이브 시트 수 | 10 == 10 |
| 푸터 y 편차 | **0pt** |
| **음성테스트**(시트 1장을 180mm 로 축소) | 손상이 **그 1장에만 국소화**(others 편차 0pt) — 수정 전에는 뒤 6페이지가 전부 333pt 밀렸다 |
| 인쇄 대상 par-root | 정확히 1개 |

> ⚠ **`report-styles.ts` 는 JS 템플릿 리터럴이다 — 주석에도 백틱을 쓰지 마라.**
> 문자열이 그 자리에서 끝나 파일 전체가 파싱 불능이 된다(26-08-18 실측 사고).
>
> ⚠ **페이지 수 지표로는 이 결함을 절대 못 잡는다** — 실측에서 시트를 117mm 줄여도
> 페이지 수는 12로 그대로였고 오직 푸터 y 편차만이 붕괴를 드러냈다.
> 인쇄 게이트의 판정 축은 **PDF 푸터 y 좌표**다(`.tmp-worksheet-compose/probe-print-break.mjs`).

##### E22-6 감독 확정 정책

- **페이지 번호는 합본 전역**을 유지한다(러닝헤더는 문서별). 「한 묶음 문서」가 사용자
  확정 산출물이므로 연속 번호가 맞고, 표면 고지에 그 사실을 명시한다.
- **순수 문항 조판은 기존 시험지 빌더에 남긴다** — 합본 경로는 학습지 ≥1 을 요구한다.
  문항이 ReportPages 호스트로 오면 시험지 빌더의 IntersectionObserver 페이지 가상화를
  잃기 때문이다(같은 51페이지가 1,311노드 → 약 12,800노드).
- 이행기 「4필 동거」는 **릴리스 하나 안에서** 끝낸다(`SHOW_LEGACY_ASSET_PILLS` 스위치).
  > ⛔ **E24(§3.10.23)로 무효** — 4필 동거에 도달하기 전에 조판실 자체가 해체됐다.
  > `SHOW_LEGACY_ASSET_PILLS` · `legacy?: boolean` 필드 · `ALL_ASSET_VIEWS`/`ASSET_VIEWS`
  > **2단 상수 구조**가 전부 소멸하고 1개 상수로 접혔다. 최종은 **3필 고정**이다.
  > (같은 절의 「페이지 번호는 합본 전역」·「순수 문항 조판은 시험지 빌더에 남긴다」는 유효.)

##### E22-7 게이트

기존 전판(E21-8 13항 · behavior-exam-studio 11항 · 독립 라우트 5항) 유지 + 신설:
`probe-print-break.mjs` **5/5**(음성테스트 포함) · `_print-matrix.mjs` 6케이스 ·
(E22-G1) 혼합 체크 → 합본 CTA → 조판실 + 가시 print-root 1개
(E22-G2) 도시에 학습지 체크 → 실행 바 + 「학습지 M건」
(E22-G3) 학습지 8건 체크 → 상한 토스트 **0건** · 문서 칩 8개.

> ⛔ **E24(§3.10.23)로 E22-G1 의 착지 판정이 무효** — 「조판실」 뷰가 없다. 대체 게이트는
> **E24-G4**(sheet 뷰에서 학습지+문항 체크 → 합본 CTA → 클릭 → **뷰 유지(튕김 0)** · 인쇄
> 대상 루트 **정확히 1개**)이고 `.tmp-worksheet-compose/probe-e24-split.mjs` 가 소유한다.
> **E22-G2·E22-G3 은 무개변**(도시에 실행 바 · 상한 폐기 계약은 유효). `probe-print-break.mjs`
> **5/5**(푸터 y 편차 0pt)와 `_print-matrix.mjs` 6케이스도 유효하며, 인쇄 판정 축이 **PDF 푸터
> y 좌표**라는 E22-5 의 결론은 E24 최종 실측에서도 그대로 재확인됐다.


#### 3.10.23 조판실 해체 — [학습지 조판 | 시험지 조판] 2필 (E24 — 26-08-21 사용자 지시)

> "야 지금 우리 클래스 스튜디오에서 조판실 로직이 너무 복잡해.
>  복잡하다는 이유가, 지금 학습지 조판에서 **뒤에 문제 추가하는 기능은 너무 좋거든?**
>  그런데, **지금 내가 시험지 조판에 있는지, 학습지 조판에 있는지 구분이 안 돼.**
>  그래서 그냥 조판실을 학습지 조판, 시험지 조판 이렇게 **명확하게 구분**을 해줘.
>  \[조판실 필 HTML] 이거 아래에 **버튼 2개** 되도록 해주고, **플로우 자연스럽게** 진짜 잘 해줘.
>  철저하게 매끄럽게 잘 해줘."
>
> 사용자 확정 응답 2건(**재논의 금지**):
> ① **조판실 필을 없애고 그 자리에 2필로 교체**한다(필 아래 서브바 방식은 **기각**).
> ② 레거시 필(문제관리·학습지 관리)은 **걷어낸다** — 단 "그 페이지에 있던 것들을 다시 활용해도 좋아".

**이 절이 §3.10.22(E22)의 뷰 구조·상호배제 설계를 대체한다.** 자산 뷰는 최종
`[지문관리 | 학습지 조판 | 시험지 조판]` **3필**이고 「조판실」·「문제관리」·「학습지 관리」 필은
**소멸**했다(지시의 「버튼 2개」는 조판실 1필이 갈라진 수 — 지문관리를 더해 3필). 사용자 불만의
정체는 「기능이 부족하다」가 아니라 **「내가 어느 조판에 있는지 화면이 말해 주지 않는다」** 였고,
그래서 이 절의 모든 결정은 **위치를 뷰 값 하나로 환원**하는 방향으로 수렴한다.

> ⚠ **번호 점유 고지 — §3.10.23 은 E24 의 것이다.**
> `src/` 주석 **53곳**이 이 절 번호를 계약 근거로 인용한다(`grep -rn "3\.10\.23" src/` —
> `actions/studio/worksheets.ts` · `studio/studio-home-client.tsx` ·
> `studio/workbench/{source-switcher,library-pane,composer-list-pane,dossier-pick-bar,passage-dossier-pane}.tsx` ·
> `lib/studio/list-states.ts`). 아직 승격되지 않은 개편(**E23** 학습 활동 패널 —
> `.tmp-worksheet-compose/e22-activity-spec.md`)을 나중에 정본화할 때 **이 번호를 재사용하지
> 마라.** 재사용하면 53개 인용이 통째로 엉뚱한 절을 가리킨다. 다음 빈 번호(§3.10.24 …)를 쓸 것.
>
> 원 작업 계약 전문(줄 단위 처방 · Touchpoint 원장 · 동명이인 금지 목록 · 유닛 분해)은
> `.tmp-worksheet-compose/E24-SPEC.md` 에 남는다. **정본은 이 절**이고 그 문서는 부속 원장이다.
> 직전 유닛 지시서 `.tmp-worksheet-compose/E22-UNITS.md` 의 [U16]과 그 판정 요지
> (「`"studio"` 추가 + `ComposeMode` 신설」·「2단 이행」)는 이 절로 **무효**다.

##### E24-0 확정 계약 ①~⑩

**① 뷰 유니온 재정의** — `workbench/source-switcher.tsx`

```ts
export type StudioAssetView = "passages" | "sheet" | "exam";
```

구 3값 `"questions"` · `"worksheets"` · `"studio"` 를 **삭제**한다. `SHOW_LEGACY_ASSET_PILLS` ·
`legacy?: boolean` 필드 · `ALL_ASSET_VIEWS`/`ASSET_VIEWS` **2단 상수 구조**도 통째로 소멸(1개
상수로 접는다).
⚠ **TS 가 잡는 것 / 못 잡는 것** — 잡음: `view === "studio"`(TS2367) · `Record<StudioAssetView, X>`
키 누락/과잉. **못 잡음**: `view !== "passages"` 류 **음성 판정**과 그 boolean 을 소비하는 삼항
사슬 · 라벨 문자열 · OR 체인.
⚠⚠ **`viewCounts` Record 의 안전망을 무력화하지 마라.** 구 렌더부의 `const isStudio = key === "studio"`
단락 때문에 `viewCounts.studio` 는 한 번도 읽히지 않는 **dead entry** 였다. `isStudio`/`studioLabel`/
`studioParts`/`studioDetail` 을 **통째로 삭제**하고 Record 경로 **하나**로 단일화한다. 남기면 두
필에 똑같은 합계가 뜬다 — 「학습지 조판 (140)」·「시험지 조판 (140)」. **컴파일은 통과한다.**

**② `composeMode` 완전 폐지 — 상호배제를 다시 뷰 값으로 환원**

E22-3 이 `ComposeMode` 를 신설한 유일한 근거는 「두 조판이 같은 뷰 소속이 되어 뷰 값이 더는
상호배제를 못 준다」였다. 이번 개편이 그 전제를 소멸시키므로 되돌린다.

```ts
const composeVisible      = examStudioOpen   && centerAssetView === "exam";
const sheetComposeVisible = sheetComposeOpen && centerAssetView === "sheet";
```

제거 대상 전량: `ComposeMode` 타입 · `composeMode` state · `setComposeMode` **호출 11곳**
(개방 6 · 폐쇄 3 · 클래스 리셋 1 · `deploySheetFromRow` 1). `closeExamStudio`/`closeSheetCompose`
의 `setComposeMode(cur => …)` 와 클래스 전환 리셋은 **삭제**로 충분하다.
⚠ **`deploySheetFromRow` 만은 대체 없는 삭제가 금지**다 — E24-2 함정 #1(critical).

- **②-a 【E24 최상위 불변식】 개방 = open 플래그 + 자기 뷰 강제, 한 커밋에**
  > **조판 개방 함수는 반드시 (a) 자기 open 플래그를 켜고 (b) 자기 뷰로 강제 전환한다.**

  둘을 한 커밋에 담지 않으면 —
  · 뷰가 안 따라오면 → 표면이 열렸는데 **영원히 안 보인다**(에러 0·경고 0. 사용자에겐 "버튼이
  안 먹는다"로 보인다).
  · 뷰만 갈리고 open 이 남으면 → 두 print-root **동시 가시 = 인쇄 백지**(PDF 로만 발견).
  ⚠ **`composeMode` 제거와 뷰 분할은 반드시 같은 커밋**이어야 한다. 어느 쪽을 먼저 해도 위 두
  실패 중 하나가 열린다.

- **②-b 감시 계기는 DOM 축으로 재작성해 반드시 존치**
  구 `console.error("[E22-3] …")` 는 `composeVisible && sheetComposeVisible` 을 봤는데, 뷰 분할
  후 그 조건은 **구조적으로 불가능**해져 감시자가 *vacuous* 가 된다 — `probe-compose-room.mjs`
  R6(「상호배제 위반 경고 0건」)이 **계기가 죽었는데 초록**이 되는, 게이트로서 최악의 상태다.
  → dev 전용 감시를 **DOM 실측**으로 승격한다(effect 안, production 조기 반환):

  ```
  인쇄 대상 루트 수 = document.querySelectorAll(
        ".par-root:not(.par-cover-preview):not(.par-print-exclude)").length
      + (#exam-paper-print-root 가 가시면 1 else 0)
  > 1  →  console.error("[E24] 인쇄 대상 루트가 N개입니다 — 인쇄가 백지로 나옵니다. …")
  ```

  이 계기는 구 계기가 못 잡던 **`active` prop 누락**(②-c)까지 잡는다.

- **②-c ⚠ `active` 는 반드시 「가시 파생값」을 먹는다 (critical)**
  ```tsx
  <SheetComposeSurface active={sheetComposeVisible} … />   // ✅
  <SheetComposeSurface active={sheetComposeOpen} … />      // ❌ 인쇄 백지
  ```
  근거: 인쇄 판정은 `report-styles.ts` 의
  `body:where(:has(.par-root:not(…):not(.par-print-exclude))) * { visibility:hidden }` 이고
  **`:has()` 는 `display:none` 요소도 매칭**한다 — **숨김 마운트는 인쇄 안전을 전혀 주지 않는다.**
  `sheet-compose-surface.tsx` 의 `active` 는 **기본값이 `true`**(옵셔널)라 표면 호출부를 옮기며
  prop 을 빠뜨리면 **타입 에러 0 · 화면 이상 0 · 콘솔 0** 인 채 인쇄만 백지가 된다.
  「뷰가 갈렸으니 open 만 보면 된다」는 단순화는 **금지**다.

**③ 선택 상태는 두 뷰가 공유 — 뷰 전환이 선택을 지우지 않는다**

`flatPicked`(문항 Map) · `pickedSheets`(학습지 Map)는 클래스 단위 상태로 남고, 뷰 전환 시
**어느 것도 청산하지 않는다**(청산은 **클래스 전환에서만** — 기존 그대로). 근거: 합본 플로우가
「학습지 조판 뷰에서 문항도 고른다」를 요구하고, 청산하면 Map 삽입 순서 = 인쇄 순서 계약도 함께
파괴된다. ⚠ 이 결정의 대가는 **⑦ 교차 고지로 갚는다.** 갚지 않으면 「A4 3장인 줄 알았는데
7장이 나왔다」가 **인쇄 후에만** 발견된다.

**④ 목록판 = `ComposerListPane` 단일 인스턴스 + `lockedKind`**

레거시 2판(`class-questions-pane.tsx` · `class-worksheets-pane.tsx`)을 **파일째 삭제**해,
`library-pane` 이 hidden 공존으로 물고 있던 **3판 → 1판**이 된다. DOM 비용 회수가 곧 사용자가
말한 "복잡함"의 해소다.

| 뷰 | `lockedKind` | 중앙 목록 | 우측 |
|---|---|---|---|
| 학습지 조판(`sheet`) | `null` | **학습지 + 문항 병합**(합본 재료) · 종류 세그먼트 노출 | ⑥ |
| 시험지 조판(`exam`) | `"question"` | **문항만**(`w:` 행 0) · 종류 세그먼트 **숨김** | ⑥ |

⚠ `kindFilter` 는 판 **로컬 `useState`** 다. `lockedKind` 가 있으면 로컬 상태를 **지우지 말고
override** 하라 — 뷰를 오가면 학습지 뷰의 세그먼트 선택이 보존돼야 한다.
타입 정의는 `src/lib/studio/list-states.ts` 로 이사했다(삭제되는 판이 소유하던 타입을 먼저
옮기고 → import 재조준 → 판 삭제. **이 순서는 강제**다).

**⑤ fetch 게이트는 두 축 모두 켠다 — 좁히지 마라 (critical)**

```ts
// library-pane.tsx — 구 `assetView === "questions" || … || assetView === "studio"`
const listActive = assetView !== "passages";
```

「학습지 조판 뷰니까 학습지만 불러오면 된다」는 **치명적 최적화**다:
- 학습지 뷰에서 문항 fetch 를 끄면 → `handleFlatSelectionChange` 가 rows 미러에 없는 id 를
  **말없이 건너뛴다**. 체크한 문항이 `flatPicked` 에 한 건도 안 들어간다. 토스트 0 · 콘솔 0.
  **사용자가 극찬한 합본이 정확히 이 방식으로 무음 파괴된다.**
- 시험지 뷰에서 학습지 fetch 를 끄면 → `worksheetsState.status === "idle"` 이 남아 판의 `loading`
  분기가 걸려 **문항 128건이 있어도 전면 스켈레톤**이 뜬다.
- 재조회 트리거가 「뷰 최초 진입」뿐이라 **새로고침으로도 안 풀린다**(영구 고착).

**⑥ 우측 실행대 = 자기 축 실행대 + 반대 축 요약 스트립 (대칭)**

핵심 설계 판단: **반대 축의 full 실행대를 상대 뷰에 두지 않는다.** 두면 그 CTA(「시험지 조판」
버튼)가 사용자를 방금 고른 탭 밖으로 튕겨 내 「내가 어디 있는지 모르겠다」는 **바로 그 불만**이
재생산된다.

⛔ **아래 노출표의 가시 조건은 E25(§3.10.24)로 실효가 바뀌었다** — xl+ 에서 자기 축 픽>0 이면
표면이 자동 개방돼 실행대는 언마운트다. 실행대가 실제로 보이는 상태는 「픽 0 · 수동 폐쇄
직후 · 배포 인텐트 · `<xl`(억제 ③)」뿐이다. 컴포넌트 구성 자체는 그대로 유효.

```
학습지 조판 뷰                          시험지 조판 뷰
[합본 조판 CTA]  ← 학습지>0 ∧ 문항>0     [QuestionsActionRail]  ← 문항>0
[SheetsActionRail] ← 학습지>0            [학습지 요약 스트립]     ← 학습지>0
[문항 요약 스트립] ← 문항>0              [빈 상태]              ← 둘 다 0
[빈 상태]        ← 둘 다 0
```

- 요약 스트립 = 「문항 N개 담김 · [선택 해제] · [시험지 조판 →]」(대칭으로 「학습지 M건 담김 …」).
  `→` 버튼은 **뷰 전환만** 한다 — **조판을 열지 않는다.**
  ⛔ (E25 §3.10.24 E25-1 4) 콜백 계약은 그대로나, 착지 뷰의 발화 ① 이 열어 주므로 xl+ 에서
  **사용자 체감은 「점프 = 조판 도착」**이다. G8 구판정(「조판 안 열림」)은 G8′ 로 반전됐다.
- **합본 CTA 의 집은 「학습지 조판」 뷰**다. `openCombinedCompose` 가 학습지 축 채널로 뷰를
  강제하므로 **같은 뷰에 머문다(튕김 0)**. 시험지 뷰에서 학습지도 담은 사용자는 요약 스트립의
  `[학습지 조판 →]` 로 한 클릭에 도달한다.
- 순서 변경: 학습지 뷰는 **학습지 실행대가 문항보다 위**(구 studioRailBody 는 문항이 위였다).
- **두 실행대를 하나로 합치지 마라**(E22-4 승계) — 배포 서버 계약이 원리적으로 다르다.

**⑦ 필 ↔ CTA 라벨 충돌 해소 — `data-asset-view` 신설, CTA 자구는 건드리지 않는다**

새 필 라벨 「학습지 조판」·「시험지 조판」은 실행대 CTA(`questions-action-rail`·`sheets-action-rail`)
및 조판 표면 `aria-label` 과 **글자 단위로 같다.**

- **(a) 필에 계약 속성** — `<button data-asset-view="passages" | "sheet" | "exam" …>`.
  QA 프로브는 라벨이 아니라 이 속성으로 필을 특정한다(E24-4). 라벨 부분매칭은 영구히 취약하다.
  요약 스트립의 점프 버튼도 `data-summary-jump="sheet" | "exam"` 로 표식해 CTA 셀렉터에서
  `:not([data-summary-jump])` 로 배제할 수 있게 한다.
- **(b) 필의 `aria-label`/`title` 은 항상 「긴 설명형」**
  ```
  "학습지 조판 — 학습지 뒤에 문항을 이어 붙여 A4 한 묶음으로 (학습지 8 · 문항 159)"
  "시험지 조판 — 문항으로 시험지 세트를 만듭니다 (문항 159)"
  ```
  근거: 구 `countLabel` 은 건수가 `null`/`0` 이면 라벨을 **그대로** 내보내, 부팅 직후(미조회)에
  필의 접근성 이름이 정확히 `"학습지 조판"` 이 되어 조판 표면 `aria-label` 과 **충돌**한다. 그
  결과가 **상태 의존 간헐 오작동**이다 — `waitFor` 계열은 **가짜 GREEN**(표면 대신 필에서 조기
  resolve), `count===0` 계열은 **영구 가짜 RED**. 항상 긴 설명형이면 충돌이 원천 소멸한다.
- **(c) 실행대 CTA 라벨은 바꾸지 않는다.** 「시험지 조판」·「학습지 조판」은 사용자가
  §3.10.13·§3.10.17 에서 직접 지시해 굳은 자구다. 승인 없는 자구 변경은 근거 없는 회귀다.
  사용자 혼란 쪽은 ⑥ 설계가, QA 쪽은 (a)+(b)가 이미 해소한다.

**⑧ 우측 패널 세로 라벨 · 드로어 문구**

`rightPanelLabel`: `composeVisible→"시험지"` · `sheetComposeVisible→"학습지"` · `sheet` 뷰→`"학습지"` ·
`exam` 뷰→`"시험지"` · 도시에→`"지문 현황"` · 폴백 `"정보"`. **`"조판실"` 분기 삭제.**
`<xl` 드로어 고지 2종의 자구는 유지한다(시험지 = IndexedDB 보관 / 학습지 = 열려 있음 —
**비대칭이 사실이므로 한쪽을 다른 쪽에 베끼지 마라**).

**⑨ `hasRightPanel` 을 가시 파생값으로 교정**

```ts
const hasRightPanel = sheetRailActive || examRailActive || Boolean(visibleDossierPassages)
                    || flatPicked.size > 0 || pickedSheets.size > 0;
```

근거: 구 산식은 **raw open**(`examStudioOpen || sheetComposeOpen || …`)을 읽었다. 3필 체제에서는
「조판을 열어 둔 채 지문관리 뷰로 나가는 것」이 **기본 동선**이 되는데, 그때 StepStrip 의
**③배포 칩이 계속 점등**하고 `<xl` 드로어 버튼도 계속 떴다. 두 조판 뷰에서는 `sheetRailActive`/
`examRailActive` 가 `selectedClass && view === …` 로 항상 참이라 **손실이 없다**.
⚠ **담긴 것(픽)을 반드시 포함한다** — 지문관리 뷰 + 픽 있음 + 도시에 미선택이면 앞 3항이 전부
거짓이라, `<xl` 에서는 드로어 버튼과 슬라이드오버 렌더 게이트가 둘 다 이 값에 묶여 **우측을 열
방법 자체가 없다**. 그러면 ⑦ 담김 고지가 도달 불가가 되고 ③의 부채가 **좁은 화면에서만**
미지급이 된다.
⚠⚠ 그래도 「③칩 소등」 효과는 무손상이다 — StepStrip 은 `hasRightPanel` 이 아니라 **전용 파생
`stepAdvanced`**(담긴 것 ∨ 펼친 도시에)를 먹는다. 두 값은 **묻는 질문이 다르다**(전자 = 「우측에
보여 줄 판이 있는가」, 후자 = 「자료를 실제로 골랐는가」). 다시 하나로 합치면 클래스만 고르고 탭을
눌렀을 뿐인데 상단이 「②자료 완료 · ③배포 진행」으로 점등하고 **같은 화면 우측은 빈 상태 문구**를
띄운다 — 정면 모순이다.

**⑩ 학습지 축 `truncated` 고지 신설 (유일한 데이터 계약 변경)**

`src/actions/studio/worksheets.ts` 의 `take: 300`(링크축) / `take: 900`(리포트축) 절단이 **무고지**
였다. 「학습지 조판」이라는 전용 방을 만들어 놓고 목록이 조용히 잘리면 사용자는 절단이 아니라
**유실/버그로 해석**한다. 문항 축과 동형으로 `truncated`(**두 절단의 OR**)를 응답에 싣고 판에
각주를 단다. ⚠ 이번 개편에서 **서버 응답 형태를 건드리는 유일한 항목**이다 — additive 필드만
추가하고 기존 소비처는 무개변이어야 한다.

##### E24-1 무회귀 계약 (절대 훼손 금지)

1. **합본 조판(학습지 + 뒤에 문항 이어붙이기)** — 사용자가 명시적으로 극찬한 기능이다.
   `SheetComposeSurface` 의 `academyId`·`pickedQuestions`·`questionsTitle` 3 prop, `buildComposedView`
   **안**의 합류 지점, `flatPicked` **Map 삽입 순서 = 인쇄 순서**.
2. **인쇄 무결성** — 인쇄 대상 루트 **정확히 1개**(②-b·②-c).
3. **타입별 델타 커밋** — 판의 `onCommit(added, removed)` 계약을 **되돌리지 마라.**
   ⚠ 오독 주의: E22-4 의 「문항은 Set 전량 교체」는 **호스트 하류**(`handleFlatSelectionChange(Set)`)
   를 서술한 것이지, 판의 발신을 `onChangeSelection(Set)` 으로 되돌리라는 뜻이 **아니다**.
   되돌리면 `guardSheetPickRemoval` dirty confirm 을 우회해 **E21 편집 증발이 재발**한다.
4. **선택 순번 배지 색 문법** — 문항 blue / 학습지 violet.
5. **드래그 마키 계약** — 무롤 div 루트 + `data-drag-item-id`, 본문 스팬 `cursor-pointer` 금지,
   chevron `<Link>` 에 `data-drag-select-ignore` 필수(§3.10.21 E21-5 승계).
6. **`key={classId}` 리마운트 규약.**
7. **표면은 `aside` 한 곳에서만 마운트** — 두 트리(드로어 포함)에 렌더하면 2인스턴스가 되어
   서버 액션 2배 발사 · IndexedDB 2 writer · 전역 DOM id 중복(인쇄 포털이 첫 노드만 잡는다).
8. **`hideQuestionLibrary` 를 끄지 마라** — 사용자가 이미 기각한 UI 다(§3.10.17-d (g)③).
9. **탭 전환은 언마운트가 아니다** — `sheetComposeOpen` 이 참인 한 표면은 hidden 으로 마운트
   유지된다. 학습지 축은 IndexedDB 초안이 없으므로 **언마운트로 바꾸면 미저장 편집이 소실**된다.
10. **독립 라우트(지문 스튜디오 · 학습지 생성 모달 등)는 반경 밖.**

##### E24-2 재발 금지 함정 — 적대 검수(5렌즈)가 **실제로 뚫은 것** (원시 29건 → 생존 15건)

| # | 등급 | 무엇 | 원인 |
|---|---|---|---|
| 1 | **critical** | `deploySheetFromRow` 의 **조판 접기 소실** → 「편집만 파괴되고 배포 폼은 안 열림」 | **이 개편의 작업 스펙(= 감독 산출물) §1② 초안이 「이미 있는 `setSheetComposeOpen(false)` 와 동치」라고 거짓 단언**해 `setComposeMode(null)` 이 대체 없이 삭제됐다. **그런 호출은 그 함수에 없었다.** |
| 2 | **major** | 학습지 **300건 초과** 클래스에서 문항 0행 → 합본 재료 창구가 통째로 폐쇄 | **감독이 넣은 축 우선 정렬**과 `slice(0, renderCap)` 의 충돌. `visibleRows` 를 **축별 배분**으로 교정 |
| 3 | major | 숨은 시험지 빌더가 남의 인쇄를 **가로챔**(Ctrl+P) | 선재 결함. ⑨ 가 「조판을 열어 둔 채 다른 탭」을 **기본 동선**으로 만들며 도달 빈도가 올라 표면화 |
| 4 | major | 체크 프룬 가드가 raw `sheetComposeOpen` 을 읽음 | ⑨ 가 고친 「open ≠ visible」이 **여기만 누락**됐다. 판정축은 `sheetComposeVisible` |
| 5 | minor | 컴팩트 임계 `560` == 중앙 하한 `minCenter` `560` → 중앙 하한에서 **컴팩트 미발동**(오버플로 60px) | 구 메모가 「하향하라」 했으나 **방향이 반대**였다(2필→3필로 라벨이 길어짐). 실측 619.92px → **640** |

> **교훈(정본화)**: **스펙(견본)의 오류는 팬아웃으로 증폭된다.** #1·#2 는 **감독 자신의 산출물**이
> 원인이었고, 적대 검수만이 그것을 잡았다. **검수 프롬프트에서 감독 산출물을 보호구역으로 만들지
> 마라.** 다음 사람에게 이 절에서 가장 값진 정보는 이 한 줄이다.

**수리자의 근거 있는 반박 — 집행하지 않은 것이 옳았던 지시**

| 감독/검수 지시 | 반박 근거 |
|---|---|
| 인쇄 가드를 `if (!root.offsetParent) return;` 로 좁혀라 | 랜딩 **모바일 데모의 인쇄가 조용히 죽는다** — 그 호스트는 `display:none` 상태 인쇄가 의도다(`step4-paper-mobile.tsx:150-158`). 대신 **명시 제외 표식**으로 우회 |
| G15 를 `div.h-11` 의 `scrollWidth == clientWidth` 로 재라 | 그 요소엔 overflow 속성이 없어 **구조적 영구 가짜 GREEN**. 실제 스크롤러는 첫 자식(`overflow-x-auto`) |
| 「단일 취소 지점이 없다」 | 거짓 — `allChecked` 가 참이면 **같은 버튼이 해제 지점**이다 |
| `data-step-state` 속성을 추가하라 | 불필요 — 안정 판별자가 실재한다(chipTone `font-weight` 700/500 이분) |
| 「먼저 등록된 지문 N개분」 자구를 채택하라 | 반쪽 거짓 — `truncated` 는 링크축(300) ∨ 리포트축(900) **두 절단의 OR** 다 |

**계기 음성테스트 (필수) — 실시 완료 (26-08-21)**

| 주입한 결함 | 기대 | 실측 |
|---|---|---|
| `lockedKind={null}`(축 고정 해제) | G3 RED | ✅ **RED** — `w:9` 등장 · 종류 세그먼트 3개 노출 |
| `active={sheetComposeOpen}`(②-c 금지 패턴) | G6 RED + `[E24]` 발화 | ✅ **RED** — `worst=2` · `[E24]` **2회 발화**(「인쇄 대상 루트가 2개입니다 … view=exam · exam open=true/visible=true · sheet open=true/visible=false」) |

⚠⚠ **이 음성테스트가 G6 자체의 결함을 잡아냈다.** 최초 G6 는 시험지 조판만 열고 왕복해 **두
표면이 동시에 열린 상태에 도달하지 못했고**, 결함을 주입해도 PASS 했다(가짜 GREEN). G4(학습지
조판도 실제로 연다)를 추가한 뒤에야 계기가 됐다.
→ **부정형 게이트는 「위험 상태에 실제로 도달하는가」부터 증명해야 한다.**

같은 계열로 프로브 이행 중 **기존에 죽어 있던 게이트 2개**도 적발·수리됐다:
- `behavior-exam-studio` G8「돌아가기 후 실행대 CTA 복귀」 — **무스코프 셀렉터**가 항상 화면에
  있는 **필**을 재고 있어 실행대가 통째로 사라져도 영원히 PASS(음성테스트 OLD=true / NEW=false).
- 같은 파일 G9 — `a[href^=/…/p/]` 가 병합 목록에서 **문항 행에도** 달려(214 = 205+9) 학습지 0건
  회귀에도 PASS 하던 죽은 게이트. **축 접두사 판정**으로 재작성.

> **「0건」을 보고하는 게이트는, 0건이 아닐 때 우는 것을 보여준 다음에만 신뢰한다.**

##### E24-3 게이트 (E24-G) · 최종 실측

| ID | 판정 |
|---|---|
| G1 | `div.h-11` 안 `button[aria-pressed]` **정확히 3개** · `data-asset-view` 집합 = {passages, sheet, exam} · 라벨 집합 = {지문관리, 학습지 조판, 시험지 조판} · 「조판실」·「문제관리」·「학습지 관리」 필 **0개** |
| G2 | `[data-asset-view="sheet"]` 클릭 → 목록에 `w:` 행과 `q:` 행이 **둘 다** 보인다 |
| G3 | `[data-asset-view="exam"]` 클릭 → `q:` 행 ≥1 · `w:` 행 **정확히 0** · 종류 세그먼트 미노출 |
| G4 | ⛔ E25 로 G4′ 재정의(§3.10.24 E25-2 — CTA 클릭 없는 자동 개방 진입). 구 판정: sheet 뷰에서 학습지+문항 체크 → 합본 CTA 노출 → 클릭 → **뷰 유지(튕김 0)** · 인쇄 대상 루트 **정확히 1개** |
| G5 | ⛔ E25 로 G5′ 재정의(체크 = 자동 개방). 구 판정: exam 뷰에서 문항 체크 → `[시험지 조판]` → `#exam-paper-print-root` 가시 · `#sheet-compose-print-root` 비가시 |
| G6 | 두 조판을 차례로 연 뒤 **탭 3개를 6회 왕복** → 매 스텝 인쇄 대상 루트 **항상 ≤1** · `[E24]` console.error **0건** |
| G7 | 탭 왕복 후 **선택 보존**(문항 N · 학습지 M 그대로 — ③ 계약) |
| G8 | ⛔ E25 로 G8′ **반전**(점프 = 뷰 전환 + 착지 자동 개방). 구 판정: exam 뷰 + 학습지 픽 → 학습지 요약 스트립 노출 · `[학습지 조판 →]` 클릭 시 **뷰만** 전환(조판 안 열림) / sheet 뷰 + 문항 픽 → 대칭 동작 |
| G9 | 도시에 행 액션 `[학습지 조판]`·`[시험지 조판]` → 각각 **올바른 탭**에 착지 |
| G10 | 클래스 전환 → 뷰 `passages` 리셋 · 선택 청산 · 판 필터 초기화 |
| G11 | 조판을 연 채 지문관리 탭으로 나가면 StepStrip **③배포 칩 소등**(⑨ — 픽이 0일 때) |
| G12 | `npx tsc --noEmit` **0 에러** · `npm run lint` 무증가 · `npm run build` 성공 |
| G13 | 기존 활성 프로브 전량이 이행 후 **베이스라인과 동일한 PASS 수** |
| G14 | `probe-print-break.mjs` — PDF **푸터 y 편차 0pt** |
| G15 | 4뷰포트(1280/1440/1720/2560) + 조판 중 420px 열에서 필 스트립 가로 스크롤 0 — 판정은 `div.h-11` 이 아니라 **첫 자식 `overflow-x-auto`** 에서 잰다(E24-2 반박표) |

**최종 실측 (26-08-21, 감독 직접 주행 — 에이전트 보고 아님)**
`npx tsc --noEmit` **0 에러** · `eslint` **0 error**(경고 16 = 베이스라인 동일 · 무증가) ·
`npm run build` **exit 0**

| 프로브 | 변경 전 | **최종** | 비고 |
|---|---|---|---|
| `.tmp-worksheet-compose/probe-e24-split.mjs` (신규) | — | **14/14 PASS** | E24 계약 전항(G9·G10·G15·G15b 신설, G8·G11 판정 강화) |
| `.tmp-studio-qa/behavior-exam-studio.mjs` | 11/11 | **11/11 PASS** | 베이스라인 복구 + **죽은 게이트 2개 수리** |
| `.tmp-studio-qa/probe-polish-v23.mjs` | 10/12 (선재 RED 2) | **13/13 PASS** | P0/P1/P8 을 E24 완료 게이트로 재작성 |
| `.tmp-studio-qa/probe-builder-payload.mjs` | — | **5/5 PASS** | |
| `.tmp-worksheet-compose/probe-compose-room.mjs` | 7/7 | **7/7 PASS** | R6 에 **계기 생존 실증** 내장 |
| `.tmp-worksheet-compose/probe-sheet-compose.mjs` | 14/14 | **14/14 PASS** | 베이스라인 복구 |
| `.tmp-worksheet-compose/probe-print-break.mjs` | — | **5/5 PASS** | 푸터 y 편차 **0pt** |
| `.tmp-worksheet-compose/probe-compose-integrity.mjs` | — | **INTEGRITY OK** | 백지 페이지 0 |
| `.tmp-worksheet-compose/probe-force-collapse.mjs` | — | **exit 0** | |
| `.tmp-worksheet-compose/probe-final-activity.mjs` | — | 9 PASS / 0 FAIL | E23 계열 무회귀 |

⚠ **위장 실패 모드(실측 재현).** 코드 변경 직후·프로브 이행 **전** 실측에서
`behavior-exam-studio` 11→**2**, `probe-sheet-compose` 14→**0**, `probe-compose-room` 7→**0**,
`probe-polish-v23` 10→**0** — **총 40항이 5줄의 로그로 위장**됐다. 진입 셀렉터 한 줄이 깨지면
게이트가 통째로 소실되는데 로그는 **「1개 실패」로 보인다.** 판정 축은 「FAIL 0」이 아니라
**실행된 항목 수**다.
⚠ **프로브 이행은 코드 변경보다 먼저일 수 없다**(새 셀렉터가 아직 없다). 그 사이 구간이 회귀
감시 공백이므로 **코드 변경 → 즉시 프로브 이행 → 게이트 주행을 한 커밋 안에서** 끝낸다.

##### E24-4 프로브 셀렉터 규약

| 대상 | 셀렉터 |
|---|---|
| **필(탭)** | `div.h-11 button[data-asset-view="passages" \| "sheet" \| "exam"]` — **신규 정본** |
| 실행대 CTA | `aside[data-panel-key="dossier"] button:not([data-summary-jump]):has-text("학습지 조판")` |
| 요약 스트립 점프 | `aside[data-panel-key="dossier"] button[data-summary-jump="sheet" \| "exam"]` |
| 조판 표면 | `[role="region"][aria-label="학습지 조판"]` — 필은 `<button>` 이라 `role=region` 을 **절대 못 가진다** |
| 행(축 판별) | `div[data-drag-item-id]:has(> button[aria-label$="문항 선택"])` / `…$="학습지 선택"` |

⚠ **무스코프 `button:has-text("시험지 조판").first()` 금지.** 필이 든 `div.h-11` 이 dossier `aside`
보다 DOM 에서 **앞서므로** `.first()` 는 필을 집는다 — 실행대가 통째로 사라져도 **영원히 PASS**
한다(E24-2 죽은 게이트 2건이 정확히 이 원인).

⚠⚠ **동명이인 원장 — 「문제관리」·「학습지 관리」라는 글자는 스튜디오 필 말고도 산다.**
전역 치환은 이 지점에서 반드시 사고를 낸다.

| 파일 | 무엇 | 판정 |
|---|---|---|
| `src/components/layout/nav-config.ts` | 전역 네비 「학습지 관리」 → `/director/workbench/passages` | **금지** |
| `src/components/admin/admin-passages-client.tsx` | 어드민 `<h1>학습지 관리</h1>` | **금지** |
| `src/components/exams/exam-paper-builder-client.tsx` | **시험지 빌더 내부** 좌측 패널 핸들 `aria-label="문제관리 패널 열기/닫기"` — `probe-builder-payload`·`probe-polish-v23` P5 의 셀렉터 | **금지** |
| `.../workbench/generate/*` · `passage-list-client.tsx` · `lib/admin-activity-labels.ts` · `actions/workbench/passage-constants.ts` | 워크벤치 라벨·토스트·브레드크럼 | **금지** |
| `.tmp-worksheet-compose/probe-standalone-noregress.mjs:63` `text=학습지 관리 · 전체 학습지` | **다른 화면의 섹션 제목** | **무개변(오탐)** |

> **판정 규칙**: 경로가 `src/app/(director)/director/studio/` 아래가 **아니면 대상이 아니다.**

#### 3.10.24 (E25, 26-08-22) 선택 즉시 조판 — 조판 버튼 게이트 제거

**지시 원문**: "학습지 조판 버튼이 필요한거야? 그냥 학습지 선택하면 바로 조판이 되도록 하면
안 되는거야??? … 굳이 조판 버튼으로 안 넘어가도 그냥 자연스럽게 바로 조판 페이지로 해버려.
애초에 문제 선택하면 그냥 바로 조판이 시작되는거야." + 표면 안내문
(「왼쪽 목록에서 체크하면 즉시 …에 올라가고」) 제거 지시.

**제품 판정**: 두 조판 뷰(`sheet`·`exam`)에서 「체크 → 우측 실행대 CTA 클릭」 2단계를
「체크 = 조판 표면 자동 개방」 1단계로 줄인다. **필(탭)이 곧 페이지, 픽이 곧 개방이다.**

##### E25-0 자동 개방 효과 (제7 개방 경로)

`studio-home-client.tsx` 에 **effect 1개**를 신설한다. 기존 개방 6경로(E24 §②-a)는
전부 존치(도시에·행 발사는 여전히 명시 경로다). 효과의 발화 조건은 **전이(transition)** 다
— 상태가 아니라 전이를 보는 것이 이 설계의 전부다:

- **발화 ①(뷰 진입)**: `centerAssetView` 가 `"sheet"`(·`"exam"`) **로 바뀌는 전이**이고
  그 시점 해당 축 픽(`pickedSheets`·`flatPicked`)이 ≥1 이면 자기 open 플래그를 켠다.
- **발화 ②(픽 증가)**: 해당 뷰에 **머무는 동안** 해당 축 픽 개수가 **증가하는 전이**에서
  켠다(0→1 포함 — 체크가 곧 개방).
- **억제 ①(배포 인텐트)**: sheet 축은 `pendingSheetDeployId !== null` 인 동안 발화하지
  않는다. 행 [모바일 배포]는 「조판 접기 + 실행대 폼 펼침」이 목적인데(E24 ⑫), 효과가
  되열면 폼을 소비할 실행대가 다시 언마운트된다(nonce 폐기 사고와 같은 모양의 최악 조합).
- **억제 ②(수동 폐쇄 존중)**: [돌아가기]·Escape 로 닫은 상태는 **전이가 없는 한** 다시
  열지 않는다 — 픽 감소·유지·배포 인텐트 소비는 전이가 아니다. 닫힌 채 그 뷰에 머물면
  우측은 실행대(재개방 CTA·요약 스트립·배포 폼)로 복귀한다. 단 **뷰를 나갔다 재진입**하면
  발화 ① 이 다시 돈다(필 = 페이지 모델의 귀결 — 조판 뷰 재진입은 조판 화면 진입이다).
- **억제 ③(뷰포트, 적대검수 확정 major 수리)**: `xl(1280px) 미만`에서는 발화하지
  않는다(`window.matchMedia("(min-width: 1280px)")`). 조판 표면의 유일한 거처인 우측
  aside 는 `hidden … xl:flex` — xl 미만 발화는 「보이지 않는 조판」을 열고 중앙 목록만
  420px 로 접는 화면 붕괴다(스모크 S8 실측 region:1 · listW 846→420). <xl 은 E25 이전
  동작(행 액션·실행대 CTA 명시 개방)으로 회귀하며, ref 전진은 뷰포트와 무관하게
  이뤄지므로 좁은 화면에서 쌓인 전이가 창 확장 순간 소급 발화하지 않는다.
- 효과는 (a) open 플래그만 켠다. E24 최상위 불변식의 (b) 뷰 강제는 **발화 전제조건**
  (이미 그 뷰에 있음)으로 충족된다 — 뷰 강제 ref 를 부르지 않는다.
- 픽 감소·0 은 개방 상태에 영향을 주지 않는다(표면 자신의 빈 상태가 담당 —
  학습지 표면 `:1236-1263` 기존 빈 상태 · 시험지 표면은 0건에서도 성립, E24-0 ②-c 무접촉).

##### E25-1 함께 바뀌는 것

1. **표면 안내문 제거**: `exam-compose-surface.tsx:215-219` · `sheet-compose-surface.tsx:1037-1041`
   의 「체크 = 조판」 상시 안내 `<p>` 를 삭제한다(지시 원문). 동작 자체가 그 문장이 됐다.
2. **실행대(레일)는 전부 존치한다** — CTA·라벨 자구 포함 무개변(⑦(c) 자구 계약 유지).
   실행대가 보이는 상태는 이제 「픽 0」·「수동 폐쇄 직후」·「배포 인텐트」뿐이고, 그
   상태들에서 CTA 는 재개방 어포던스다. SHOW_MOBILE 배포 갈래 존치 계약(feature-flags
   「env 1줄 복구」)도 무접촉.
3. **`<xl` 드로어 고지에 [조판 접기] 버튼 신설**: 조판 가시 중 드로어는 「넓은 화면에서
   표시됩니다」 고지만 있고 **닫을 수단이 0** 이었다(억제 ③ 이후 <xl 자동 개방은 없지만
   명시 경로로 연 뒤 창을 좁힌 상태가 남는다). 고지 아래에 접기 버튼을 두고, sheet 축은
   **전용 정자구** `confirmSheetComposeCollapse()`(「조판을 접으면 사라집니다」 —
   sheet-compose-dirty-guard 신설)를 앞세운다. ⚠ 초판이 재사용한 REMOVE 자구(「조판에서
   빼면」)는 대기열이 통째로 보존되는 접기에서 **거짓 경고**였다(적대검수 minor 확정 —
   개정 완료). exam 축은 IndexedDB 초안 계열이라 즉시 접는다.
4. **요약 스트립 [→] 점프의 실효 의미 변화**: 콜백 자체는 여전히 뷰 전환만 한다
   (E24 ⑥ 코드 계약 무개변 — `goExamView`/`goSheetView` 는 open 을 켜지 않는다).
   그러나 착지 뷰에서 발화 ① 이 돌므로 **사용자 체감은 「점프 = 조판 도착」** 이다.
   E24 ⑥ 의 ⚠(「열면 편집 중이던 것 위에 다른 문서 개방」)이 금지한 실해는 발생하지
   않는다: 효과는 픽·활성 문서를 **건드리지 않고** open 만 켜므로, 이미 열려 있던(숨김
   보존) 표면은 그대로 다시 보이고, 닫혀 있던 표면은 현재 대기열 그대로 마운트된다.

##### E25-2 게이트 개정 (G4·G5·G8 재정의 — 프로브 이행은 코드와 같은 커밋)

| ID | 구 판정 | **신 판정** |
|---|---|---|
| G4′ | 합본 CTA **클릭** → 뷰 유지·인쇄 루트 1 | sheet 뷰에서 학습지+문항 체크 → **CTA 없이 자동 개방**된 합본 표면 · 뷰 유지 · 인쇄 대상 루트 **정확히 1** |
| G5′ | 실행대 [시험지 조판] **클릭** → 빌더 가시 | exam 뷰에서 문항 체크 → **자동으로** `#exam-paper-print-root` 가시 · `#sheet-compose-print-root` 비가시 |
| G8′ | 점프 [→] = 뷰만 전환(**조판 안 열림**) | 점프 [→] = 뷰 전환 **+ 픽 보유 시 착지 뷰에서 자동 개방**(발화 ①). 콜백이 open 을 직접 켜지 않는 것은 코드 검사로만 유지 |
| G16 | (신설) | [돌아가기]로 닫은 뒤 **같은 뷰에 머물며** 픽 유지 → 재개방 **0**(억제 ②) · 실행대 복귀 · 그 상태에서 새 체크 1회 → 즉시 재개방(발화 ②) |
| G17 | (신설) | 행 [모바일 배포](SHOW_MOBILE on 한정) → 조판 접힘 + 폼 펼침이 자동 개방에 **되말리지 않는다**(억제 ①) |

| G18 | (신설) | `<xl(1100px)` 에서 체크 → **자동 개방 0 + 중앙 무붕괴**(억제 ③). 판정 주체 = 스모크 `_e25-smoke.mjs` S8 (음성테스트 이력: 가드 삽입 전 region:1·846→420 실측 검출) |

- `behavior-exam-studio.mjs` G6(CTA 클릭 진입)·G8(돌아가기 → CTA 복귀), `probe-polish-v23.mjs`
  P4 진입(:149-151 `ctaCount!==1` throw), `probe-builder-payload.mjs` P1/P2 진입도 같은 커밋에서
  「체크 → 자동 개방」 진입으로 이행한다. 판정 축은 「FAIL 0」이 아니라 **실행된 항목 수**
  (E24-3 위장 실패 40항 실측)를 유지한다.
- (적대검수 보강) CTA 클릭 진입 프로브의 **전수 원장**은 위 4종 + `probe-compose-room` ·
  `probe-sheet-compose` · `probe-print-break` · `probe-compose-integrity` ·
  `probe-force-collapse` · `probe-final-activity` · `probe-f3-print-hijack`(누락 적발분) ·
  `capture-states`(스크린샷 문서화 — S5 진입 CTA, 산출물 이름과 내용이 어긋나는 상태로
  잔존, 재캡처 시 이행 필요) 총 12종이다. 목록 밖 프로브를 완료 선언의 근거로 쓰지 마라.
- G6(인쇄 루트 ≤1 왕복)·G7(선택 보존)·G11(③칩 소등)·G13(전량 베이스라인)은 **무개정 유지**.
  G11 이 사는 이유 = `stepAdvanced`/`hasRightPanel` 분리(E24 ⑨)가 무접촉이기 때문이다.

##### E25-3 무회귀 불변식 (전부 E24 승계 — 개정 아님, 재확인)

- 인쇄 대상 루트 **정확히 1**(②-b DOM 계기 존치 — 자동 개방으로 두 표면 동시 open 의
  도달 빈도가 최대가 되므로 이 계기의 가치도 최대가 된다).
- 표면 `active` = **가시 파생값**(②-c). 자동 개방은 open 만 만지고 가시 산식·active 배선
  무접촉.
- 탭 전환 ≠ 언마운트(E24-1-9) · 표면은 aside 한 곳 마운트(E24-1-7) · 선택은 뷰 공유(③)
  · fetch 게이트 두 축(⑤) · 델타 커밋(E24-1-3) 전부 무접촉.
- 자동 개방 효과는 **픽 Map·activeSheetId·flatPicked 를 절대 변경하지 않는다** — 변경하는
  순간 E24 ⑥ ⚠ 이 금지한 「이동 + 편집 위에 개방」이 실제가 된다.

##### E25-4 확정 결함 원장 — 미수리·사용자 결정 대기 (적대검수 26-08-22, 반증 검증 통과분)

현재 도달 불가(§M `SHOW_STUDIO_MOBILE_LEARNING=false`) 또는 E24 승계 잔여라 이번 커밋에서
수리하지 않은 **실재 결함**들이다. §M 을 켜는 날, 이 원장이 선행 수리 목록이 된다.

| # | 심각도 | 내용 | 도달 조건 |
|---|---|---|---|
| 1 | major | **exam 축 배포 폼 파괴**: 배포 폼(레일 로컬 state — 펼침·마감 프리셋·직접 날짜)을 채우는 중 새 문항 체크 → 발화 ② → `anyComposeVisible` 이 실행대를 언마운트 → 폼 입력 전량 무고지 소실. exam 축에는 억제 ① 상당의 보호가 없다(폼 개방 여부를 오케스트레이터가 모른다). sheet 축도 인텐트 소비 후 창은 동형 | §M on |
| 2 | major(선재 E24) | **hidden-aside 인텐트 소비**: `<xl` 에서 행 [모바일 배포] → CSS 숨김 aside 인스턴스가 `pendingSheetDeployId` 를 비가시로 소비 → 드로어 인스턴스는 pending=null 로 태어나 폼 미개방. 파괴 고지(대기열 N→1)에 동의한 대가만 남는다 | §M on + `<xl` |
| 3 | major(선재 E24) | **프룬 ①-b dirty 소실**: 조판 open+hidden+dirty 상태에서 지문관리 도시에 선택 교체 → 렌더 중 프룬이 confirm 없이 활성 문서를 컷 → 미저장 편집 소멸(E24 가 「고지만 남긴다」로 접어둔 잔여를 자동 개방이 증폭 — open 상태 도달이 흔해짐). 초안 없음(학습지 축)이라 복구 0 | dirty + 도시에 교체 |
| 4 | minor | **exam 드로어 [조판 접기] 디바운스 꼬리**: IndexedDB 자동저장(900ms 디바운스)이 언마운트 cleanup 에서 플러시 없이 파기 — 접기 직전 900ms 내 편집분이 초안에서 빠진다(신규 작성 경로 한정) | `<xl` 접기 |

##### E25-5 잔여 자구 개선 후보 (nit — 프로브 텍스트 의존이 있어 일괄 보류)

- sheet 뷰 빈 상태 「②에서 학습지나 문항을 고르면 여기서 조판합니다」 — 문항 체크는 이
  뷰에서 무발화(교차 축)라 절반만 참. ⚠ `probe-sheet-compose` §M 검침·스모크 S1 이 이
  문구를 매칭하므로 **개정 시 프로브 동시 이행 필수**.
- `sheet-compose-surface` 빈 상태 「…학습지를 1건 이상 함께 체크해야 열립니다」 — E25
  어휘(체크=개방)와 충돌, 「채워집니다」 계열로 개정 후보.
- `<xl` 드로어 트리거 고정 자구 「지문 현황」 — 조판 뷰에서는 내용(실행대/고지)과 불일치.

##### E25-6 도시에 「미리보기」 모듈 칩 층 폐기 (26-08-22 추가 지시)

지시 원문: "(어휘·직독직해·어법·빈칸 복원·어순 배열·해석·영작 칩 스트립) 참고로 이것도 필요 없어".
`passage-dossier-pane.tsx` 의 구 ③층(D4 → E19-5 3층: 「미리보기」 캡션 + 보유 모듈 칩 +
실전 문제 칩)을 **배관째 폐기** — `onPreviewModule` 사슬 2계층 · `preview` 상태 ·
`ModulePreviewSheet` 마운트 · `MODULE_CHIP_READY/BUTTON` 토큰 · `StudioModuleId` 참조까지
전부 제거(파일 내 완결, 오케스트레이터 무접촉). `readyChips` 는 학습지 Sec 빈 상태 판정이
계속 쓰므로 존치. **모듈 미리보기의 정본은 지문 스튜디오**(`passage-studio-client` —
자체 시트 호스팅)로 일원화된다. E19-5 3층 서술은 이 절이 2층으로 개정한다.

#### 3.10.25 (E26, 26-08-22) 온보딩 투어 — 첫 방문자 스포트라이트 튜토리얼

**지시 요지**: 첫 방문자용 튜토리얼 철저 강화 — 친절한 멘트 · 지문 등록 3경로(텍스트/
PDF·이미지 크롭/기출, 크롭은 좌표를 강박적으로 계산해 시연) · 학습지 생성 시 화면 딤 +
우측 큐 스팟 · 미리 만든 자료 기반 결과 표시 · 문제 생성(유형→큐→결과) · 학습지
조판(문제 이어붙이기 강조 · 단어장/빈칸/영작) · 시험지 조판(1단/2단·A4/B4 실토글) ·
전 기능 커버 · 건너뛰기 필수.

**작업 스펙 정본(전 계약·38스텝 문구 원장·데모 계약·게이트)**:
`.tmp-studio-tour/spec.md` — 이 절은 색인이다. 요지:

- **구현**: `src/components/studio/tour/` 신규 계층(엔진·스포트라이트·스텝 7챕터
  38스텝·인터랙티브 데모 9종). **프롭 0 자립** — 필 전환은 `button[data-asset-view]`
  실클릭, 상태는 DOM 파생. 서버 액션 0 · 스토어 쓰기 0 · **픽 생성 0**(E25 자동
  개방과 간섭 금지). idle 이면 포털 미마운트(DOM 기여 0).
- **스포트라이트**: SVG evenodd 딤(rgba(2,6,23,.62)) + rAF 스프링 추적(명령형, 앵커
  실측 오차 ≤1.5px 계약 — 실측 최악 0.00px). 링 `[data-tour-ring]` = 컷아웃 계기.
  컨테이너 계기 축 `data-tour-anchor/-anchor-sel/-pad`. 앵커 소실 600ms → 중앙 강등.
- **억제(무회귀 핵심)**: 자동 환영은 `navigator.webdriver` 에서 발화하지 않는다 —
  기존 QA 프로브 12종 보호. 투어 자체 프로브만 `?tour=start` 로 뚫는다. `?tour=off`
  강제 차단. dev 한정 `?tourShift=N` = 좌표 게이트 음성테스트 훅.
- **진행 저장**: `localStorage["studio-tour-v1"]`(pending/done/dismissed + step) —
  이어보기·재시작. 헤더 「튜토리얼」 버튼(`data-tour-launcher`, 필 스트립 밖 —
  G1·G15 무접촉)이 상시 재진입점.
- **자동 클래스 선택**: 스텝 view 보장 시 필이 없으면(클래스 미선택)
  `[data-tour="quick-class"]` 1회 실클릭 후 재시도. 클래스 0개면 조용히 폴백.
- **기존 파일 편집 = 정적 `data-tour` 앵커 + 헤더 버튼 + coach 억제뿐** — memo
  방어선 prop 무접촉. 앵커: `asset-pills`(source-switcher) · `add-passage`(〃) ·
  `cta-sheet-generate`(library-pane) · `composer-list`/`composer-passage-filter`
  (composer-list-pane) · `step-strip`(step-strip) · `quick-class`(step-guide-pane).
  coach.tsx 는 `body[data-studio-tour-active]` 관찰로 투어 중 말풍선 억제.
- **문구**: §10 계약(합니다체·이모지 금지) + 실 화면 자구 미러는 실 모듈
  import/출처 주석 강제(상품 3종 = `STUDIO_SHEET_PRODUCTS` 직수입).

- **E25 억제 ④ 신설(이 절이 E25-0 에 추가하는 유일한 조항)**: autoCompose 효과는
  `body[data-studio-tour-active]="1"` 동안 발화하지 않는다 — 투어의 필 실클릭
  전이는 사용자 의사가 아니며, 픽 보유 세션에서 수동 폐쇄(억제 ②)를 우회해
  표면을 되열던 적대검수 확정 major 의 수리다. ref 전진은 유지되어 투어 종료 후
  소급 발화가 없다. E25 결합 프로브 재주행 그린(11/11·14/14).

**게이트(E26-G, 최종 실측 26-08-22)**: `.tmp-studio-tour/behavior-tour.mjs` —
T1 완주 **37/37**(적대검수로 ch3-bridge 삭제) · T2 좌표 잠금 24스텝 최악 0.00px
+ **필수 잠금 검열 6/6**(핵심 앵커 미잠금 = RED — 「조용한 강등」 사각 봉쇄) ·
T3 카드 뷰포트/가로스크롤 0 · T4 webdriver 자동 억제 · T5 건너뛰기/점프/이전/
Esc/이어보기(**스텝 id 저장**)/재개 7종 · T6 데모 실동작 **6종 전수** · T9
음성테스트(24px 주입→24.0px 검출 — 계기 생존 실증) · T10 idle DOM 0 ·
**T11 톤 정적 게이트**(해요체 서술형·이모지 스캔 — 행동 게이트가 못 보던 §10
계약 축, 검수 5렌즈 합치 사각 수리).
**16 PASS / 0 FAIL · 실행 게이트 9/9** (판정 축은 실행 수 — E24-3 위장 실패 교훈 유지).
적대검수 5렌즈(코드·무회귀·자구·UX 실물·전역 정합) 원시 40여건 → 채택 24건
전량 이행 — 전 원장은 `.tmp-studio-tour/spec.md` §6.

⚠ 재발 금지: ① 스크린샷 감상으로 딤 부재를 진단하지 마라 — 이미지 프리뷰가
알파 레이어를 밝게 왜곡한 실사고(픽셀 실측 rgb(96,100,111)이 진실이었다). 판정은
픽셀 프로브로. ② CH1 순서는 tree→pillars 고정 — pillars 의 view 보장이 클래스를
선택하면 레일이 접혀(§3.10.12) tree 앵커가 사라진다. ③ 스텝 id 는 저장 호환 축
(localStorage 가 **id 를 저장**한다) — 개명 금지. ④ 데모 캡션·문구 행에 고정
높이 금지 — 좁은 오버레이(360px)에서 2줄 감김이 위로 넘쳐 잘린다(픽셀 실측).
⑤ 프로브 주행 중 소스 편집 금지 — HMR 재컴파일이 주행 중 프로브를 가짜 RED
7건으로 학살한 실사고.

---

### 3.2 `/director/studio/c/[classId]` — 클래스 홈

헤더 밴드: 클래스명(클릭 = 이름 변경 인라인) + 학생 N명 칩 + `학생 초대` 보조 버튼.
탭 바(4탭 고정): **지문 · 학생 · 결과 · 설정** (쿼리 `?tab=`, 기본 지문).

#### 지문 탭
- 우상단 `+ 지문 등록` (primary).
- 지문 행 카드 리스트(1열): 좌측 제목·출처 메타(회차·번호 등), 중앙 상태 칩
  (`분석 완료` good / `분석 전` neutral / `분석 중` progress — 진행률 %는 표기하지 않는다:
  fast 분석 라우트가 잡 단위 진행률을 제공하지 않는다. 개정 2026-08-09), 우측 보조 정보
  (배포 N건 · 마지막 배포일) + 화살표. 행 클릭 → 지문 스튜디오(3.4).
- 빈 상태: "이 클래스에서 사용할 지문을 등록해 주세요" + `+ 지문 등록`.

**지문 등록 모달** — 탭 4개:
1. **내 자료** (기본): 검색 인풋 + 전 지문 리스트(학원 공용 자료 전체 — 기존 자료실과 같은
   풀). 다중 선택 → `N개 등록`. 이미 이 클래스에 등록된 지문은 체크 표시+비활성.
   행 우측 `내용` 토글로 **본문을 행 안에서 펼쳐 확인**할 수 있다(제목이 "지문 1" 류인
   대량 추출 지문 식별용 — 개정 2026-08-10). 본문은 첫 펼침 때 지문 단위로 지연 로드
   (`getStudioPassageText`, 목록 응답은 슬림 유지)·컴포넌트 캐시, 펼침은 선택 체크와 독립.
2. **붙여넣기**: 제목(선택) + 본문 textarea → `등록`. 기존 지문 생성 경로 재사용(§12).
3. **AI로 만들기**: 기존 AI 지문 생성(passage-authoring) 재사용 — 모달 안에서 안 되면
   해당 화면으로 이동 후 복귀 링크(§12 정찰 결과에 따라 확정).
4. **파일/OCR**: 기존 임포트 플로우(`/director/workbench/passages/import`)로 새 탭 안내 —
   "가져오기가 끝나면 '내 자료' 탭에 나타납니다".

#### 학생 탭
- 우상단 `+ 학생 등록` (primary).
- 테이블: 이름 · 학생 코드(모노스페이스) · 최근 학습일 · 진행 요약("과제 3건 중 2건 완료") ·
  행 우측 `초대장` 버튼(말풍선 아이콘) + 케밥(제외).
- **학생 등록 모달**: 이름 1필드(연속 등록 지원 — 엔터로 다음 이름). 신규 학생은 학생 코드
  자동 발급. **기존 학원 학생 검색·연결**도 같은 모달 상단 검색으로 지원(중복 계정 방지).
- 등록 직후 **초대 키트 시트** 자동 오픈(§5).

#### 결과 탭
- 배포 과제 리스트(최신순): 제목(모듈 조합 칩 포함) · 대상 요약(학생 N명) · 완료 n/m ·
  평균 첫 시도 정답률 · `자세히`. 자세히 = 기존 과제 상세(학생별 매트릭스) 재사용(§12).
- **평균 첫 시도 정답률은 stageStates 재계산이 정본**(worksheet-study-spec §5.1) — 목록·이력
  카드도 저장 스냅샷 `masteryPct` 를 그대로 평균내지 않고 「자세히」 모달과 같은 원천을 쓴다.
- 빈 상태: "아직 배포한 학습이 없습니다 — 지문 탭에서 시작해 보세요".

#### 설정 탭
- 클래스 이름 변경 · 클래스 보관(비활성화, 삭제 아님 — "보관하면 목록에서 숨겨집니다.
  학생 관리(ERP)의 반 목록에서도 비활성 처리되며, 학생 기록은 지워지지 않습니다") ·
  학생 코드 일괄 복사("이름⇥학생코드" 줄 텍스트). (개정 2026-08-09: "초대 코드"→"학생 코드",
  보관 문구에 ERP 반 목록 파급 명시 — 같은 Class 실체를 공유하므로.)

### 3.3 지문 등록 → 분석

지문을 등록해도 **자동으로 AI 분석을 시작하지 않는다**(비용 통제 — 사용자가 버튼으로 시작).
분석은 **모듈 단위**다(§3.4 개정) — "전체 일괄 분석 후 해금" 게이트 화면은 존재하지 않는다.

### 3.4 `/director/studio/c/[classId]/p/[passageId]` — 지문 스튜디오 (2026-08-10 전면 개정)

상단: 뒤로(클래스 홈) · 지문 제목 · 출처 메타 · `원문 보기` 토글(접이식 원문 카드).

> **개정 배경(사용자 지시 2026-08-10)**: "한 번에 다 분석하는 게 아니라 나눠서 분석하게 하라.
> 어휘만 분석할 수 있고, 직독직해만 추출할 수 있어야 한다." — 구 A/B 이분(분석 전 대형
> 게이트 카드 → 전 모듈 해금)은 폐기. **모듈 카드가 1급 표면**이고, 각 카드가 자기 분석을
> 스스로 시작한다.

**A. 모듈 그리드(항상 표시 — 분석 여부와 무관)**: 7모듈 카드. 열 수 정본(2026-08-10 감사
개정 — 구 문구 "2열, 태블릿 3열"은 실측과 어긋나 폐기): **폰 1열 · sm(640+) 2열 · lg(1024+)
3열 · xl(1280+, 에뮬레이터 레일 동반) 2열**. 태블릿 768 에서 3열은 카드 폭이 무너지고, xl 에서는
우측 레일(420px)이 본문을 좁히므로 오히려 열을 줄여야 카드가 판독 가능하다.
**카드 골격은 상태와 무관하게 동일**하다 — 체크박스 자리는 항상 예약(needs 는 자리표시),
부제는 2줄 높이 고정, 하단 액션은 바닥 정렬. 상태에 따라 좌측 정렬선·밑변이 달라지면
같은 그리드가 지그재그로 보인다(감사 L2-01·L2-04).
각 카드는 **자기 상태**를 가진다:

| 상태 | 카드 표기 | 동작 |
|---|---|---|
| 미생성 | 모듈명 + 부제 + `분석하기 · N크레딧` 버튼 + **"분석 약 1분 소요"** | 클릭 → 그 모듈 섹션만 부분 분석(아래 종량제) |
| 생성 중 | 진행 스피너 + "어휘 분석 중…" (해당 카드만) | 다른 카드 버튼은 잠시 비활성(지문당 동시 1잡) |
| 사용 가능 | 문항 수·예상 분("6문항 · 약 3분") + 체크박스(배포 선택) + `미리보기` | 기존 계약 그대로 |
| 실패 | **"분석에 실패했습니다 — 크레딧은 환불되었습니다"** + `다시 시도` | 재시도 시 완성분 이어받기(체크포인트) |

그리드 상단에 **얇은 요약 스트립**(대형 히어로 카드 아님): 문장은 "필요한 모듈만 골라
분석하세요", 가격은 버튼 라벨 `남은 전체 분석 · N크레딧` 한 곳에만 둔다(2026-08-10 감사
L2-13 — 구 문구는 같은 라벨을 문장과 버튼에 두 번 반복했다). 남은 전체 분석 가격이 0이면
스트립을 숨긴다. **분석이 진행 중이면 스트립 자리를 스트리밍 패널이 대신한다**(§3.4.1-12) —
생성 중에 구매 유도를 계속 띄우지 않는다.

**모듈 ↔ 분석 섹션 매핑(정본 — `src/lib/studio/module-sections.ts` 가 단일 소스)**:

| 모듈 | 스테이지(§7) | 카드 부제(문구 정본) | 필요 섹션(빌더가 아이템 생산에 실제 소비) |
|---|---|---|---|
| 어휘 | vocab-quiz (+vocab-match) | "단어 시험" | passage + vocabulary |
| 직독직해 | reading + chunk | "문장 통독과 끊어 읽기" | passage + summary |
| 어법 | grammar | "어법 포인트 OX·택일" | passage + grammar |
| 빈칸 복원 | cloze | "핵심 표현 빈칸 채우기" | passage |
| 어순 배열 | order | "우리말 보고 어순 맞추기" | passage |
| 해석·영작 | translation (+reproduction) | "해석 쓰기·백지 영작" | passage |
| 실전 문제 | exam | "수능형 확인 문제" | 실전 학습지 특례(아래) — 섹션 종량제 대상 아님 |

**섹션 종량제(가격 정본 — 2026-08-10 검수 개정)**: 분석 요청의 가격 =
**`min(부족 섹션 수 × 1크레딧, 5 − min(보유 섹션 수, 5))`** — 부족분 종량 + **지문(콘텐츠
해시) 누적 지출 상한 5크레딧**. 상한을 요청 단위가 아니라 누적 보유 기준으로 걸어야
**순차 구매 총액 = 일괄 구매 총액(항상 ≤5)** 불변식이 성립한다(검수 L1-F4: 구식
`min(missing,5)` 는 부분 2 + 남은 전체 5 = 7크레딧으로 불변식을 깼다). 예: 빈 지문 어휘만
= 2크레딧(passage+vocabulary) → 어법 추가 = 1크레딧 → 빈칸·어순·해석영작 = **0크레딧 즉시
사용 가능**(passage 보유 — 데이터가 있으면 모듈은 열려 있다, G2) → `남은 전체 분석` =
min(5부족, 5−2보유) = **3크레딧**(총 5, 일괄가와 동일). 본문 수정(스테일)은 보유 0 취급 —
새 본문 = 새 작업이므로 전액이 정당하다.
`남은 전체 분석` = 6섹션 전부 목표(passage·vocabulary·summary·grammar·parsing·exam-focus).
【개정 26-08-21】 learning-worksheet(지문 논리 구조 분석·logicRows 표)는 **폐지**됐다 —
렌더 슬롯·프롬프트·섹션 정본(FULL_ANALYSIS_SECTIONS)에서 모두 제거되어 더는 생성·과금
대상이 아니다. 이 kind 는 이제 유료 '실전 학습지'(워크북/추론) 생성물 전용이며, 분석
섹션이 아니므로 부분 병합에서 비분석 extras 로 통째 보존된다(partial-analysis (c)). 전체에만 포함되는 parsing 은 문항 선별 품질 신호 + 인쇄
분석지 완성 가치. 0크레딧 카드는 버튼 없이 곧장 "사용 가능"으로 보인다(잠금 금지 —
무설계 잠금은 이 개편이 제거하려는 바로 그 냄새다). 요약 스트립은 `남은 전체 분석` 가격이
0이면 숨긴다(구 문구 "모든 모듈이 사용 가능이면 숨긴다"를 이 기준으로 대체).

**실전 문제 모듈 특례(유지 — 검수 개정 3건 반영)**: 수능형 세트는 분석 섹션이 아니라 실전
학습지 생성물(worksheet-grade learning-worksheet·self-check)이 원천 — 카드 버튼
`실전 문제 생성 · 5크레딧`, 기존 옵트인 라우트 호출(§12), 완료 후 활성화. 코어 분석의
learning-worksheet(logicRows 표)와 혼동 금지(프롬프트가 드릴·워크북·추론 생성을 명시 금지 —
section-prompts.ts:105 실측). 검수 개정: ① 실전 보유 판정은 **worksheet-grade**(lw 에
drills·workbookSet·inferenceSet 중 실존) 기준 — 코어 lw(logicRows만) 존재로 구매 버튼을
숨기면 안 된다(검수 L1-F2). ② PRIME 리포트가 하나도 없으면 버튼 비활성 + 캡션 "다른 모듈을
먼저 분석하면 생성할 수 있어요"(라우트가 404 를 반환하는 막다른 클릭 금지 — 검수 M4).
③ 실전 생성도 workbenchAiJob 수명주기(활성 잡 검사→PROCESSING 잡→종결)를 가진다 — 잡 없는
동기 실행은 새로고침·타 스태프 화면에서 버튼이 재활성돼 5크레딧 이중 차감 창을 연다(검수 M3).
부분 분석과 실전 생성은 같은 활성 잡 검사로 상호 배제된다(지문당 동시 1잡).

**스테일(본문 수정) 규칙(정본 — 검수 M6·L2-2)**: `PassageAnalysis.contentHash` 가 현재 본문과
다르거나 **행이 없으면** 스테일이다(행 부재 = 검증 불가 = 스테일 — 라우트·액션 동일 술어,
검수 M5). 스테일이면: 보유 섹션은 가격·시드 양쪽에서 0 취급(전액 재과금 정당), **비분석
섹션(self-check 등)도 보존하지 않는다** — 구본문 기준 문항이 새 본문 리포트에 병합돼 학생에게
서빙되는 것을 금지한다(실전 학습지는 재생성 유도). 스테일 지문의 부분 분석은 결과적으로
리포트를 요청 섹션만으로 축소하며, 배포된 과제의 문항 구성도 그에 따라 바뀐다 — 지문
스튜디오는 스테일 상태에서 이를 사전 고지한다(문구: "본문이 수정되어 기존 분석이 무효화
되었습니다. 다시 분석하면 배포된 학습의 문항 구성도 바뀝니다.").

**다른 클래스와의 연결(G2 유지)**: 섹션은 지문 단위 저장 — 다른 클래스에서 이미 분석한
모듈은 여기서도 즉시 사용 가능.

#### 3.4.1 섹션 종량제 서버 계약 (fast 라우트 additive 확장 — 무회귀)

- `POST /api/workbench/ai-jobs/passage-analysis/fast` 요청에 선택 필드
  **`targetSections?: SectionKind[]`** 추가(7종 enum). 부재 시 현행 전체 분석과 **바이트 동일**
  동작(기존 학습지 생성 페이지 무회귀 — 5크레딧 정액 그대로).
- `targetSections` 존재 시:
  1. 현 PRIME 리포트의 보유 섹션 산출. 단 `PassageAnalysis.contentHash ≠ 현재 본문 해시`면
     본문이 수정된 것 — 보유 섹션을 **전부 스테일 취급**(가격·시드 양쪽에서 무시).
  2. `missing = targetSections ∖ 보유` (passage 는 REQUIRED 라 미보유 시 항상 포함).
     `missing = ∅` → 과금·LLM 없이 즉시 "이미 준비됨" 응답.
  3. 과금 = `min(|missing|, 5)` 크레딧. 환불 경로 3곳(품질 게이트·예외·부족) 전부 이 금액.
  4. 생성 = 기존 회복형 생성기 그대로 — **기존 보유 섹션을 체크포인트로 시드**하고
     `targetKinds = 보유 ∪ 요청`. 생성기는 보유분을 스킵하고 부족분만 섹션 단위 생성
     (문장 번호 정합은 시드된 passage 기준 reconcileSentenceRefs 가 보장).
  5. 품질 게이트(부분 전용): **요청한 missing 중 하나라도 미완성이거나 passage 가 결정론
     폴백이면** 전액 환불 + FAILED(부분 성공 어중간 과금 금지). 체크포인트는 보존 — 재시도가
     이어받는다.
  6. 저장 병합(검수 개정 — M1·M6·L5-4): 병합 원천은 **신선(freshReport) 리포트만**(스테일
     본은 어떤 섹션도 새 리포트에 얹지 않는다 — 위 스테일 규칙). 신선본 기준 3중 보존:
     (a) 비분석 섹션(self-check 등) 보존, (b) **부분 실행으로 기보유 분석 섹션이 소실되지
     않는다** — 생성기 산출에 없는 신선 보유 섹션은 되살린다(시드 재검증 탈락 안전망),
     (c) **worksheet-grade learning-worksheet 필드(drills·workbookSet·inferenceSet 등) 오버레이
     복원** — 생성기 조립이 `stripWorksheetContentFields` 로 학습지 필드를 소거하므로(코어
     게이트, resilient-generate.ts:327) 오버레이 없이는 부분 분석 1회가 +5크레딧 실전
     콘텐츠를 파괴한다(critical). PRIME 리포트 제자리 갱신(현행 계약).
  7. 파생 `PassageAnalysis` 갱신 시 리포트가 6섹션 미만이면 analysisData 에
     `_partialSections: string[]` 마커 기록. **캐시 완료 판정 가드는 공용 헬퍼 1개**로 두고
     `shouldUseCachedAnalysis` 3벌 복제본(fast 라우트 · trigger/workbench-passage-analysis ·
     api/ai/passage-analysis/[passageId]) **전부**에 적용한다(검수 M2 — 1벌만 고치면 나머지
     표면이 부분 데이터를 완료 캐시로 서빙). 마커 없는 기존 데이터 동작은 불변.
  10. 부분 요청은 홀리스틱 초안을 항상 건너뛴다(targetKinds ⊂ 전체) — 초안 프롬프트는 전체
      6섹션용이라 2크레딧 요청에 전체급 LLM 원가가 나가고 비대상 산출은 폐기된다(검수 L5-3).
  11. 카드 "생성 중" 표시 규칙(2026-08-10 재개정 — 사용자 지적 "어휘만 눌렀는데 왜
      다른 것도 돌아?"): **클릭한 카드 하나만** "분석 중"으로 표시한다. 클라이언트가
      요청에 `sourceModule` 을 실어 보내고 잡 config 에 기록 — detail 은 sourceModule
      카드만 generating(구형 잡·전체 요청은 종전 부분집합 규칙 폴백). 공유 기반(passage)
      으로 함께 준비되는 모듈은 조용히 needs(버튼 비활성 — 동시 1잡) 상태를 유지하다가
      완료 시 ready 로 바뀌며 **완료 토스트가 덤 해금을 알린다**(문구 정본:
      "{모듈} 분석 완료 — {덤 모듈 라벨들}도 함께 준비되었습니다" / 덤 없으면
      "{모듈} 분석이 완료되었습니다"). 허위 "실패·환불" 안내 금지 원칙은 유지(완료
      전이 감시는 sourceModule 카드만). 실패 상태는 클라이언트 메모리가 아니라
      **최근 실패 잡(서버)에서 파생**해 새로고침·재진입에도 유지한다.
  12. 생성 스트리밍(2026-08-10 신설): 분석 진행 중 요약 스트립 자리에 공유
      `StreamPreviewPane`(stream-preview-pane.tsx — "문제 생성과 학습지 분석 SSE 가
      공유" 계약 그대로)을 띄운다. fast 라우트 `stream:true` SSE 의 사고/본문 델타를
      tail 로 흘리고, done/error 프레임에서 기존 폴링 완료 처리로 합류한다(스트림
      단절 시 폴링이 실상태를 복원 — 무손실).
  8. 국어(PRIME_KO) 지문 + `targetSections` → 400("국어 지문은 부분 분석을 지원하지 않습니다").
  9. 잡 `config.targetSections` 기록 — `getStudioPassageDetail` 이 진행 중 잡의 대상 섹션을
     읽어 **해당 모듈 카드만** "생성 중"으로 표시.

**C. 배포 바(sticky bottom)**: 좌측 선택 요약("어휘 + 빈칸 복원 · 약 12분") — **10~15분
목표 구간이면 good 톤, 20분 초과면 '길어요' 경고 톤** — 우측 `이 구성으로 배포` primary.

**배포 다이얼로그**: ① 대상 — 클래스 학생 전원 기본 체크, 개별 해제 가능. ② 마감 —
오늘/내일/이번 주/직접(기본 내일). ③ 강도 — 가볍게/표준/집중(기본 표준, 캡 프리셋 매핑).
④ 과제명 자동("[지문제목] 어휘·빈칸 학습" — 수정 가능). `배포하기` → 완료 토스트
"12명에게 배포했습니다 — 결과 탭에서 확인할 수 있습니다".

**D. 이력 섹션**(모듈 그리드 아래): "이 지문으로 만든 학습" — 배포 행(일시 · 모듈 조합 칩 ·
대상 · 완료 n/m · 평균 첫 시도 정답률 · `결과 보기`). **새로 분석** 보조 버튼도 여기.
분석 결과는 지문당 PRIME 리포트 1행을 **제자리 갱신**하고 학생 런타임은 매 로드 재컴파일하므로,
재분석은 이미 배포한 과제의 문항 구성도 새 결과로 바뀔 수 있다(답안 기록은 무거절 원칙으로 보존).
확인 문구(정본): "지문 내용이 그대로면 저장된 분석을 다시 사용합니다. 새 결과가 나오면 진행 중인
학습의 문항 구성도 바뀔 수 있으나, 학생이 이미 푼 기록은 유지됩니다." (개정 2026-08-09 — 구 문구
"이미 배포한 학습은 바뀌지 않습니다"는 파이프라인 사실과 모순이라 폐기.)
**부분 보유 상태 변형(개정 2026-08-10 — 검수 L2-5)**: 보유 섹션이 7종 미만이면 캐시 재사용
문장이 거짓이 된다(마커 가드가 재사용을 의도적으로 차단) — 이때의 확인 문구: "부분 분석
상태에서는 저장된 분석을 재사용하지 않고 전체를 새로 생성합니다(5크레딧). 진행 중인 학습의
문항 구성도 바뀔 수 있으나, 학생이 이미 푼 기록은 유지됩니다."

### 3.5 모바일 (디렉터면 반응형)

스튜디오도 폰에서 동작해야 한다(원장이 이동 중 배포): 사이드바 → 상단 드로어,
카드 그리드 → 1열, 배포 바 → 전폭 sticky.

**브레이크포인트 정본(2026-08-10 감사 개정 — 구 문구 "태블릿(1024px+)은 데스크톱과 동일"이
§3.6 의 xl 레일 기준과 1024~1279 구간에서 충돌해 개정)**:

| 구간 | 모듈 그리드 | 학생 에뮬레이터 | 비고 |
|---|---|---|---|
| ~639 (폰) | 1열 | 타이틀 행 버튼 → 전폭 시트 | 시트 배경 블리드 -mx-3(부모 패딩 실측값) |
| 640~1023 | 2열 | 버튼 → 시트 | |
| 1024~1279 | 3열 | 버튼 → 시트 (레일 없음) | 이 구간이 QA 사각지대였다 — 뷰포트 세트에 1024 를 포함할 것 |
| 1280~ (xl) | 2열 | 우측 420px sticky 레일 | 레일이 본문을 좁히므로 열을 줄인다 |

**하단 sticky 배포 바**: 본문 마지막 콘텐츠가 가려지지 않도록 바 높이만큼 하단 여백을
확보한다. 좌하단 전역 플로팅 위젯과 겹치지 않게 좌측 요약에 여백을 둔다.

---

## 4. 온보딩 코치마크 (신규 공용 컴포넌트)

`src/components/studio/coach.tsx` — 말풍선 1개 = 대상 요소에 `data-coach="<step-id>"`,
컴포넌트가 해당 요소를 찾아 뷰포트 기준 위치에 말풍선(꼬리 포함)을 띄운다.
진행 상태는 `localStorage["studio-coach-v1"]` (완료 step-id 배열). `다시 보지 않기` 제공.
한 화면에 말풍선은 **동시에 1개만**. 대상 요소가 없으면 그 스텝은 조용히 스킵.

시퀀스(각 스텝: 트리거 조건 → 앵커 → 문구):

| # | id | 조건 | 앵커 | 문구 |
|---|---|---|---|---|
| 1 | create-class | 워크벤치 진입 & 클래스 0 | 트리 하단 `+ 새 클래스`(개정 2026-08-10 — 구 앵커 `+ 첫 클래스 만들기` 폐기) | "먼저 클래스를 만들어 주세요. 이름 하나면 됩니다 — 예: 한영고 1학년 내신 심화반" |
| 2 | add-passage | 클래스 홈 & 지문 0 | `+ 지문 등록` | "이 클래스에서 공부할 지문을 등록해 주세요. 내 자료·붙여넣기·AI 생성 모두 가능합니다" |
| 3 | run-analysis | 지문 스튜디오 & 사용 가능 모듈 0 & 생성 진행 중 아님 | 모듈 그리드 컨테이너(개정 2026-08-10 — 구 앵커 `AI 분석 시작` 폐기) | "필요한 모듈만 골라 분석하세요 — 어휘만, 직독직해만도 가능합니다. 이미 만든 분석은 다시 쓰여 더 저렴해집니다" |
| 4 | pick-modules | 지문 스튜디오 & 사용 가능 모듈 ≥1 & 배포 0 | 학습 모듈 섹션 헤더(개정 2026-08-10) | "원하는 모듈만 골라 보세요. 아래에 예상 학습 시간이 계산됩니다 — 10~15분이 적당합니다" |
| 5 | deploy | 모듈 1개 이상 선택 | `이 구성으로 배포` | "이 구성 그대로 학생들 폰에 전송됩니다. 채점과 오답 분석까지 자동입니다" |
| 6 | invite | 학생 탭 & 학생 0 | `+ 학생 등록` | "학생을 등록하면 카톡으로 보낼 초대장이 자동으로 만들어집니다" |

문구는 위 표가 정본(변형 금지). 톤: 디렉터 대상 합니다체, 기술 용어 금지.

---

## 5. 학생 초대 키트

학생 등록 직후·`초대장` 버튼에서 여는 시트. 구성:
- 미리보기 카드(카톡 말풍선 모양 프리뷰) + `안내문 복사` primary + `링크만 복사` ghost.
- 안내문 템플릿(정본 — {} 는 치환 변수):

```
[{학원명}] 모바일 학습 초대장

{학생이름} 학생, 반갑습니다!
아래 순서대로 접속해 주세요.

1. 접속 주소: {접속링크}
2. 학원 코드: {학원코드}
3. 이름과 학생 코드로 로그인
   · 이름: {학생이름}
   · 학생 코드: {학생코드}

접속 후 [과제] 에서 오늘의 학습을 시작할 수 있습니다.
휴대폰·태블릿 모두 사용할 수 있습니다.
```

- {접속링크}: 학생 로그인 URL — 학원 코드가 프리필되는 개별 링크가 가능하면 그것(§12 정찰
  결과로 확정), 불가하면 공용 로그인 URL.
- 클립보드 복사는 기존 유틸 재사용(§12). 복사 성공 토스트 "복사했습니다 — 카카오톡에
  붙여넣어 보내세요".

---

## 6. DB 계약 (additive only)

기존 모델 재사용 — **신규 모델은 1개만**:
- 클래스 = 기존 `Class` + `ClassEnrollment` 재사용(fee=0, capacity 기본값, schedule null).
  이유: `StudyAssignment.targets` 의 `CLASS` 타입이 이 모델을 가리키므로 배포·통계 인프라가
  무수정 호환. 스튜디오는 ERP 필드를 노출하지 않을 뿐이다.
- 학생 = 기존 `Student` (studentCode 자동 발급 — 기존 발급 로직 재사용, §12).
- 분석 = 기존 `PassageReport`. 배포 = 기존 `StudyAssignment`/`StudyAssignmentTask`.

신규(soft-ref, relation-free, surgical SQL — `prisma/migrations-manual/20260809_class_studio.sql`,
`prisma migrate`/`db push` 금지):

```prisma
/// 클래스 스튜디오 — 클래스 ↔ 지문 등록부 (지문은 학원 공용, 등록은 클래스 스코프)
model StudioClassPassage {
  id         String   @id @default(cuid())
  academyId  String
  classId    String   // Class soft-ref
  passageId  String   // Passage soft-ref
  addedById  String?  // Staff soft-ref
  sortOrder  Int      @default(0)
  createdAt  DateTime @default(now())

  @@unique([classId, passageId])
  @@index([academyId, classId, sortOrder])
  @@index([passageId])
  @@map("studio_class_passages")
}
```

생성 이력·배포 이력은 **파생 조회**(신규 테이블 없음): 지문의 분석 = `PassageReport`
(passageId 스코프 최신), 배포 = `StudyAssignment`(kind=WORKSHEET, refId ∈ 그 지문의
reportIds, targets 에 이 클래스 포함 여부는 payload 스냅샷으로 판정).
스튜디오 배포 과제에는 `payload.studio = { classId, passageId, modules: string[] }` 를
스탬프해 역조회를 단순화한다(additive — 기존 소비처는 모르는 필드를 무시).

---

## 7. 모듈 → 스테이지 화이트리스트 (worksheet-study additive 확장)

`WorksheetStudyConfig` 에 **선택 필드 1개** 추가(무회귀 — 부재 시 현행과 완전 동일):

```ts
export interface WorksheetStudyConfig {
  mode: StudyMode;
  required: boolean;
  /** 배포에 포함할 스테이지 화이트리스트 — 부재 = 프리셋 전체(현행 동작) */
  stages?: StudyStageId[];
}
```

- `resolveStudyConfig`: `stages` 는 유효 StudyStageId 만 필터해 통과, 빈 배열은 부재 취급.
- `compileStudyPlan`(CompileInput 에 `stages?` 추가): 프리셋 순회 시
  `stages && !stages.includes(id) → skip`. **contentSig(planHash)에 stages 를 포함**한다.
- `planIsViable`: 화이트리스트가 명시된 plan 은 **채점 스테이지 ≥1** 로 완화(현행 ≥2 는
  화이트리스트 부재 시에만). 어휘만 배포가 성립해야 한다.
- 모듈→스테이지 매핑(§3.4 표)은 `src/lib/studio/modules.ts` 가 단일 정본으로 export.
- 허브·플레이어·리포트·통계는 plan.stages 만 보므로 추가 수정 불필요(빈 스테이지는
  원래 컴파일에서 제외되는 계약과 동형).

---

## 8. 배포 파이프라인 (기존 인프라 재사용)

배포 = 기존 과제 생성 서버 액션 호출(§12 정찰로 액션명 확정) —
kind=WORKSHEET, refId=PassageReport.id, targets=[{type:"STUDENT", …선택 학생}],
payload = { passageTitle, study: { mode, required: true, stages }, studio: {…§6} }.
마감·과제명·안내문은 다이얼로그 값. 완료 판정·이벤트·리포트는 전부 기존 계약.

---

## 9. 어휘 시험 선지 품질 수술 (전역 — 스튜디오 외 기존 배포분에도 적용)

**진단(확정)**: `compile.ts buildVocabQuiz` 의 오답은 같은 학습지 다른 행의 meaning/headword
무작위 3개 — 품사 정합·동의어(복수정답) 차단·혼동어 소비 전무. 캠페인들(문제생성 품질,
단어 드릴 문항팩)은 각각 실전 문제 생성기·단어 훈련 앱에만 적용됐고 이 경로는 무설계.

**수술 (compile 은 순수 유지 — 자산은 서버가 주입)**:

```ts
// CompileInput 에 추가
vocabAssets?: Record<string, VocabDistractorAsset>;  // key = headword lower-trim
export interface VocabDistractorAsset {
  koDistractors: string[];   // 품사 정합·동의어 배제 검증된 한국어 뜻 오답 후보(코퍼스)
  enDistractors: string[];   // 뜻→단어 방향용 영어 표제어 오답 후보
  bannedKo: string[];        // 정답과 동치인 표기들 — 오답 풀에서 반드시 배제
}
```

- `loadStudyContext`(server.ts): plan 컴파일 전에 리포트 vocab rows 의 headword 들로
  코퍼스를 1쿼리 조회(§12 정찰이 확정한 조인 경로) → asset 맵 구성 → compile 에 전달.
  코퍼스 미적중 표제어는 asset 없음 = 폴백.
- `buildVocabQuiz` 오답 선택 우선순위:
  1. asset.koDistractors / enDistractors (seeded 셔플 — 결정론 유지)
  2. 폴백(현행 같은-학습지 풀)이되 **3중 가드 신설**: (a) 정답 행·오답 행의 synonyms 문자열에
     서로의 표제어가 들어가면 배제, (b) asset.bannedKo 표기 배제, (c) 한국어 형태 시그니처
     (어미: ~하다/~한/~히/명사형) 가 정답과 일치하는 후보 우선.
  3. 그래도 3개 미만이면 현행대로 아이템 스킵.
- **결정론 불변**: 같은 (report, taskId, config, assets) → 같은 plan. assets 는 DB 상태라
  준안정 — planHash 변동은 §7.1 무거절 원칙이 흡수(이미 검증된 계약).
- 성공 기준: 실전형 QA(§13)에서 (a) 동일 문항 내 정답-오답 동의어 공존 0, (b) 오답의
  품사 어미 정합률 ≥90%, (c) 혼동어/코퍼스 오답 소비율 — 코퍼스 적중 표제어에서 ≥80%.

---

## 10. 문구·톤 규칙

- 디렉터면: **합니다체 단일**, 간결. 기술 용어(AnalysisReport·컴파일·스테이지 등) 화면 노출
  금지 — "분석", "학습 모듈", "배포" 로 통일. 학생면 문구는 worksheet-study 스펙 §13 그대로.
  **해요체 금지(2026-08-10 감사 L4-16 — 한 화면에 어미가 세 갈래로 섞였다)**. 이 문서 안의
  구 정본 중 해요체였던 것은 아래로 개정한다(코드도 함께 교체):
  · "분석에 실패했어요 — 크레딧은 환불됐어요" → **"분석에 실패했습니다 — 크레딧은 환불되었습니다"**
  · "다른 모듈을 먼저 분석하면 생성할 수 있어요" → **"다른 모듈을 먼저 분석하면 생성할 수 있습니다"**
  · 토스트 "분석에 실패했어요 — 크레딧은 환불됐어요. 다시 시도해 주세요." →
    **"분석에 실패했습니다 — 크레딧은 환불되었습니다. 다시 시도해 주세요."**
- 아이콘 lucide-react 만. 이모지 금지. 카톡 프리뷰 카드도 이모지 없이.
- "선생님" 아닌 "학생" 시점 문구 금지(디렉터면이므로 대상은 원장·강사).

## 11. 무회귀 보증 (검수 렌즈)

1. `/director/workbench/*`·`/g/*` 기존 화면 픽셀·동작 불변 (스튜디오 미사용 시).
2. `payload.study.stages` 부재 과제 = 현행 프리셋 동작과 완전 동일(§7).
3. `resolveStudyConfig`·`compileStudyPlan` 기존 테스트 전부 그린 + stages 계약 테스트 추가.
4. 어휘 수술 후에도: asset 0건 환경(코퍼스 빈 DB)에서 현행 폴백+가드로 문항 성립,
   기존 vocab-quiz 문항 수 급감(>20%) 금지 — 가드로 스킵이 폭증하면 폴백 완화.
5. schema.prisma 는 additive 만(기존 모델 수정 0줄). 수동 SQL 만, migrate/push 금지.
6. `Class` 재사용으로 ERP 클래스 목록에 스튜디오 클래스가 보이는 것은 **의도된 동작**
   (같은 실체) — 단 ERP 화면이 fee=0/schedule null 로 깨지지 않는지 확인.

## 12. 정찰 바인딩 (2026-08-09 정찰 함대 6기 확정 — 전부 file:line 검증됨)

**분석(생성) 파이프라인**
- 학습지 실체 = `PassageReport`(generationPlan="PRIME", deletedAt:null) 1행, pages 에 AnalysisReport JSON.
  판정 정본 `HAS_PRIME_REPORT_WHERE`(src/actions/workbench/passage-constants.ts:20).
- 생성 주 경로 = `POST /api/workbench/ai-jobs/passage-analysis/fast` (maxDuration 300s,
  `stream:true` 시 SSE {t:"phase"|"r"|"c"|"done"|"error"}). 클라 재사용 정본 =
  `usePassageQueue`(src/hooks/use-passage-queue.ts:753 — **cacheKey 신규 부여 필수**, 페이지당 폴러 1개).
- 크레딧: 기본 분석 5(전 코어 6섹션 = 어휘·구문·어법·빈칸·통독 모듈 전부 커버),
  실전 학습지 +5. **부분 생성 훅 `targetKinds`**(resilient-generate.ts:81)는 존재하나 v1 미사용 —
  부분 생성 단가는 신규 과금 정책이라 사용자 결정 대상(§14 열린 결정). v1 세분화는
  "분석 1회 → 배포는 모듈 단위" + "실전 문제만 옵트인 추가 생성"(기존 라우트
  `/api/workbench/passage-reports/prime/[passageId]/worksheet`, +5크레딧, 멱등 병합) 으로 구현.
- 지문당 활성 잡 1개(중복 요청 = 기존 jobId 반환). 같은 본문 재분석은 캐시 단락(과금 0).
- 진행 폴링: `GET /api/workbench/ai-jobs?domain=PASSAGE_ANALYSIS&view=passage-list`.

**지문(내 자료)**
- 목록 = `getWorkbenchPassages(academyId, filters)`(src/actions/workbench/passages.ts:81, 페이지네이션).
  `/api/passages/list` 는 무상한+본문 전문이라 스튜디오 **슬림 목록·등록 피커**에 쓰지 말 것.
  **예외(2026-08-10 개정)**: §3.1.2 워크벤치 중앙 「내 지문함」 임베드는 학습지 생성
  페이지와 동일 표면의 재호스팅이므로 동일 데이터 경로(usePassageLibrary →
  /api/passages/list)를 그대로 쓴다 — 폴더 카운트가 passages[].collectionItems 클라이언트
  파생이라 슬림화와 양립 불가(트레이드오프 인지, 경량화는 v2 후보).
- 영어 전용 스코프: `buildPassageSubjectScopeWhere`(subject null=영어 — `OR:[{subject:null},…]` NULL 함정).
- 붙여넣기 = `createDirectInputPassageMaterial({title, content, …})`(passages.ts:424, 최소 20자).
- AI 지문 생성 = passage-authoring 잡(편당 2크레딧) — v1 은 `/director/workbench/generate`(AI 생성 보드)
  새 탭 딥링크 + "등록한 지문은 내 자료에서 불러오세요" 안내. OCR 도 동일(새 탭 → import).
- ⚠ `deleteWorkbenchPassage`·`updateWorkbenchPassage`·`getWorkbenchPassage` 는 academyId 미스코프 —
  스튜디오에서 노출 금지, 스코프된 패턴만.

**클래스·학생·배포**
- 클래스 = 기존 `Class` 재사용 확정 — "반=폴더" 선례(src/actions/students/class-folders.ts:95,
  name 만으로 create). 단 **capacity 기본 20 이 addStudentsToClass 정원 검사에 걸리므로**
  스튜디오 생성 액션은 자체로 `capacity: 200` 을 넣는다.
- 학생 생성 = `createStudent`(src/actions/students/mutations.ts:61 — studentCode 자동 발급,
  HMAC+bcrypt 동시 기록). 학생은 status ACTIVE 로 생성됨(expandTargets ACTIVE 필터 통과).
- 배포 = `createStudyAssignment`(src/actions/study-assignments/mutations.ts:105) —
  kind:"WORKSHEET", `worksheet:{passageReportId, study}`. **PassageReport 선존재 필수.**
  targets 는 STUDENT 개별 배열(스튜디오 로스터 체크 상태 그대로). revalidate 는
  STUDY_ASSIGNMENT_PATHS 하드코딩이라 스튜디오 경로 revalidatePath 추가 필요.
- 학생 로그인 = 학원코드 4자(`Academy.code`) + 학생코드 6자. **자동로그인 링크
  `/g?ac=&sc=` 지원**(src/app/g/page.tsx:2-4). 링크 빌더 `buildStudentAppLoginUrl`
  (src/components/students/devices/student-app-share-row.tsx:48), 카톡 공유 `KakaoShareButton`
  (SDK 없으면 복사 폴백), 클립보드 `copyText`(student-code-row.tsx:12). 신규 토큰 체계 발명 금지.
- 학습 현황 = `getWorksheetStudyOverview(assignmentId)`(study-stats.ts:156) 재사용 —
  화이트리스트 plan 도 스테이지 열 동적 파생으로 자동 대응.

**worksheet-study 수술 지점**
- `compileStudyPlan` 은 플레인 모듈 — 스튜디오 서버가 가상 taskId 로 **모듈별 문항 수·estMin
  미리보기** 컴파일 가능(배포 전 "이 지문엔 해당 자료 없음" 판정도 이걸로).
- 컴파일 호출부 3곳: server.ts:146(런타임) · src/actions/students/study-item-preview.ts:73(교사
  미리보기) · dev 하네스. **stages/vocabAssets 는 공용 조립 헬퍼로 묶어 세 곳 동시 적용**
  (한쪽만 고치면 미리보기와 실서빙이 갈림).
- `planIsViable` ≥2 규칙(compile.ts:1062)이 "단어만 배포" 최대 함정 — stages 명시 시 ≥1 완화.
- planHash 조합식(compile.ts:1038)에 stages 포함(무거절 원칙이라 안전, stale 감지 정확성용).
- 신규 배포 기본 required:true(mutations.ts:214) vs resolveStudyConfig 폴백 false — 비대칭 인지.

**코퍼스 오답 자산 (어휘 수술 재료)**
- 조회 사슬: headword `trim().toLowerCase()` → `vocabDrillLemma.findMany({lemma, retiredAt:null})`
  (품사 변이 전부) → sense 는 **senseOrder=0 금지**, 학습지 한국어 뜻을 senseKo·senseKoCandidates
  에 normKo/fuzzyKo 대조로 확정(비대표 뜻 17.9% 함정) → `fetchPackAssets(senseIds)`
  (src/lib/vocab-drill/pack-assets.ts:97, gate_clean 필터·장애 폴백 내장).
- **문맥 없는 학습지 어휘 시험 UI 에서 안전한 오답 재료**: ① 팩 `wordChoiceDistractors`
  (뜻→단어 방향, 동의어·어간공유 사전 배제 완료) ② confusable(`getConfusableLemmas`) ③ 런타임
  코퍼스 풀 + formSig/bannedKo 필터. **팩 `meaningChoiceSets` 는 스템(문맥) 동반 필수라 사용 금지.**
- 오답 금지 목록은 같은 표제어(철자) **전 sense 의 senseKo+대안 표기**로 넓힌다.
- 한국어 형태 규칙 정본은 scripts/vocab-item-assets/dossier.mjs(normKo·fuzzyKo·formSig·DA_MATTERS·
  bannedKoOf) — src/lib 로 이식 시 신규 파일을 정본으로 삼고 dossier.mjs 에 포인터 주석
  (동시 수정 금지 규약 §14). 명사 '~다' 우연(바다) 함정: formSig 비교는 DA_MATTERS 품사만.
- 셔플·선택은 반드시 compile 의 seeded rng(결정론) — queue-items 의 Math.random 이식 금지.

**UI·플래그·nav**
- 플래그: `FEATURE_FLAGS.ENABLE_CLASS_STUDIO = publicBooleanFlag(NEXT_PUBLIC_ENABLE_CLASS_STUDIO, true)`
  (기본 on — env 로 킬 가능). 페이지 서두 `if (!FEATURE_FLAGS.ENABLE_CLASS_STUDIO) redirect("/director")`.
- nav: nav-config.ts 출제 파이프라인 그룹에 NavItem(beta:true) 추가. 잠든 주석 블록 무접촉.
- 페이지 골격: `PageShell`+`SectionCard`+`WorkflowPageTitle`+`StatusPill`+`StatTile`(page-frame.tsx),
  큰 작업창은 `WideModal`(좁은 모달 금지), 토스트 sonner, shadcn/ui 전 세트, `useResizablePanels`.
- 하우스 스타일: slate 중립+blue-600 액센트+emerald/rose 상태색. 금지: 주황·앰버, Sparkles 아이콘,
  차트 라이브러리, font-extrabold, desk-*·erp-* 토큰 혼용.
- 코치마크 선례: generate-page-tour(가상 커서). 스튜디오는 §4 의 경량 data-coach 방식 신규.
- 기존 「모바일 학습」(/tutor)·「배포 관리」 숨김 표면과는 **병존**(테스트 페이지) — 대체 아님.

## 14. 열린 결정 (사용자 승인 대기 — 구현은 기본값으로 진행)

1. **부분 생성 단가 — 결정됨(2026-08-10, 사용자 지시로 모듈 단위 분석 확정)**: 섹션 종량제
   (부족 섹션 × 1크레딧, 상한 5 — §3.4 정본). 구 "분석 5크레딧 단일 게이트"는 폐기.
   기존 학습지 생성 페이지의 정액 5크레딧 경로는 무회귀 유지. 단가 숫자 자체(1크레딧/섹션,
   상한 5)의 조정은 여전히 사용자 몫 — `module-sections.ts` 상수 2개로 일원화.
2. **스튜디오 클래스의 ERP 노출(양방향)**: 같은 `Class` 실체라 ERP 반 목록에도 보이고(수강료 0원),
   역으로 ERP 반이 스튜디오 목록에도 노출돼 스튜디오에서 이름 변경·보관이 가능하다. v1 은 이
   공유를 수용(보관 문구에 ERP 파급 명시). 분리를 원하면 v2 에서 스튜디오 마커 필드 추가.
3. **nav 정식 노출 vs URL 직행**: v1 은 nav 베타 배지 노출로 구현(숨김 원하면 주석 처리 한 줄).
4. dossier.mjs ↔ src/lib 한국어 형태 규칙의 단일 정본화 방향(스크립트 리팩터는 v2).

## 13. 검증 게이트

1. `npx tsc --noEmit` → `npm run lint`(신규 파일 스코프) → `npm run build`(최종).
2. 단위: worksheet-study compile/grade 기존 + stages 화이트리스트 + vocabAssets 계약 테스트.
3. 하네스: dev 서버 + 스태프 쿠키 주조(§12 — wordbook 검증 기법 재사용)로 스튜디오 전 화면
   Playwright 캡처(1440/768/390 3뷰포트) + **행동 게이트**(클래스 생성→지문 등록→분석 mock→
   모듈 선택→배포 다이얼로그→학생 등록→초대장 복사까지 실제 조작).
4. 학생면: 스테이지 화이트리스트 배포를 QA 학생으로 실제 진입(/g/w) — 선택 모듈만 노출 확인.
5. 어휘 수술 QA: 실 리포트 표본 ≥20개로 신구 문항 덤프 비교(§9 성공 기준 계측).
6. 적대 검수 함대: 정확성·UX(터치·오버플로)·무회귀(§11)·전역 정합(문구·톤) 4렌즈 + 통독 1기.

## §M. 모바일 학습 임시 숨김 오버레이 (26-08-22 — 사용자 지시)

> **이 절은 오버레이다.** 위 본문(§0~§14)의 모바일 배포·초대·결과 계약은 개정하지
> 않는다 — `FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING`(기본 **false**,
> `feature-flags.ts`)이 꺼져 있는 동안 아래 표면이 **UI 에서만** 숨고, 실행 동선이
> 조판 단독형으로 재구성된다. 서버 액션·라우트·데이터 무접촉 — 기존 배포분과
> 학생앱(/g)은 그대로 동작한다. 복구: `NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true`
> 한 줄(코드 삭제 0 — 전부 조건부 렌더).

### M-1. 숨긴 표면 (플래그 off 기준)

| 표면 | 파일 | off 처치 |
|---|---|---|
| 실행대 [모바일 배포]+인라인 폼+상한/사유 경고 | questions-action-rail.tsx · sheets-action-rail.tsx | 미렌더, [시험지/학습지 조판]이 grid-cols-1 전폭 |
| 픽바 좌측 슬롯([모바일 배포]/[학습지 실행대])+폼+실행대 열기 박스 | dossier-pick-bar.tsx | 미렌더, 조판 버튼 전폭 |
| 도시에 CTA 행 [학습지 보내기][문제 보내기]+DossierDeployInline | passage-dossier-pane.tsx | 래퍼째 미렌더 |
| 학습지 행 [모바일 배포] (도시에·병합 목록) | passage-dossier-pane.tsx · composer-list-pane.tsx | 오케스트레이터가 onDeploySheet/onSheetDeploy 채널을 내리지 않음 |
| 지문 스튜디오 sticky 배포 바·DeployDialog·에뮬레이터 레일·학생 화면 미리보기 | passage-studio-client.tsx | 미렌더(단일 컬럼 재구성) |
| 클래스 홈 「결과」 탭 | class-home-client.tsx | 탭 제외 + ?tab=results → 지문 폴백 |
| 초대 키트(레일·학생 탭·등록 후 자동 오픈) | class-tree.tsx · students-tab.tsx · studio-home-client.tsx | 버튼·자동 오픈·시트 렌더 봉인 |
| 코치마크 deploy(5)·invite(6) | passage-studio-client.tsx · students-tab.tsx | when 에 플래그 결합(스텝 정의는 불변 — 저장 호환) |
| ③ 단계 라벨 「배포」 | step-strip.tsx · step-guide-pane.tsx | 「조판」으로 개칭(판정값 stepAdvanced 재사용) |
| 배포 관련 안내 카피(우측 빈 상태·라이브러리 빈 상태·aria) | studio-home-client.tsx 외 | 조판 단독 자구로 재작성 |

### M-2. 조판 유도(넛지) — 플래그와 무관하게 동작

- `studio-home-client.tsx` 의 `composeNudge` 엔진: 생성 완료 **세션 내 전이**
  (문항 세션 큐 generating→done/reviewed · 분석 큐 sheet 스탬프 pending/analyzing→done ·
  실전 잡 running→done)를 시그니처 비교로 감지 — 마운트 첫 관측(영속 복원분)은
  켜지 않는다. 소등은 조판 표면 열림 전이(anyComposeVisible) — 두 축 일괄.
- 소비: 실행대 [조판] 버튼 펄스(`nudge` prop → `.studio-pulse`/-soft, globals.css) ·
  우측 빈 상태 넛지 카드("…생성이 끝났어요 — 체크하면 바로 조판으로") ·
  뷰 필 펄스(SourceSwitcher `nudgeSheet`/`nudgeExam`, 비활성 필에만).

### M-3. 검증

- 하네스: `.tmp-studio-mobile-hide/`(스펙 v2·capture.mjs·기준선 tsc). 게이트:
  tsc 청정·eslint·실화면 캡처(1440/1024)·가시 "모바일" 문자열 0·코치 음성 테스트·
  플래그 on 회귀(tsc + spot).
