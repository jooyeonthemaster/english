# 시험지 인쇄 실측 기록

> 읽는 사람: 시험지 인쇄 파이프라인(`docs/EXAM-PRINT-PIPELINE.md`)을 고치고 같은 계기로 다시 재야 하는 개발자.
> 계약 · 판정식 · 도구 사용법은 파이프라인 문서 §5~6 이 정본이고, 이 문서는 그 계기로 잰 **날짜별 결과**만 모은다
> (26-09-30 파이프라인 문서 §6.4 에서 옮김 — 500줄 규칙).

## 실측 기록(개발 서버 3109 turbopack · StrictMode, 운영 DB 쓰기 0 — 전후 printCount · updatedAt · app_events 대조)

26-09-29(Wave 1): native 고객 80문항 인쇄 전 3/31 → 인쇄된 DOM 31/31 → PDF 31/31(최소 338자) · 107문항 3/44 → 44/44 ·
button 고객 80 · 107 클릭→print() 0.54 · 0.77초 · dialog(카드 84장) 캐시 적중 18/18 · 캐시 미스 9/9 · 요청 누계 1 · 집계 1 ·
deeplink-strictmode print() 정확히 1회 · 새로고침 뒤 0회 · paper-print-check 빌더 53 화면 4/18 → 인쇄 19/19 · timing CPU 4× 에서
빠른 경로 9~10초짜리 긴 작업 하나(페인트 없음 — 운영 빌드 V10 에서 반드시 다시 잴 것).

26-09-30 Wave 1 수리 · Wave 2:

| 실행 | 결과 |
|---|---|
| button + `hang-ui-font`(고객 80) | GREEN — 1.40초, `path:'fast'` · `fonts:'loaded'` · `guard:'settled'`, 31/31. 수리 전 판정으로 되돌리면 RED |
| button + `hold-exam-fonts`(고객 107) | GREEN — `path:'prepare'`, 44/44 |
| R5 준비 중 Ctrl+P(고객 80 · 107, 카드 대화상자 53) | 네이티브 PDF 31/31 · 44/44 · 18/18, 컨트롤러 print() 0회 · 집계 0건(대조군 1회 · printed 1건) |
| R7 카드 대화상자 인쇄 중 Esc(진짜 print() + afterprint 보류) | 닫은 직후 호스트 0 · body 클래스 없음 · 루트 0, 재인쇄 18/18 |
| PH-R1 랜딩 PC 데모 네이티브 인쇄 | PDF 4,324자(데모 시험지). 미룸 분기를 끄면 905자(랜딩 히어로) RED |
| button `--explanation`(내부 53 · 고객 80 · 107) | 26/26 · 44/44 · 63/63, 넘침 0, `guard:'settled'`, `prior` 없음 |
| force-per-page `--per 2` · `--per 1`(내부 53, 쪽당 2: 16→27쪽) | 일반 29/29 · 55/55, 해설 26/26 · 32/32, 넘침 0, 인쇄 뒤 강제 배치 · 쪽 수 유지 |

26-09-30 TOOLS-FINISH(도구 마감 — 쓰기 가드 · 새 fault · force-per-page):

