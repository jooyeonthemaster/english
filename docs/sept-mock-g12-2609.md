# 고1·고2 2026년 9월 학평 영어 학습지 — 필살기 주행 정본 (26-09-08)

고3용 9월 모평 학습지 파이프라인(`mock-worksheet-pdf` v4, `docs/sept-mock-v4-upgrade.md`)을 **고1·고2 전국연합학력평가**에 확장한 기록. 감독 = Fable 5.1(조판 확인·게이트·검수 함대), **생성·분석 = Opus 5**. 수능 예측 리포트(exam-trend-forecast)는 이번 범위 밖(사용자 지시).

## 1. 입력 자료 (웹 직접 확보)
| 항목 | 값 |
|---|---|
| 시험 | 2026학년도 9월 고1·고2 전국연합학력평가 영어 영역(26-09-02 시행, 인천광역시교육청 주관·16개 시도교육청 공동) |
| 문제지 | horaeng.com `wp-content/uploads/2026년-9월-고{1,2}-모의고사-영어-문제.pdf` (8쪽, 벡터 텍스트층) — mogozip.com(EBSi 미러) `question-*.pdf` 와 바이트 동일 |
| 정답·해설 | horaeng.com `…-영어-해설.pdf` (고1 4쪽·고2 5쪽, 1쪽에 정답표) — 고1은 mogozip 정답 PNG 로 2중 확인 |
| 보관 | `.tmp-mock-g12/src/` (gitignore) — EBSi 직접 접근은 방화벽 차단 |

정답표(18~45): `.tmp-mock-g12/ingest/srcpdf/G{1,2}_09.answers.json`.
어법·어휘 오형 정정(해설지 근거, 복원문에 적용): G1 29 ④ is→are · 30 ⑤ easier→harder · 42 (e) weaker→stronger / G2 29 ⑤ which→where · 30 ③ reluctant→inclined · 42 (d) following→challenging.

## 2. 반입기 개조 — 학평 PDF 는 평가원 PDF 와 다르다
`.tmp-mock-g12/ingest/` = `.tmp-trend-v2` 의 `extract-origin.py`·`ingest-new-exam.mjs`·`restore-forms.mjs` 복제(ROOT 치환). **원본 `.tmp-trend-v2` 를 그대로 쓰면 `stats/type-timeline.json` 에 학평 행이 append 돼 수능 예측 통계가 오염된다.**

실사고 4건(전부 반입기 수리로 흡수):
1. **soft hyphen**: 학평 PDF 는 복합어 하이픈(self-esteem·leaf-cutter·eco-friendly)을 U+00AD 로 찍는다(줄끝 분철은 0건 실측) → `delig` 에서 "-" 로 치환.
2. **「고르시오. 38.」**: 공통 발문 블록 끝에 다음 문항 번호가 같은 블록으로 붙어 q38 슬라이스가 사라짐(G2) → 줄머리 분리 정규식.
3. **머리글**: 「고1 영어영역 3 3 8」·「4 영어영역 고1 4 8」(평가원은 「영어 영역」 띄어쓰기) → `clean()` 규칙 추가.
4. **대시 혼재**: U+2015·U+2014·**박스문자 U+2500**(G1 37번) + 공백 비대칭 → `clean()` 에서 「 ― 」 로 정규화.

결과: G1 items 20·pending 0 / G2 items 20·pending 0 → `passages.json` 20지문(G1 3,552어 · G2 3,349어).

## 3. 반입 대조 함대 (`wf_53f57012-8ac`, 10기)
학년×4문항 배치가 시험지·해설 PNG 를 열어 forms·복원문을 축자 대조. **critical 0 · major 8 · minor 12** — 텍스트 영향은 대시 4곳(§2-4 로 해소, 재복원 diff 로 그 4곳만 변경 확인). 미조치 수용: 이탤릭 강조(텍스트 표현 수단 없음) · 41/43 발문 공란·42 선지 공란·40 각주 혼입(학습지 입력에 쓰이지 않는 필드).

## 4. 작업장 · 상수
`.tmp-mock-g1/`·`.tmp-mock-g2/` = `.tmp-mock-v4/` 스크립트 복제 + ROOT 치환(fonts·plate-A·cover-chars 복사, 비주얼 견본 `design/exemplar-20-visual.json`).
- render-v4: EXAM 「2026학년도 9월 고N 전국연합학력평가」 · EXAM_ORG 인천광역시교육청(16개 시·도교육청 공동) · GRADE 고N · DOC_ID `SMOAT-2609-GN-v4{T|S}` · BUILD_DATE 2026-09-08 / paginate: PDF `mock-2026-09-gN-v4.pdf`
- 모델: `model:'opus'` = 분석·워크북·추론·수리(wf-content) · 청크 · 압축 · 스토리보드/재생성(wf-visual) · 누설 수리 / **Fable 상속** = 블라인드 풀이·적대 감사·비전 QA·페이지 검수(새로운 눈은 더 강한 모델로)
- 프롬프트: 대상 「고N 학평 상위권 — 어휘·구문·선지는 고N 교과 수준, 논리 추론 밀도는 수능형」 · analysis `meta.themeShort`(오프너 중립 라벨 — 고3 전수 검수 critical 재발 방지) · compact infExp 선지 번호 노출 금지

## 5. 함대 원장
| 단계 | g1 | g2 |
|---|---|---|
| 콘텐츠(분석→워크북→추론→블라인드·감사→수리) | `wf_9c17c7be-128` | `wf_4dc7ab20-2a9` |

(이하 단계는 주행 후 갱신)

