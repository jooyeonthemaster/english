All facts confirmed. The credit charge is **per-page, at page-execution time** (`ensurePageCharged` → `deductCredits("TEXT_EXTRACTION")` = 3 credits/page), idempotent via `creditTxId`, and refundable per-page. This is the load-bearing detail for the credit section and for the D4 bundle billing problem (a bundle of N pages currently would charge per-page).

I now have everything grounded. Producing the unified design document.

---

# 자료 추출 적응형 인테이크 — 통합 설계 문서

> 본 문서는 3개 설계안(guided-wizard / single-canvas / adaptive-surface) + 심사 + 완전성 비평을 종합한 **구현 직행용 단일 설계**다. 모든 코드 근거는 실제 파일을 읽어 검증했으며, 검증되지 않은 라인 인용(예: 비평이 지적한 "L2634" 오인용)은 폐기하고 실측 위치로 교체했다.

---

## 0. 설계 요약

**뼈대 채택: adaptive-surface(관점 C)의 "라우팅 골격".** 트리아지 결과가 입력유형별로 작업대(Surface)를 결정하는 라우터 구조를, 신규 `useIntakeStore`로 기존 `useExtractionStore`와 분리해 페이지 코어를 오염시키지 않는 점이 D1(코어 보존)에 가장 정합적이고, C1/C6/C7/C10·크레딧 표기를 가장 구체적으로 다룬다.

**그래프트(이식)한 borrowWorthy 아이디어:**
- **single-canvas(관점 B)**: 데스크톱 1급 직접조작 — 경계 핸들 split(C3), 이어붙이기 체인(C5), 8핸들 크롭(C8), 묶음 해제 `✕`(C4). `cropBox`를 `boundingBox`와 **별 컬럼으로 분리**(오버로드 금지)도 채택.
- **guided-wizard(관점 A)**: 복원 diff 3구역 + `changes[]` 근거 + [부분 채택](C9), 저신뢰 시 자동경계 제거(automation bias 방어), 5스텝 진행 인지.
- **모바일**: wizard식 리스트형 분할/병합 폴백으로 격하(canvas의 직접조작은 데스크톱 전용).

**비평가 보강 그래프트(반드시 반영):** D4 묶음의 멱등성·과금·lease 스펙(§7), 재정렬→트리아지 순서 고정+segment 재바인딩(§2·§7), **promote 2개 사이트의 sourcePageIndex 매핑 수정**(§5, 컬럼 추가만으론 손실 지속), 접근성 키보드/SR 대체 경로(§3.6), 크레딧 3계정 분리 표기(§6), C1 트리아지 스킵 빠른 경로(§2·§4), skew 회전보정+잘림 2단 검출(§3·§8), diff 색+기호(±) 병기(§3.5).

---

## 1. 적응형 인테이크 아키텍처 (코어 보존 + 신규 레이어 경계)

```
┌─ [페이지 코어 — 불변] ────────────────────────────────────────────────────┐
│ ClientPageSlot[] 평탄화(types.ts:65) · extraction-orchestrator(batchTrigger  │
│ 1page=1 extraction-page) · extraction-page(idempotencyKey=`${jobId}:${pgIdx}`,│
│ lease=PAGE_LEASE_DURATION_MS 5min, charge-credits.ensurePageCharged          │
│ =TEXT_EXTRACTION 3크레딧/page, P2002 재커밋안전 create-or-reuse-passage)      │
│ · SSE(SSE_TICK_INTERVAL_MS 2000) · pdf-splitter · Supabase Storage           │
│ ⇒ @@unique([jobId,pageIndex]) (schema:2382) 가 멱등성의 2차 방벽             │
└──────────────────────────────────────────────────────────────────────────┘
        ▲ 본 추출은 그대로. 신규 레이어는 "앞단(인테이크)"과 "promote 매핑"만 손댐
┌─ [신규 인테이크 셸 — additive] ───────────────────────────────────────────┐
│ useIntakeStore(별도 Zustand) : empty→ingesting→reordering→scanning→         │
│   triage-review(Surface morph)→(cropping 서브)→plan-locked                  │
│   ⇒ plan-locked 시점에 IntakePlan을 startUpload() 인자로 직렬화해 코어 인계   │
│ triage-task(신규 Trigger 태스크, 경량 Flash 사전분석)                       │
│ bundle 디스패처(신규, D4 묶음 전용 가상 pageIndex — §7)                      │
└──────────────────────────────────────────────────────────────────────────┘
```

**재사용 지점(코드 실측):**
| 신규 레이어가 쓰는 기존 자산 | 위치 |
|---|---|
| 입력 평탄화 `ClientPageSlot[]` | `types.ts:65-73` |
| 다중페이지 span 지원 `sourcePageIndex Int[]` | `schema:2433`(ExtractionItem), `2395`(ExtractionResult), `2634`(M1Draft) |
| 크롭 좌표 후보 `boundingBox{page,x,y,w,h}` | `schema:2454`(현재 뷰어 하이라이트 전용) |
| 섞인업로드 재정렬 신호 `pageMeta` | `schema:2356-2359`(pageNumber/examCode 등) |
| 복원 자산 | `ExtractionM1PassageDraft{rawText,restoredText,teacherText,restorationStatus}` `schema:2628`, `ExtractionM1PassageDraftChange{before,after,reason}` `schema:2670`, `ExtractionPassageRestoration` `schema:2847` |
| 사후 정규식 경계병합(폴백 백업) | `structured-groups.ts:13` `TERMINAL_PUNCT_RE`, `:161-165` shouldMerge(같은 group + `!questionFlowOpened` + 종결부호 없음) |
| 신뢰도 임계 | `constants.ts:94-96` GREEN 0.9 / YELLOW 0.7 / CRITICAL 0.5 |
| 페이지 상한 | `constants.ts:15` MAX_PAGES_PER_JOB=30 |
| 길이 게이트 | `constants.ts:75` MIN_COMMIT_PASSAGE_LENGTH=40, `:85` BY_MODE |

