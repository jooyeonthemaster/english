# "포인트 짚어주기" (Teacher Point Picker) — 확정 설계 스펙

작성: Fable (26-07-14, 3안 경쟁 설계 → 심판 종합). 구현 에이전트 필독.

## 0. 한 줄 정의

문제 생성 모달에서 유형별로 "포인트 짚어주기"를 켜면, 모달이 2컬럼(지문 무대 + 설정 콘솔)으로 성장하고, 교사가 지문에서 직접 단어/구/문장을 클릭해 출제 포인트를 지정하며, 그 선택이 생성 프롬프트에 "필수 반영" 계약으로 주입된다.

## 1. 확정 아키텍처 — Split-Stage Modal

- `PassageGenerateModal` 카드가 픽커 모드에서 `max-w-[1200px]` → `max-w-[1520px]`로 모프. 본문 2컬럼:
  - 좌: 신규 `PassagePointPicker` (지문 무대, `flex-1 min-w-0`, 내부 `max-w-[68ch] mx-auto`, **text-[15.5px] leading-[1.95] 원고지 타이포** — 12px 설정 UI와의 대비가 모드 전환을 설명)
  - 우: 기존 `GenerationConfigPanel` `w-[440px]` 콘솔 상주 (맥락 상실 없음)
- **모달 위 모달 0건.** 부가 UI는 전부 absolute z-20 팝오버. 픽커 열림 중 헤더 지문 전문 팝오버 트리거 숨김.
- **Esc 사다리 (구현 최우선 검증)**: passage-generate-modal.tsx:62-69 의 window keydown 이 모달 전체를 닫음 → `pickerOpen`으로 게이트해 Esc 1회=픽커 닫기(설정 복귀), 2회=모달 닫기. 미적용 시 선택 작업 전체 유실.
- 모바일(configOnly): 픽커가 뷰 스왑(translate-x 슬라이드 + 백 버튼).

## 2. 상태·배선 (요청 스키마 변경 0)

```ts
type TeacherPoint = { text: string /*축자*/, sentenceIndex: number, start: number, end: number,
  unit: "word"|"phrase"|"clause"|"sentence", source: "manual"|"ai", tag?: string, note?: string };
// generate-page-client 소유:
teacherPointsByPassage: Record<passageId, Record<typeId, TeacherPoint[]>>
```
- passageId 스코프 필수 (지문 간 누출 차단) + activeRow.fullContent 해시 저장, 불일치 시 무효화+1줄 안내.
- 전송: use-generation-handlers 호출부(fast·큐·모바일 일괄바 공통)에서 `questionTypeSettings = { ...기존, teacherPoints: [{text, unit, tag?, note?}] }` (최대 12, 오프셋은 클라 전용·서버 미신뢰). questionTypeSettings 는 z.unknown() 채널(fast/route.ts:66)이라 서버 요청 스키마 무변경.
- 서버 소비(**Wave 2** — run-question-generation.ts:215 단일 지점, fast :419-421·trigger 워커 :280 모두 관통 검증됨):
  1) teacherPoints 방어적 파싱 → 2) passage.content indexOf 축자 재앵커링(실패 드롭+로그) → 3) point-picker-config 공유 클램프 → 4) 프롬프트 `## 교사 지정 출제 포인트 (필수 반영)` 블록(AI 플랜 targetContext와 분리, "불가 항목만 최근접 대체+사유", "다양성 회피보다 우선") → 5) fast diversity(:377-404)에서 교사 quote 겹침 회피항목 제외.
- ⚠️ 배포: run-question-generation·prompts 변경은 trigger 워커 번들 포함 — vercel + trigger.dev 동시 재배포.

## 3. 인터랙션

