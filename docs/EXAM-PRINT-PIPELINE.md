# 시험지 브라우저 인쇄 파이프라인 (26-09-29 · 26-09-30 개정)

> 읽는 사람: 시험지 인쇄(미리보기 · 상세 · 목록 카드 · 빌더)를 다음에 만질 개발자, 그리고 인쇄 신고를 받은 운영자.
> 한 줄 요약: **인쇄는 「준비 완료 신호」가 모두 참일 때만, 한 파일(인쇄 컨트롤러)에서 부른다.
> 전 쪽 마운트는 `usePrintPortal` 한 곳만 소유한다. 검증은 기다림 없는 실제 인쇄 엔진으로만, 쓰기 가드를 건 브라우저로만 한다.**

관련 문서
- 사고 원인 분석(정본): [`docs/customers/eastim-print-hwpx-2609.md`](customers/eastim-print-hwpx-2609.md) — 6/29~9/29 전 고객 「앞 2쪽 + 백지」 인쇄
- **무엇을 찍을지**(지문 싣기 · 지문 원천 · 정답표 · 레이아웃 기본값 · 웹/HWPX/DOCX 선지 묶음): [`docs/EXAM-PAPER-MODEL.md`](EXAM-PAPER-MODEL.md) — 이 문서는 「언제 · 어떻게 인쇄하나」만 다룬다
- 조판 추정·넘침 가드 · 선지 묶음 · 해설 블록: [`docs/EXAM-PAGINATION-OVERFLOW.md`](EXAM-PAGINATION-OVERFLOW.md) — §4 의 9/19 인쇄 수리 서술은 **가짜 GREEN** 이었다(아래 §1)

26-09-30 개정 요지(Wave 2): 포털 소유 기록(`print-portal-registry.ts`)과 남은 호스트 자가 치유(R7) · 인쇄 레이아웃 도중
언마운트는 그 인쇄의 afterprint 로 미룸(PH-R1, `matchMedia('print')`) · 준비 중 네이티브 인쇄 넘겨받기(R5) · 원격 측정
`fonts:'error'` · `guard:'stuck'` · `overflowColumns` · PDF 해설 블록 줄 단위 분할(§6.2 수리 완료) · 해설 모드에서 「쪽당 N문제」
강제 배치 끔 · 검증 도구의 다운로드 쓰기 가드(§6.1 — 9/30 운영 쓰기 사고). Wave 4: 누름 무장(§3.3) · 인쇄 집계가 `updatedAt` 을
안 올림(§3.2) · 쓰기 가드 GET 기본 거부(§6.1) · 정답표 쪽 PDF 하한(§6). XB-1: 문서 load 전 print() 금지 — 잡이 load 를
기다리고 표시줄은 「페이지를 마저 불러오는 중」(§3.2 · 교차 브라우저 게이트가 잡음).

---

## 1. 무엇이 틀렸었나 — 두 겹

1. **지연 마운트 + 시간 추측 인쇄.** 미리보기(`LazyPaperPage`)는 화면 근처 쪽만 그린다. 인쇄 버튼은
   `setTimeout(50)` 뒤 `window.print()`, 해설 PDF 는 `rAF + 120ms`, 목록 카드는 0×0 숨김 iframe 에
   `?print=1` 을 띄워 그 안의 상세 화면이 600ms 뒤 스스로 인쇄했다. 어느 것도 「전 쪽이 그려졌는가」를 보지
   않았다 → 3쪽 이후 백지.
2. **9/19 수리(`use-print-mount-all.ts`)와 그 검증이 가짜 GREEN.** `beforeprint` 에서 `flushSync` 로 전 쪽
   마운트를 켰지만, `LazyPaperPage` 는 그 값을 **이펙트**로 받아 한 박자 늦게 그렸다. 브라우저는 beforeprint
   핸들러가 끝나자마자 인쇄 레이아웃을 뜨므로 인쇄에는 못 들어간다. 그런데 검증 스크립트
   (`paper-print-check.mjs` 종전 판)는 **합성 beforeprint → `waitForTimeout(1500)` → 측정**이라, 그 1.5초 동안
   이펙트가 나머지 쪽을 그려 줘서 초록이 나왔다. 실제 엔진(printToPDF 직행)으로 뜨면 3/29쪽이었다.
   게다가 이 훅은 소유권 판정 없이 **모든** beforeprint 에서 전 쪽을 그려, 스튜디오에서 학습지를 인쇄해도 숨은
   시험지 빌더 수십 쪽을 헛마운트했다.

교훈: **「기다렸더니 됐다」는 증거가 아니다.** 인쇄 판정은 엔진이 실제로 찍은 PDF, 또는 `print()` 호출 순간의
동기 스냅숏으로만 한다(§6).

## 2. 진입점

| 진입점 | 파일 | 경로 | 원격 측정 entry |
|---|---|---|---|
| 상세 화면 툴바 [인쇄] · [다운로드]→[PDF] · [PDF 해설] | `exam-detail-paper-preview.tsx` | `ctl.print('plain' \| 'explanation')` | `detail` |
| 빠른보기 대화상자 툴바 | `exam-quick-view-dialog.tsx` → 위 컴포넌트(`printEntry="quick-view"`) | 같음 | `quick-view` |
| 목록 카드 [인쇄] | `exam-file-card.tsx`(`onPrint`) → `exam-list-client.tsx` → `exam-print-dialog.tsx` | 같은 문서 안 **보이는** 인쇄 대화상자, `autoPrint` | `card-dialog` |
| `?print=1` 딥링크(유사 시험지 카드 새 탭) | `similar-exam-job-card.tsx` → 상세 화면 | 상세의 `autoStart`, 시작 순간 `history.replaceState` 로 파라미터 제거 | `deep-link` |
| 빌더 툴바 · 다운로드 메뉴 · 모바일 하단 바(독립 · 국어 · 스튜디오 임베드) | `exam-paper-builder-client.tsx` | `ctl.print(...)`, 모바일 문항 단계면 `ensureVisible` | `builder` |
| Ctrl+P · 브라우저 메뉴 · printToPDF | (진입점 없음) | `usePrintPortal` 동기 안전망(§4). 버튼 인쇄가 **준비 중**이면 그 잡이 이 인쇄를 넘겨받는다(§3.2 native) | 기록 없음 |

- 목록 카드의 숨김 iframe 은 **폐기**했다(0×0 창이라 IntersectionObserver 가 영원히 안 돌았고, 인쇄 1회마다
  원장 콘솔 문서를 새로 부팅했다). 카드 인쇄 데이터는 썸네일과 같은 캐시(`exam-preview-data-cache.ts`)를 쓴다.
  **신선도 상한(감독 결정 26-09-30 — TTL 유지)**: 키 = examId + 목록의 `updatedAt`, 결과는 도착 뒤 **3분**까지 쓴다. 문제은행에서
  문항 · 지문을 고쳐도 `exam.updatedAt` 은 그대로라 카드 인쇄는 최대 3분 동안 고치기 전 내용을 찍을 수 있다. 빌더 저장은 `updatedAt`
  을 올려 바로 새로 받는다. 인쇄 집계는 `updatedAt` 을 올리지 않는다(§3.2). 새로고침하면 비워지고, 상세 화면 인쇄는 캐시를 안 쓴다.
- 인쇄 버튼은 lg 미만에서 숨는다. 진행 상태 · 제스처 폴백은 모든 폭에서 보이는 `PrintStatusBar`
  (`[data-preview-toolbar] + [role=status]`)가 맡는다.
- 원문 지문 없는 문항 경고(26-09-30): 상세 컴포넌트를 쓰는 진입점(상세 · 빠른보기 · 카드 대화상자 · 딥링크)은 인쇄 잡이
  `printed` · `native` 로 끝나고 누락이 있으면 토스트를 띄운다(`missing-passage-warning.tsx` `withPrintWarning` — 배너를 볼 틈
  없는 경로 대비). **빌더는 인쇄 토스트가 없다**(배너 · 문항 칩 · HWPX/DOCX 내보내기 토스트만). 인쇄 빠른 경로(print() 전)에는
  아무것도 끼우지 않는다. 판정 규칙은 EXAM-PAPER-MODEL §6.

## 3. 인쇄 컨트롤러 — `paper-builder/print/`

