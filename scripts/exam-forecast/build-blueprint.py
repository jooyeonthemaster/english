"""봉투 모의고사 10회 배정표 + 문제집 확장 과제 생성(결정론).

  python scripts/exam-forecast/build-blueprint.py <work-dir> [--sets 10]

입력  <work-dir>/range/range-passages.json, <work-dir>/analysis/predictions.json
출력  <work-dir>/gen/blueprint.json  = { sets:[{no,tier,description,items:[{number,qtype,points,groupKey,passageCode,difficulty,targetAnswer,code}]}],
                                         extras:[{passageCode,qtype,difficulty,points,code,variant}], perPassage:{code:[...과제]} , stats }

규칙(생성 스펙 §1·§3·§4):
  · 회차 = 기출과 같은 30칸(유형·배점 고정). 한 회차에 지문 한 번.
  · 지문×유형 조합은 10회 통틀어 한 번만(같은 지문을 회차마다 다른 유형으로).
  · 원 출처의 유형으로는 배정하지 않는다(기출 유형 전환율 25/25).
  · 회차당 출처 수: 올림포스 18 · 학평 12 (기말 실측 부교재 16 : 모의고사 10 비율, 교과서 칸은 범위 지문으로 대체).
  · 지문별 등장 횟수는 출제 확률(hitLikelihood)에 비례.
  · 정답 번호는 회차마다 기출 분포(4·5·7·5·6 꼴)로 미리 지정.
"""
import json, os, random, sys
from collections import defaultdict

try:
    from scipy.optimize import linear_sum_assignment
except Exception:  # pragma: no cover
    linear_sum_assignment = None

SLOTS = [
    (1, 'TOPIC_KO', 2.5, ''), (2, 'MISMATCH_KO', 2.5, ''), (3, 'CONNECTIVE_ABC', 2.6, ''), (4, 'GRAMMAR_WRONG', 2.6, ''), (5, 'ORDER', 2.6, ''),
    (6, 'TITLE_EN', 2.7, ''), (7, 'GIST_EN', 2.7, ''), (8, 'TOPIC_EN', 2.7, ''), (9, 'GRAMMAR_WRONG', 3.2, ''),
    (10, 'GRAMMAR_RIGHT_COMBO', 3.2, '10-11'), (11, 'GRAMMAR_RIGHT_COMBO', 3.2, '10-11'), (12, 'VOCAB_CHOICE_ABC', 3.3, ''),
    (13, 'VOCAB_WRONG', 3.3, '13-14'), (14, 'VOCAB_WRONG', 3.4, '13-14'), (15, 'VOCAB_PHRASE_AWKWARD', 3.4, ''), (16, 'BLANK', 4.2, ''),
    (17, 'BLANK_AB', 4.3, '17-18'), (18, 'BLANK_AB', 4.3, '17-18'), (19, 'IMPLICATION', 4.1, '19-20'), (20, 'IMPLICATION', 4.1, '19-20'),
    (21, 'ORDER', 3.6, ''), (22, 'IRRELEVANT', 3.4, '22-23'), (23, 'IRRELEVANT', 3.4, '22-23'), (24, 'INSERTION', 3.5, '24-25'),
    (25, 'INSERTION', 3.5, '24-25'), (26, 'MISMATCH_EN', 3.5, ''), (27, 'SUMMARY', 4.2, ''),
    (101, 'ESSAY_SUMMARY_ARRANGE', 3, ''), (102, 'ESSAY_TOPIC_ARRANGE', 3, ''), (103, 'ESSAY_BLANK_ARRANGE_FIX', 4, ''),
]
DEFAULT_POINTS = {}
for _n, _t, _p, _g in SLOTS:
    DEFAULT_POINTS.setdefault(_t, _p)
DEFAULT_POINTS.update({'GIST_KO': 2.7, 'CLAIM_KO': 2.5, 'MATCH_EN': 3.5, 'ESSAY_GRAMMAR_FIX': 3, 'ESSAY_SENTENCE_ARRANGE': 3, 'ESSAY_SUMMARY_WRITE': 3})