| 실행 | 결과 |
|---|---|
| write-guard 자가 시험 `--base 3109` | GREEN. 대조군 9/9 가짜 서버 도달(앱 모양 앵커 4종 route · request 사건 0 = 사고 구멍 재현), controlDeny(`acceptDownloads:false`) 3/3 도달, 가드 9/9 도달 0 · 다운로드 0(페이지 층 8: anchor.click 2 · click 2 · dispatch · navigate · window.open · submit, 네트워크 층 1: fetch), 실제 앱 문서 3/3 삼킴 |
| 자가 시험 음성 | `no-download-guard` RED(다운로드 속성 트리거 4종 서버 도달) · `no-export-block` RED(fetch 도달) |
| native 고객 80 | GREEN 2/30 → 31/31 → PDF 31/31(최소 338자), 인쇄 뒤 호스트 0. 넘친 칸 2 경고(글꼴 경주, §6.3) |
| native `portal-opt-out` · `portal-removed` · `host-preexists` | RED(3/31 · 부모 null · PDF 2 ≠ 31) · RED(부모 null · PDF 1쪽 백지) · GREEN(인쇄 전 호스트 1 → 31/31 → 뒤 0) |
| paper-print-check `--url` 고객 80 / `portal-opt-out` | GREEN 3/31 → 31/31 → PDF 31, 넘침 0 / RED(포털 미탑승 · 3/31 · PDF 2 ≠ 31) |
| button `--explanation` 고객 80 · `--surface builder --explanation` 내부 53 | GREEN 31/31 + 44/44 · 18/18 + 26/26, 엔진 인쇄 뒤 상태 done, `prior` 없음 |
| button `--real-print` + `portal-opt-out`(고객 80) | RED(「인쇄된 루트의 부모 null(포털 미탑승)」) |
| force-per-page `--per 2`(내부 53) | GREEN ×3(16→27쪽, 29/29 · 26/26, 넘침 0). 첫 회 RED(두 번째 잡 `prior:'needs-gesture'`)는 실행 중 다른 세션의 `paper-export-items.ts` 편집(Fast Refresh)과 겹친 것 — 재실행 GREEN. `overflow-dom` → RED |
| dialog 내부 53(캐시 적중) | GREEN 18/18, 추가 미리보기 요청 0, 집계 1(읽기 전용 액션 허용 목록 정상) |
| paper-sweep `--base 3109` | 가드 켬 5쪽 넘침 0(보정 1회) · 1단 압축 5쪽 0 / `--guard-off` 넘침 1(보정 0) — 가드 스위치가 init script 로 먹는다 |

26-09-30 Wave 4 PRINT-RESPONSE(누름 무장 §3.3 — 개발 서버, 다른 트랙이 CPU 를 포화시킨 구간 포함). 타이밍 계기는
scratchpad `arm-timing.mjs`(쓰기 차단 하네스 재사용): 누른 채 「준비 중」 페인트 **사건**을 기다린 뒤 떼고, 페인트는 프레임 번호
(매 프레임 첫 rAF 의 메시지 · 다음 프레임 rAF 시작)로 판정한다. 계기 자가 시험 7/7 × 3(같은 rAF 에서 커밋 + 인쇄 · 태스크 커밋 뒤
다음 rAF 인쇄는 RED, CPU 6× 포함).