| 파일 | 역할 |
|---|---|
| `use-exam-print-controller.ts` | 상태 · 단일 비행 · autoStart 래치 · 잡 인쇄 사건 리스너 · **시험지 영역의 유일한 `window.print()`** |
| `exam-print-job.ts` | 인쇄 잡 1건의 순서(React 무의존 상태기계) — 빠른 경로 / 준비 경로, 시작 시 남은 포털 치우기 |
| `print-readiness.ts` | 준비 완료 판정 도구(시험지 글꼴 면 · 전 쪽 마운트 · 이미지 · 첫 매칭 루트 · 탭 가시성) |
| `column-overflow.ts` | 칸 넘침 실측(순수 DOM) — 넘침 가드와 인쇄 잡(인쇄 순간 남은 넘침 → `guard:'stuck'`)이 같은 판정식을 쓴다 |
| `print-portal-registry.ts` | 포털(`#exam-print-host`) 소유 기록 · 남은 포털 치우기(`settleStalePrintPortal`) · 인쇄 레이아웃 판정(`isPrintLayoutActive`) — §4 |
| `print-status-bar.tsx` | 상태 표시줄(role=status, aria-live=polite) — [취소] · [인쇄] · [다시 시도]. idle · done 에서 무장되면 「준비 중」(`printBarView`) |
| `print-arming.ts` | 누름 무장(26-09-30 CC-2) — 누름 의도 판정 · 무장 스토어 · 타이머 없는 해제 감시(§3.3). React 무의존 |
| `print-arm-ui.tsx` | 무장 구독 조각 — `usePrintArmed` · `printArmHandlers`(진입점의 onPointerDown · onKeyDown) · `PrintArmIcon` |

원격 측정 메타 검증기는 `src/lib/exams/print-event-meta.ts`(순수, 서버 액션 `incrementExamPrintCount` 가 씀).

### 3.1 준비 완료 조건 6가지

| 조건 | 판정 | 못 채우면 | 실패 상한 |
|---|---|---|---|
| fonts | `fonts.check('400 16px "Malgun Gothic Exam"')` · 700 이 참(아니면 `fonts.load` → **시험지 글꼴 면의 `loaded`** 만 기다림). 전역 `document.fonts.status` · `fonts.ready` 는 보지 않는다 | 상한 뒤 `fonts:'timeout'`, 글꼴 파일 거부(404 · 차단)는 즉시 `fonts:'error'` 로 인쇄 | 8초 |
| pages | 루트 안 모든 본문 프레임(`[data-exam-page-index]`)이 `.exam-a4-page` 를 가진다 | **차단**(print 호출 0, `outcome:'blocked'`) | — |
| guard | 넘침 가드 `isSettled()`(측정 당시 결과 · 마운트 수 · 글꼴 에폭이 지금과 같고 clean/stuck-overflow/exhausted). 가드가 비활성(쪽당 N문제 강제 · 개발 스위치)이면 참 | 상한 뒤 `guard:'timeout'` 으로 인쇄 | 4초 |
| images | 루트 안 `img` 가 전부 complete(아니면 `decode()`) | 상한 뒤 `images:'timeout'` | 3초 |
| primary-root | `document.getElementById('exam-paper-print-root') === 내 루트` — 잡은 첫 양보 전에 남은 포털부터 치운다(C12) | **차단** | 1초 |
| visible | 탭이 보이는 상태 | 보일 때까지(취소로만 멈춤) | — |

⚠ 표의 시간은 전부 **실패 상한**이다. 준비 판정에 시간 추측(50/120/600ms 대기 뒤 인쇄)은 없다 — 조건이 참이
되는 순간 진행한다.

**왜 전역 글꼴 상태를 보지 않나(26-09-30 PRINT-R1)**: 앱 UI 글꼴 Pretendard 는 jsDelivr CDN 에서 온다
(`src/app/layout.tsx`). 로컬 설치본이 없는 사용자가 CDN 이 느리거나 막힌 망에 있으면 `document.fonts.status` 가 영영
`loading` 이다. 이것을 보면 시험지 글꼴이 이미 로드됐어도 빠른 경로(Safari 제스처)를 잃고 글꼴 8초 + 가드 4초 상한을
다 기다린 뒤, 가드가 한 번도 재지 못한 추정 조판 그대로 인쇄했다(실측 80문항 12.6초 · 넘친 칸 6). 시험지 조판의 글꼴
스택은 시험지 글꼴 → 시스템 맑은 고딕 → sans-serif 라 다른 웹 글꼴은 칸 높이에 영향이 없다. 넘침 가드도 같은 이유로
시험지 글꼴 면이 `loading` 일 때만 측정을 보류한다(`examFontsLoading`).
⚠ 정정(26-09-30 XB-1): UI 글꼴이 걸려 있으면 **문서 load 도 끝나지 않는다.** 이때의 「빠른 경로」 print() 는 브라우저가 load
뒤로 미뤘다 — PRINT-R1 의 GREEN 은 스텁 print 에서만 참이었다. 이제 잡은 load 가 끝날 때까지 print() 를 부르지 않는다(§3.2).
UI 글꼴 **상태**를 기다리지 않는다는 판정은 그대로다(load 가 끝나면 UI 글꼴이 실패로 끝났어도 인쇄한다).

**인쇄 순간 남은 넘침(PRINT-R3)**: 인쇄 잡은 최종 판정 때 인쇄될 DOM 의 넘친 칸을 실측해(`column-overflow.ts`)
`overflowColumns` 로 싣고, 가드가 수렴했는데도 남았으면 `guard:'stuck'` 으로 보고한다 — 종이에서 잘린 칸이 「정상
인쇄」로 묻히지 않게. 인쇄를 막지는 않는다(잘린 한 칸 때문에 시험지 전체를 안 찍는 것보다 찍고 드러낸다).
근본 원인이던 「한 칸보다 긴 PDF 해설 블록」은 26-09-30 줄 단위 분할로 없어졌다(§6.2).

### 3.2 상태기계

```
idle ──print(mode)──▶ preparing ──모든 조건 참──▶ printing ──afterprint──▶ done
                     (⇄ waiting-load: 문서 load 전)    │
                        │   │                       │
                        │   │                       └─ print() 동안 beforeprint 0회 ─▶ needs-gesture ─[인쇄]─▶ (새 제스처, 빠른 경로)
                        │   │                                                  └─ 늦은 beforeprint ─▶ printing(prior 지움)
                        │   └─ 준비 중 남이 연 인쇄(Ctrl+P · 메뉴)의 beforeprint ─▶ native ──그 afterprint──▶ done
                        └─ pages · primary-root 끝내 거짓 ─▶ blocked ─[다시 시도]─▶ preparing
```

- **빠른 경로**: 글꼴이 이미 준비된 클릭이면 await 가 하나도 없다 — 클릭 태스크 안에서 `flushSync` 로 전 쪽을
  그리고(같은 커밋에서 가드 layout effect 가 수렴) 같은 태스크에서 `print()`. Safari 사용자 활성화가 보존된다.
- **준비 경로**: 조건 하나라도 거짓이면 「준비 중」을 한 번 페인트한 뒤 조건마다 기다린다.
- **【load 전 인쇄 금지】(26-09-30 XB-1)**: 문서 load 전의 `print()` 는 Chromium · Gecko · WebKit 이 load 뒤로 미룬다(사건 0으로
  즉시 반환). 미뤄진 인쇄는 load 와 같은 태스크에서 발화하는데, 그 beforeprint · afterprint 리스너 안에서 예약된
  마이크로태스크는 **실행되지 않는다**(Chromium 실측: `queueMicrotask` 0회 · `setTimeout` 실행). React 는 렌더 예약을 그
  마이크로태스크로 하므로 포털의 `flushSync` 한 번으로 루트가 영구 정지한다(`pendingLanes 32 · callbackNode null` — 인쇄 뒤
  화면이 다시 그려지지 않는다). 그래서 잡은 글꼴 단계 뒤 `isDocumentLoadPending` 이면 `waiting-load`(표시줄 「페이지를 마저
  불러오는 중」 · [취소]) 로 두고 `waitDocumentLoad` — load 사건이 **끝난 다음 태스크**(리스너 · 이어진 마이크로태스크는 아직
  로딩 중으로 친다)까지 기다린다. 상한 없음(브라우저도 load 까지 미룬다) · 연타 무시 · 취소 · 네이티브 넘겨받기는 preparing 과
  같다. 종전: 미뤄진 print() 를 「브라우저가 막음」(needs-gesture)으로 오판 · 재시도도 미뤄짐 · 기록만 2건 · 이어서 React 정지.
  같은 함정은 다른 영역의 `window.print()` 에도 있다 — 새 인쇄 진입점은 load 뒤에만 부를 것.