# 원 출처 유형(한글) → 그 유형과 같다고 보는 qtype 들
ORIG_BLOCK = [
    ('함축', ['IMPLICATION']), ('주제', ['TOPIC_KO', 'TOPIC_EN']), ('제목', ['TITLE_EN']), ('요지', ['GIST_EN', 'GIST_KO']), ('주장', ['CLAIM_KO']),
    ('어법', ['GRAMMAR_WRONG']), ('어휘', ['VOCAB_WRONG']), ('네모', ['VOCAB_CHOICE_ABC']), ('빈칸', ['BLANK']), ('무관', ['IRRELEVANT']),
    ('순서', ['ORDER']), ('삽입', ['INSERTION']), ('요약', ['SUMMARY']), ('불일치', ['MISMATCH_KO', 'MISMATCH_EN']), ('지칭', ['REFERENCE']),
]
TIERS = [
    (1, '워밍업 — 기출보다 쉬움', '정답 근거가 한 문장에 드러나는 문항으로 범위 전체를 한 바퀴 돈다.', 2),
    (2, '워밍업 — 기출보다 쉬움', '1회와 다른 유형으로 같은 지문을 다시 만난다.', 2),
    (3, '실전 동형 — 기출과 같은 난도', '기출의 선지 길이·바꿔 쓰기 수준 그대로. 예측 1순위 유형 위주.', 3),
    (4, '실전 동형 — 기출과 같은 난도', '예측 1~2순위 유형 위주.', 3),
    (5, '실전 동형 — 기출과 같은 난도', '예측 2~3순위 유형까지 넓힌다.', 3),
    (6, '실전 동형 — 기출과 같은 난도', '지문×유형 조합을 다시 섞은 실전 점검.', 3),
    (7, '실전 심화 — 기출보다 어려움', '3·4점대 문항의 오답 매력도를 올렸다.', 4),
    (8, '실전 심화 — 기출보다 어려움', '어법·어휘 변형(동의어 교체)을 더 깊게.', 4),
    (9, '최고난도 — 1등급 가르기', '빈칸·함축·조합형을 킬러로. 두 문장 이상 종합.', 5),
    (10, '최고난도 — 1등급 가르기', '파이널. 전 유형 최고난도.', 5),
]
# 번호별 출처 선호 — 기출 관찰: 학평 지문은 지문 내 표지형(9·12·13·21·22·24)과 논술형 2, 4점대 추론·대의·조합형은 올림포스.
# 1~5번은 교과서 자리(범위 미제공) — 학평 지문으로 채운다(한글 선지 유형 포함).
SLOT_PREF = {1: 'HP', 2: 'HP', 3: 'HP', 4: 'HP', 5: 'HP', 9: 'HP', 12: 'HP', 13: 'HP', 21: 'HP', 22: 'HP', 24: 'HP', 102: 'HP'}

# 반박 검증 반영: 학평 지문도 4점대(빈칸·함축·요약)로 나온다(기말 배점 역산·전년도 문항표) — 짝수 회차에 1문항씩.
# 그 회차는 교과서 자리 하나를 올림포스로 돌려 12:18 을 유지한다.
SET_PREF_OVERRIDE = {2: {27: 'HP', 5: 'OLY'}, 4: {16: 'HP', 3: 'OLY'}, 6: {19: 'HP', 4: 'OLY'}, 8: {18: 'HP', 5: 'OLY'}, 10: {27: 'HP', 3: 'OLY'}}
# 원 유형(한글) → 문제집 「보험」 문항의 qtype
ORIG_QTYPE = [('함축', 'IMPLICATION'), ('주제', 'TOPIC_EN'), ('제목', 'TITLE_EN'), ('요지', 'GIST_EN'), ('주장', 'CLAIM_KO'), ('어법', 'GRAMMAR_WRONG'), ('네모', 'VOCAB_CHOICE_ABC'),
              ('어휘', 'VOCAB_WRONG'), ('빈칸', 'BLANK'), ('무관', 'IRRELEVANT'), ('순서', 'ORDER'), ('삽입', 'INSERTION'), ('요약', 'SUMMARY'), ('불일치', 'MISMATCH_EN')]

HARD_TYPES = {'BLANK', 'BLANK_AB', 'IMPLICATION', 'SUMMARY', 'GRAMMAR_RIGHT_COMBO', 'VOCAB_PHRASE_AWKWARD', 'ESSAY_BLANK_ARRANGE_FIX', 'INSERTION', 'ORDER'}


def blocked_types(original_type):
    out = set()
    for key, qs in ORIG_BLOCK:
        if key in (original_type or ''):
            out.update(qs)
    return out


def slot_difficulty(tier_diff, qtype, number):
    if tier_diff <= 3:
        return tier_diff
    if tier_diff == 4:
        return 4 if (qtype in HARD_TYPES or number >= 9) else 3
    return 5 if qtype in HARD_TYPES else 4