**`mode` 하드코딩 제거 방식:** `bulk-extract-client/index.tsx:167,389,429`의 `"PASSAGE_ONLY"`를 직접 지우지 않는다. 대신 IntakePlan이 `modeGuess`(`PASSAGE_ONLY|QUESTION_SET|FULL_EXAM`, 백엔드 `ExtractionMode` enum 그대로)를 추정→사용자 1회 확인→`startUpload(mode=plan.modeGuess)`로 주입. 코어 시그니처 불변, 호출부에서 plan→mode 매핑만 additive.

---

## 2. 전체 플로우 상태머신

```
                  ┌──────────────── 신규 인테이크 셸 (본 추출 前) ─────────────────┐
 drop/select ─▶ empty ─▶ ingesting ─▶ reordering ─▶ scanning ─▶ triage-review ─▶ plan-locked
 (handleFiles)   (PDF split          (C10 선행:    (D3 Flash    (Surface morph     (IntakePlan
                  =pdf-splitter)      OCR 페이지번호 사전분석)    A/B/C/D + cropping  직렬화)
                                      만으로 재정렬)              서브상태)              │
                                                                                       ▼
 ┌──────────────────────── 페이지 코어 (불변) ──────────────────────────────────────┐
 │ uploading ─▶ starting ─▶ processing(SSE, 지문단위 진행률 §9) ─▶ reviewing         │
 └──────────────────────────────────────────────────────────────────────────────────┘
                                       │
                       reviewing ─▶ (옵트인) restore-select(D2) ─▶ committing ─▶ done
```

### 핵심 순서 결정 (비평가 C10 보강): **reordering → scanning 고정**
재정렬이 트리아지 **뒤**에 오면, 잘못된 페이지 순서로 추정한 묶음/경계가 전부 무효화돼 재트리아지(비용·지연 2배)가 필요하다. 따라서:
1. `reordering`은 **경량**(OCR 페이지번호 + `pageMeta` fingerprint + `sourceFileName`만, Flash 본분석 아님).
2. 페이지번호 없는 자료(이미지 다발)는 자동 재정렬 불가 → "순서 확신 못 함" 배너 + 수동 드래그(`reorderSlots`) 전용.
3. 재정렬 확정 후에만 `scanning` 진입. 재정렬로 슬롯 순서가 바뀌면 아직 segment/crop이 없으므로 재바인딩 불필요(트리아지 전이라 안전). 단 사용자가 triage-review에서 다시 재정렬하면 §7의 재바인딩 규칙 적용.