- **잡 시작**: 첫 양보 전에 `settleStalePrintPortal(doc, null)` 로 지난 인쇄의 남은 포털을 치우고(R7 — 남은 호스트 안의
  옛 루트가 첫 매칭이 되어 차단되지 않게), 잡의 beforeprint/afterprint 리스너를 **잡 시작부터** 단다(R5).
- **준비 중 네이티브 인쇄(26-09-30 PRINT-R5)**: preparing 에서 컨트롤러가 부르지 않은 beforeprint 가 오면 = 사용자가 Ctrl+P ·
  브라우저 메뉴로 직접 인쇄했다(포털이 동기 안전망으로 받는다). 잡은 `native` 로 바뀌어 준비를 멈추고(`isDead`) **print() 를
  부르지 않으며**(두 번째 인쇄 창 0) 원격 측정도 보내지 않는다. 그 인쇄의 afterprint 에서 `onFinished({outcome:'native', meta:null})`
  로 끝난다. 종전에는 준비가 끝난 뒤 print() 를 한 번 더 불러 인쇄 창 둘 · 기록 둘이 생겼다.
- 정리(해설 모드 해제 · 전 쪽 마운트 해제 · done · onFinished)는 **afterprint 에서 1회만**. 모바일의 비차단
  `print()` 반환 직후에는 정리하지 않는다.
- `autoStart` 는 이펙트가 rAF 를 예약하고 cleanup 에서 취소, 래치는 실행된 콜백 안에서만 → StrictMode 에서도 정확히 1회.
- 모듈 단위 `activeJob` — 문서 전체에서 준비 중인 인쇄는 1건.
- 원격 측정: `print()` 직전(또는 차단 시) `incrementExamPrintCount(examId, meta)` fire-and-forget.
  `outcome:'blocked'` 는 인쇄 횟수에 넣지 않는다. 미저장 빌더(examId null)는 보내지 않는다. `native` 는 보내지 않는다.
- 인쇄 횟수 +1 은 `src/lib/exams/exam-print-count.ts` `incrementExamPrintCountRow` 한 경로(인쇄 집계 · HWPX/DOCX 내보내기). 원시
  UPDATE 라 `exams.updatedAt` 을 올리지 않고 학원 범위를 WHERE 에 건다(26-09-30 COH-15 — 종전엔 인쇄마다 목록 「마지막 수정」이
  바뀌고 카드 캐시가 무효가 됐다. 인쇄는 수정이 아니다).

### 3.3 누름 무장 — 빠른 경로의 무페인트 동결 대책(26-09-30 PRINT-RESPONSE · CC-2 / PRINT-R4)

빠른 경로는 click 태스크 하나 안에서 전 쪽 `flushSync` · 가드 · `print()` 를 끝낸다(Safari 제스처). 그 태스크에는 페인트가
없어 종전에는 「준비 중」이 한 번도 안 보였고, 느린 CPU 에서는 클릭 뒤 화면이 반응 없이 멈췄다(개발 서버 CPU 4× 9~10초).
사람의 누름(pointerdown → click)에는 수십~백여 ms 가 있고 그 사이 렌더링 기회가 돈다(실측 5~7프레임). 그래서:

- **모든 진입점**(툴바 [인쇄] · 메뉴 [인쇄] · [PDF] · [PDF 해설] · 빌더 모바일 바 [인쇄] · 모바일 메뉴 [PDF] · [PDF 해설] ·
  상태 표시줄 [인쇄] · [다시 시도])은 `onPointerDown` · `onKeyDown`(Enter/Space)에서 `ctl.arming.arm(mode, e)` 를 부른다
  (`printArmHandlers`). 표시줄은 「준비 중」, 버튼은 스피너 · `aria-busy` · 눌린 색으로 **click 전에 페인트**된다.
  `print()` 는 지금처럼 click 안에서 동기로 부른다(제스처 · 키보드 활성화 그대로).
- 무장은 **표시일 뿐**이다. `busy` · `disabled` 를 켜지 않는다(켜면 뒤따를 click 이 사라져 인쇄가 안 된다). 무장 상태는
  외부 스토어라 호스트(상세 · 빌더)를 다시 그리지 않는다 — 구독자(표시줄 · 툴바 · `PrintArmIcon`)만 다시 그린다.
- 진행 중(무장 · preparing · printing) 표시줄은 미리보기 위에 **겹쳐** 그린다(`absolute z-20`). 흐름에 끼우면 미리보기가 44px
  밀려 A4 쪽 전체를 다시 래스터했다(CPU 4× 커밋→페인트 12~135ms). 툴바 메뉴(z-30)보다 아래라 메뉴 항목을 누르는 중에 떠도
  click 을 가로채지 않는다. needs-gesture · blocked 는 흐름 안(내용을 가리지 않는다).
- 소비: 잡 시작(`start`)이 해제 감시만 뗀다. 표시는 잡의 다음 상태 커밋(`useLayoutEffect([state])`)에서 지워진다 — 준비
  경로로 가도 「준비 중」이 깜박이지 않고, 빠른 경로 동결 동안에는 마지막에 페인트된 「준비 중」과 컴포지터 스피너가 보인다.
- 인쇄로 이어지지 않은 누름은 **타이머 없이** 푼다(엔진 3종 실측): mouse 는 pointerup 뒤 첫 프레임(click 은 pointerup 과
  같은 태스크), Enter 는 keydown 뒤 첫 프레임, Space 는 keyup 뒤 첫 프레임. touch · pen 은 click 이 다음 태스크에 와서(Chromium 은
  pointerup 뒤 rAF 가 click 보다 먼저) 프레임으로 풀지 않고 떼는 점이 버튼 밖 · `pointercancel` · `contextmenu`(길게 누름) · 다른 곳
  click 으로 푼다. 공통: 다른 곳의 새 pointerdown · **창 자신의** blur(요소 사이 포커스 이동 blur 는 무시 — 메뉴 항목을 누르면
  [다운로드] 버튼이 blur 된다) · 탭 숨김 · [취소]. 준비 중(연타)에는 무장하지 않는다.
- `autoStart`(카드 대화상자 · `?print=1`)는 제스처가 없으므로 래치 프레임에 무장해 「준비 중」을 한 번 페인트하고 **다음 프레임**에
  시작한다. 두 번째 프레임은 언마운트만 취소한다(`onAutoStart` 로 `?print=1` 을 지워 autoStart 가 꺼져도 인쇄한다).
- 한계: Enter 는 keydown 과 click 이 같은 태스크라 그 사이 페인트가 없다(무장은 되지만 동결 전에 그려지지 않는다). Space · 포인터는
  누르는 동안 페인트된다.

## 4. 전 쪽 마운트 소유권 — `usePrintPortal` 한 곳

`paper-builder/hooks/use-print-portal.ts` 의 `beforeprint` 판정:

0. **남은 포털 자가 치유 + 이번 인쇄 판정**(26-09-30 R7): `settleStalePrintPortal(document, event)` —
   `print-portal-registry.ts` 의 소유 기록(claim: 호스트 · 세운 beforeprint 사건 · 주인의 원복 함수)을 본다.
   **같은 beforeprint 사건 객체**로 선 포털이 이미 있으면(`same-print`) 비켜선다(두 인스턴스가 한 인쇄에 두 시험지를
   옮기지 않게). 그 밖의 호스트(지난 인쇄의 잔재 · 주인 없는 호스트)는 주인의 원복을 부르거나 직접 떼어 **치운 뒤 판정을
   잇는다.** 종전 판정 「`#exam-print-host` 가 이미 있으면 비켜선다」는 남은 호스트 하나로 이후 모든 포털을 영구히 막았다
   (네이티브는 앞 2쪽만, 버튼 인쇄는 printed 로 기록되며 옛 내용).
1. 루트 조상에 `[data-exam-print-exclude='true']`(호스트의 명시 선언 — 스튜디오 숨은 빌더 등) → 비켜선다.
2. `!root.offsetParent` **그리고** 화면에 남의 인쇄 루트(`.par-root:not(.par-cover-preview):not(.par-print-exclude)`) → 비켜선다.
3. `rootRef` 를 넘긴 호스트인데 첫 매칭 루트가 내 것이 아니면 → 비켜선다.

