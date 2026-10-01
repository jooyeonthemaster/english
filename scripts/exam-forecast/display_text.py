"""문항 해설·출제 예측 문장의 표시용 정리 — 생성 단계의 작업 표기를 선생님이 읽는 말로 바꾼다.

생성 함대는 지문 문장을 ❶~❿·S1~S9 로, 기출 문항을 Q1~Q27·S1~S3 로, 작업 문서를 「레시피 §…」「브리프」로 가리킨다.
인쇄된 지문에는 문장 번호가 없고 작업 문서는 독자가 못 보므로, DB 에 넣기 전에 바꾼다.

  - 해설(explanation): 문장 번호만 「첫째 문장」… 으로 (내용은 그대로 — 정답 근거라 손대지 않는다)
  - 출제 예측(rationale)·설계(transform): 편집 워크플로가 다듬은 오버레이(원문 해시 일치 시)를 쓰고,
    없거나 낡았으면 아래 기계 정리로 대신한다.
"""
import hashlib, json, re

ORD = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째',
       '열한째', '열두째', '열셋째', '열넷째', '열다섯째']
CIRC = '❶❷❸❹❺❻❼❽❾❿'
# 「문장」(받침 ㅇ) 뒤에 붙는 조사 — 원래 숫자 읽기에 맞춰 붙은 받침 없는 조사를 고친다
PARTICLE = {'는': '은', '를': '을', '가': '이', '와': '과', '로': '으로', '라는': '이라는', '라고': '이라고', '다': '이다'}
# \b 는 한글도 단어 문자로 봐서 「D12를」「Q5를」처럼 조사가 붙으면 경계가 안 생긴다 — 영숫자 기준으로 끊는다
FORBID = re.compile(r'레시피|스펙\s*§|§|브리프|targetAnswer|targetRationale|(?<![A-Za-z0-9])Q\d{1,2}(?![0-9])|(?<![A-Za-z0-9])x[0-2](?![A-Za-z0-9])|[❶-❿]')


# 유형 코드 → 이름(src/lib/exam-forecast/types.ts FORECAST_QTYPES 의 label)
QTYPE_KO = {
    'TOPIC_KO': '주제(한글 선지)',
    'TOPIC_EN': '주제(영어 선지)',
    'TITLE_EN': '제목',
    'GIST_EN': '요지(영어 선지)',
    'GIST_KO': '요지(한글 선지)',
    'CLAIM_KO': '주장',
    'MISMATCH_KO': '내용 불일치(한글 선지)',
    'MISMATCH_EN': '내용 불일치(영어 선지)',
    'MATCH_EN': '내용 일치(영어 선지)',
    'REFERENCE': '지칭 대상',
    'CONNECTIVE_ABC': '연결어 (A)(B)(C)',
    'GRAMMAR_WRONG': '어법 — 틀린 것',
    'GRAMMAR_RIGHT_COMBO': '어법 — 맞는 것끼리 짝',
    'GRAMMAR_CHOICE_ABC': '어법 — 네모 (A)(B)(C)',
    'GRAMMAR_COUNT': '어법 — 틀린 개수',
    'VOCAB_WRONG': '어휘 — 적절하지 않은 낱말',
    'VOCAB_CHOICE_ABC': '어휘 — (A)(B)(C) 택일',
    'VOCAB_PHRASE_AWKWARD': '어휘 — 어색한 구',
    'BLANK': '빈칸',
    'BLANK_AB': '빈칸 (A),(B)',
    'IMPLICATION': '함축 의미',
    'ORDER': '글의 순서',
    'IRRELEVANT': '무관한 문장',
    'INSERTION': '문장 삽입',
    'SUMMARY': '요약문',
    'ESSAY_SUMMARY_ARRANGE': '논술형 — 요약문 [보기] 배열',
    'ESSAY_TOPIC_ARRANGE': '논술형 — 주제 [보기] 배열',
    'ESSAY_BLANK_ARRANGE_FIX': '논술형 — 빈칸 배열+어법 수정',
    'ESSAY_GRAMMAR_FIX': '논술형 — 어법 오류 고치기',
    'ESSAY_SENTENCE_ARRANGE': '논술형 — 문장 배열 영작',
    'ESSAY_SUMMARY_WRITE': '논술형 — 요약문 빈칸 쓰기',
    'ESSAY_WORD_FILL': '논술형 — 빈칸 낱말 쓰기',
}


def _ord(n):
    return ORD[n - 1] if 1 <= n <= len(ORD) else f'{n}번째'


