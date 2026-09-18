# Jev (TypeSafe AI) 리서치 — 26-09-18

> 조사 시점 2026-09-18. 전량 웹 출처 기반(조사자 학습컷 26-05 이후 사건이라 사전지식 0).
> 스타 수·순위는 스냅샷마다 크게 흔들린다(같은 레포가 출처별로 1.2k~3.8k). 추세로만 읽을 것.

## 1. 한 줄

**Jev = 글자를 안 만드는 모델.** 상태(텍스트/JSON) + 타입 지정된 질문 → 확률 붙은 구조화된 답.
TypeSafe AI 가 26-09-15 스텔스를 깨고 얼리액세스로 공개. 「System One 모델」이라는 새 범주를 주장.
이름은 경제학자 William Stanley **Jev**ons 에서 땄다.

발상 자체는 단순하다. LLM 이 토큰을 순차 생성하는 대신, **선언된 선택지들의 logit 을 한 번의 forward pass 로 읽는다.**
그래서 (a) 파싱 단계가 없고 (b) 스키마 위반이 구조적으로 불가능하고 (c) 미친 듯이 빠르다.

## 2. API 실물

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY
model: jev-latest  (재현성 필요하면 jev-1.13.0 처럼 핀)
```

질문 타입은 딱 3개. 한 요청에 state 하나 + 질문 여러 개를 병렬로 던진다.

| 타입 | 하는 일 | 응답 | 제약 |
|---|---|---|---|
| `Choice` | N지선다 | `.choice`, `.probabilities`, `.confidence` | 선택지 최대 255 |
| `Score` | 순서 있는 척도 위 위치 | `.score`(소수 가능), `.probabilities`, `.confidence` | 2~10 레벨 |
| `Noul` | 예/아니오 확률 | `.noul` (0~1) | confidence 필드 없음 |

```python
from typesafe_sdk import Choice, Noul, TypeSafeClient

