# 자율 연장 작업 보고서 — 2026-06-19 (문제 생성 엔진)

> jay 위임(10시간 자율, 푸시 금지·로컬커밋만, 매 검증에 전체 문항 품질판정 동반).
> 브랜치 `jay/gen-engine-shipfirst-20260618`. **푸시는 591cdb4 1개만**(이전 승인), 이후 전부 **로컬 커밋**.

## 1. 커밋 요약 (최신순)

| 커밋 | 종류 | 내용 | 검증 |
|---|---|---|---|
| `2498788` | FIX | 빈칸 보기 병렬성 프롬프트 넛지 (SOURCE_EXACT "we we" 문법누설) | 결정형 0/8 + 적대판정 8/8 usable·병렬 100%·누설 0 |
| `4893f89` | FEAT | **글의순서(SENTENCE_ORDER) focus 배선** (코퍼스 550건 LLM P0) | E2E 5/5·5/5 무회귀, 적대판정 유일정답 100%·core 60→100% |
| `395191c` | FEAT | **무관문장(IRRELEVANT) focus 배선** (코퍼스 227라벨) | E2E 5/5·5/5 무회귀, 적대판정 0 broken·core 40→60% |
| `f62c184` | FIX | 긴/워크시트 지문 마커 과다렌더 + 빈칸 등위열 누설 가드 | 라이브 att6FAIL→att1SHIP·마커24→5, 결정형 8/8 |
| `591cdb4` | FEAT | (전일, **푸시됨**) ship-first 게이트 + 부분-repair + C 사전게이트 | KILLER 30/30·INTERMEDIATE 38/38, 적대판정 23/24 |

전 변경 **tsc 0 / eslint 신규 0**. happy-path·비-focus 경로 동작 불변(전부 추가/opt-in).

## 2. 메인 mandate 달성 — 추출 코퍼스 기반 보완
인벤토리 결과 코퍼스-focus 파이프라인 갭 2개를 모두 완료:
- **IRRELEVANT**: core 2 = topic_intrusion 63%·scope_shift 20.3% (LLM 227라벨). `irrelevant-point-catalog.ts` + 3지점 배선.
- **SENTENCE_ORDER**: 휴리스틱 코퍼스 → LLM P0 재분류 550건(temporal 42.9%·anaphora 24%·contrast 15.5% = core 3). `sentence-order-point-catalog.ts` + 3지점.
- 나머지 완료(blank P0·SI P2·어법3종) / grammar-1000은 이미 seed 통합(SKIP).
- 두 focus 모두 blank/SI와 동일 구조(catalog→candidate block/typeSettings→pointFocus 체인), `pointFocus` 설정 시만 작동.

## 3. ⚠️ 너의 결정/검토가 필요한 항목 (무인 검증 불가)

1. **신규 focus 2종 활성화** — IRRELEVANT/SENTENCE_ORDER focus는 **default-OFF**다(blank/SI와 동일 opt-in). 단 **UI 토글 미추가**라 현재 프로덕션선 켤 수 없음. blank/SI처럼 `generation-config-panel.tsx`에 토글 추가 필요(**브라우저 검증=이동주 영역**). 그 전엔 하네스로만 작동.
2. **푸시** — 4개 로컬 커밋(f62c184·395191c·4893f89·2498788) 검토 후 직접 푸시. (`git push origin jay/gen-engine-shipfirst-20260618`)
3. **DB 트랜잭션 저장 버그** (스펙 §4) — 실저장 검증 필요.
4. **WS4 PREMIUM async** (스펙 §5) — UI 리워크·브라우저 검증 필요.
5. **빈칸 distractor** — 넛지 적용(2498788). 더 강하게 하려면 차단 게이트(병렬성)도 가능하나 ship-first상 넛지 우선.

## 4. DB 트랜잭션 저장 버그 — 스펙 (미수정)
- **증상**: 후처리 저장 시 `Transaction not found / already closed (interactive tx 5000ms)` → 롤백, 생성 성공분 유실. 프로덕션 30일 58건(PREMIUM 47). PREMIUM 체감 성공률 63%→~90% 회복 레버.
- **범인**: `saveGeneratedQuestionsForJob`의 question.create 트랜잭션은 이미 timeout 30s(범인 아님). 진짜 범인은 **question+explanation+credit를 묶는 별도 5s-기본 트랜잭션**(set/similar/custom 경로 추정 — `question-sets/generate-set.ts`, `similar-exam-generation/persistence.ts`, `custom-question-types/persistence.ts` 중). `$transaction` + `questionExplanation.create`/`creditBalance.updateMany` 동시 등장 지점을 grep으로 특정.
- **수정 방향**: 해당 interactive tx의 timeout 상향(30s+) 또는 비임계 write(해설)를 임계 트랜잭션 밖으로 분리.
- **검증**: 실제 저장+정리 테스트(레이스성이라 부하 재현 어려움 → 사용자 입회 권장).

## 5. WS4 PREMIUM async 라우팅 — 스펙 (미수정)
- **근거**: PREMIUM(Claude) median 52s·max 194s(긴 지문 279s) → 100s fast 라우트서 STALE 타임아웃. (deadline 가드로 우아한 환불은 되지만 실패.)
- **방향**: PREMIUM 유닛만 비동기 trigger 경로(540s)로, STANDARD는 sync 유지. 클라이언트 디스패치 분기(use-generation-handlers/use-workspace-generation) + 완료 폴링(generate-page-client) + async route에 C 사전게이트·diversity 패리티.
- **검증**: 클라이언트 상태머신이라 **브라우저/Playwright 필요**(생성테스트 불가). 이동주 영역 권고.

## 6. 인프라 메모
- ⚠️ **Gemini "unrestricted key" enforcement 장애 진행 중**: 동시성↑일수록 EXC↑(테스트 중 9/20까지). **내 코드 회귀 아님**(isNonRetryable 정상 즉시단락). 라이브 테스트는 동시성 1~2로 진행함. 키 정책(IP/referrer 제한) 점검 권장.

## 7. 검증 하네스 (재사용·전부 scripts/tmp-*, untracked)
`tmp-broad-quality-audit.ts`(전유형 생성→렌더→게이트) · `tmp-irrelevant-focus-e2e.ts` · `tmp-sentence-order-focus-e2e.ts` · `tmp-blank-distractor-check.ts` · `tmp-longpassage-*.ts` · `tmp-ws6-preflight-verify.ts` · `tmp-blank-midlist-verify.ts`. 산출 `scripts/_gen_audit_out/`. 적대 품질판정은 Workflow(Claude, Gemini 무관).