모두 통과해 루트를 `#exam-print-host` 로 **옮긴 직후에만** 소유를 기록하고(`claimPrintPortal({host, event, release: afterPrint})`)
`flushSync(() => setPrintMountAll(true))` 한 뒤 그 값을 돌려준다. 호스트(상세 · 빌더)는 반환값을 `PreviewPages forceMountAll`
에 **OR** 한다. 비켜선 인쇄에서는 헛마운트 0. 이것이 Ctrl+P · 브라우저 메뉴 · printToPDF 처럼 **기다릴 수 없는 경로**의
동기 안전망이다(버튼 인쇄는 컨트롤러가 print() 전에 이미 그려 둔다 — 이중 안전). afterprint 는 자기가 옮긴 `portaledRoot`
를 되돌리고 기록을 지운다.

**인쇄 도중 언마운트(26-09-30 R7 · PH-R1)**: 이펙트 cleanup 은 리스너를 떼므로 afterprint 가 더 오지 않는다 → 내 포털이 서
있으면 cleanup 이 원복을 책임진다(루트 원위치 · 호스트 제거 · body 클래스 해제 — 안 하면 최상위 고정 호스트가 화면을 덮고
다음 인쇄를 망친다. 모바일 비차단 인쇄 뒤 대화상자 닫기 · 화면 이동). 단 **문서가 지금 인쇄 레이아웃으로 그려지는 중**
(`isPrintLayoutActive` = `matchMedia('print').matches`)이면 즉시 원복하지 않고 **그 인쇄의 afterprint 로 미룬다**(한 번) —
네이티브 인쇄는 인쇄 폭(A4 794px)으로 매체 질의를 다시 평가하고, 랜딩 PC 데모의 `DemoGate`(`min-width:1024px`)가 그 사이에
데모를 언마운트한다. 즉시 원복하면 캡처 전에 포털이 사라져 PDF 에 랜딩 히어로가 찍혔다(실측 905자 → 미룸 4,324자).
미룬 원복은 기록(claim)의 원복 함수로도 걸어 두어, afterprint 가 끝내 안 오면 다음 beforeprint · 새 인쇄 잡의 치우기가 부른다.
`matchMedia('print')` 판별은 헤드리스 Chromium printToPDF 에서만 실측했다(데스크톱 인쇄 미리보기 · Safari · Firefox · 모바일 미확인).

짝이 되는 계약 두 개:
- `LazyPaperPage`(`exam-paper-builder-client-parts/preview-pages.tsx`)는 `visible = mounted || forceMount` 를
  **렌더에서** 반영한다. 이펙트로 미루면 flushSync 가 끝난 뒤에야 그려져 3쪽 이후가 백지다.
  `data-exam-page-mounted` 가 그 결과를 DOM 에 드러낸다.
- 인쇄 CSS(`print-styles.tsx`)는 `#exam-print-host` 안에서 `data-exam-page-mounted="false"` 인 쪽에 백지 대신
  **「이 쪽은 인쇄 준비가 끝나지 않았습니다. 화면의 [인쇄] 버튼으로 다시 인쇄해 주세요.」** 를 찍는다. 모든 방어가
  뚫려도 조용한 백지는 없다. 또 `body.exam-print-active` 일 때 Radix 스크롤 잠금(`body[data-scroll-locked]`)을
  인쇄 미디어에서 푼다(대화상자 안 인쇄).

**계약 밖 호스트(C2 · C5 · C10 이 보지 않는다)**: 랜딩 PC · 모바일 데모(`components/landing/demo/step4-paper/`)는 `usePrintPortal`
반환값을 `forceMountAll` 에 OR 하지 않고 `window.print()` 를 직접 부른다(4문항이라 지금은 영향이 작다 — 쪽이 늘면 OR 한 줄 + C2 · C5
범위 확장). 관리자 보기 · 인쇄(`components/admin/exam-print-view.tsx`)도 직접 부른다 — 지연 마운트 · 넘침 가드 · 시험지 글꼴이 없는
단순 흐름 문서라 기다릴 준비 신호가 없다(찍을 내용은 공용 모델 `exam-print-model.ts`).

## 5. 불변식과 테스트

`tests/unit/exam-print-pipeline-contract.test.mjs`(`npm run test:unit` 에 포함)가 소스 계약으로 고정한다.
주석은 떼고 코드만 본다.

| # | 불변식 | 깨면 |
|---|---|---|
| C1 | `LazyPaperPage` 는 렌더에서 `mounted \|\| forceMount` 로 그린다 · `data-exam-page-mounted` · `forceMount={…forceMountAll}` | 3쪽 이후 백지 |
| C2 | 시험지 영역(`src/components/exams/**`, 시험지 라우트 3곳)의 `window.print(` 는 `use-exam-print-controller.ts` 에만 | 준비 판정 우회 |
| C3 | `setTimeout` 콜백이 인쇄를 부르거나 인쇄 함수를 넘기는 패턴 0건 | 시간 추측 인쇄 부활 |
| C4 | `exam-file-card.tsx` 에 iframe · `?print=1` · `contentWindow` 없음 | 숨김 iframe 부활 |
| C5 | `usePrintPortal` 두 판정 선택자 유지, 판정 → 포털 탑승 → 전 쪽 마운트 순서, 호스트가 반환값을 `forceMountAll` 에 OR | 남의 인쇄 가로채기 · 헛마운트 · 네이티브 백지 |
| C6 | `use-print-mount-all.ts` 파일도 참조도 없음 | 판정 없는 전 쪽 마운트 부활 |
| C7 | `scripts/exam-pagination/*print*.mjs` 는 인쇄 준비 사건(`printReady` · `waitPrintCall`)부터 PDF 까지 시간 대기(`waitForTimeout` · sleep Promise) 0, 합성 beforeprint/afterprint 0 | 가짜 GREEN 부활 |
| C8 | `exam-print-job.ts` · `use-exam-print-controller.ts` 에 `setTimeout` · `setInterval` · sleep 0(시간은 `print-readiness` 의 실패 상한 · 프레임 양보에만) | 준비 대기를 고정 대기로 바꾸기 |
| C9 | 포털 판정 (0)/(3): `settleStalePrintPortal(document, event) === 'same-print'` 면 비켜서고 · 「호스트가 있기만 하면 비켜선다」 종전 판정 없음 · `rootRef` 가 첫 매칭이 아니면 비켜선다 · 탑승 뒤 `claimPrintPortal` · afterprint 는 `portaledRoot` 를 되돌리고 기록을 지운다 · cleanup 은 내 포털일 때만 원복하되 `isPrintLayoutActive` 면 afterprint 로 미룬다 · 레지스트리의 「이번 인쇄」는 사건 동일성, 레이아웃 판정은 `matchMedia("print")` | 두 시험지가 한 인쇄에 · 남은 호스트로 영구 비켜섬 · 인쇄 중 언마운트 누수 · 랜딩 네이티브 인쇄에서 시험지 소실 |
| C10 | `useExamPrintController` 를 쓰는 호스트(상세 · 빌더)는 그 `forceMountAll` 을 `PreviewPages forceMountAll` 에 OR | 버튼 인쇄가 전부 blocked |
| C11 | autoStart 래치는 rAF 콜백 안에서만(1곳) · `invokePrint` 의 `window.print()` 뒤에 `endJob` 없음(정리는 afterprint 에서만) | StrictMode 0/2회 인쇄 · 모바일 인쇄 전 원복 |
| C12 | 인쇄 잡은 첫 양보(글꼴 단계) 전에 `settleStalePrintPortal(doc, null)` · 컨트롤러는 `runExamPrintJob` 전에 `watchPrintEvents(job)` · 준비 중 `native` 면 잡을 멈춘다 | 남은 루트로 차단 · 준비 중 Ctrl+P 뒤 두 번째 인쇄 창 |
| C14 | 인쇄 진입점(툴바 `onPrint` · `downloadPdf` · `onDownloadPdfWithAnswers` 버튼, 상태 표시줄 [인쇄] · [다시 시도], 빌더 모바일 [인쇄])은 `armFor` · `printArmHandlers` · `retryProps` 로 누름에서 무장 · `printDisabled = actionDisabled \|\| printBusy`(무장 무관) · 컨트롤러 `busy` 는 잡 단계(preparing · waiting-load · printing)만 · `PreviewToolbar` 를 그리는 컨트롤러 호스트는 `printArming={ctl.arming}` · `print-arming.ts` 에 타이머 0 (§3.3) | 빠른 경로 무페인트 동결 재발 · 무장이 버튼을 막아 인쇄 불가 |
| C13 | 검증 스크립트 쓰기 가드(§6.1): `write-guard.mjs` 페이지 층(navigate `downloadRequest` 취소 · 캡처 click · 앵커 `click()` · 떨어진 앵커 `dispatchEvent` · 다운로드 속성 앵커 전부) · `guardRoute` 의 내보내기 abort 가 GET 처리보다 앞 · `openGuardedContext` 는 route · 계측 전에 `installDownloadGuard`, 자체 `route.continue()` 없이 `guardRoute` 로 끝남 · `clickToolbar` 는 인쇄 · PDF · PDF 해설만 · 브라우저를 열어 클릭하는/인쇄/스윕 스크립트는 가드를 건다 · print-e2e · paper-print-check · paper-sweep 은 `judgeWriteGuard`. GET 기본 거부(`get-policy.mjs`)의 증명은 브라우저가 필요한 `write-guard.mjs` 자가 시험에만 있다(`test:unit` 밖) | 검증이 운영 DB 에 쓴다(9/30 사고 재발) |

