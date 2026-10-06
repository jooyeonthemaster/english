"""생성 과제 브리프 조립 — 지문당 과제를 5문항씩 묶어 jobs/<id>.json 으로.

  python scripts/exam-forecast/build-jobs.py <work-dir> [--only CODE,CODE] [--items=<codes.json>]
  (--items: 그 문항 코드만 과제로 → gen/jobs/<지문>__rNN.json · gen/jobs-index-items.json)

입력  gen/blueprint.json · range/range-passages.json · analysis/predictions.json
출력  gen/jobs/<jobId>.json (작성 에이전트가 읽는 브리프) · gen/jobs-index.json (워크플로 args)
브리프 = { jobId, passage{code,sourceLabel,originalType,text,sentences,originalQuestion,keyGrammar,keyVocab,…},
           prediction{…}, items[{code,qtype,difficulty,points,targetAnswer,setNo,number,variant}],
           siblings[{code,qtype}] }  — siblings = 같은 지문의 다른 과제(출제 지점이 겹치지 않게 참고).
"""
import json, os, sys

CHUNK = 5


def main():
    wd = sys.argv[1]
    only = None
    items_only = None  # --items=<json 파일: 문항 코드 목록> — 그 문항만 과제로(형제 과제는 지문 전체를 그대로 참고)
    for a in sys.argv[2:]:
        if a.startswith('--only'):
            only = set(a.split('=', 1)[1].split(',')) if '=' in a else None
        if a.startswith('--items='):
            items_only = set(json.load(open(a.split('=', 1)[1], encoding='utf-8')))
    bp = json.load(open(os.path.join(wd, 'gen/blueprint.json'), encoding='utf-8'))
    passages = {p['code']: p for p in json.load(open(os.path.join(wd, 'range/range-passages.json'), encoding='utf-8'))}
    preds = {p['code']: p for p in json.load(open(os.path.join(wd, 'analysis/predictions.json'), encoding='utf-8'))}
    os.makedirs(os.path.join(wd, 'gen/jobs'), exist_ok=True)
    index = []
    for code, tasks in bp['perPassage'].items():
        if only and code not in only:
            continue
        p = passages[code]
        tasks = sorted(tasks, key=lambda t: (t.get('setNo') is None, t.get('setNo') or 0, t['qtype']))
        siblings_all = [{'code': t['code'], 'qtype': t['qtype'], 'difficulty': t['difficulty']} for t in tasks]
        if items_only is not None:
            tasks = [t for t in tasks if t['code'] in items_only]
            if not tasks:
                continue
        for k in range(0, len(tasks), CHUNK):
            chunk = tasks[k:k + CHUNK]
            job_id = f"{code}__{'r' if items_only is not None else 'j'}{k // CHUNK + 1:02d}"
            codes = {t['code'] for t in chunk}
            brief = {
                'jobId': job_id,
                'passage': {
                    'code': code, 'source': p.get('source'), 'originalType': p.get('originalType'), 'titleKo': p.get('titleKo'),
                    'text': p['cleanText'], 'sentences': p.get('sentences'), 'wordCount': p.get('wordCount'),
                    'originalQuestion': p.get('originalQuestion'), 'irrelevantSentence': p.get('irrelevantSentence'),
                    'summarySentence': p.get('summarySentence'), 'keyGrammar': p.get('keyGrammar'), 'keyVocab': p.get('keyVocab'),
                    'logicFlow': p.get('logicFlow'), 'originalFootnotes': p.get('footnotes'),
                },
                'prediction': preds.get(code, {}),
                'items': [{
                    'code': t['code'], 'qtype': t['qtype'], 'difficulty': t['difficulty'], 'points': t['points'],
                    'targetAnswer': t.get('targetAnswer') or '', 'setNo': t.get('setNo'), 'number': t.get('number'),
                    'variant': t.get('variant') or (f"봉투 {t['setNo']}회 {('논술형 ' + str(t['number'] - 100)) if (t.get('number') or 0) > 100 else str(t.get('number')) + '번'}" if t.get('setNo') else '확장'),
                } for t in chunk],
                'siblings': [s for s in siblings_all if s['code'] not in codes],
            }
            json.dump(brief, open(os.path.join(wd, 'gen/jobs', job_id + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            index.append({'id': job_id, 'passageCode': code, 'items': [{'code': t['code'], 'qtype': t['qtype'], 'targetAnswer': t.get('targetAnswer') or ''} for t in chunk]})
    # --items 로 고른 추가 과제는 원래 색인을 덮지 않는다(과제 이름도 __rNN)
    index_name = 'gen/jobs-index-items.json' if items_only is not None else 'gen/jobs-index.json'
    json.dump(index, open(os.path.join(wd, index_name), 'w', encoding='utf-8'), ensure_ascii=False)
    print('jobs', len(index), 'items', sum(len(j['items']) for j in index))


if __name__ == '__main__':
    main()