def answer_plan(rng):
    """27문항 정답 번호 — 4~7개씩, 같은 번호 3연속 금지, 무관 문장은 ① 금지."""
    for _ in range(2000):
        counts = [5, 5, 6, 5, 6]
        rng.shuffle(counts)
        seq = []
        for i, c in enumerate(counts):
            seq += [i + 1] * c
        rng.shuffle(seq)
        ok = all(not (seq[i] == seq[i + 1] == seq[i + 2]) for i in range(len(seq) - 2))
        ok = ok and seq[21] != 1 and seq[22] != 1  # 22·23번 무관
        if ok:
            return seq
    return seq


def main():
    wd = sys.argv[1]
    n_sets = 10
    rng_passages = json.load(open(os.path.join(wd, 'range/range-passages.json'), encoding='utf-8'))
    preds = {p['code']: p for p in json.load(open(os.path.join(wd, 'analysis/predictions.json'), encoding='utf-8'))}
    codes = [p['code'] for p in rng_passages]
    group = {c: ('HP' if c.startswith('HP') else 'OLY') for c in codes}
    orig = {p['code']: p.get('originalType') or '' for p in rng_passages}

    prob = defaultdict(dict)
    for c in codes:
        blocked = blocked_types(orig[c])
        if c == 'HP-q41-42':
            blocked |= {'TITLE_EN', 'VOCAB_WRONG'}
        if c == 'HP-q43-45':
            blocked |= {'ORDER', 'MISMATCH_KO', 'MISMATCH_EN', 'REFERENCE'}
        types = {}
        for t in (preds.get(c, {}).get('predictedTypes') or []):
            types[t['qtype']] = max(types.get(t['qtype'], 0), float(t.get('probability') or 0))
        for _n, t, _p, _g in SLOTS:
            v = types.get(t, 0.03)
            prob[c][t] = 0.0 if t in blocked else max(v, 0.03)
        prob[c]['_blocked'] = sorted(blocked)

    hit = {c: float(preds.get(c, {}).get('hitLikelihood') or (0.85 if group[c] == 'OLY' else 0.5)) for c in codes}
    # 지문별 목표 등장 횟수: 올림포스 합 180, 학평 합 120 을 hit 비례로
    desired = {}
    for g, total in (('OLY', 18 * n_sets), ('HP', 12 * n_sets)):
        cs = [c for c in codes if group[c] == g]
        s = sum(hit[c] for c in cs)
        for c in cs:
            desired[c] = min(float(n_sets), total * hit[c] / s)
        # 상한(10) 때문에 남는 몫을 재분배
        for _ in range(5):
            short = total - sum(desired[c] for c in cs)
            free = [c for c in cs if desired[c] < n_sets - 1e-9]
            if short < 1e-6 or not free:
                break
            sf = sum(hit[c] for c in free)
            for c in free:
                desired[c] = min(float(n_sets), desired[c] + short * hit[c] / sf)

    used_pt = set()
    used_count = defaultdict(int)
    sets = []
    # 풀이 순서: 실전 동형(3~6회)이 가장 유력한 지문×유형 조합을 먼저 가져가게 한다 → 워밍업(1·2) → 심화·최고난도(7~10)
    SOLVE_ORDER = [3, 4, 5, 6, 1, 2, 7, 8, 9, 10][:n_sets]
    for k, no_ in enumerate(SOLVE_ORDER):
        no, tier, desc, tier_diff = TIERS[no_ - 1]
        remaining_sets = n_sets - k

        def solve(lam):
            cost = [[0.0] * len(codes) for _ in SLOTS]
            for i, (_n, t, _p, _g) in enumerate(SLOTS):
                for j, c in enumerate(codes):
                    p = prob[c][t]
                    if p <= 0 or (c, t) in used_pt:
                        w = -50.0
                    else:
                        need = (desired[c] - used_count[c]) / remaining_sets
                        pref = SET_PREF_OVERRIDE.get(no, {}).get(_n) or SLOT_PREF.get(_n, 'OLY')
                        w = p * 2.0 + need * 1.5 + (lam if group[c] == 'OLY' else 0.0) + (0.9 if group[c] == pref else 0.0)
                    cost[i][j] = -w
            rows, cols = linear_sum_assignment(cost)
            return [(SLOTS[r], codes[c]) for r, c in zip(rows, cols)]

        lo, hi = -6.0, 6.0
        best = None
        for _ in range(40):
            mid = (lo + hi) / 2
            asg = solve(mid)
            n_oly = sum(1 for _s, c in asg if group[c] == 'OLY')
            best = asg
            if n_oly == 18:
                break
            if n_oly < 18:
                lo = mid
            else:
                hi = mid
        asg = sorted(best, key=lambda x: x[0][0])
        # 같은 묶음(유형) 안에서는 학평 지문이 앞(기출 9·12·13·22·24번 관찰)
        by_type = defaultdict(list)
        for (num, t, pts, g), c in asg:
            by_type[t].append(num)
        amap = {s[0]: c for s, c in asg}
        for t, nums in by_type.items():
            if len(nums) == 2 and nums[0] <= 27 and abs(nums[0] - nums[1]) == 1:
                a, b = sorted(nums)
                if group[amap[a]] == 'OLY' and group[amap[b]] == 'HP':
                    amap[a], amap[b] = amap[b], amap[a]
        rng = random.Random(20261012 + no)
        answers = answer_plan(rng)
        items = []
        for (num, t, pts, g) in SLOTS:
            c = amap[num]
            used_pt.add((c, t))
            used_count[c] += 1
            items.append({
                'number': num, 'qtype': t, 'points': pts, 'groupKey': g, 'passageCode': c,
                'difficulty': slot_difficulty(tier_diff, t, num),
                'targetAnswer': '①②③④⑤'[answers[num - 1] - 1] if num <= 27 else '',
                'code': f"{c}__{t}__s{no:02d}",
                'prob': round(prob[c][t], 3),
            })
        sets.append({'no': no, 'title': f'봉투 모의고사 제{no}회', 'tier': tier, 'description': desc, 'items': items})
    sets.sort(key=lambda x: x['no'])

    # 문제집 확장: 봉투에 안 들어간 유력 유형 + 1·2순위 유형의 두 번째 변형
    extras = []
    extra_types = [t for _n, t, _p, _g in SLOTS] + ['CLAIM_KO', 'MATCH_EN']
    for c in codes:
        in_sets = {t for (cc, t) in used_pt if cc == c}
        ptypes = sorted(((t['qtype'], float(t.get('probability') or 0)) for t in (preds.get(c, {}).get('predictedTypes') or [])), key=lambda x: -x[1])
        blocked = set(prob[c]['_blocked'])
        cand = [t for t, p in ptypes if t in set(extra_types) and t not in in_sets and t not in blocked]
        seen = set()
        cap = 2 if group[c] == 'OLY' else 4  # 올림포스는 봉투에서 이미 9~10유형, 학평은 6유형
        for t in cand:
            if t in seen:
                continue
            seen.add(t)
            if len(seen) > cap:
                break
            extras.append({'passageCode': c, 'qtype': t, 'difficulty': 3, 'points': DEFAULT_POINTS.get(t, 3.0), 'code': f"{c}__{t}__x1", 'variant': '확장', 'targetAnswer': ''})
        if c not in ('HP-q41-42', 'HP-q43-45'):
            for key, qt in ORIG_QTYPE:
                if key in (orig[c] or ''):
                    extras.append({'passageCode': c, 'qtype': qt, 'difficulty': 3, 'points': DEFAULT_POINTS.get(qt, 3.0), 'code': f"{c}__{qt}__x0", 'variant': '원 유형(보험) — 출처와 같은 유형, 확률 낮음. 출처 문항의 출제 지점·선지는 쓰지 않는다', 'targetAnswer': ''})
                    break
        top1 = [t for t, p in ptypes if t not in blocked and t in DEFAULT_POINTS][:1]
        for t in top1:
            extras.append({'passageCode': c, 'qtype': t, 'difficulty': 5 if t in HARD_TYPES else 4, 'points': DEFAULT_POINTS.get(t, 3.0), 'code': f"{c}__{t}__x2", 'variant': '1순위 유형 두 번째 변형(다른 출제 지점·최고난도)', 'targetAnswer': ''})

    per = defaultdict(list)
    for s in sets:
        for it in s['items']:
            per[it['passageCode']].append({**it, 'setNo': s['no'], 'tier': s['tier']})
    for e in extras:
        per[e['passageCode']].append({**e, 'setNo': None})
    stats = {
        'appearances': {c: used_count[c] for c in codes},
        'desired': {c: round(desired[c], 2) for c in codes},
        'itemsPerPassage': {c: len(per[c]) for c in codes},
        'total': sum(len(v) for v in per.values()),
        'lowProbAssignments': [(s['no'], it['number'], it['passageCode'], it['qtype']) for s in sets for it in s['items'] if it['prob'] <= 0.03],
    }
    out = {'sets': sets, 'extras': extras, 'perPassage': per, 'stats': stats}
    os.makedirs(os.path.join(wd, 'gen'), exist_ok=True)
    json.dump(out, open(os.path.join(wd, 'gen/blueprint.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('sets', len(sets), 'set items', sum(len(s['items']) for s in sets), 'extras', len(extras), 'total', stats['total'])
    print('appearances', stats['appearances'])
    print('low-prob assignments', len(stats['lowProbAssignments']))


if __name__ == '__main__':
    main()