**동작 게이트** `tests/unit/exam-print-behavior.test.mjs`(`npm run test:unit` 에 포함): 계약은 모양만 본다.
동작은 이 게이트가 `node --import=tsx --test` 로 `tests/unit/exam-print/*.gate.mjs` 6개를 띄워 실제로 돌린다(케이스 하한
`MIN_CASES = 59` — 케이스를 지워 공허하게 만드는 것을 막는다). 저장소에 jsdom 이 없어 `fake-print-env.mjs`(가짜 DOM ·
FontFaceSet · 수동 시계)를 쓰고, 훅(`usePrintPortal` · `useExamPrintController`)은 `react-hook-env.mjs` 가 **진짜 React**
(react-dom/client + 가짜 문서/창)로 돌린다.
- `exam-print-job.gate.mjs`(20): 원격 측정 메타 검증 · 준비 판정(시험지 글꼴 면만) · 칸 넘침 실측 · 빠른 경로 동기 인쇄 ·
  수렴 전 인쇄 금지 · 4초 상한 · 차단 2종 · 취소 · 글꼴 늦음/거부/영영 안 옴/UI 글꼴 걸림 · 이미지 decode · stuck 보고
- `exam-preview-cache.gate.mjs`(5): 우선순위 · 승격 · 버전 · 실패/null 비캐시 · TTL · LRU
- `print-job-hardening.gate.mjs`(5): 잡 시작 치우기 · 라벨(R7 · R8)
- `print-portal.gate.mjs`(10): 인쇄 중 언마운트 원복 · 남은 호스트 자가 치유 · 두 인스턴스 규칙(R7) · 인쇄 레이아웃 도중 미룸(PH-R1)
- `print-controller.gate.mjs`(9): 준비 중 네이티브 넘겨받기(R5) · 비차단 print 정리 시점 · needs-gesture · StrictMode autoStart 1회 ·
  load 전 print() 0(waiting-load · 연타 무시 · load **다음 태스크**에 1회 · 취소 · 넘겨받기, XB-1)
- `print-arming.gate.mjs`(10): 누름 무장(§3.3) — click 전 「준비 중」 · 호스트 재렌더 0 · busy 거짓 · mouse/touch/Enter/Space 해제 규칙 ·
  요소 blur 무시 · 준비 경로 무깜박임 · [취소] · 연타 · 빈 시험지 · autoStart 무장 프레임 · 래치 뒤 autoStart 꺼짐 · 언마운트

`EXAM_PRINT_SRC_ROOT=<사본>` 으로 게이트를, `EXAM_PRINT_CONTRACT_ROOT=<사본>` 으로 계약을 저장소 사본에 건다(결함을
심어 RED 를 보는 계기 음성테스트 — 저장소 파일은 건드리지 않는다).

계기 음성테스트 기록: 26-09-29 계약에 결함 14종 → 해당 단언만 RED(9/29 이전 트리에 걸면 C1~C7 전부 RED). 26-09-30 Wave 1
수리: 계약 + 동작 게이트에 13종 → 전부 RED. 26-09-30 Wave 2(PRINT-HARDEN): 사본 변이 15종 · PH-R1 변이 8종 → 기대대로
(즉시 원복 회귀 · 항상 미루기 · 종전 판정 (3) · 사건 동일성 무시 · claim 미기록 · 잡 시작 치우기 제거 등). 26-09-30 C13: 사본
변이 9종(가드 설치 제거 · 하네스 자체 GET 통과 · 내보내기 abort 를 GET 뒤로 · navigate 제거 · dispatchEvent 제거 · 다운로드 속성
조건 제거 · 툴바 HWPX 허용 · 스윕 가드 제거 · 경보 판정 제거) → 전부 C13 만 RED, 무변이 GREEN.

한계: 정적 검사라 「대기를 품은 함수를 준비 사건 뒤에 부르는」 우회는 못 잡는다 — 인쇄 스크립트의 헬퍼에
`waitForTimeout` 을 넣지 말 것.

## 6. 검증 방법 — 기다림 없는 실제 엔진, 쓰기 가드 필수

도구(모두 헤드리스 Chromium, cwd = 저장소 루트, 기본 base `http://localhost:3000`, `--base`/`$PRINT_E2E_BASE` 로 변경):

| 도구 | 용도 |
|---|---|
| `scripts/exam-pagination/print-e2e.mjs <mode> --exam <id>` | 진입점별 e2e. 모드 `native` · `button` · `dialog` · `deeplink-strictmode` · `timing` · `force-per-page` |
| `scripts/exam-pagination/paper-print-check.mjs <classId> \| --url <경로>` | 스튜디오 조판 또는 아무 시험지 화면을 엔진 인쇄 + 인쇄된 DOM 넘침 감사 |
| `scripts/exam-pagination/print-harness.mjs` | 공용: 쓰기 가드 컨텍스트 · 계측 · `enginePrint` · 판정식 |
| `scripts/exam-pagination/write-guard.mjs` | 쓰기 가드(공용) + **자가 시험**(`node …/write-guard.mjs [--base URL]`, 본체 `write-guard-selftest.mjs`) — §6.1 |
| `scripts/exam-pagination/get-policy.mjs` · `side-effect-sweep.mjs` | GET 허용 목록(순수) · 부작용 GET/화면 정적 스윕(`--all` · `--pages director` · `--json`) — §6.1 |
| `scripts/exam-pagination/print-judge-selftest.mjs` | PDF 판정식 자가 시험(`PRINT_JUDGE_FAULT=fixed-floor` 면 RED) |
| `scripts/exam-pagination/paper-sweep.mjs` | 조판 전수 측정(개발 렌더 페이지) — 같은 쓰기 가드 · `--base` |

`dialog` 모드는 `--exam` 카드가 첫 화면 목록에 없으면(모바일 목록은 카드 10장만 그린다) 「다음 페이지」를 끝까지 넘기며 찾고, 끝내
없으면 「시험 조건 불성립」 RED 다(26-09-30 GPE-2).

`force-per-page`(26-09-30): 빌더 [시험지 설정] 「쪽당 N문제」(`--per 1|2`)를 켜고 켜졌는지(버튼 활성 + 쪽 수 변화)를 확인한 뒤
[인쇄] → [PDF 해설] 을 button 과 같은 판정으로 돈다. 해설 모드는 강제 배치를 끄므로(`forcedPerPageEnabled`, §6.2) 해설이 칸
용량대로 흘러야 하고, 인쇄 뒤에도 강제 배치 · 쪽 수가 그대로여야 한다. 빌더 읽기 액션이 필요해 `--session e2e` 전용.

판정 원칙
- **네이티브**: 앱이 인쇄를 가로챌 준비가 된 사건(첫 본문 프레임 + 앱의 beforeprint 리스너 등록)에서 곧바로
  `page.pdf({preferCSSPageSize:true})`. 엔진이 beforeprint/afterprint 를 쏜다. 인쇄 전 마운트가 일부뿐이어야
  시험이 성립한다(아니면 「시험 조건 불성립」 RED). 인쇄된 루트의 부모가 `#exam-print-host`, 인쇄 뒤 루트 원위치 · 호스트 0.
- **버튼 · 대화상자 · 딥링크**: `window.print` 를 「호출 순간 동기 스냅숏」으로 바꾼다(실제 인쇄 없음). 스냅숏의
  합격: `mounted == frames` · `data-exam-page-mounted=false` 0 · 글꼴 400/700 `check` 참이고 FontFace `loaded` ·
  이미지 대기 0 · iframe 0 · (대화상자면) 루트가 대화상자 안. 그 직후 `page.pdf()` 로 PDF 를 뜬다. 스텁 print() 는
  beforeprint 를 안 쏘므로 잡은 needs-gesture 로 가고, 뒤이은 엔진 인쇄의 beforeprint · afterprint 가 그 잡을 done 으로
  끝내야 한다 — 엔진 인쇄 뒤 상태 표시줄이 빈 값인지 · 호스트 0 인지 본다(26-09-30).
