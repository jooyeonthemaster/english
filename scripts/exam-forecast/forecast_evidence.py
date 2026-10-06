"""번들에 얹는 두 가지 근거 데이터(결정론 — 에이전트 문장 없음).

  passage_evidence()  지문별 「왜 이렇게 예측했나」 — 같은 종류 지문을 기출이 어떻게 냈는지(선례 문항) + 유형별 선례·우리 문항 짝
  format_fidelity()   「동형 대조」 — 봉투 회차의 번호별 유형·배점·발문·선지 형식·표지 수가 기출과 얼마나 같은지 기계로 센 표

입력은 build-bundle.py 가 이미 만든 구조(지문·문항·세트)와 작업 폴더의 analysis/sem1-range-map.json(직전 시험 범위 ↔ 기출 대조).
"""
import re

# 출처 문항의 원 유형(한글 자유 문장) → 묶음
ORIG_FAMILY = [('함축', '함축'), ('주제', '대의'), ('제목', '대의'), ('요지', '대의'), ('주장', '대의'), ('어법', '어법'), ('어휘', '어휘'), ('네모', '어휘'),
               ('빈칸', '빈칸'), ('무관', '무관'), ('순서', '순서'), ('삽입', '삽입'), ('요약', '요약'), ('불일치', '불일치'), ('일치', '불일치'), ('교과서', '교과서')]
FAMILY_KO = {'대의': '주제·제목·요지', '교과서': '교과서 본문'}


def orig_family(s):
    for k, v in ORIG_FAMILY:
        if k in (s or ''):
            return v
    return ''


def source_group(label):
    if '교과서' in label:
        return '교과서'
    if '올림포스' in label:
        return '올림포스'
    return '학평'


def _ref_table(sem1, ref_questions):
    """기출 문항표: 번호 → {refCode, qtype, points, group, unit, origFamily}"""
    by_no = {}
    for q in ref_questions:
        no = q['code'].replace('REF-', '')
        no = no if no.startswith('S') else str(int(no))
        by_no[no] = q
    rows = []
    for it in (sem1 or {}).get('items', []):
        q = by_no.get(it['no'])
        if not q:
            continue
        group = '교과서' if it['group'] == '교과서' else '올림포스' if it['group'] == '올림포스' else '학평'
        fam = '교과서' if group == '교과서' else orig_family(it.get('originalType') or '')
        rows.append({'refCode': q['code'], 'examNo': it['no'], 'qtype': q['qtype'], 'points': q['points'], 'group': group,
                     'source': ('2025년 3월 고2 학평 ' + it['unit']) if group == '학평' else ('올림포스 ' + it['unit']) if group == '올림포스' else ('영어Ⅰ ' + it['unit']),
                     'origFamily': fam})
    return rows


def passage_evidence(passages, questions, sem1):
    """passages[].prediction.evidence 를 채운다(제자리 수정)."""
    refs = _ref_table(sem1, [q for q in questions if q['role'] == 'reference'])
    if not refs:
        return 0
    ours = {}
    for q in questions:
        if q['role'] == 'forecast':
            ours.setdefault(q['passageCode'], {}).setdefault(q['qtype'], []).append(q['code'])
    n = 0
    for p in passages:
        if p['sourceGroup'] == '기출':
            continue
        group = p['sourceGroup']
        fam = '교과서' if group == '교과서' else orig_family((p.get('analysis') or {}).get('originalType') or '')
        same_origin = [r for r in refs if r['group'] == group and r['origFamily'] == fam and fam]
        same_group = [r for r in refs if r['group'] == group]
        types = []
        ranked = sorted((p.get('prediction') or {}).get('predictedTypes') or [], key=lambda t: -float(t.get('probability') or 0))
        seen = set()
        for t in ranked:
            qt = t['qtype']
            if qt in seen:
                continue
            seen.add(qt)
            a = [r['refCode'] for r in same_origin if r['qtype'] == qt]           # 같은 종류 지문이 같은 유형으로 나온 선례
            b = [r['refCode'] for r in same_group if r['qtype'] == qt and r['refCode'] not in a]  # 같은 출처가 같은 유형으로
            c = [r['refCode'] for r in refs if r['qtype'] == qt and r['refCode'] not in a + b]    # 기출의 같은 유형 문항(형식 선례)
            rel = 'same-origin' if a else 'same-source' if b else 'same-type' if c else 'none'
            types.append({'qtype': qt, 'probability': round(float(t.get('probability') or 0), 3), 'relation': rel,
                          'precedents': (a + b + c)[:3], 'ourCodes': ours.get(p['code'], {}).get(qt, [])})
            if len(types) >= 8:
                break
        p.setdefault('prediction', {})['evidence'] = {
            'originFamily': FAMILY_KO.get(fam, fam),
            'sameOrigin': [{k: r[k] for k in ('refCode', 'examNo', 'qtype', 'points', 'source')} for r in same_origin],
            'sameSourceCount': len(same_group),
            'types': types,
        }
        n += 1
    return n