def _fix_particle(m):
    p = m.group(1)
    return '문장' + PARTICLE.get(p, p)


def _run(text, token_re, num_of):
    """❶·❷ / S2~S3 같은 연속 표기를 「첫째·둘째 문장」으로. 뒤에 이미 「문장」이 있으면 덧붙이지 않는다."""
    pat = re.compile(rf'(문장\s)?({token_re}(?:\s?[·,~]\s?{token_re})*)(\s?문장)?')

    def rep(m):
        before, run, after = m.group(1), m.group(2), m.group(3)
        parts = re.split(r'(\s?[·,~]\s?)', run)
        words = [(_ord(num_of(p.strip())) if i % 2 == 0 else p.strip()) for i, p in enumerate(parts)]
        body = ''.join(words)
        if before:  # 「정답 문장 ❿」 → 「정답 문장(열째 문장)」
            return f'문장({body} 문장)' + (after or '')
        return body + (after if after else ' 문장')

    out = pat.sub(rep, text)
    out = re.sub(r'문장(라는|라고|는|를|가|와|로|다)(?![가-힣])', _fix_particle, out)
    out = re.sub(r'문장 (에서|에게|에|도|의|은|이|을|과|으로|만|까지|부터)(?=[\s,.)…\'’"”]|$)', r'문장\1', out)
    return out


def sentence_refs(text, s_numbers=True):
    if not text:
        return text
    out = _run(text, f'[{CIRC}]', lambda t: CIRC.index(t) + 1)
    out = _run(out, r'(?<![가-힣A-Za-z])문\d{1,2}(?![0-9])', lambda t: int(t[1:]))  # 「문4」 표기
    if s_numbers:
        out = _run(out, r'(?<![A-Za-z0-9])S\d{1,2}(?![0-9])', lambda t: int(t[1:]))
    return out


def clean_explanation(text):
    return sentence_refs(text, s_numbers=True)


def clean_rationale(text):
    """편집본이 없을 때의 기계 정리(최소한 작업 용어가 보이지 않게)."""
    if not text:
        return text
    s = text
    for _ in range(3):  # 작업 문서만 가리키는 괄호 통째로
        s = re.sub(r'\s*\([^()]*(레시피|스펙|브리프|§|target|(?<![A-Za-z0-9])x[0-2](?![A-Za-z0-9]))[^()]*\)', '', s)
    s = re.sub(r'(레시피|스펙)\s*§\s*[\d.]+\s*(개정대로|기준|의|에|에서|대로)?\s*', '', s)
    s = re.sub(r'브리프\s*(예측|리서치|설계안)?\s*', '지문 분석 ', s)
    s = re.sub(r'targetAnswer\s*', '정답 번호 ', s)
    s = re.sub(r'(기출\s*)?Q(\d{1,2})((?:\s?[·,~]\s?Q?\d{1,2})*)', lambda m: '기출 ' + m.group(2) + re.sub(r'Q', '', m.group(3) or '') + '번', s)
    s = re.sub(r'(기출\s*)?(논술형\s*)?(?<![A-Za-z0-9])S([1-3])(?![0-9])', lambda m: '기출 논술형 ' + m.group(3), s)
    s = re.sub(r'번(라는|는|를|가|와|로)(?![가-힣])', lambda m: '번' + PARTICLE.get(m.group(1), m.group(1)), s)  # 「Q5를」 → 「기출 5번을」
    s = sentence_refs(s, s_numbers=False)
    s = re.sub(r'(?<![A-Z_])(' + '|'.join(sorted(QTYPE_KO, key=len, reverse=True)) + r')(?![A-Z_])', lambda m: QTYPE_KO[m.group(1)], s)
    s = re.sub(r'(기출 [^()]{1,14})\(\1\)', r'\1', s)  # 「기출 논술형 2(기출 논술형 2)」
    s = re.sub(r'[,·]\s*\)', ')', s)  # 「(… 줄표, 스펙 §2.2)」에서 참조만 지워져 남은 「, )」
    s = re.sub(r'\(\s*[,·]\s*', '(', s)
    s = re.sub(r'\s{2,}', ' ', s).replace(' .', '.').replace('()', '').replace(' )', ')')
    return s.strip()


SLOT_PARTICLE = {'을': '를', '이': '가', '은': '는', '과': '와', '으로': '로', '이다': '다'}


