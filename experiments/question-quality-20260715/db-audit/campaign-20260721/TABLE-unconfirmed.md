# 미확정·비지문 목록 (수정 금지 / 후속 과제)

## 미확정 (원칙상 수정 금지)

### G061 — 2025 6월 모평 30번 (vocab, 2행)
- solver=PLANTED_FOUND / verifier=PLANTED_FOUND
- [divergent-correction] "drives" → "hinders vs prevents"
- 패킷: experiments/question-quality-20260715/db-audit/campaign-20260721/packets/G061.md

### G029 — 2026 29번(밑줄 함의) (other, 19행)
- solver=NO_DEFECT / verifier=PLANTED_FOUND
- [solver-only] "a clean water. act." → "a clean water act."
- [verifier-only] "water. act." → "water act."
- 패킷: experiments/question-quality-20260715/db-audit/campaign-20260721/packets/G029.md

### G013 — 29번(해커스 수불패 8회) (grammar, 4행)
- solver=PLANTED_FOUND / verifier=PLANTED_FOUND
- [solver-only] "record them accurately" → "record accurately"
- [verifier-only] "record them" → "record"
- 패킷: experiments/question-quality-20260715/db-audit/campaign-20260721/packets/G013.md


## 비지문 (Passage 테이블에 지문 아닌 행)

- **G043** (1행, id=cmqi4j8h10007jx04qt41icfr): G043 is not an English passage: it is a Korean MATH problem (연립부등식/quadratic inequality) answer-key + full solution ("[정답] ②", ㄱㄴㄷ 보기, ①~⑤ choices). All formulas are replaced by ba
- **G008** (1행, id=cmpcq19yl0001jz04tv513rx8): Single variant is a full internal-exam question set, not a passage: word box + choices, passage [I]-[V] with underlined (a)-(c) items, Q6 (5 choices), Q7 grammar-pair table. Passag


## 마커·발문 잔존 지문 (구조 정리 후속 과제)

| 그룹 | 시험 | 행수 | 판정 | 대표 id |
|---|---|---|---|---|
| G001 | (미상) | 1 | CLEAN | cmpne97ry0001l204lxnmope1 |
| G019 | (미상) | 1 | CLEAN | cmpr2uw9g000xi804dtxfqpyg |
| G032 | (미상) | 5 | CONFIRMED | cmq7t0h6w0003jy049nf9bswy |
| G043 | (미상) | 1 | NOT_TARGET | cmqi4j8h10007jx04qt41icfr |
| G008 | 2026 | 1 | NOT_TARGET | cmpcq19yl0001jz04tv513rx8 |
| G017 | 2026 | 7 | CONFIRMED | cmppqbcjp0004v30ozd54axc3 |
| G026 | 2026 6월 고1 모평 29번 | 8 | CLEAN | cmq0pakbe0003la04ywbzulqg |
| G064 | 2026 6월 고1 모평 30번 | 9 | CLEAN | cmq0pcwyn0005la043zb93vsg |
| G002 | 고1 | 2 | CLEAN | cmpr6wbbt0002mm3coikj9suy |
