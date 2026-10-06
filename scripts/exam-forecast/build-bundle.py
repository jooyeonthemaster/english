"""한광고 2학기 1차 예측 팩 번들 조립 → seed-pack.ts 입력.

  python scripts/exam-forecast/build-bundle.py <work-dir> <out-bundle.json>

work-dir(.tmp-hanguang) 에서 읽는 것(없으면 건너뜀):
  range/range-passages.json      범위 지문 정규화(WF1)
  exam/hk2601-transcript.json    기출 전사(WF1) → 기출 원본(reference) 지문·문항
  exam/hk2601-paper.json         전사 → 렌더 모델 변환본(transcript-to-paper.py)
  analysis/analysis.json         출제 경향 해부 종합(WF2) → pack.analysis
  analysis/predictions.json      지문별 예측(WF2) → passage.prediction
  analysis/reference-key.json    기출 정답·해설(WF2 구조 렌즈)
  analysis/range-info.json       범위 추정 근거 → pack.rangeInfo
  gen/questions.json             예측 문항(WF3·WF4 검수 통과본)
  gen/sets.json                  봉투 세트 구성
  range/range-allowlist.json     범위 목록(범위 파일 수업용 자료에서 기계 추출) — 필수.
                                 목록 밖 지문이 지문·문항·봉투 어디에든 있으면 번들을 만들지 않고 멈춘다.
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from display_text import display  # noqa: E402
from forecast_evidence import format_fidelity, passage_evidence  # noqa: E402

def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)

def plain(s):
    s = re.sub(r'</?[ubi]>', '', s or '')
    s = re.sub(r'\[\[BLANK(?::[A-Z])?\]\]', '______', s)
    s = re.sub(r'\[\[SLOT:\d\]\]', '', s)
    return re.sub(r'[ \t]+', ' ', s).strip()

HP_YEAR = {'HP': '2025년 9월', 'HP24': '2024년 9월'}


def hp_label(code):
    prefix, q = code.split('-', 1)
    q = q.replace('q', '').replace('-', '~')
    return f"{HP_YEAR[prefix]} 고2 학평 {q}번"


def range_gate(allow, rng, gen_q, gen_sets):
    """범위 목록 밖 지문이 하나라도 있으면 멈춘다 — 범위에 없는 지문으로 만든 문항은 시험 대비 자료가 아니다."""
    if not allow:
        sys.exit('range/range-allowlist.json 이 없다 — make-range-allowlist.py 로 범위 파일에서 먼저 만든다')
    ok = {p['code'] for p in allow['passages']}
    bad = sorted({p['code'] for p in rng if p['code'] not in ok}
                 | {q['passageCode'] for q in gen_q if q['passageCode'] not in ok}
                 | {it['questionCode'].split('__')[0] for st in gen_sets for it in st['items'] if it['questionCode'].split('__')[0] not in ok})
    if bad:
        sys.exit(f'범위 밖 지문 {len(bad)}개 — 번들 중단: {bad}')
    missing = sorted(ok - {p['code'] for p in rng})
    if missing:
        print('주의: 범위 지문 중 정규화 기록이 없는 것', missing)

def tb_label(p):
    # TB2-3 → 「영어Ⅱ 교과서 NE능률(오선영) 2과 본문 (3/5)」 — 출처 문구는 정규화 기록의 source 를 그대로
    return (p.get('source') or p['code']).replace('영어Ⅱ 교과서 ', '영어Ⅱ ')


def oly_label(code):
    _, qn, pr = code.split('-')
    qn_full = {'21': '21', '23': '23~24', '29': '29', '30': '30', '31': '31~34', '35': '35', '36': '36~37', '38': '38~39', '40': '40'}[qn]
    return f"올림포스 9대 변별유형 QN{qn_full} Practice {pr}"

REF_SOURCE = {
    '1': '영어Ⅰ 교과서(YBM 박준언) 1과', '2': '영어Ⅰ 교과서(YBM 박준언) 2과', '3': '영어Ⅰ 교과서(YBM 박준언) 1과', '4': '영어Ⅰ 교과서(YBM 박준언) 1과', '5': '영어Ⅰ 교과서(YBM 박준언) 1과',
    '9': '2025년 3월 고2 학평 30번', '12': '2025년 3월 고2 학평 23번', '13': '2025년 3월 고2 학평 24번',
    '21': '2025년 3월 고2 학평 21번', '22': '2025년 3월 고2 학평 31번', '24': '2025년 3월 고2 학평 32번',
    'S2': '2025년 3월 고2 학평 33번',
}

def short_source(s):
    m = re.search(r'(QN[\d~]+)[^P]*?(Practice \d+)', s)
    if m:
        return f'올림포스 9대 변별유형 {m.group(1)} {m.group(2)}'
    m = re.search(r'Lesson (\d)', s)
    if m:
        return f'영어Ⅰ 교과서(YBM 박준언) {m.group(1)}과'
    return s[:60]

def main():
    wd, out = sys.argv[1], sys.argv[2]
    rng = load(os.path.join(wd, 'range/range-passages.json'), [])
    transcript = load(os.path.join(wd, 'exam/hk2601-transcript.json'), {'questions': []})
    paper = load(os.path.join(wd, 'exam/hk2601-paper.json'), {'items': []})
    analysis = load(os.path.join(wd, 'analysis/analysis.json'), {})
    preds = {p['code']: p for p in load(os.path.join(wd, 'analysis/predictions.json'), [])}
    refkey = {k['no']: k for k in load(os.path.join(wd, 'analysis/reference-key.json'), [])}
    range_info = load(os.path.join(wd, 'analysis/range-info.json'), {})
    gen_q = load(os.path.join(wd, 'gen/questions.json'), [])
    gen_sets = load(os.path.join(wd, 'gen/sets.json'), [])
    range_gate(load(os.path.join(wd, 'range/range-allowlist.json')), rng, gen_q, gen_sets)
    # 사전 생성 PDF(올린 것만) — pdf/uploaded.json = 업로드된 파일 이름 목록, manifest.json = 쪽수
    uploaded = set(load(os.path.join(wd, 'pdf/uploaded.json'), []))
    pages = {m['file'][:-4]: m.get('pages') for m in load(os.path.join(wd, 'pdf/manifest-all.json'), [])}
    for st in gen_sets:
        n = f"{st['no']:02d}"
        pp = {}
        if f'set-{n}-paper' in uploaded:
            pp['paper'] = f'set-{n}-paper'
            if pages.get(f'set-{n}-paper'):
                pp['pages'] = pages[f'set-{n}-paper']
        if f'set-{n}-answers' in uploaded:
            pp['answers'] = f'set-{n}-answers'
        st['pdfPaths'] = pp
    access_ids = [a for a in os.environ.get('FORECAST_ACCESS_ACADEMY_IDS', '').split(',') if a]
    research_src = {f['examQ'].replace('논술형', 'S').replace(' ', '').lstrip('Q'): f for f in (load(os.path.join(wd, 'analysis/research.json'), {}) or {}).get('findings', [])}

    passages = []
    for i, p in enumerate(rng):
        code = p['code']
        hp = code.startswith('HP')
        tb = code.startswith('TB')
        passages.append({
            'code': code,
            'sourceGroup': '교과서' if tb else '학평' if hp else '올림포스',
            'sourceLabel': tb_label(p) if tb else hp_label(code) if hp else oly_label(code),
            'sortOrder': i + 1,
            'titleKo': p.get('titleKo') or code,
            'titleEn': p.get('titleEn') or None,
            'text': p['cleanText'],
            'sentences': p.get('sentences') or [],
            'footnotes': p.get('footnotes') or [],
            'analysis': {
                'source': p.get('source'), 'originalType': p.get('originalType'), 'originalQuestion': p.get('originalQuestion'),
                'irrelevantSentence': p.get('irrelevantSentence'), 'summarySentence': p.get('summarySentence'),
                'keyGrammar': p.get('keyGrammar'), 'keyVocab': p.get('keyVocab'), 'logicFlow': p.get('logicFlow'),
                'vendorPredictedTypes': p.get('vendorPredictedTypes'), 'wordCount': p.get('wordCount'),
            },
            'prediction': preds.get(code, {}),
        })

    # 기출 원본(reference)
    qs = []
    items = {it['key']: it for it in paper.get('items', [])}
    for k, q in enumerate(transcript.get('questions', [])):
        no = q['no']
        code = f"REF-{no if no.startswith('S') else no.zfill(2)}"
        src = REF_SOURCE.get(no)
        if not src:
            r = research_src.get(no)
            src = short_source(r['identifiedSource']) if r and r.get('confidence') in ('confirmed', 'likely') else '올림포스 9대 변별유형(추정)'
        passages.append({
            'code': code, 'sourceGroup': '기출', 'sourceLabel': f"2026 1학기 1차 {('논술형 ' + no[1:]) if no.startswith('S') else no + '번'} · {src}",
            'sortOrder': 1000 + k, 'titleKo': f"기출 {('논술형 ' + no[1:]) if no.startswith('S') else no + '번'}", 'titleEn': None,
            'text': plain((q.get('givenBox') or '') + '\n\n' + q['passage']).strip(), 'sentences': [], 'footnotes': q.get('footnotes') or [],
            'analysis': {'origin': src, 'layoutNotes': q.get('layoutNotes')}, 'prediction': {},
        })
        it = items.get(f'ref-{no}')
        key = refkey.get(no, {})
        qs.append({
            'code': code, 'passageCode': code, 'role': 'reference', 'qtype': it['qtype'],
            'kind': 'ESSAY' if no.startswith('S') else 'MC', 'difficulty': int(key.get('difficulty') or 3),
            'points': q['points'], 'body': it['body'], 'answer': key.get('answer') or '',
            'explanation': key.get('explanation') or '', 'rationale': key.get('designNote') or '',
            'transform': {'baseChanges': key.get('baseChanges') or []}, 'tags': ['기출', src], 'sortOrder': 100000 + k,
        })

    # 표시용 정리: 문장 번호(❶·S3) → 「셋째 문장」, 작업 문서 참조 제거 — 편집 오버레이(원문 해시 일치분)가 우선
    overlay = load(os.path.join(wd, 'gen/display-overlay.json'), {})
    used = {'overlay': 0, 'fallback': 0}
    for i, q in enumerate(qs):
        qs[i], _ = display(q, {})
    for q in gen_q:
        dq, how = display(q, overlay)
        used[how] += 1
        qs.append(dq)
    print('display text', used)

    # 근거 데이터(결정론): 지문별 「왜 이렇게 예측했나」 선례 + 봉투 회차의 기출 형식 일치표
    sem1 = load(os.path.join(wd, 'analysis/sem1-range-map.json'), {})
    print('passage evidence', passage_evidence(passages, qs, sem1))
    set_pages = {int(k[4:6]): v for k, v in pages.items() if re.match(r'set-\d\d-paper$', k) and v}
    fidelity = format_fidelity(qs, gen_sets, set_pages)
    if fidelity:
        analysis = {**analysis, 'fidelity': fidelity}
        print('fidelity', {r['label']: f"{r['match']}/{r['total']}" for r in fidelity['summary']})

    bundle = {
        'pack': {
            'slug': 'hanguang-2026-2mid',
            'schoolName': '한광고등학교',
            'title': '한광고 2학년 2학기 1차 정기시험 적중 예측',
            'subtitle': '범위 — 영어Ⅱ 교과서 NE능률(오선영) 1~3과 · 올림포스 9대 변별유형 Practice 07~08(빈칸 08~10) 19 · 2025년 9월 고2 학평 18 · 2024년 9월 고2 학평 7',
            'examMeta': {
                'gradeLabel': '2학년',
                'schoolLine': '한광고등학교 2학기 1차 정기시험 대비 동형 모의고사',
                'subjectLine': '영어Ⅱ (과목코드: 12)',
                'subjectShort': '영어Ⅱ',
                'footerRight': '이 문제지에 대한 저작권은 스모트(SMOAT)에 있습니다.',
                # 열람 허용 학원(비우면 원장 전원) — 학교 시험지 원본·교재 지문이 들어 있어 기본은 자기 학원만
                'access': {'academyIds': access_ids},
                'pdfFiles': sorted(uploaded),
            },
            'analysis': analysis,
            'rangeInfo': range_info,
            'status': 'published' if gen_q else 'draft',
        },
        'passages': passages,
        'questions': qs,
        'sets': gen_sets,
    }
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(bundle, f, ensure_ascii=False)
    print('passages', len(passages), 'questions', len(qs), 'sets', len(gen_sets))

if __name__ == '__main__':
    main()