- **PDF 합격**: 쪽 수 = 인쇄된 프레임 수, 본문 쪽 글자 50자 이상(pdfjs-dist 로 추출), 경고 문구 쪽 0. 정답표 · 표지 쪽은
  그 프레임의 DOM 글자 수 절반(최소 8, 최대 50)이 하한이다 — 5문항 정답표(41자)를 백지로 오판하던 거짓 RED 수리(26-09-30 GPE-1).
  쪽 수가 프레임 수와 다르면 쪽별 하한을 쓰지 않는다(그 자체로 RED).
  「인쇄된 프레임 수」는 인쇄 전 화면이 아니라 **afterprint 순간의 DOM** 에서 센다 — 전 쪽 마운트 중 가드가 쪽을
  다시 나누면 쪽 수가 바뀐다(빌더 53문항 실측: 화면 18프레임 → 인쇄 19프레임 → PDF 19쪽).
- **인쇄된 DOM 칸 넘침 0**: 계측은 afterprint 리스너를 앱보다 먼저 걸어, 인쇄 레이아웃 직후 · 앱의 정리(포털 복원)
  전의 DOM 을 그대로 잰다(인쇄 CSS 는 균일 배율이라 px 넘침이 같다). 그 뒤 인쇄 루트가 바뀐 횟수도 센다.
  `paper-print-check` 는 보조로 앱의 afterprint 정리를 붙잡아 둔 채 인쇄 미디어를 흉내 내 다시 재되, 인쇄 뒤 재조판이
  있었으면 그 값은 인쇄된 것이 아니므로 경고만 남긴다.
- **원격 측정(button · force-per-page)**: 잡마다 인쇄 집계 요청 1건이 도착하는 사건을 기다리고(서버 액션 직렬 큐 —
  print() 직후가 아니다) 메타가 `outcome:'printed'` · `mountedPages == pages` · `fonts:'loaded'`(block-fonts 면 `'error'`)
  · `guard:'settled'`(`'stuck'` 이면 잘린 칸) · `prior` 없음이어야 한다. `--real-print` 는 스텁 대신 **진짜
  `window.print()`** — 헤드리스 Chromium 은 그 호출 안에서 beforeprint → afterprint 를 동기로 쏘고 돌아온다(데스크톱 실제
  순서). 그 호출 안의 이벤트 수 · afterprint 순간 인쇄된 DOM(부모 `#exam-print-host` · 전 쪽 · 넘침 0) · 인쇄 뒤 done 을 본다.
- 대기는 **사건**만: 인쇄 리스너 등록, print() 호출, afterprint, 집계 요청 발생. 시간은 실패 판정 상한에만.
  「두 번째 print() 가 없다」 같은 부재 증명만 networkidle + 두 프레임 뒤에 센다.
- **개발 서버 Fast Refresh**: 다른 세션이 `src` 를 고치면 turbopack 이 모듈을 갈아 끼우며 상태 · ref 를 보존한 채 이펙트
  cleanup 을 다시 돈다 — 인쇄 도중 잡 리스너가 떨어질 수 있다(26-09-30 실측: 두 번째 잡에 `prior:'needs-gesture'`, 재실행
  3회 GREEN). 하네스는 콘솔의 `[Fast Refresh]` 를 세어 경고로 싣는다. 그런 RED 는 같은 명령으로 다시 돌려 확인한다.

### 6.1 쓰기 가드(운영 DB 0건 — 로컬 `.env` 는 운영 DB 다)

**26-09-30 사고**: 종전 하네스는 `context.route` 로 비GET 만 abort 했다. e2e 가 고객 세션에서 `<a download>` HWPX 링크를
눌렀는데, Chromium 은 다운로드를 다운로드 관리자가 따로 요청하므로 **route 에도 request 이벤트에도 잡히지 않는다.** 개발
서버가 내보내기 라우트를 실행해 운영에 `app_events`(EXAM_EXPORT hwpx) 1행 · 고객 80문항 `printCount` 6→7 을 썼다(되돌리기는
감독 승인 대기). 게다가 GET 은 전부 통과였으므로 `location.href` · `fetch` · `window.open` 으로 부른 내보내기도 나갔을 것이다.

그래서 `write-guard.mjs` 가 모든 하네스 컨텍스트(`openGuardedContext` · `paper-sweep`)에 세 겹을 건다:
1. **페이지 층**(init script, 앱보다 먼저): 다운로드 · 내보내기 트리거를 **요청이 생기기 전에** 삼킨다 — Navigation API
   `navigate`(`downloadRequest` · 내보내기 목적지) 취소, 캡처 단계 click/auxclick `preventDefault`(다운로드 속성 앵커 전부 ·
   내보내기 링크), `HTMLAnchorElement/HTMLAreaElement.prototype.click` · 떨어진 앵커의 `dispatchEvent`(이벤트가 window 에 안 온다),
   `window.open`, 폼 제출. 삼킨 것은 `net.swallowed`. `navigator.sendBeacon` 무력화도 여기서 한다.
2. **네트워크 층**(`context.route`): `/api/**/export*` 경로(pathname 기준)는 **메서드 무관** abort. 그다음 앱 원점(과 로컬 호스트)의
   GET/HEAD 는 **기본 거부**이고 `get-policy.mjs` 의 명시 목록만 통과한다(26-09-30 COH-4 · GPE-3 — 종전 「GET 은 전부 통과」는
   틀린 전제였다): 정적(`/_next/` · `/__nextjs*` · 실제 public 파일), `READ_ONLY_PAGES`(하네스가 여는 화면 6개), `READ_ONLY_GETS`
   (nextauth session · csrf · providers, 알림 요약, 분석 설정). `GET_STUBS` 는 서버에 보내지 않고 로컬로 대답한다 — `/api/credits/balance`
   (부작용 GET) · `/api/site-banners`(빈 목록). 그 밖은 문서 이동이면 abort, 나머지는 로컬 503. 다른 원점(CDN 글꼴 등)은 통과.
   서버 액션은 `READ_ONLY_ACTIONS`(이름 허용 목록, ID 는 `.next/(dev/)server/server-reference-manifest.json` 에서 풂)만 — 고객
   세션(`--session customer`)은 예외 0. `/api/track` · `/api/collect` abort. 인쇄 집계(`incrementExamPrintCount`)는 abort 하고 본문
   (메타)만 증거로 남긴다. 허용 목록을 늘리려면 `get-policy.mjs` 에 적고 자가 시험을 통과시킨다(실행 중 확장 옵션은 없다).
3. **경보**: 그래도 다운로드가 시작되면 취소하고 `net.downloads` 에 적는다 → 실행 RED(`judgeWriteGuard`). 이 시점엔 요청이
   이미 서버에 갔다 — 예방이 아니라 조용히 새지 않게 하는 경보다. 컨텍스트는 `acceptDownloads: true` 로 둔다(거부 `deny` 로
   둬도 요청은 서버에 간다 — 아래 자가 시험 controlDeny 실측).

추가로 `clickToolbar` 는 인쇄 항목(인쇄 · PDF · PDF 해설)만 누른다 — HWPX · DOCX 는 이름으로 거부한다.

