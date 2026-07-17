# 캠페인 20260716 종합 보고 — 어법·빈칸 "아름다운 킬러" 실측 연구

기간: 2026-07-16 19:00 ~ 07-17 (연속). 예산: 완성 문항 후보 1,000 하드캡 중 **656+40(PhaseE) 사용**, OpenRouter 실측 **$24.44 / HTTP 1,410콜 / 입력 5.43M·출력 1.49M 토큰**(wire.jsonl 전량 보존, 원장 대사 완료).
평가: 문항당 독립 블라인드 솔버 2 + 전체 감사자 1 + 분쟁 제3 조정 (RUBRIC v0.2 V1–V5 / C1–C6), 총 5개 배치 470+ 문항 판정, 에이전트 약 1,300개.

## 1. 실측으로 확정한 근본 원인과 수정 (전부 코드 반영·회귀 146/146)

| ID | 발견 | 수정 |
|---|---|---|
| O147 | OpenRouter Gemini 엔드포인트가 reasoning 비활성화를 400으로 거부 — 프로덕션 실효 설정은 reasoning=low (기존 "thinking-off" 전제 전부 폐기) | 캠페인 parity 기준 교정 |
| O150/I1 | reasoning 토큰이 max_tokens 예산을 공유 → 기본 토큰 floor 4,096이 빈칸 KILLER에서 JSON 절단 전멸(finish=length 실측) — **살아있던 프로덕션 결함** | floor 4,096→8,192 (`dispatchers.ts`) + 회귀 테스트 |
| O149 | vertex/global 고정 라우팅이 pro-preview 대형 응답에서 ~12% mid-stream error | 연구 라우팅 env 오버라이드(프로덕션 무영향) |
| O158/I5 | passage-integrity 접합 탐지 정규식 lookahead 반전 → **전면 미작동** (실행 불가 상태로 커밋된 테스트가 결함을 봉인) | 정규식 교정 + jul16 테스트 실행 가능화(npx→tsx, interop) |
| O153 | **수락 문항의 지배적 치명 결함 = V4(해설 사실성)** — 정답은 맞는데 해설이 거짓(접속사 오분석·함정 인과 반전·비단어) | E-gate 신설 (아래) |

## 2. 최종 승자: "pro 생성 기반 + 해설 사실검증 게이트(E-gate)"

Phase C 확증 (confirmatory 20지문 paired × 6 arm, 117문항 전량 독립판정):

| 구성 | 출하분 중 치명(F) | 판정 |
|---|---|---|
| **어법: 사다리+솔버+pro E-gate enforce (G-LX)** | **0/11 (V4 0)** | 채택 |
| 어법: 현행 사다리 (G-A0) | 5/18 (28%, 전부 V4) | 기준선 |
| **빈칸: pro 생성 (B-A0)** | 4/19 (전부 V4 — E-gate가 제거하는 축) | +E-gate로 채택 |
| 빈칸: flash 생성+E-gate (B-X3) | 8/16 (V3·V1 포함) | 기각 — **게이트는 V4만 방어, 생성 기반은 pro 필수** (end-to-end p=0.039 유의 열세) |
| 어법: 스펙 합성 (G-CX) | end-to-end 5% (p<0.001) | 기각 |

E-gate = pro 검증 → flash 표적수리 → pro 재검증 → (enforce 시) fail-closed. flash 검증기는 재현율 64%로 기각(O155) — **검증기 등급이 결정 변수**.

## 3. 프로덕션 반영 (배포 대기)

- `_lib/explanation-verify-gate.ts` (신규): 플랜별 기본 모드 **PREMIUM=enforce / STANDARD=warn** (env `EXPLANATION_VERIFY_GATE_MODE[_PREMIUM|_STANDARD]` 오버라이드). strict/relaxed 레인 전용, scarce/salvage 생략, 게이트 장애 무판정 통과 — never-fail 불변.
- `run-question-generation.ts`: 어법·빈칸 수락 직전 훅.
- 전 유형 sentinel(26유형×2플랜): 50/52 수락, E-gate warn이 해설 3건 수리 채택·반려 0 — 회귀 없음(O159).
- 비용: E-gate 포함 문항당 sentinel 실측 $0.027~0.034. 어법 프리미엄 full 구성 $0.10→$0.18/수락 (출하 무결의 대가 — 반려는 기존 retry가 흡수).

## 4. 기각된 가설 (각 ≥10회 실측, 재검 없이 부활 금지)

- 바이트-정확 교차결속 계약(G3 site-certificate 20회, B3 option-ledger 15회): flash 수율 0 — 모델에게 같은 값을 두 구조에 축자 중복 기입시키는 계약은 실행 불가.
- flash가 flash를 검증(X2, 20회): V4 순제거 27%뿐.
- 결정론 코드 조립(B-T1, 20회): V3 seam 결함 유발.
- flash 생성+게이트(B-X3, 39회): 생성 기반 결함(V1/V3)은 게이트가 못 막음.
- 어법 스펙→렌더 합성(G-CX/G-D1, 40회): KILLER 공예 플로어 미달.

## 5. 남은 병목과 다음 단계

- **beautiful KILLER 비율 ~3%** (Phase C 117문항 중 3건) — C5(난이도 정합)·오답 축 다양성·표면 누출이 감점 축.
- **Phase E(공예 심판+표적 오답 업그레이드, n=40 paired) 판정: 기각.** 출하분 craft는 상승(어법 16.9→18.1, 빈칸 16.1→16.5, A 1건 신규)하나 사전등록 승격 기준(+1.5) 미달 + 어법 end-to-end 수율 13/18→7/18 하락 + 비용 $0.10→$0.38/수락(상한 1.5배 초과). 공예 심판의 "결함 지목"은 유효했으나(업그레이드 23/37 발동) 업그레이드 산출물이 게이트·E-gate 재통과에서 손실 — 심판은 향후 "재생성 트리거"(수리 아닌 재생성)로 재설계할 것.
- STANDARD 어법의 단발 수율(게이트 가혹) — 프로덕션 retry로 흡수 중이나 G2 계열(간결 긍정 프롬프트, craft 19.5/n=2 신호)의 후속 검증 여지.
- 인프라 교훈: 커밋된-실행불가 테스트는 결함을 봉인한다(O158). 대형 에이전트 평가는 세션 한도 리셋을 고려해 발사.

## 6. 산출물 지도

- 원장: `../budget-ledger.json` (wire 실측 대사 완료) / 배치별 `batches/*/`(manifest·items.jsonl·calls.jsonl·wire.jsonl·eval/)
- 러너: `runner.ts` + `custom-arms.ts` (arm 15종) / 평가: `eval-workflow.js`·`build-eval-packets.py`·`aggregate-reviews.py`·`phase-c-stats.py`
- 관찰 로그: `../../research-note.md` O145~O161