client = TypeSafeClient()
r = client.system_one(
    state={"message": "두 번 결제됐어요. 빨리 고쳐주세요."},
    questions={
        "category": Choice(instructions="무엇에 관한 건인가",
                           criteria={"billing": "결제", "technical": "버그"}),
        "urgent":   Noul(instructions="긴급함이 드러나는가"),
    },
)
r.answers["category"].choice   # "billing"
r.answers["urgent"].noul       # 0.93
```

**한도·가격**

- 컨텍스트: state+질문 합계 64k, state+최장 질문 32k
- 레이트: 250k tok/s, 1,200 req/min
- **입력 $0.042 / MTok, 출력 무료.** 결정 1건당 대략 $0.0004
- 지연: end-to-end **70~500ms** 주장
- 이미지 미지원(텍스트/구조화 상태만)

파이썬·TS 공식 SDK. **Vercel AI Gateway 경유하면 TypeSafe 웨이트리스트 없이 바로 쓸 수 있다**(우리가 이미 Vercel 위에 있다는 점에서 유일하게 실무적으로 의미 있는 경로).

## 3. 「Claude Code 에 물려서 쓰는 툴」로서의 값어치 — 본론

결론 먼저: **MCP 툴로 붙이면 값어치 거의 없다. 훅/파이프라인 부품으로 쓰면 값어치 있다.**
이유는 하나다 — **비싼 모델이 호출 결정을 내리는 순간 Jev 의 200ms 는 사라진다.**

```
[MCP 경로]  Opus 판단 3s  →  jev_rank 0.2s  →  Opus 해석 3s   = 6.2s, Opus 토큰 2회분
[훅 경로]   코드가 30개 던짐 → Jev 0.2s → 코드가 3개만 Opus 에 전달 = 0.2s, Opus 토큰 0회분
```
Jev 의 강점은 **빠른 게 아니라 "비싼 모델을 안 깨우고 결정하는 것"**이다.
오케스트레이터가 Opus 인 루프에 툴 하나 더 꽂는 건 오히려 왕복만 늘린다.

### 3-1. 단가 실측 대조 (상태 12k tok = 검색결과 30건 스니펫 정도)

| | 입력 단가 | 출력 | 1콜 비용 | 체감 지연 |
|---|---|---|---|---|
| **Jev** | $0.042/MTok | **무료** | **$0.0005** | 70~500ms (리랭크 실측 p50 208~238ms) |
| Haiku 4.5 | $1.00/MTok | $5.00/MTok | $0.0135 | 1~2s |
| Opus 5 | $5.00/MTok | $25.00/MTok | $0.0675 | 수 초 |

Haiku 대비 **27배**, Opus 대비 **135배** 싸다. 근데 이건 부차적이다.
**진짜 절감은 Jev 콜 값이 아니라 "Opus 가 안 읽게 된 토큰"이다.**
10페이지(각 15k) 대신 3페이지만 읽히면 Opus 입력 7×15k×$5/1M = **$0.525** 를 아낀다.
Jev 콜 값($0.0005)의 **1,000배**. 이게 유일하게 의미 있는 산수다.

### 3-2. 크롤링·검색 — 여기가 실증이 있는 유일한 자리

**리랭킹은 진짜다.** 검증 가능한 숫자가 나온 유일한 용도.

`hev/jev-rerank` (한 콜에 문서 최대 30개, 문서별 확률):

| 데이터셋 | Jev | Cohere rerank-v3.5 | Voyage rerank-3 |
|---|---|---|---|
| SciFact nDCG@10 | **0.768** (1위) | – | – |
| NFCorpus | 0.358 (동률) | – | 0.358 |
| FiQA | 0.376 | – | **0.395** |
| 300쿼리 비용 | **$0.13~0.19** | $0.60 | ~$0.15 |
| p50 / p95 | 208~238ms / 0.8~1.8s | – | – / 255~300ms |

결론: **리랭커 학습을 전혀 안 한 범용 결정 모델이 전용 리랭커와 같은 품질·가격대에 착지했다.** Cohere 의 1/3 값. 게다가 확률이 캘리브레이션돼 있어서 임계값으로 자를 수 있다(전용 리랭커는 점수만 준다).
단점: p95 가 전용 리랭커보다 3~7배 길다. 콜당 30개 상한.

`carlaiau/jev-reranking` (TREC WSJ):

| | MAP | P@10 | 지연 | 비용 |
|---|---|---|---|---|
| BM25 | 0.2521 | – | – | $0 |
| monoBERT passage MaxP | 0.2693 | 0.4960 | 30.27s | $0 (로컬) |
| **JEV complete-doc** | **0.3055** | **0.6340** | **4.02s** | $0.33 |
| JEV passage MaxP | 0.3053 | 0.6000 | 14.98s | $0.61 |

monoBERT 보다 정확하고 7.5배 빠르다. 대신 monoBERT 는 공짜.

**브라우저 크롤링**은 `browser-use/jev-ultrafast` 가 패턴을 증명했다 — DOM 을 LLM 에 추론시키는 대신 **인덱싱된 표를 만들어 Jev 가 (동작, 엘리먼트)를 한 콜에 고르게** 했더니 브라우저 프로토콜 호출 **1,092 → 101**, 9.45s→7.09s. 훔칠 만한 아키텍처다. 핵심은 Jev 가 아니라 "선택지를 미리 열거해서 결정만 시킨다"는 모양.

### 3-3. Claude Code 붙이는 3가지 경로

| 경로 | 물건 | 실효성 |
|---|---|---|
| **MCP 서버** | `jev-mcp` 최소 6종 난립 (rashedInt32, minhgv, burnigtm, arunav25, jkudish…). `/plugin marketplace add rashedInt32/jev-mcp` 한 줄로 설치. 툴: `jev_classify`/`jev_score`/`jev_check`/`jev_ask`. 다른 구현은 `jev_review`(패치 완료 선언 전), `jev_verify`(주장 vs 증거), `jev_screen`(신뢰 못할 붙여넣기/페치), `jev_rank` | **△ 낮다.** 왕복 세금이 이득을 먹는다. 벤치마크 있는 구현 0개. 3일 된 레포 6개 중 하나 찍는 리스크 |
| **함수 훅** | `fast-jev-compaction` — 컴팩션 때 요약 대신 툴콜마다 Noul 2개("이 호출이 아직 의미 있나" / "이 결과가 원문 그대로 필요한가") 던져 버릴 것만 버리고 **남기는 건 원문 유지** | **◎ 발상은 최고.** 요약은 파일 경로·정확한 에러·제약을 갉아먹는데 이건 안 갉는다. 단 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` + early access + v2.1.274+ 필요. 토큰 추정이 실제 토크나이저가 아니라 글자수 휴리스틱 |
| **내 코드에서 직접** | 서브에이전트·크롤러·리서치 스크립트 안에서 후보 팬아웃 → Jev 로 컷 → 살아남은 것만 Opus 에 | **◎ 여기가 정답.** 모델의 판단이 아니라 코드가 호출하니 왕복 세금 0 |