def _plain(s):
    s = re.sub(r'</?[ubi]>', '', s or '')
    s = re.sub(r'〔[\d.]+점〕', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def _template(s):
    """발문의 틀 — 문항마다 달라지는 숫자(단어 수 등)와 쉼표·마침표 차이(스캔본 기출의 「중.」·「(A).(B)」)는 같은 틀로 본다."""
    s = re.sub(r'\d+', '#', _plain(s))
    s = re.sub(r'\(([a-h])\)\s*~\s*\([a-h]\)', r'(\1)~(?)', s)  # 라벨 범위 끝 글자는 밑줄 수 — 「표지 수」에서 센다(이중 계산 방지)
    s = re.sub(r'\s*[.,]\s*', ',', s)
    return re.sub(r'\s+', '', s)


def _marks(body):
    p = (body.get('passage') or '') + ' ' + (body.get('givenBox') or '')
    return {
        'underlines': len(re.findall(r'<u>', p)),
        # 삽입 자리: 기출 전사는 본문에 「( ① )」 글자, 우리 문항은 [[SLOT:n]] 토큰 — 찍히는 모양이 같아 하나로 센다
        'circled': len(re.findall(r'[①②③④⑤]', p)) + len(re.findall(r'\[\[SLOT', p)),
        'labels': len(set(re.findall(r'\(([a-h])\)\s?<u>', p))),
        'blanks': len(re.findall(r'\[\[BLANK', p)),
        'givenBox': 1 if body.get('givenBox') else 0,
        'boxes': len(body.get('boxes') or []),
        'options': len(body.get('options') or []) or len((body.get('optionTable') or {}).get('rows') or []),
    }


def _lang(body):
    txt = ' '.join(body.get('options') or [])
    if not txt:
        return ''
    ko = len(re.findall(r'[가-힣]', txt))
    return 'KO' if ko > len(txt) * 0.2 else 'EN'


def _key(n):
    return f'S{n - 100}' if n > 100 else str(n)


def format_fidelity(questions, sets, pages_by_set=None, exam_pages=10):
    """봉투 회차 × 번호별 형식 일치표."""
    by_code = {q['code']: q for q in questions}
    ref = {}
    for q in questions:
        if q['role'] == 'reference':
            no = q['code'].replace('REF-', '')
            ref[no if no.startswith('S') else str(int(no))] = q
    if not ref:
        return None
    CHECKS = [('qtype', '유형'), ('points', '배점'), ('stem', '발문 틀'), ('stemExact', '발문 글자 그대로'), ('layout', '선지 배열'), ('lang', '선지 언어'), ('marks', '밑줄·번호·빈칸·상자 수')]
    per_set, slot_rows = [], {}
    for st in sets:
        tally = {k: 0 for k, _ in CHECKS}
        diffs = []
        n_items = 0
        for it in st['items']:
            key = _key(it['number'])
            r, q = ref.get(key), by_code.get(it['questionCode'])
            if not r or not q:
                continue
            n_items += 1
            rb, qb = r['body'], q['body']
            res = {
                'qtype': r['qtype'] == q['qtype'],
                'points': float(r['points'] or 0) == float(it.get('points') or q.get('points') or 0),
                'stem': _template(rb.get('stem') or rb.get('groupStem')) == _template(qb.get('stem') or qb.get('groupStem')),
                'stemExact': _plain(rb.get('stem') or rb.get('groupStem')) == _plain(qb.get('stem') or qb.get('groupStem')),
                'layout': (rb.get('optionLayout') or '') == (qb.get('optionLayout') or ''),
                'lang': _lang(rb) == _lang(qb),
                'marks': _marks(rb) == _marks(qb),
            }
            for k, ok in res.items():
                tally[k] += 1 if ok else 0
                if not ok:
                    detail = ''
                    if k in ('stem', 'stemExact'):
                        detail = f"기출 「{_plain(rb.get('stem') or rb.get('groupStem'))[:60]}」 ↔ 봉투 「{_plain(qb.get('stem') or qb.get('groupStem'))[:60]}」"
                    elif k == 'marks':
                        a, b = _marks(rb), _marks(qb)
                        detail = ', '.join(f'{m} {a[m]}→{b[m]}' for m in a if a[m] != b[m])
                    elif k == 'layout':
                        detail = f"{rb.get('optionLayout')} → {qb.get('optionLayout')}"
                    diffs.append({'number': key, 'check': k, 'detail': detail})
            # 기출 정보는 refType·refPoints — 대조 항목 키(qtype·points)와 겹치면 집계가 덮어쓴다
            row = slot_rows.setdefault(key, {'number': key, 'refType': r['qtype'], 'refPoints': r['points'], 'sets': 0, **{k: 0 for k, _ in CHECKS}})
            row['sets'] += 1
            for k, ok in res.items():
                row[k] += 1 if ok else 0
        pages = (pages_by_set or {}).get(st['no'])
        per_set.append({'no': st['no'], 'items': n_items, 'pages': pages, **tally, 'diffs': diffs[:40]})
    total_items = sum(s['items'] for s in per_set) or 1
    summary = [{'check': k, 'label': lab, 'match': sum(s[k] for s in per_set), 'total': total_items} for k, lab in CHECKS]
    if pages_by_set:
        got = [s['pages'] for s in per_set if s['pages']]
        summary.append({'check': 'pages', 'label': f'쪽수(기출 {exam_pages}쪽)', 'match': sum(1 for x in got if x == exam_pages), 'total': len(got)})
    note = ('발문 틀 = 숫자(단어 수 등)·쉼표와 마침표만 다른 것은 같은 틀(스캔본 기출의 「중.」「(A).(B)」 포함). '
            '삽입 자리 「( ① )」는 글자든 토큰이든 같은 표지로 센다. 기준 = 2026 1학기 1차 실물 시험지 30문항. '
            '〔10~11〕 묶음 발문은 기출이 「(a)~(e)」로 찍고 10번에 (f) 까지 둔 오기라, 봉투는 라벨 수(10번 6개·11번 5개)는 그대로 두고 발문만 「(a)~(f)」로 바로잡았다 — 「발문 글자 그대로」에서 이 차이가 잡힌다.')
    return {'note': note, 'examPages': exam_pages, 'checks': [{'key': k, 'label': lab} for k, lab in CHECKS], 'summary': summary, 'perSet': per_set,
            'perSlot': sorted(slot_rows.values(), key=lambda r: (r['number'].startswith('S'), int(r['number'].lstrip('S'))))}