### 입력유형별 분기 (scanning 직후 `routeSurface(plan)`)
| 조건 | Surface | OCR | 트리아지 |
|---|---|---|---|
| 이미지 1장 + 사후 길이/종결부호 통과 | **A 크롭-우선 미니멀** | 1콜 | **스킵**(C1 빠른 경로, 비평가 보강 #7) |
| 이미지 1장 + 다지문 의심/저신뢰 | A→B 폴백 | 1콜 | 1콜 |
| TEXT 붙여넣기 | **D 에디터** | 스킵 | 스킵 |
| PDF/이미지 다수, pages≤3, passages≤6 | **B 지문 보드**(시험지) | 페이지별 | 첫 min(N,3) |
| pages≥8 (대용량) | **C 배치 대시보드** | 페이지별 | **앞 3p 샘플만**(C6, 전수 비용 과다) |
| 트리아지 저신뢰/실패 | **단일 폴백 = 페이지:세그먼트 1:1** | 페이지별 | 위임(기존 사후정규식 = 100% 동일 동작) |

> **C1 트리아지 스킵 규칙(확정):** 이미지 1장 & 사후 길이≥40 & 종결부호 OK → triage 호출 0회로 직추출. 결과가 다지문 의심(텍스트 내 `①②③`/복수 종결블록)이면 reviewing에서 사후적으로 "더 나눌까요?" 칩 제안. **auto-advance 임계 = CONFIDENCE_GREEN(0.9)**, 되돌리기 스낵바 **5초**, 되돌리기 시 `triage-review` 복귀.

---

## 3. 화면별 최종 와이어프레임

아이콘 = lucide 도구형만(Upload/FileText/Type/Crop/Link2/SplitSquareHorizontal/Pencil/AlertTriangle/Play/Coins). **Sparkles·이모지·주황/앰버 금지.** 톤 slate-700 라인 + blue-600 액티브. 4 Surface는 **공통 골격**(상단 D2 토글 · 좌측 페이지 · 하단 크레딧/추출버튼)을 공유해 morph 학습부하를 낮춘다.

### 3.0 업로드(empty) + 크롭 오버레이

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [▣] 자료 추출                                              [◈ 크레딧 1,240]   │
│ PDF·이미지·텍스트를 올리면 지문을 추출하고, 원하면 원문으로 복원합니다.       │
├────────────────────────────────────────────────────────────────────────────┤
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │   [⬆ Upload] 파일을 끌어다 놓으세요   (PDF·PNG·JPG·WebP, 최대 30p/50MB) │ │
│   │   [📄 파일 선택]      또는      [⌨ 텍스트 붙여넣기]                     │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│   자료 목록(최신순) ───────────────────────────────────────────────────────  │
└────────────────────────────────────────────────────────────────────────────┘

┌─ 크롭 오버레이 (cropping 서브상태) ──────────────────────── [Esc 닫기] ──────┐
│  ┌──────────────────────────────────┐   영역 목록                          │
│  │  ░░░ scrim(흐림) ░░░               │   ① 지문2  x.12 y.34 w.60 h.20 [✕]  │
│  │  ┌────────────◰─┐ ◀ 8핸들 리사이즈 │   ② 지문3  x.12 y.58 w.60 h.18 [✕]  │
│  │  │ 선택영역 #1   │   Shift=비율고정  │   [⎘ 새 영역 그리기]                │
│  │  └◰─────────────┘   Alt=중심기준    │   각 영역 = 지문 1개로 추출          │
│  └──────────────────────────────────┘   ↑↓←→=핸들이동 · 숫자입력 좌표(SR)  │
│  드래그=영역 / 영역내 드래그=이동 / Del=삭제      [취소]  [이 영역들로 확정]  │
└──────────────────────────────────────────────────────────────────────────┘
```
- 좌표계 **단일 표준 = 정규화 0~1**(adaptive의 0~100%·canvas의 0~1 불일치 해소). EXIF 회전 보정 후 원본해상도 역변환. 저장은 신규 `cropBox`(boundingBox 오버로드 금지).
- **C2 skew 전용**: 크롭 오버레이에 회전 핸들(◷) + [자동 보정(deskew)]. skew를 잘림 배지와 분리(비평가 보강 #8).

### 3.1 트리아지 검토 — Surface B (시험지 다지문, 대표 화면)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [▣] 자료 추출 › 사전분석 확인          신뢰도 [● 높음 82%]  [↺ 다시 분석]    │
├────────────────────────────────────────────────────────────────────────────┤
│ 지문 [4 ▾]개 · 2p · 레이아웃 [시험지 2단 ▾] · 잘림 1건   모드 [지문만 ▾]     │ ← 인라인 편집 헤더
├──────────────────────────┬─────────────────────────────────────────────────┤
│ 페이지(좌, 24%)          │ 지문 보드(우, 76%)                               │
│ ┌────────┐ ┌────────┐    │ ┌─────────────────────────────────────────────┐ │
│ │ p.1 ▣▣ │ │ p.2 ▣  │    │ │⟦지문1⟧ p.1상  92%        [● 원문][✎][⎘크롭]│ │
│ │ ╔════╗ │ │ ╔════╗ │    │ │ "The notion of ..."                         │ │
│ │ ║ S1 ║ │ │ ║ S3 ║ │ ◀╌╌┤ ├─────────────────────────────────────────────┤ │
│ │ ╠═⊟══╣ │ │ ║계속║ │    │ │⟦지문2⟧ p.1하  88%   ⊟경계핸들(↑↓끌기/SR숫자) │ │
│ │ ║ S2 ║ │ │ ╚════╝ │    │ ├─────────────────────────────────────────────┤ │
│ │ ╚════╝ │ │ ╔════╗ │    │ │⟦지문3⟧ p.1하→p.2 [⛓ 페이지걸침] [✕끊기]     │ │ ← D4 묶음
│ └────────┘ │ ║ S4 ║⚠│    │ │ 근거: p.1 끝이 종결부호 없음 "...therefore the"│ │
│ ⟂=경계후보  │ ╚════╝ │    │ ├─────────────────────────────────────────────┤ │
│ 2단=세로분할│        │    │ │⟦지문4⟧ p.2   [⚠ 잘림·하단] [⎘크롭으로 보완] │ │
├──────────────────────────┴─────────────────────────────────────────────────┤
│ 제안▸[⛓ S3 p.1하+p.2 이어진 지문으로][수락][무시]  [＋지문][⇄합치기/나누기]  │
│ 사전분석 [무료]   추출 소비예정 [◈12 = 4지문·관련4p×3]      [▶ 추출 시작]    │
└────────────────────────────────────────────────────────────────────────────┘
```
- **C3 분할축 전환**(비평가 보강): `layout=exam2col`이면 분할선 가로→세로, 칼럼 읽기순서 오버레이 ①②③ + 드래그 재정렬(가로 분할선은 2단에서 무의미).
- 고스트(점선·blue-300, AI 추정) → 사용자가 손대면 실선(blue-600, 확정), confidence "수동" 전환.
- **저신뢰(< YELLOW 0.7) 시 고스트 미표시**(automation bias 방어, 비평가 #4·횡단): "추정 안 함, 직접 확인" + 1:1 기본 세그먼트만 제공.

### 3.2 Surface A(이미지 1장) / Surface C(30p PDF 배치) / Surface D(텍스트) — 골격 발췌

```
[A] [● 원문 | ○ AI복원] 상단상시 · 감지요약(지문1·94%·잘림없음) · C1이면 [▶바로추출] 즉시활성
[C] 앞3p 샘플 "지문 ~22±3개 추정" · 30칸 그리드(●지문시작 ⟂경계 ⛓걸침 ⚠잘림 ▢빈/표지)
    · 묶음제안 p.4-5/p.12-13 [모두수락] · 표지제외 · 소비예정 ~◈66(22지문·22p×3)
    · 진행분모 "실측 우선·추정 보조"(예 8/22 추정), 썸네일 가상화+lazy decode
[D] 빈 줄로 지문 분리(실시간 하이라이트+구분선 수동 삽입/삭제 드래그핸들, 0/과다 시 경고)
    · "문제 마커 감지 → AI복원 안내" · OCR 0회, startTextExtraction이 reviewing 직점프
```

### 3.3 추출 진행 — 지문 단위(§9 상세)

```
지문 추출 진행  ▰▰▰▰▱▱▱▱  4 / 22 지문 완료   (보조: 페이지 12/30 처리·예상 ~1분40s)
[지문1✓][지문2✓][지문3⟳추출중][⛓지문5 묶음(p.6-7-8)][지문4 대기]...
[백그라운드 진행](이탈→복귀 시 SSE 재연결·진행복원)   [취소·크레딧 환불]
```

### 3.4 리뷰 — 3열 워크벤치(BlockTree/OriginalViewer/StructuredEditor 재사용) + D2 토글

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 18개 추출 · 2개 불완전 ⚠ · 복원요청 3개                       [커밋 준비]    │
├───────────┬────────────────────────────┬───────────────────────────────┤
│세그먼트레일│ OriginalViewer(boundingBox  │ StructuredEditor               │
│▦S1 ✓      │ 하이라이트)                  │ S3 — 빈칸형(QUESTIONIZED)       │
│▶▦S3 ◉     │                             │ [● 원문 그대로(무료) ○ AI복원◈]│ ← 항상 노출
│ ├원문(무료)│                             │ Renewable energy ____(1)____   │
│ └AI복원◈4 │                             │ [본문 직접 편집]               │
│⚠S5 불완전 │                             │                               │
│복원합계3·◈12[복원 실행]                  │                               │
├───────────┴────────────────────────────┴───────────────────────────────┤
│ 커밋 게이트: ⚠ 불완전 2개. [불완전 제외하고 커밋]  [전부 커밋(확인 필요)]    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.5 복원 선택·비교(restore-select, C9) — wizard diff 3구역 그래프트

```
┌─ AI 복원 — 지문 S3 ───────────────────────────────────────────── [✕] ──────┐
│ ┌────────────────────────────┬────────────────────────────┐                │
│ │ 원문(문제화됨)              │ 복원 결과                    │                │
│ │ Many researchers ＿(A)＿    │ Many researchers (＋BELIEVE) │ ± 기호+색 병기 │
│ │ that climate ②＿ shifts     │ that climate (＋SYSTEMS)     │ (색맹 접근성)  │
│ │ [③] The data, however…     │ (－[③]) The data, however… │                │
│ └────────────────────────────┴────────────────────────────┘                │
│ 변경 3건: 빈칸2 채움·삽입마커1 제거   근거(changes[]): ①(A)→BELIEVE 추론·高 │
│ [원문 유지]   [부분 수정 후 채택]   [AI복원 적용 · ◈4 차감]                  │
└──────────────────────────────────────────────────────────────────────────┘
```
- diff 표기: **추가=밑줄+(＋), 제거=취소선+(－)**, slate/blue만(주황 금지). 색만으로 구분하지 않게 ± 기호 병기(색맹 접근성, 비평가 횡단 #3).
- `ExtractionM1PassageDraft{rawText,restoredText,teacherText}` + `ExtractionM1PassageDraftChange{before,after,reason}` 그대로 좌/우/근거 매핑. 미적용 시 `restoredText`는 저장하되 `teacherText=rawText` 유지(adaptive 보존모델 — 옵트인 복귀 안전).

### 3.6 접근성·모바일 (비평가 횡단 #1·#2 보강 — 셋 다 전무)
- **키보드 대체 경로**: 경계 핸들 = ↑↓(±1%)·Shift+↑↓(±5%)·숫자 직접입력. 크롭 = Tab 포커스→화살표 이동/리사이즈→Enter 확정. 이어붙이기 = 세그먼트 포커스 후 `M`(merge)/`B`(split). 모든 고스트/배지/신뢰도에 `aria-label`("지문3, 페이지1-2 묶음 후보, 신뢰도 88%").
- **모바일/태블릿 폴백**: 직접조작(드래그 크롭/핸들) → **리스트형**으로 격하(wizard식). 지문 카드 세로 리스트 + [나누기]/[합치기]/[묶기]/[크롭(전체영역 선택지)] 버튼식. 핀치줌↔크롭 제스처 충돌 회피. 데스크톱 워크벤치가 1급, 모바일은 검토·승인 중심.

---

## 4. C1~C10 케이스별 최종 동선

- **C1 깨끗한 1장**: drop → 사후 길이/종결부호 통과 → **트리아지 스킵** → Surface A `[▶ 바로 추출]` → reviewing 원문 커밋. (트리아지 0콜, 최단경로)
- **C2 일부/기울어짐/잘림**: scan `croppedSignal`/skew 감지 → Surface A에 `⚠ 잘림` 배지(red 테두리) + skew면 [자동 보정] → 본추출 OCR confidence로 **2단 재검출** → reviewing 배너 → 커밋 게이트(그래도 저장/재촬영 교체/제외).
- **C3 한 페이지 다지문**: scan `passageCount=N`+`exam2col` → Surface B, 2단이면 세로 분할축+읽기순서 ①②③ → 경계핸들 split/병합 → 추출.
- **C4 1~2p 걸침**: scan이 p.1 끝 비종결 감지(`TERMINAL_PUNCT_RE` 사전 가시화) → 보드 `⛓` 후보+근거 → [수락]/[✕끊기] → §7 묶음 1콜.
- **C5 3p+ 장문**: 묶음 체인(p.1◀p.2◀p.3), 묶음 최대 페이지 상한 체크(§7) → 이어붙이기 → 1콜(초과 시 슬라이딩 오버랩 분할). 장문+문항세트는 longpassage 아키텍처로 라우팅.
- **C6 30p PDF**: Surface C 배치, 앞 3p 샘플 → 묶음/제외 수락 → 진행분모 "실측 우선·추정 보조" → [백그라운드 진행](SSE 재연결).
- **C7 텍스트**: Surface D, 빈 줄 분리(수동 구분선 교정) → [등록] → reviewing 직점프 → 복원 선택만.
- **C8 영역 크롭**: 크롭 오버레이 → 멀티 영역(정규화 0~1) → 각 영역=`cropBox` 1 segment → **클라 크롭 비트맵 업로드**(가상 1페이지 슬롯, 워커 무변경).
- **C9 문제화 복원**: reviewing 토글 ○ AI복원 → restore-select diff(±기호) → [적용·◈4 차감] 또는 [부분 채택].
- **C10 섞인 순서**: `reordering` 선행(OCR 페이지번호+pageMeta) → 재정렬 제안 배너/수동 드래그 → 확정 후 `scanning`. 번호 없으면 "순서 확신 못 함" 배너.

---

## 5. 데이터 모델 변경 (additive 마이그레이션)

전부 `ADD COLUMN ... NULL/DEFAULT`. 코어 멱등성/SSE/환불/PDF분할은 신규 컬럼을 읽지 않으면 그대로 동작(D1 준수).

```prisma
// ── Passage (schema:648) — promote 시 손실되던 출처 보존 (핵심 누락) ──
model Passage {
  // ... 기존 컬럼 유지 ...
  sourcePageIndex Int[]   @default([])   // ExtractionItem/M1Draft에서 승계
  extractionOutput String?               // "verbatim" | "restored" (D2 감사)
}

// ── ExtractionJob (schema:2287~) — 트리아지/플랜 스냅샷 ──
model ExtractionJob {
  intakePlan       Json?    // 확정 IntakePlan 스냅샷(재커밋·감사·재현)
  triageConfidence Float?
  inputType        String?  // "IMAGE_SINGLE"|"IMAGES"|"PDF"|"TEXT" (라우팅 감사)
  estimatedPassageCount Int? // 진행률 분모(샘플 추정), 실측 시 보정
}

// ── ExtractionItem (schema:2429) — 묶음/크롭/불완전 1급화 ──
model ExtractionItem {
  // sourcePageIndex Int[](2433) · boundingBox Json?(2454) · pageId(2432) 이미 존재 → 재사용
  cropBox          Json?    // {x,y,w,h} 정규화 0~1 — 추출입력 (boundingBox 오버로드 금지)
  segmentKind      String?  // "page"|"span"|"crop"|"text-block"|"manual"
  incompleteReason String?  // "LENGTH"|"CROP_SIGNAL"|"LOW_OCR"|"SKEW" (조용한 폐기 대체)
}

// ── ExtractionPage (schema:2331) — D4 묶음 입력 표식 (§7) ──
model ExtractionPage {
  bundleKey       String?  // 묶음 멤버 공통키 (null=기존 단일경로)
  spanPageIndices Int[]    @default([])  // 묶음이 함께 보낼 원본 pageIndex들
  // bundle 가상 pageIndex 규칙은 §7 (음수 예약대 사용)
}
```

**promote 매핑 수정(비평가 Top #3 — 컬럼만으론 손실 지속, 2개 사이트 명시):**
1. `src\app\api\extraction\jobs\[jobId]\commit\_lib\create-or-reuse-passage.ts:61-78` `data`에 `sourcePageIndex: input.sourcePageIndex ?? []`, `extractionOutput` 추가. `PassageInput` 타입(`./types`)에 두 필드 추가, `build-payload.ts:74`가 이미 만든 `sourcePageIndex`를 payload에 전달(현재는 commit API 서버가 무시).
2. `src\app\api\extraction\m1-passages\promote\route.ts:103-116` `tx.passage.create` data에 `sourcePageIndex: draft.sourcePageIndex`(L2634 이미 존재), `extractionOutput: draft.restorationStatus === "RESTORED" ? "restored" : "verbatim"` 추가.

> 신규 테이블 0개. 복원 자산(M1PassageDraft/Restoration/Change)·`pageMeta`·`documentAiRawText` 모두 신규 컬럼 없이 재사용.

---

## 6. 크레딧 모델 (3계정 분리 — 비평가 Top #6, "12 vs 1" 충돌 해소)

**현행 실측:** 추출 = `CREDIT_COSTS.TEXT_EXTRACTION = 3` (credit-costs.ts:25), 과금 시점 = **페이지 실행 시** `ensurePageCharged`→`deductCredits("TEXT_EXTRACTION")` (charge-credits.ts:47), `creditTxId`로 멱등, 페이지 실패 시 페이지 단위 환불. 예약 = `create-job.ts:47` `totalPages × 3`. 복원 전용 단가 **없음**(3안의 "1"·"12"는 전부 근거 없는 추정 → 폐기).

| 계정 | 시점 | 단가(제안) | 환불 정책 | 표기 위치 |
|---|---|---|---|---|
| **트리아지(사전분석)** | scanning | **0(무료)** — Flash 경량, 1콜/소수페이지. 비용통제 필요 시 후속 결정에서 정액화 | 해당없음 | triage-review 헤더 "사전분석 [무료]" |
| **추출(verbatim)** | 페이지 실행 시(기존 유지) | **3/page**(기존). 단 **묶음=1과금단위로 변경** | 페이지/묶음 단위 환불(기존) | Surface 하단 "소비예정 ◈N" + reviewing |
| **복원(AI, 옵트인)** | restore-select [적용] 클릭 시 | **신규 `PASSAGE_RESTORATION` 제안**: 지문당 고정 2 + 글자수 구간(≤1500자 +0, ≤4000자 +1, 초과 +2) | **실패=전액 환불 / 성공품질불만=무환불(사전 고지)** | 토글 옆 `AI복원 ◈N` + 레일 "복원합계" + 적용 모달 |

- **묶음 과금 변경(중요, D4):** 현재 `totalPages×3`은 2p 묶음을 6크레딧으로 친다. 묶음은 **1지문=1추출단위**가 사용자 기대이므로 **묶음 1콜=3크레딧 고정**으로 명문화(§7). `create-job.ts:47` 예약 산식을 `sum(segment 가상페이지수)×3`이 아닌 `segments.length×3`로 조정(예약), 실제 차감은 묶음 디스패처가 `creditTxId` 1개로 1회.
- **부분 채택 과금:** [부분 수정 후 채택]도 복원 1회 소비로 동일 과금(이미 모델 호출 발생). 적용 모달에 명시.
- 신규 `CREDIT_COSTS.PASSAGE_RESTORATION` 추가는 credit-costs.ts에 키 1개 추가(additive). `costOverride`(credits.ts:72 지원)로 글자수 구간 가산 처리.

---

## 7. 트리아지 · 다중페이지 묶음 OCR 기술 설계 (D4 최대 리스크)

### 7.1 트리아지(D3)
- **호출 단위:** 신규 Trigger 태스크 `extraction-triage`. 입력 = 첫 min(N,3) 페이지의 **저해상 다운스케일**(PDF_RENDER_SCALE보다 낮춤). Gemini 3.5 Flash 1콜(다수면 배치 1콜에 이미지 N장 첨부).
- **프롬프트 전략:** 출력 = JSON `{passageCount, boundaries:[{afterPage,nonTerminal:bool,confidence}], layout:"single|exam2col|longform|mixed", cropSignals:[{page,truncated:bool,skew:bool}], reorder:[...]}`. zod 검증(`zod-schemas.ts` 패턴 재사용). verbatim 본문은 **추출 안 함**(경계·레이아웃 신호만 → 토큰 절감).
- **60RPM/동시8 제약:** 트리아지는 `GEMINI_CONCURRENCY_LIMIT`(constants.ts:38, =EXTRACTION_PAGE_QUEUE_CONCURRENCY 8)와 **같은 풀 공유**. 30p도 앞 3p만 → 1콜이라 RPM 영향 미미.
- **저신뢰 폴백(단일화, 비평가 횡단 #5):** confidence < CRITICAL(0.5) 또는 파싱실패/타임아웃(8s) → **단일 폴백 = 페이지:세그먼트 1:1 + 사후정규식(`structured-groups`) 위임 = 기존 동작 100% 동일**. 빈 화면 절대 없음. 트리아지는 차단막 아님("그냥 추출" 항상 가능).

### 7.2 다중페이지 묶음 OCR — 멱등성/과금/lease 스펙 (셋 다 봉합만 한 진짜 빈틈)
코어는 `idempotencyKey=`${jobId}:${pageIndex}``(extraction-page.ts:73) + `@@unique([jobId,pageIndex])`(schema:2382)가 멱등성 2차 방벽. 묶음이 이를 우회하면 충돌. 해결:

- **묶음 = 1개 ExtractionPage 행(가상 pageIndex):** 묶음 전용 가상 `pageIndex`를 **음수 예약대**(예: `-1000 - bundleOrdinal`)로 발급 → `@@unique([jobId,pageIndex])` 충돌 없음, `idempotencyKey=`${jobId}:${가상pageIndex}`` 그대로 작동. `bundleKey`로 묶음 식별, `spanPageIndices=[p,p+1,...]`에 실제 페이지 기록.
- **입력 additive 분기:** `extraction-page`가 `spanPageIndices`가 있으면 imageUrl 단일 대신 **이미지 배열을 1 Gemini 콜에 첨부**(adaptive의 "1슬롯=이미지배열" 분기). 단일이면 기존 경로 완전 동일.
- **과금 = 1단위:** 묶음 1콜 = `ensurePageCharged` 1회 = 3크레딧(§6). `creditTxId` 1개. 예약 산식도 segment 수 기준.
- **환불 = 1단위:** 묶음 실패 시 그 묶음 3크레딧 전액 환불(2페이지치 6 아님). 부분 OCR(2.5p 끊김)은 **원자 단위 = 전량 재시도**(`MAX_PAGE_ATTEMPTS`), 최종 실패 시 **페이지 단위 graceful degrade**(묶음 해제 후 개별 1콜 재시도) 폴백.
- **lease:** 묶음 가상 page 행에 `leaseOwner+leaseExpiresAt`(PAGE_LEASE_DURATION_MS 5min) 동일 적용. reaper(`extraction-reaper`)는 `@@index([status, leaseExpiresAt])`로 묶음 행도 동일하게 stuck 복구.
- **묶음 최대 페이지 상한(C5):** Flash 이미지/토큰 한도 기반 `MAX_PAGES_PER_BUNDLE`(제안 4, 후속 벤치로 확정). 초과 시 슬라이딩 오버랩(예: [1,2,3]+[3,4,5])으로 분할 후 텍스트 봉합.
- **재정렬 후 재바인딩(C10):** triage-review에서 재정렬 시 segment의 `spanPageIndices`/`cropBox.page`를 **새 슬롯 인덱스로 자동 재매핑**(slot id 기준 안정 참조 유지). 묶음·크롭의 페이지 참조 깨짐 방지.

---

## 8. 백그라운드 추출 테스트 하니스 (다중페이지 end-to-end 벤치 부재 메움)

기존 `scripts/bench-*.ts`는 grammar/모델 비교 중심, **추출 파이프라인 end-to-end(지문수/경계/복원충실도) 벤치 없음**. 신규:

```
scripts/extraction-bench/
  fixtures/
    C1-clean-single.png            # 깨끗한 1장
    C2-skewed-cropped.jpg          # 기울어짐/잘림
    C3-exam-2col.png               # 2단 다지문 시험지
    C4-spans-p1-p2/{p1,p2}.png     # 경계 걸침
    C5-longform-3p/{p1,p2,p3}.png  # 3p 연속
    C6-30page.pdf                  # 대용량
    C7-pasted.txt                  # 텍스트
    C9-questionized.png            # 문제화 지문(복원 대상)
    C10-shuffled/{...}.png         # 섞인 순서
    expected.json                  # 케이스별 기대값(지문수/경계 afterPage/복원 변경수)
  run-bench.ts                     # tsx 실행 진입점
  scorers/
    passage-count.ts               # 추정 vs 실측 지문수 오차
    boundary-iou.ts                # 경계 위치 IoU(페이지·y) — split/merge 정확도
    restoration-fidelity.ts        # 복원본 vs 정답 BLEU/마커제거율
  report.ts                        # 케이스별 통과/오차 표 출력(콘솔, md 생성 안 함)
```
- **실행:** `npx tsx scripts/extraction-bench/run-bench.ts --case C4`(개별) / `--all`. 트리아지 태스크와 묶음 디스패처를 **직접 함수 호출**(Trigger 큐 우회)로 측정해 RPM 소모 최소화. Gemini 실호출이라 `--dry`(모킹) 옵션 병행.
- **측정 지표:** (a) 트리아지 지문수 정확도, (b) 경계 IoU, (c) 묶음 후보 precision/recall, (d) 복원 마커제거율·BLEU, (e) C1 트리아지 스킵 회귀(추가 콜 0 확인).
- 세그멘테이션 변경(§9 분모 로직, 묶음 입력 분기)은 **이 벤치 그린 후에만** 머지(§9 로드맵).

---

## 9. 단계별 구현 로드맵 (additive 우선, 세그멘테이션 변경은 벤치 확보 후)

| Phase | 산출물 | 위험 | 회귀 방지·검증 |
|---|---|---|---|
| **P1 — promote 손실 수정** | Passage.sourcePageIndex/extractionOutput 컬럼 + 2개 promote 사이트(§5) 매핑 | 낮음(additive) | 기존 커밋 회귀 테스트, 마이그레이션 nullable 확인 |
| **P2 — 인테이크 셸 스캐폴드** | `useIntakeStore` + 상태머신(empty~plan-locked) + routeSurface, plan→mode 주입(하드코딩 우회) | 중(코어 인계 경계) | mode 주입 후에도 PASSAGE_ONLY 경로 동일 동작 |
| **P3 — Surface UI** | A/B/C/D 와이어 + 공통골격 + 크롭 오버레이(cropBox) + 키보드/SR + 모바일 리스트 폴백 | 중(접근성/모바일) | Playwright 키보드 경로 테스트, 좌표계 0~1 단위 검증 |
| **P4 — 트리아지 태스크** | `extraction-triage` Flash 1콜 + zod + 저신뢰 단일폴백 + C1 스킵 | 중(새 실패표면) | §8 벤치 (a)(b), 폴백=기존동작 100% 확인 |
| **P5 — 재정렬 선행 + 재바인딩** | reordering→scanning 순서, segment 재바인딩(C10) | 중(순환의존) | 섞인 픽스처 재정렬 후 묶음/크롭 참조 무결성 |
| **P6 — 묶음 OCR(D4)** | 가상 pageIndex/bundleKey/spanPageIndices + 입력 배열분기 + 1과금/1환불/lease + 상한 | **높음(D1↔D4 충돌)** | §8 벤치 (c), 멱등성 재시도·부분실패 graceful degrade, 환불 단위 검증 |
| **P7 — 복원 과금/UI(D2)** | PASSAGE_RESTORATION 단가 + restore-select diff(±) + teacherText 보존 + 부분채택 | 중(과금 정확성) | 실패=환불/품질불만=무환불 정책 e2e, §8 (d) |
| **P8 — 불완전 게이트 + 진행률** | 조용한 폐기→incompleteReason 보존 + 커밋 게이트 + 지문단위 분모(실측보정) + skew/잘림 2단검출 | 중(분모 출렁임) | build-payload 폐기→보존 회귀, 진행률 분모 안정성 |

---

## 10. 미해결 / 추가 결정 필요

1. **트리아지 과금:** 현재 "무료" 제안. Flash 비용 누적이 문제면 정액(소액) 또는 추출 크레딧에 흡수할지 결정 필요.
2. **복원 단가 공식 확정:** 지문당 2 + 글자수 가산은 제안값. 실 토큰비용 측정(§8) 후 확정.
3. **`MAX_PAGES_PER_BUNDLE` 값:** 제안 4. Flash 다중이미지 한 콜의 verbatim 충실도 임계를 §8 벤치로 측정해 확정.
4. **장문+문항세트(C5) 라우팅:** longpassage 아키텍처(메모리 `project_longpassage_set`)와의 인계 인터페이스 미정 — 별 유형으로 분기할지, QuestionSet 1급으로 갈지.
5. **C1 다지문 오판 사후제안:** "더 나눌까요?" 칩이 reviewing에서 재OCR을 트리거할지(비용) 또는 클라 텍스트 분리만 할지 결정.
6. **묶음 가상 pageIndex 음수대 충돌:** 기존 코드가 pageIndex≥0을 암묵 가정하는 지점(정렬/UI 인덱싱) 전수 점검 필요 — 음수 대신 별 컬럼 플래그가 더 안전할 수 있음(P6 착수 전 확정).
7. **트리아지 confidence 보정:** Flash 자가신뢰도가 실제 정확도와 괴리될 수 있음 — §8 벤치로 캘리브레이션 곡선 확보 후 GREEN/YELLOW 임계 재조정 여부.

---

**검증 근거 파일(절대경로):**
- `c:\Users\jooye\Desktop\2026project\nara\prisma\schema.prisma` — Passage(648, sourcePageIndex 없음·sourceExtractionItemId @unique 665) · ExtractionItem.sourcePageIndex(2433)·boundingBox(2454) · ExtractionPage @@unique[jobId,pageIndex](2382)·pageMeta(2356)·documentAiRawText(2361) · ExtractionM1PassageDraft(2628, sourcePageIndex 2634)·Change(2670) · ExtractionPassageRestoration(2847)
- `...\src\lib\extraction\constants.ts` — MAX_PAGES_PER_JOB=30(15)·MIN_COMMIT_PASSAGE_LENGTH=40(75)·BY_MODE(85)·CONFIDENCE 0.9/0.7/0.5(94-96)·GEMINI_CONCURRENCY_LIMIT(38)·PAGE_LEASE 5min(45)·SSE_TICK 2000(68)
- `...\src\lib\extraction\types.ts` — ClientPageSlot(65)·ResultDraft.sourcePageIndex(116)·ExtractionItemSnapshot.boundingBox(146)
- `...\src\lib\extraction\segmentation\structured-groups.ts` — TERMINAL_PUNCT_RE(13)·shouldMerge 조건(161-165)·questionFlowOpened
- `...\src\lib\credit-costs.ts` — TEXT_EXTRACTION=3(25), 복원 단가 부재
- `...\src\trigger\extraction-page.ts` — idempotencyKey `${jobId}:${pageIndex}`(73)·lease(76) / `...\src\trigger\extraction-orchestrator.ts` — batchTrigger 1page=1task(68-77) / `...\src\trigger\_lib\extraction-page\charge-credits.ts` — ensurePageCharged deductCredits TEXT_EXTRACTION(47,69)
- `...\src\app\api\extraction\jobs\_lib\create-job.ts` — projected=totalPages×3(47)
- `...\src\app\api\extraction\jobs\[jobId]\commit\_lib\create-or-reuse-passage.ts` — Passage.create data, sourcePageIndex 누락(61-78) / `...\src\app\api\extraction\m1-passages\promote\route.ts` — tx.passage.create, draft.sourcePageIndex 미전달(103-116)
- `...\bulk-extract-client\index.tsx` — PASSAGE_ONLY 하드코딩(167,389,429) / `...\review-step\commit\build-payload.ts` — 40자 미만 silent drop(35,61), sourcePageIndex 생성하나 commit API가 무시(74)
