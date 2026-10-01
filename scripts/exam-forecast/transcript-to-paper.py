"""한광고 기출 전사(JSON) → ForecastPaper 입력(PaperItem[]) 변환.

  python scripts/exam-forecast/transcript-to-paper.py <transcript.json> <out-paper.json>

골든 테스트(기출을 우리 엔진으로 재조판해 스캔과 대조)와 기출 원본(reference) 문항 DB 적재에 쓴다.
"""
import json, re, sys

QTYPE_BY_NO = {
    '1': 'TOPIC_KO', '2': 'MISMATCH_KO', '3': 'CONNECTIVE_ABC', '4': 'GRAMMAR_WRONG', '5': 'ORDER',
    '6': 'TITLE_EN', '7': 'GIST_EN', '8': 'TOPIC_EN', '9': 'GRAMMAR_WRONG', '10': 'GRAMMAR_RIGHT_COMBO',
    '11': 'GRAMMAR_RIGHT_COMBO', '12': 'VOCAB_CHOICE_ABC', '13': 'VOCAB_WRONG', '14': 'VOCAB_WRONG',
    '15': 'VOCAB_PHRASE_AWKWARD', '16': 'BLANK', '17': 'BLANK_AB', '18': 'BLANK_AB', '19': 'IMPLICATION',
    '20': 'IMPLICATION', '21': 'ORDER', '22': 'IRRELEVANT', '23': 'IRRELEVANT', '24': 'INSERTION',
    '25': 'INSERTION', '26': 'MISMATCH_EN', '27': 'SUMMARY',
    'S1': 'ESSAY_SUMMARY_ARRANGE', 'S2': 'ESSAY_TOPIC_ARRANGE', 'S3': 'ESSAY_BLANK_ARRANGE_FIX',
}

def conv_markup(s):
    if not s:
        return ''
    s = re.sub(r'\[BLANK:\(([A-Z])\)\]', r'[[BLANK:\1]]', s)
    s = s.replace('[BLANK]', '[[BLANK]]')
    return s

def strip_stem(stem):
    s = stem.strip()
    s = re.sub(r'^\d+\.\s*', '', s)
    s = re.sub(r'\s*〔[\d.]+점〕\s*$', '', s)
    return s

def table_from_options(opts):
    rows = []
    for o in opts:
        parts = [p.strip() for p in re.split(r'\s*(?:…|⋯|···|\.\.\.)\s*', o['text']) if p.strip()]
        rows.append(parts)
    n = max(len(r) for r in rows)
    headers = ['(A)', '(B)', '(C)'][:n]
    return {'headers': headers, 'rows': rows}

def convert(q):
    no = q['no']
    qtype = QTYPE_BY_NO[no]
    is_essay = no.startswith('S')
    body = {'stem': '', 'passage': conv_markup(q['passage'])}
    group = q.get('groupInstruction') or ''
    if group:
        m = re.match(r'〔(\d+)~(\d+)〕\s*(.*)$', group.strip(), re.S)
        body['groupStem'] = m.group(3) if m else group
        body['groupKey'] = f"g{m.group(1) if m else no}"
    stem = q['stem']
    if is_essay:
        lines = stem.split('\n')
        rest = '\n'.join(l for l in lines if '논술형' not in l)
        body['stem'] = re.sub(r'\s*〔[\d.]+점〕\s*$', '', rest.strip())
    else:
        st = strip_stem(stem)
        if group and not st:
            body['stem'] = body['groupStem']
        else:
            body['stem'] = st
    if q.get('givenBox'):
        body['givenBox'] = conv_markup(q['givenBox'])
    sb = q.get('summaryBox') or ''
    if sb and not is_essay:
        sb = '\n'.join(l for l in sb.split('\n') if not l.strip().startswith('↓') and not l.strip().startswith('('))
        body['summaryBox'] = conv_markup(sb.strip())
    boxes = []
    for b in q.get('extraBoxes') or []:
        boxes.append({'label': b['label'], 'text': conv_markup(b['text']), 'align': 'center' if b['label'] == '보기' else 'left'})
    if boxes:
        body['boxes'] = boxes
    lay = (q.get('optionLayout') or '').lower()
    opts = [o for o in (q.get('options') or []) if (o.get('text') or '').strip()]
    if qtype in ('GRAMMAR_WRONG', 'VOCAB_WRONG', 'VOCAB_PHRASE_AWKWARD', 'IRRELEVANT', 'INSERTION'):
        opts = []  # 지문 안 표지형 — 기출은 선지 목록을 찍지 않는다
    if opts:
        if lay.startswith('table'):
            body['optionLayout'] = 'table'
            body['optionTable'] = table_from_options(opts)
        elif lay.startswith('stack'):
            body['optionLayout'] = 'stack'
            body['options'] = [conv_markup(o['text']).replace(' / (B)', '\n(B)') for o in opts]
        elif lay.startswith('2col'):
            body['optionLayout'] = 'grid2'
            body['options'] = [conv_markup(o['text']) for o in opts]
        elif lay.startswith('3col'):
            body['optionLayout'] = 'grid3'
            body['options'] = [conv_markup(o['text']) for o in opts]
        else:
            body['optionLayout'] = 'list'
            body['options'] = [conv_markup(o['text']) for o in opts]
    if q.get('footnotes'):
        body['footnotes'] = q['footnotes']
    if is_essay:
        al = q.get('answerLines') or ''
        lines = []
        for m in re.finditer(r'(\([A-Z]\))?\s*_+\s*(?:[〔(]([\d.]+)점[〕)])?', al):
            if m.group(0).strip():
                lines.append({'label': m.group(1) or '', **({'points': float(m.group(2))} if m.group(2) else {})})
        body['answerLines'] = lines or [{'label': ''}]
    return {
        'key': f"ref-{no}",
        'number': None if is_essay else int(no),
        'essayNo': int(no[1:]) if is_essay else None,
        'points': q['points'],
        'qtype': qtype,
        'body': body,
    }

def main():
    src, out = sys.argv[1], sys.argv[2]
    t = json.load(open(src, encoding='utf-8'))
    items = [convert(q) for q in t['questions']]
    paper = {
        'header': {
            'gradeLabel': '2학년',
            'schoolLine': '한광고등학교 1학기 1차 정기시험 문제지',
            'subjectLine': '영어Ⅰ (과목코드: 12)',
            'dateLine': '2026년 4월 29일 2교시\u2003 대상학급 : 1~10반',
            'countLine': '본 시험은 선택형 27문항, 논술형 3문항이며 쪽수는 10쪽입니다.',
        },
        'items': items,
        'footer': {'left': '영어Ⅰ', 'right': '이 문제지에 대한 저작권은 한광고등학교에 있습니다.'},
    }
    json.dump(paper, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('items', len(items))

if __name__ == '__main__':
    main()