**자가 시험** `node scripts/exam-pagination/write-guard.mjs [--base http://localhost:3109]`: 프로세스 안에 **가짜** 로컬 서버
(127.0.0.1 임의 포트, 내보내기 모양 경로에 attachment 로 답하고 도달을 센다)를 띄워 트리거 9종(앱 모양 3종 — 붙였다 떼는
앵커 `click()` · 떨어진 앵커 `click()` · 선언형 `<a download>` 사용자 클릭 — 과 dispatchEvent · 속성 없는 링크 클릭 ·
`location.href` · `window.open` · GET 폼 · `fetch`)을 쏜다. 합격: 대조군(종전 하네스)은 앱 모양 앵커가 route · request 사건
0 인 채 서버에 닿아야 하고(구멍 재현 — 못 하면 자가 시험이 무뎌진 것이라 RED), 가드 컨텍스트는 9종 모두 서버 도달 0 · 다운로드
0 · 어느 층이 잡았다는 기록. `--base` 를 주면 실제 앱 문서(`/login`, GET 만)에서 앱 모양 3종이 페이지 층에서 삼켜지는지도 본다
(존재하지 않는 가짜 경로만). **실제 내보내기 라우트는 어떤 경우에도 부르지 않는다.**
GET 쪽(26-09-30): 대조군(GET 전부 통과)은 부작용 GET 이 서버에 닿아야 하고, 가드는 credits 스텁 · 목록 밖 거부 · 허용 화면 통과여야
한다. `side-effect-sweep.mjs`(TS 파서 · 함수 단위 도달성: route GET · 화면 · 조상 레이아웃 · `src/proxy.ts` · 읽기 전용 서버 액션 →
prisma 쓰기 · `$executeRaw` · 쓰기 SQL · storage/fs 쓰기 · 외부 POST)가 허용 목록과 형제 파일의 부작용 0 을 매번 다시 증명한다(자가
시험 약 3분). 한계: 동적 디스패치 · node_modules · eval 은 못 본다 — 그래서 목록 밖은 기본 거부다. 계기 음성테스트는 §6.2.
**부작용 GET(제품 — 소유자 검토 권고)**: route GET 122개 중 25개가 쓰기에 닿는다. 원장 화면이 늘 부르는 `/api/credits/balance`
(만료 크레딧 sweep) · `/api/workbench/ai-jobs`(stale 정리 + 환불) · `/api/ai/passage-analysis/[id]`(upsert + 차감), 렌더 중 쓰는 화면
3개(국어 · 워크벤치 추출, 지문 가져오기 — `getCreditSummary`). 하네스 화면 6개 · 읽기 전용 서버 액션 10개는 부작용 0.

**하지 말 것**: 쓰기 가드 없이 브라우저 컨텍스트를 열기 · 검증에서 HWPX · DOCX · 내보내기 버튼/링크를 누르기(가드가 증명된
하네스에서도 누를 이유가 없다 — 앱 모양 트리거는 자가 시험이 가짜 서버로 대신 본다).

### 6.2 계기 음성테스트와 악조건

| `PRINT_E2E_FAULT` | 기대 | 무엇을 증명하나 |
|---|---|---|
| `portal-opt-out` | native · `button --real-print` · paper-print-check **RED** | 포털이 서지 않는 인쇄(`<html data-exam-print-exclude>` → 판정 (1) 비켜섬)를 하네스가 잡는다: 「포털 미탑승 · 인쇄된 DOM 3/31 · PDF 2쪽 ≠ 31」 |
| `portal-removed` | native **RED** | 포털 호스트가 뜯긴 인쇄(MutationObserver 가 `#exam-print-host` 제거): 「부모 null · PDF 1쪽 ≠ 0 · 백지」 |
| `block-fonts` | button **RED** | 글꼴 거부 → 스냅숏 글꼴 미준비, 원격 측정 `fonts:'error'` |
| `no-replace-state` | deeplink **RED** | `?print=1` 잔존 · 새로고침 뒤 재인쇄 |
| `no-preview-data` | dialog **RED** | 카드 데이터 실패 → print() 0 |
| `overflow-dom` | paper-print-check · button · force-per-page **RED** | 인쇄된 DOM 넘침 감지(「1쪽 1칸 +1770px」) |
| `host-preexists` | native · button **GREEN**(악조건) | 지난 인쇄가 남긴 주인 없는 호스트를 포털이 치우고 선다(R7). 인쇄 전 호스트가 실제로 있었는지(시험 조건) · 인쇄 뒤 0 인지도 본다. Wave 1 에서는 이것이 「포털 미탑승 → RED」 fault 였다 — 그 역할은 `portal-opt-out` · `portal-removed` 가 잇는다 |
| `hang-ui-font` | button(`--real-print` 포함) **GREEN** | 무관한 UI 글꼴(Pretendard CDN)이 문서 load 를 붙잡음 — 시험지 글꼴만 도착한 뒤 누른 [인쇄]가 「페이지를 마저 불러오는 중」 · load 전 print() 0, 하네스가 걸린 요청을 끝내면(`releaseHungFonts` — abort) load 다음 태스크에 1회 · `path:'prepare'` · `fonts:'loaded'` · 인쇄 뒤 done(XB-1). 잡의 load 대기를 끄면 RED 5건 |
| `hold-exam-fonts` | button **GREEN** | 시험지 글꼴 응답을 붙잡았다가 「준비 중」 사건에 보냄 — 준비 경로에서 도착 뒤 인쇄(V7-1) |
| `no-download-guard` · `no-export-block` | write-guard 자가 시험 **RED** | 쓰기 가드 각 층이 필요하다(§6.1) |
| `get-passthrough` · `allow-side-effect-get` · `sweep-blind` | write-guard 자가 시험 **RED** | GET 기본 거부 · 허용 목록 · 부작용 스윕이 무뎌지지 않았다(§6.1) |
| `PRINT_JUDGE_FAULT=fixed-floor` | `print-judge-selftest.mjs` **RED** | 정답표 · 표지 쪽 하한(GPE-1)이 살아 있다 |

Git Bash 주의: `/` 로 시작하는 인자는 `C:/Program Files/Git/…` 로 바뀐다 — `--url director/exams/<id>` 처럼 앞 `/` 를 뺄 것.
세션 쿠키는 로컬 전용 도구(`.tmp-studio-qa/mint-cookie.mjs` · `.tmp-crm/lee89/mint-lee.mjs`, gitignore)로 만든다.
없는 환경에서는 `PRINT_E2E_COOKIE=<authjs.session-token 값>` 을 넘긴다.

### 6.3 이 계기가 잡은 것과 현재 상태

- **PDF 해설이 한 칸보다 긴 해설 블록을 쪼개지 못했다 → 26-09-30 수리 완료.** 해설 블록이 원자 단위라 53문항 1번(순서 배열,
  해설 1,085자)이 1쪽 2칸을 166px 넘쳐 쪽 번호 아래에서 잘렸다(가드 stuck, 종전 검증은 쪽 수 · 백지만 봐서 초록). 이제 해설을
  행(정답 배지 · 라벨 · 문단 · 글머리 · 오답)으로 나누고 흐르는 행을 **렌더 줄 단위**로 조판기에 넘긴다(`explanation-layout.ts`,
  Blink 줄 나눔 재현 · 임베드 글꼴 폭 — 조각 경계 = 줄 경계). 실측: 내부 53문항 해설 26/26쪽(수리 전 27쪽 RED) · 고객 80문항
  44/44 · 107문항 63/63, 넘침 0, `guard:'settled'`. 해설 조각 추정 = 렌더 불일치 0/329. 해설 원문의 `**굵게**` 는
  `explanation-markdown.ts`(웹 · DOCX · HWPX 공용)가 굵게로 그린다(PRINT-R9). 조판 계약: `EXAM-PAGINATION-OVERFLOW.md` §3.5 · §5.
- **「쪽당 N문제」 + [PDF 해설] 도 잘렸다 → 해설 모드에서는 강제 배치를 끈다(26-09-30 E1).** 강제 배치는 칸 용량 ∞ · 가드
  꺼짐이라 해설이 붙으면 넘친 칸 17개가 종이 아래로 잘렸다. `forcedPerPageEnabled(settings) = forceTwoPerPage && !includeAnswers`
  (HWPX `builder.ts` 와 같은 정책)를 조판기 · 선지 묶음 · 넘침 가드가 함께 본다. 해설 PDF 는 칸 용량대로 흐르고(쪽당 2문제
  26쪽 · 쪽당 1문제 32쪽), 해설 없는 인쇄의 강제 배치는 그대로다. 회귀 계기: `print-e2e force-per-page`.
- **네이티브 경로(Ctrl+P · printToPDF)를 글꼴 도착 전에 누르면 가드가 대체 글꼴로 잰 배치가 찍힌다(설계가 받아들인 위험).**
  인쇄 순간 시험지 글꼴이 `loading` 이던 회차만 넘친 칸이 났다(107문항 6칸 4~12px, 80문항 2칸 4~6px) — 본문 영역 아래로
  약 9pt 라 쪽 번호 위에서 끝나고 잘리지 않는다. print-e2e native 는 **경고**로 보고한다(버튼 경로는 컨트롤러가 글꼴을 기다려 0).
- 인쇄 직후(앱의 afterprint 정리 전) 인쇄 루트가 계속 바뀐다(글꼴 로드 후에도 20~1,131회). 인쇄된 DOM 자체는 넘침 0 이지만,
  인쇄 순간이 가드 · 렌더가 완전히 멈춘 시점인지는 이 계기로 판정할 수 없다(보조 감사를 생략하는 이유).