### 3-4. 안 되는 것 / 리스크

- **이미지 미지원.** 스크린샷 기반 크롤링·PDF 판정에는 못 쓴다
- **컨텍스트 32k**(state+최장 질문). 긴 페이지 통째로는 안 들어간다 → 스니펫/청크 단계에서만 쓸 수 있다
- **선택지 255개, Score 는 2~10 레벨, 리랭크 30개** 상한
- **얼리액세스 웨이트리스트.** 다만 **Vercel AI Gateway 경유면 대기 없이 바로** 된다 — 이게 실무상 유일하게 쓸 만한 진입로
- **ZDR 이 엔터프라이즈 티어 전용.** 남의 코드/문서를 훑는 용도면 이게 걸림돌
- **자체 벤치.** 공개 벤치 거부, 자기들 workflow eval 로 GPT-6 Astra·Fable 5.1 의 *평균 예측*과 비교(정답 아님). 그 대시보드에서도 정확도는 **67.8% vs 74.1%로 진다**
- **HN 470+ 코멘트 반론:** 스키마 제약 결정은 GLiNER·BERT zero-shot·기존 structured output 이 이미 하던 것 / "70ms vs 329초"는 LLM 이 full CoT 돌 때 얘기라 사과-오렌지 / 코딩도 대화도 못 하는데 "frontier model" 은 과하다
- **생태계가 3일차.** awesome-jev 만 6종, 동일 레포 포크 수십 개. 스타 수가 출처마다 1.2k~3.8k 로 널뛴다 — 신호가 아니라 잡음

### 3-5. 내 판단

**지금 Claude Code 에 상시로 물리는 건 반대.** 훅은 early-access 플래그 물려 있고, MCP 는 왕복 세금 때문에 이득이 안 남고, 구현체 고르는 게 도박이다.

**딱 하나 해볼 값어치가 있는 건 리랭킹/필터링을 *내 스크립트 안에서* 쓰는 것.** 근거가 실측으로 나온 유일한 용도고(nDCG 에서 Cohere 이기고 1/3 값), 30개 후보 → 상위 3개 컷 하나로 Opus 입력 토큰을 1,000배 규모로 아낀다. Vercel AI Gateway 로 붙이면 웨이트리스트도 없다.

**대체재부터 재보는 게 순서다.** 같은 일을 Haiku 4.5 한 콜 + structured output 으로 하면 27배 비싸지만 키 하나 덜 쓰고 이미지도 되고 컨텍스트도 200k다. 30개 리랭크 한 번에 $0.0135 — 하루 1,000번 돌려도 $13.5. **그 차이가 아프지 않으면 Jev 쓸 이유가 없다.** 아픈 규모(하루 수만~수십만 결정)에 도달했을 때 다시 꺼내는 게 맞다.

## 4. 출처

- [TypeSafe 공식 런칭 포스트](https://typesafe.ai/blog/introducing-system-one-models-and-jev) · [실사용 가이드(DEV)](https://dev.to/valyuai/how-to-use-jev-a-practical-guide-to-typesafes-system-one-model-g5e)
- 리랭킹 실측: [hev/jev-rerank](https://github.com/hev/jev-rerank) · [carlaiau/jev-reranking](https://github.com/carlaiau/jev-reranking)
- 크롤링: [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast)
- Claude Code: [tamaratran/fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction) · [rashedInt32/jev-mcp](https://github.com/rashedInt32/jev-mcp) · [burnigtm/jev-mcp](https://github.com/burnigtm/jev-mcp) · [gamesonrblx/Jevbridge](https://github.com/gamesonrblx/Jevbridge) · [docxology/daf-jev](https://github.com/docxology/daf-jev)
- 로컬 재현: [TheoLeeCJ/openjev](https://github.com/TheoLeeCJ/openjev) · [vinnylarouge/jevlike](https://github.com/vinnylarouge/jevlike)
- 반론: [cho.sh (HN 470+ 코멘트 요약)](https://cho.sh/mini/news/ai-2/typesafe-launches-jev) · [Flowtivity "Too Good to Be True?"](https://flowtivity.ai/blog/jev-typesafe-ai-decision-model/)