- 토큰화: 신규 순수 모듈 `passage-point-tokenizer.ts` (문장/단어 분해 + **원본 문자 오프셋 보존**, 약어 가드, v1 영어 지문 한정). 클라 렌더·서버 재앵커링 공용.
- 문장 위첨자 인덱스: idle `text-slate-300`, hover `text-blue-400`.
- 이벤트: 컨테이너 위임 1핸들러 + **CSS :hover 전용** (React hover state 금지 — 60fps 규율).
- 클릭=단일 토글 / 드래그=단어 경계 스냅 구 선택(경계 토큰만 라운딩되는 스냅 pill, user-select:none) / 터치=시작 탭→끝 탭 2탭(pointerType 분기).
- 커밋 모션: press-spring(scale 0.96→복귀) + ① 배지 팝-인. 칩 레일↔본문 양방향 ring pulse.
- 무대 상단 안내 칩: "지문에서 [단어]를 클릭해 출제 포인트를 지정하세요" (단위어 유형별 치환) + sticky 카운터 `3/8`(tabular-nums, 초과 시 셰이크). 하단 sticky 힌트 바.
- 어법 분류 태그: 칩 레일의 선택 칩에 드롭 칩(선택 흐름 차단 금지).
- SENTENCE_INSERT: 선택 문장 점선 외곽 + 반투명 "빠진 자리" 프리뷰.
- 키보드: roving 커서(aria-activedescendant), Shift+화살표 구 확장, aria-live polite. prefers-reduced-motion 전면 존중.

## 4. 유형 매핑 — `point-picker-config.ts` 선언 테이블

| 유형 | 단위 | 상한 |
|---|---|---|
| 어법 3종 | word + 드래그 구 | grammarMarkerCount 연동 |
| BLANK_INFERENCE | phrase/clause | blank 수 연동 (blankGranularity 양방향 제안, 자동 변경 금지) |
| 어휘 계열 | word | marker 수 연동 |
| SENTENCE_INSERT | sentence 1 | 1 |
| 순서/무관 | sentence 1~3 | 3 |
| 요지/주제/제목 | 근거 sentence 1~3 | 3 |

- 미등재 유형: 진입 행 자체를 렌더하지 않음(죽은 버튼 0). 클라 캡 = 서버 클램프 단일 규칙(이 파일 공유).
- 적용 후 유형 타일에 "포인트 N" 마이크로 배지(bg-blue-50 text-blue-700 tabular-nums).

## 5. AI 제안 — POST /api/workbench/point-suggest (신규, 크레딧 0)

- 요청: `{ passageId, questionType(등재 유형만), unit, maxPoints(1~8, 기본 8) }`
- 응답: `{ suggestions: [{ quote(≤120자 축자, 서버 indexOf 검증·불일치 드롭), sentenceIndex, start, end(서버 결정론 계산), reason(≤40자 합니다체), tag? }], cached }`
- 규율: staff 인증 → flash-lite(ATLAS_RESTORATION_MODEL_ID) 직호출, temperature 0, maxRetries 0, AbortSignal.timeout(20s)×최대 2시도. **strict json_schema 금지 — 관대한 JSON 파싱**. deductCredits 미호출 + recordCostSafely 원가 기록. (passageId,questionType) 캐시. 자동 발사 금지(ScanSearch 버튼 명시 호출). 실패는 완전 비차단(수동 선택 계속 가능), 후보 0건은 [] 정직 반환.
- 표시: 후보 점선 밑줄이 40ms 스태거로 좌→우 드로우-인, hover 툴팁에 reason, 클릭 시 승격(점선→실선).

## 6. 디자인 언어 (강제)

- Pretendard, slate 중립 + **blue 액센트만**. 주황/앰버 액센트 신규 도입 절대 금지. Sparkles/이모지 금지 — lucide(ScanSearch·Crosshair·Check 등)+PearlIcon만.
- setting-fields 문법 그대로: 라벨 `text-[12px] font-bold text-slate-800`, 설명 `text-[10px] text-slate-500 max-lg:hidden`, 칩 `px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600`, 토글 스위치 on=`border-blue-300 bg-blue-500`, 세그 활성 `bg-white text-blue-700 shadow-sm`.
- 문구는 전부 합니다체.

## 7. 파일 계획

Wave 1 (UI·신규): passage-point-tokenizer.ts(신규) / point-picker-config.ts(신규) / passage-point-picker.tsx(신규) / api/workbench/point-suggest/route.ts(신규) / passage-generate-modal.tsx(수정) / generate-page-client.tsx(수정) / type-numeric-detail.tsx(수정) / use-generation-handlers.ts(수정)

Wave 2 (서버 소비, 어법 품질 라운드 안정 후): run-question-generation.ts / prompts.ts / fast route diversity