def plain_terms(s):
    """편집본에도 남는 작업 용어 — 토큰→낱말, 슬롯→자리(받침이 달라 조사도 고친다)."""
    if not s:
        return s
    s = re.sub(r'\s*\([^()]*블라인드 풀이[^()]*\)', '', s)  # 괄호 속 검수 기록(「블라인드 풀이 2명이 …」)
    s = s.replace('토큰으로', '토큰로')  # 「낱말」은 ㄹ 받침 — 으로 → 로
    s = re.sub(r'1\s*토큰', '한 낱말', s)
    s = re.sub(r'1~2\s*토큰', '한두 낱말', s)
    s = s.replace('토큰', '낱말')
    s = re.sub(r'슬롯(으로|이다|을|이|은|과)(?![가-힣])', lambda m: '자리' + SLOT_PARTICLE[m.group(1)], s)
    return s.replace('슬롯', '자리')


def source_hash(q):
    t = q.get('transform') or {}
    return hashlib.sha1(json.dumps([q.get('rationale') or '', t.get('targetRationale', ''), t.get('distractorDesign', '')], ensure_ascii=False).encode()).hexdigest()[:12]


def _dids(s):
    return sorted(set(re.findall(r'(?<![A-Za-z0-9])D\d{2}(?![0-9])', s or '')))


def overlay_ok(orig, ed):
    """편집본 게이트 — 작업 용어 없음 · 원리 번호 보존 · 과도한 축약 없음."""
    for f in ('rationale', 'targetRationale', 'distractorDesign'):
        o, n = orig.get(f) or '', ed.get(f) or ''
        if FORBID.search(n):
            return False, f'{f}: forbidden token'
        if [d for d in _dids(o) if d not in _dids(n)]:
            return False, f'{f}: doctrine id lost'
        if len(o) > 60 and len(n) < len(o) * 0.55:
            return False, f'{f}: too short'
    return True, ''


def display(q, overlay):
    """DB 에 넣을 표시본. overlay = {code: {hash, rationale, targetRationale, distractorDesign}}"""
    q = dict(q)
    t = dict(q.get('transform') or {})
    orig = {'rationale': q.get('rationale') or '', 'targetRationale': t.get('targetRationale', ''), 'distractorDesign': t.get('distractorDesign', '')}
    ed = (overlay or {}).get(q['code'])
    used = 'fallback'
    if ed and ed.get('hash') == source_hash(q) and overlay_ok(orig, ed)[0]:
        q['rationale'] = ed['rationale']
        t['targetRationale'], t['distractorDesign'] = ed['targetRationale'], ed['distractorDesign']
        used = 'overlay'
    else:
        q['rationale'] = clean_rationale(orig['rationale'])
        if 'targetRationale' in t:
            t['targetRationale'] = clean_rationale(t['targetRationale'])
        if 'distractorDesign' in t:
            t['distractorDesign'] = clean_rationale(t['distractorDesign'])
    q['rationale'] = plain_terms(q['rationale'])
    for f in ('targetRationale', 'distractorDesign'):
        if f in t:
            t[f] = plain_terms(t[f])
    if t.get('baseChanges'):
        # 원문 변경 기록의 S1~S9 는 문장 번호 — 먼저 「첫째 문장」으로 바꾼 뒤 작업 문서 참조를 지운다(순서가 바뀌면 S2 가 「기출 논술형 2」가 된다)
        t['baseChanges'] = [plain_terms(clean_rationale(sentence_refs(c, s_numbers=True))) for c in t['baseChanges']]
    q['transform'] = t
    q['explanation'] = plain_terms(clean_explanation(q.get('explanation') or ''))
    if q.get('qtype') in ('VOCAB_CHOICE_ABC', 'GRAMMAR_CHOICE_ABC') and q.get('body'):
        # 택일 쌍 「limit / expand」가 슬래시에서 줄이 꺾이지 않게(줄바꿈 없는 공백)
        b = dict(q['body'])
        b['passage'] = re.sub(r'<u>([^<]*?) / ([^<]*?)</u>', '<u>\\1 / \\2</u>', b.get('passage') or '')
        b['passage'] = re.sub(r'\(([A-C])\) <u>', '(\\1) <u>', b['passage'])  # 라벨 (B)가 줄 끝에 홀로 남지 않게
        q['body'] = b
    if q.get('qtype') == 'IMPLICATION' and q.get('body'):
        # 밑줄 끝 문장부호는 밑줄 밖(기출·회차 다른 밑줄과 같게)
        b = dict(q['body'])
        b['passage'] = re.sub(r'([.,;:!?])</u>', r'</u>\1', b.get('passage') or '')
        q['body'] = b
    return q, used