- **문서 load 전 [인쇄]가 「브라우저가 막음」으로 오판되고, 미뤄진 인쇄 뒤 React 가 멈췄다 → 26-09-30 수리 완료(XB-1).**
  교차 브라우저 게이트(진짜 print · UI 글꼴 걸림)가 잡았다. 스텁 print 는 사건을 안 쏘므로 이 경로를 영영 못 본다 —
  `hang-ui-font` 는 `--real-print` 로도 돌린다. 수리와 근거는 §3.2, 실측은 `EXAM-PRINT-MEASUREMENTS.md`.

### 6.4 실측 기록

날짜별 실측 결과(Wave 1~4 · TOOLS-FINISH · PRINT-RESPONSE · XB-1)는 [`docs/EXAM-PRINT-MEASUREMENTS.md`](EXAM-PRINT-MEASUREMENTS.md)
로 옮겼다(26-09-30, 500줄 규칙). 새 실측은 그 문서에 날짜와 조건을 붙여 덧붙인다.

## 7. 운영 감시(읽기 전용 SQL)

원격 측정 메타(`app_events.metadata`, `eventType='EXAM_EXPORT'`, `format='print'`) — 검증기 `src/lib/exams/print-event-meta.ts`:

| 필드 | 값 | 뜻 |
|---|---|---|
| `entry` | detail · quick-view · card-dialog · deep-link · builder | 진입점(§2) |
| `mode` | plain · explanation | 해설 포함 여부 |
| `pages` / `mountedPages` | 정수 | 인쇄 루트 프레임 수 / 그중 그려진 수 — 작으면 백지 쪽 |
| `fonts` | loaded · timeout · **error** | error = 시험지 글꼴 파일 거부(404 · 차단, 대체 글꼴로 인쇄) — 상한 초과 timeout 과 구분(26-09-30) |
| `guard` | settled · timeout · **stuck** | stuck = 가드는 수렴했는데 인쇄 순간 넘친 칸이 남았다(`overflowColumns` 개수, 종이에서 잘림) |
| `overflowColumns` | 정수(0 이면 생략) | 인쇄(또는 차단) 순간 실측한 넘친 칸 수(print() 직전 화면 레이아웃 기준) |
| `outcome` | printed · blocked | blocked 는 인쇄 횟수에 넣지 않는다. 준비 중 네이티브 인쇄로 넘어간 잡(`native`)은 **기록하지 않는다** — 컨트롤러 `onFinished` 의 결과로만 남는다 |
| `path` · `images` · `prior` · `blockReason` | fast/prepare · loaded/timeout · needs-gesture/blocked · no-root/unmounted-pages/not-primary-root | 선택 필드 |

```sql
-- 백지 쪽이 있는 인쇄: 항상 0 이어야 한다
SELECT count(*) FROM app_events
WHERE "eventType" = 'EXAM_EXPORT' AND metadata->>'format' = 'print'
  AND (metadata->>'mountedPages')::int < (metadata->>'pages')::int
  AND "createdAt" > now() - interval '7 days';

-- 결과 · 경로 · 상한 초과 분포(진입점별)
SELECT metadata->>'entry' AS entry, metadata->>'outcome' AS outcome, metadata->>'path' AS path,
       metadata->>'fonts' AS fonts, metadata->>'guard' AS guard, metadata->>'prior' AS prior,
       count(*) AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY (metadata->>'prepareMs')::int) AS p50_ms
FROM app_events
WHERE "eventType" = 'EXAM_EXPORT' AND metadata->>'format' = 'print' AND "createdAt" > now() - interval '7 days'
GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY n DESC;

-- 고칠 수 없는 넘침(종이에서 잘린 칸)이 있는 인쇄 · 글꼴 파일 거부
SELECT metadata->>'entry' AS entry, metadata->>'mode' AS mode, metadata->>'guard' AS guard, metadata->>'fonts' AS fonts,
       count(*) AS n, sum(coalesce((metadata->>'overflowColumns')::int, 0)) AS overflow_columns
FROM app_events
WHERE "eventType" = 'EXAM_EXPORT' AND metadata->>'format' = 'print' AND "createdAt" > now() - interval '7 days'
  AND (metadata->>'guard' = 'stuck' OR metadata->>'fonts' = 'error')
GROUP BY 1, 2, 3, 4 ORDER BY n DESC;

-- 차단 사유
SELECT metadata->>'blockReason' AS reason, count(*) FROM app_events
WHERE "eventType" = 'EXAM_EXPORT' AND metadata->>'outcome' = 'blocked' AND "createdAt" > now() - interval '7 days'
GROUP BY 1;
```

- `outcome='blocked'` 는 인쇄 횟수(`printCount`)에 넣지 않는다 → `printCount` 는 「인쇄 창을 연 횟수」(사용자가 인쇄 창에서
  취소한 경우도 포함 — 브라우저가 구분해 주지 않는다).
- `prior='needs-gesture'` 는 제스처 폴백 뒤 재시도다(Safari · 인앱 브라우저의 비제스처 자동 인쇄). 인쇄 창이 늦게라도
  떴으면(beforeprint 도착) 재시도 사유가 아니므로 지운다.
- 관리자 활동 피드(`src/actions/admin-activity/_app-event-activity.ts` `describePrint`): printed 는 「시험지 내보내기」 INFO
  (경고는 상세 — 넘친 칸 · 조판 대기 초과 · 시험지 글꼴 거부 · 글꼴/이미지 대기 초과 · 제스처 재시도), 백지 쪽이 있으면
  「시험지 인쇄 불완전 (PRINT)」 FAILED, blocked 는 「시험지 인쇄 실패 (PRINT)」 FAILED + 차단 사유 라벨.
- 활동 분석 집계(`analytics/_query.ts` · `_query-extra.ts`, 26-09-30 해소): 규칙 표 하나(`APP_EVENT_CATEGORY_RULES`)에서 SQL CASE 와
  JS 판정을 만들고 **끝나지 않은 인쇄**(outcome 이 'printed' 아닌 문자열)는 뺀다. 의도된 차이: 피드는 그 인쇄를 FAILED 로 보여 주고
  분석은 세지 않는다. 피드 필터(`appEventTypeWhere`)는 분류 규칙과 따로 적혀 있다 — 새 eventType 은 두 곳을 함께 고칠 것.

## 8. 하지 말 것

- 인쇄 진입점에서 `window.print()` 를 직접 부르기, `setTimeout`/`rAF + n ms` 뒤 인쇄 — `ctl.print(mode)` 만 부른다.
- 문서 load 전(또는 load 리스너 · 거기 이어진 마이크로태스크 안)에서 `print()` 부르기 — 미뤄진 인쇄가 React 를 멈춘다(§3.2 XB-1).
  「미뤄진 인쇄를 받아서 처리」하는 식의 수리도 같은 이유로 안 된다(그 사건 안의 setState 가 정지를 부른다).
- 새 인쇄 진입점에 누름 무장(`printArmHandlers`)을 빼먹기 · 무장으로 버튼을 `disabled` 로 만들기(click 유실) · 무장 상태를
  호스트 state 로 옮기기(빌더 전체 재렌더 = 누름과 click 사이 페인트를 놓침) · 무장 해제를 타이머로 하기 · 빠른 경로를
  「먼저 페인트하고 다음 프레임에 print()」로 바꾸기(click 태스크 밖 print() 는 Chromium 이 연속 호출을 버리고 Safari 는 막는다, §3.3).
- 전 쪽 마운트를 `usePrintPortal` 밖에서 beforeprint 로 켜기(스튜디오 헛마운트) · `LazyPaperPage` 의 `forceMount` 를
  이펙트로 받기.
- 포털 판정을 「`#exam-print-host` 가 있으면 비켜선다」로 되돌리기(남은 호스트 하나로 영구 비켜섬) · 인쇄 레이아웃 도중
  언마운트에서 즉시 원복하기(네이티브 인쇄 캡처 전에 포털이 사라진다).
- 숨김 iframe · 새 창으로 인쇄 대행.
- 「쪽당 N문제」 판정을 `settings.forceTwoPerPage` 로 직접 읽기 — `forcedPerPageEnabled(settings)` 하나만 본다.
- 검증에서 합성 `beforeprint` 를 쏘거나, 준비 사건과 PDF 사이에 시간을 기다리기.
- 검증에서 쓰기 가드 없는 브라우저 컨텍스트를 열거나, HWPX · DOCX · 내보내기 링크를 누르기(§6.1).