## 6. 결정론 콘텐츠 게이트 (신설)
`.tmp-mock-g12/verify-content.mjs --root <작업장> [지문…] [--json out]` — C1~C15 기계 검사. 핵심은 **세 학습 지문의 원문 복원 대조**(선택지·빈칸을 정답으로 되돌려 축자 비교), **어휘 빈칸 힌트의 정답 영단어 노출**, **wordOrders 청크 순열 재조립**, **세트 내 누설**(정답끼리 공유하는 지문 밖 어간), 합쇼체 혼입, inference 구조·정답 정합.
음성테스트 `negtest-content.py` 18종 주입 → **18/18 PASS**.

**게이트 오탐 4계통을 감독이 실물 대조로 잡아 수리**(아티클이 아니라 게이트를 고친다):
| 오탐 | 실체 | 수리 |
|---|---|---|
| excerpt 원문에 없음 4건 | 생략 인용(`...`) | 조각별 대조 |
| 관사 누설 1건 | `a universal` 은 정문(발음 자음) | 발음 예외표 |
| wordBank 불일치 1건 | 대소문자만 다름 | 소문자 비교 후 WARN |
| 세트 누설 3건 | 어간 과잉 절단(`need`→`ne`)·비대칭(`balance`/`balanc`) | 접미 제거는 4자 이상 남을 때만 + 끝 e 정규화 |

합쇼체 검출은 자모 `ㅂ니다` 정규식으로는 조합형 음절(`고릅니다`)을 못 잡는다 → **종성 ㅂ(jong 17) 판정**으로 교체. 음성테스트가 아니었으면 「0건」이 탐지 실패인 채로 통과했다.

## 7. 세션 한도 · 모델 정책 (26-09-08)
- **리밋 반복의 진짜 원인은 clauth 로테이션 wedge**: `live-sync.state.json` baseline=acc3 인데 active=main → 2분마다 no-op → 자동 계정 전환 사망. `repair.ps1 -Fix baseline` 로 해소. 다만 `whois.ps1` 상 라이브 계정이 어느 프로필 스냅숏과도 안 맞아 자동 전환은 여전히 신뢰 불가(사용자 확인 필요).
- **실패 메시지가 모델을 특정했다**: 「You've reached your **Fable** limit. Switch to another model」 — Fable 계열만 소진되고 Opus 는 살아 있었다. 사용자 지시로 **전 단계 Opus 전환**(`wf-verify-fix2.js`).
- 함대는 **학년 순차**로만 발사한다(동시 2개 이상이 한도 전멸을 두 번 냈다).

## 8. 주행 결과 (26-09-08 23:00 시점)

| 항목 | 고1 | 고2 |
|---|---|---|
| 지문 | 20 (3,552어) | 20 (3,349어) |
| 콘텐츠(분석·워크북·실전 5문항) | 20/20 | 20/20 |
| 인쇄면 결함 수리 + 착지 재감사 | 38/38 완료 | 40/40 완료 |
| 청크 / 압축 | 20/20 · 20/20 | 20/20 · 20/20 |
| 세트 내 누설(verify-leak) | **critical 0** (수리 전 14) | **critical 0** (수리 전 21) |
| 콘텐츠 게이트(verify-content) | 인쇄면 ERR 0 | ERR 0 |
| 04 어법 앵커 | exact 100 · fallback 0 | exact 100 · fallback 0 |
| 웹툰·도식 | **18/20** (41-42·43-44-45 미생성) | **0/20**(스토리보드 20/20 확보) |
| 조판 | 교사판 129쪽 · 학생판 124쪽 | 교사판 100쪽 · 학생판 95쪽 |
| 게이트 V1~V31 | 실패 1 (V11a 비주얼) | 실패 3 (V11a·V25·V30 — 전부 비주얼 파생) |

산출물: `D:\Desktop\9월학평-고1고2-산출물-2609\학습지-고{1,2}-{교사판,학생판}-20지문-2026-9월학평.pdf`

## 9. 남은 일 — OpenRouter 크레딧 (외부 차단)
이미지 생성이 **크레딧 소진**으로 멈췄습니다. 실측: `total_credits 1390 / total_usage 1389.86` → 잔액 **$0.14**. 이번 주행에서 쓴 금액은 $3.90(고1 18지문 × 웹툰+도식).
충전 후 아래만 돌리면 끝납니다(지문당 약 $0.20, 남은 22지문 ≈ **$4.4**).

```
node .tmp-mock-g1/gen-visuals.mjs 41-42 43-44-45 --force && node .tmp-mock-g1/post-visuals.mjs
node .tmp-mock-g2/gen-visuals.mjs 20 21 22 23 24 26 29 30 31 32 33 34 35 36 37 38 39 40 41-42 43-44-45 --force && node .tmp-mock-g2/post-visuals.mjs
node .tmp-mock-g1/render-v4.mjs && node .tmp-mock-g1/paginate.mjs && node .tmp-mock-g1/gates-v4.mjs
node .tmp-mock-g2/render-v4.mjs && node .tmp-mock-g2/paginate.mjs && node .tmp-mock-g2/gates-v4.mjs
```
그 다음 비전 QA(`wf-visual.js` 재발사 또는 감독 직접 판독)와 전수 페이지 검수(`wf-page-audit.js`, args `{pages:N}`)를 돌리면 고3과 동일한 출하 절차가 완성됩니다.

**주의**: `gen-visuals.mjs` 의 플래그는 `--only=webtoon` 처럼 **등호 표기만** 파싱됩니다(띄어쓰기로 주면 값이 지문 번호로 오독). `post-visuals.mjs` 는 `<no>-<kind>-raw.png` 가 있으면 그 원본을 다시 처리하므로, 이미지를 갈아끼울 때 raw 도 함께 교체해야 합니다.