| 실행 | 결과 |
|---|---|
| 상세 [인쇄] 고객 80(빠른 경로) | pointerdown→「준비 중」 페인트 1× 12~23ms · 4× 33~57ms(한가한 구간) / 80~130ms(포화 구간), click 전 페인트 전부. click→print() 1× 0.7~1.4초 · 4× 3.6~15초(동결 자체는 그대로 — 이제 그동안 「준비 중」과 스피너가 보인다) |
| 빌더 [인쇄] 내부 53 | 1× 20~52ms · 4× 56~80ms(한가) / 57~126ms, 포화 구간 한 회차 99 · 219 · 451ms — 누름 태스크에 빌더가 누름과 무관하게 돌리는 호스트 재렌더가 끼인 경우(대조: 인쇄가 아닌 툴바 자리 누름에서도 1.4~2.4초 긴 작업). 무장 자체의 커밋은 13~30ms |
| 카드 대화상자(autoStart) 내부 53 | print() 전 표시줄 페인트 4/4(무장 프레임 → 다음 프레임 인쇄). 1×: click→표시줄 0.47~0.54초 · click→print() 1.2초 |
| 음성 대조 `ARM_TIMING_FAULT=no-arm`(React 전에 툴바 누름 삼킴) | RED — click 전 페인트 없음 · click 순간 표시줄 빈 값 |
| 메뉴 [PDF] · [PDF 해설] | 누르는 동안 「준비 중」 · `aria-busy`, 레이아웃 이동 0px, 누른 자리의 요소 = 메뉴 항목(겹친 막대가 가로채지 않음), print() 1회. 수리 전: 메뉴를 열 때 포커스가 간 [다운로드] 의 blur 가 무장을 즉시 풀었다 |
| 키보드 | Space: 누르는 동안 「준비 중」 페인트 · 떼면 print() 1회 31/31 · Enter: print() 1회 31/31 · Space 누른 채 Tab 뒤 떼기 · 마우스 밖으로 끌어 떼기: 무장 해제 · print() 0 |
| print-e2e 회귀(무장 뒤) | native 80 · 107, button 80 · 107 · 빌더 53(+해설), dialog 53 hit/miss · 모바일, deeplink 53 · 80, real-print 80 · 107 · 빌더 53 전부 GREEN. 빠른 경로 잡도 print() 순간 표시줄이 「준비 중」(종전 빈 값) |
| 동작 게이트 · 계약 음성테스트 | 사본 변이 21종(무장이 host/busy 를 켬 · touch 프레임 해제 · mouse 무해제 · Space 조기 해제 · 빈 시험지 · 상태 커밋 미정리 · autoStart 무장 없음/같은 프레임 인쇄/cleanup 취소 · 연타 무장 · 표시줄 무시 · [취소] · 요소 blur · 오른쪽 버튼 · 툴바/표시줄/빌더 모바일 무장 누락 · disabled 결합 · busy 결합 · 호스트 printArming 누락 · 타이머) → 전부 RED, 무변이 GREEN |

26-09-30 XB-1(문서 load 전 [인쇄] — 교차 브라우저 게이트가 잡은 결함, 파이프라인 문서 §3.2 【load 전 인쇄 금지】).
조건: `hang-ui-font`(Pretendard CDN 글꼴이 load 를 붙잡음) · 시험지 글꼴만 도착 · 고객 80문항(32쪽) · 고객 세션 · 쓰기 가드.

| 실행 | 결과 |
|---|---|
| 수리 전 · 진짜 print(Chromium 147) | 누른 print() 가 사건 0으로 돌아옴(`readyState:'interactive'`) → 「브라우저가 막음」 오판 표시 · [인쇄] 재시도도 0/0 · 기록 `printed` 2건(인쇄 0) → 글꼴 요청을 끝내 load 가 오자 미뤄진 인쇄 1회(32/32) |
| 미뤄진 인쇄를 「받아내는」 1차 수리안(기각) | 미뤄진 인쇄의 beforeprint · afterprint 리스너는 불렸으나(load 5766 → bp 5860 → ap 5920ms) 그 안의 `queueMicrotask` 0회 · `setTimeout` 은 실행. React 루트 `pendingLanes 32 · callbackNode null` 로 영구 정지 — 표시줄이 14초 넘게 「불러오는 중」, 버튼 클릭도 반영 안 됨. load 전 루트는 `pendingLanes 0`(정지 원인 = 미뤄진 인쇄) |
| 채택안(load 전 print() 금지) · Chromium 진짜 print | 누름 → 「페이지를 마저 불러오는 중」 · print() 0 · 기록 0 · 루트 정상 → 글꼴 요청 끝냄 → load 다음 태스크에 print() 1회(그 안에서 beforeprint 1 · afterprint 1 = 미뤄지지 않음) · 32/32 · 표시줄 비움 · `pendingLanes 0` · 이어 누른 [인쇄] 빠른 경로 64ms · 기록 `prepare/3001` · `fast/64` |
| 채택안 · Firefox 148(동기 모형) | 같은 9개 판정 전부 참 |
| `print-e2e button --real-print` · `button --explanation`(`hang-ui-font`) | GREEN(대기 표시 · load 전 호출 0 · `path:'prepare'` · 32/32 · 해설 46/46). 잡의 load 대기를 끈 사본 → RED 5건(대기 표시 없음 · load 전 print() 1회 · print() 안 사건 0/0 · 「막음」 표시 · `path:'fast'`) |
