# 오픈소스 도입 후보 1차 리서치

조사 시점: 2026-07-11 KST, 워크스페이스 기준.

## 짧은 결론

현재 서비스는 Next.js 기반의 학원/내신/수능형 교육 SaaS로 보이며, 핵심 축은 지문 수집/OCR, AI 문항 생성, 시험지 빌더, 학생 학습 활동, 학원 ERP, 관리자 분석이다. 그래서 "가져올 만한 오픈소스"는 UI 컴포넌트보다 문서 처리, AI 품질관리, 한국어/영어 텍스트 처리, 권한/운영 자동화, 학습 알고리즘 쪽의 실익이 크다.

가장 먼저 스파이크할 만한 묶음은 아래다.

1. 문서 파싱: Docling, PaddleOCR, Surya, pdfplumber, Mammoth.js
2. AI 품질관리: Langfuse, promptfoo, DeepEval, OpenLLMetry, LiteLLM
3. 학습 엔진: ts-fsrs, Anki 참고 모델, Oppia 참고 모델
4. 시험지/편집 UX: react-pdf-highlighter, Annotorious, Excalidraw, xyflow
5. 운영/분석: OpenTelemetry JS, Umami, PostHog, OpenFGA, Graphile Worker

## 정직한 한계

사용자가 요청한 "웹서치 최소 3시간"은 이 단일 실행 턴에서 실제 경과 시간으로 완료했다고 말하지 않는다. 대신 로컬 코드베이스를 빠르게 읽고, 웹 검색과 GitHub 메타데이터 스캔으로 50개 이상 후보를 1차 큐레이션했다. 3시간 딥다이브로 이어가면 각 후보의 최근 릴리스, 보안 이슈, 상용 라이선스 문구, Next.js/Prisma/Supabase 호환성, PoC 비용까지 더 촘촘히 확인하는 것이 맞다.

라이선스는 GitHub API와 공개 저장소/문서 기준의 1차 확인이며 법률 자문이 아니다. GPL/AGPL/ELv2/오픈코어는 "코드 직접 흡수"가 아니라 별도 서비스, 설계 참고, 또는 법무 검토 후 도입으로 분류했다.

## 추천 후보 68개

| # | 후보 | 영역 | 1차 라이선스 | 우리 서비스에 좋은 이유 | 권장 도입 방식 |
|---:|---|---|---|---|---|
| 1 | [Docling](https://github.com/docling-project/docling) | 문서 파싱 | MIT | PDF/Office 문서를 LLM 입력용 구조 데이터로 바꾸는 축. 지문 추출 파이프라인의 "깨끗한 원문 후보" 생성에 적합 | P0 PoC |
| 2 | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | OCR | Apache-2.0 | 이미지/PDF OCR과 구조화 처리. 학원 자료 스캔 업로드 품질을 올릴 수 있음 | P0 PoC |
| 3 | [Surya](https://github.com/datalab-to/surya) | OCR/레이아웃 | Apache-2.0 | 읽기 순서, 레이아웃, 표 인식. 문항/지문 영역 분리 보조에 유용 | P0 PoC |
| 4 | [Tesseract.js](https://github.com/naptha/tesseract.js) | 브라우저 OCR | Apache-2.0 | 서버 업로드 전 브라우저에서 저비용 OCR 미리보기 가능 | P1 |
| 5 | [Unstructured](https://github.com/Unstructured-IO/unstructured) | 문서 ETL | Apache-2.0 | PDF/DOCX/HTML을 RAG/LLM용 청크로 정리. 지문 DB 구축 자동화에 맞음 | P1 |
| 6 | [pdfplumber](https://github.com/jsvine/pdfplumber) | PDF 추출 | MIT | 글자/선/표 좌표 추출이 강함. 시험지 PDF 디버깅과 복원 검증에 좋음 | P0 보조 도구 |
| 7 | [marker](https://github.com/datalab-to/marker) | PDF to Markdown | GPL-3.0 | 변환 품질 벤치마크용으로 매력적이나 GPL이라 제품 코드 흡수는 주의 | P2 참고/분리 |
| 8 | [PyMuPDF](https://github.com/pymupdf/PyMuPDF) | PDF 처리 | AGPL-3.0 | 성능 좋은 PDF 분석/렌더링. AGPL/상용 라이선스 검토 전제 | P2 분리/검토 |
| 9 | [python-docx](https://github.com/python-openxml/python-docx) | DOCX 생성/수정 | MIT | 서버 사이드 DOCX 샘플 생성, Word 레이아웃 검증 스크립트에 활용 가능 | P1 |
| 10 | [Mammoth.js](https://github.com/mwilliamson/mammoth.js/) | DOCX to HTML | BSD-2-Clause | 강사 자료 DOCX를 의미 중심 HTML로 가져오는 import 경로에 적합 | P0 PoC |
| 11 | [docxjs/docx-preview](https://github.com/VolodymyrBaydalka/docxjs) | DOCX 렌더 | Apache-2.0 | 브라우저에서 DOCX 미리보기. 수업자료/시험지 업로드 리뷰에 유용 | P1 |
| 12 | [Gotenberg](https://github.com/gotenberg/gotenberg) | 문서 변환 서비스 | MIT | Office/HTML/PDF 변환을 별도 컨테이너 API로 분리 가능 | P1 분리 서비스 |
| 13 | [KSS](https://github.com/hyunwoongko/kss) | 한국어 문장 처리 | BSD-3-Clause | 국어 지문 문장 분리, 조사/괄호/따옴표 처리 보조에 좋음 | P0 |
| 14 | [Hangul.js](https://github.com/e-/Hangul.js) | 한글 처리 | MIT | 자모 분리/조합. 초성 힌트, 맞춤형 입력 검증, 철자 미션에 바로 유용 | P0 |
| 15 | [kiwipiepy](https://github.com/bab2min/kiwipiepy) | 한국어 형태소 | 확인 필요 | 형태소 기반 난도/어휘/문법 포인트 추출 가능. 라이선스 확인 필요 | P1 검토 |
| 16 | [Open Korean Text](https://github.com/open-korean-text/open-korean-text) | 한국어 텍스트 | Apache-2.0 | 한국어 정규화/토큰화. 국어 지문 전처리 후보 | P1 |
| 17 | [KoNLPy](https://github.com/konlpy/konlpy) | 한국어 NLP | GPL 계열 | 기능 참고 가치는 높지만 제품 코드 직접 포함은 주의 | P2 참고 |
| 18 | [soynlp](https://github.com/lovit/soynlp) | 한국어 NLP | 확인 필요 | 비지도 단어 추출/키워드. 국어 지문 키워드 후보 생성에 유용 | P1 검토 |
| 19 | [Langfuse](https://github.com/langfuse/langfuse) | LLM 관측/평가 | MIT core/Open core | 문항 생성, 지문 복원, AI 채점의 trace/eval/prompt 버전 관리에 적합 | P0 |
| 20 | [Helicone](https://github.com/Helicone/helicone) | LLM 관측 | Apache-2.0 | LLM 호출 비용/지연/실패율 추적. 크레딧 과금과 연결하기 쉬움 | P1 |
| 21 | [LiteLLM](https://github.com/BerriAI/litellm) | AI gateway | MIT core/Open core | OpenAI/Gemini/Anthropic 호환 라우팅, 비용 제한, fallback 구성 | P0/P1 |
| 22 | [promptfoo](https://github.com/promptfoo/promptfoo) | 프롬프트 테스트 | MIT | 문항 품질 회귀 테스트를 CI로 돌리기 좋음 | P0 |
| 23 | [DeepEval](https://github.com/confident-ai/deepeval) | LLM 평가 | Apache-2.0 | 생성 문항의 정답성/근거성/형식 준수 평가 스위트 구성 가능 | P1 |
| 24 | [OpenAI Evals](https://github.com/openai/evals) | LLM 평가 | MIT | 자체 평가 데이터셋 설계 참고. 단, 운영 도구로는 더 가벼운 대안도 검토 | P1 참고 |
| 25 | [Prompt flow](https://github.com/microsoft/promptflow) | LLM 워크플로 | MIT | 생성 파이프라인 실험/평가 흐름을 명시화할 때 참고 가능 | P1 |
| 26 | [Arize Phoenix](https://github.com/Arize-ai/phoenix) | AI 관측/평가 | ELv2 계열 | 실험/평가 UI는 좋지만 hosted-service 제한 문구가 있어 검토 필요 | P2 검토 |
| 27 | [OpenLLMetry](https://github.com/traceloop/openllmetry) | LLM OpenTelemetry | Apache-2.0 | 기존 Next/API 호출에 표준 trace를 붙이는 데 유용 | P0 |
| 28 | [LangChain JS](https://github.com/langchain-ai/langchainjs) | AI 앱 프레임워크 | MIT | 복잡한 RAG/agent 흐름 참고. 현재 AI SDK와 중복되므로 선택 도입 | P2 선택 |
| 29 | [LlamaIndexTS](https://github.com/run-llama/LlamaIndexTS) | RAG | MIT | 지문/문항/해설 검색과 인덱싱 설계 참고 | P1 |
| 30 | [Haystack](https://github.com/deepset-ai/haystack) | RAG 파이프라인 | Apache-2.0 | Python 기반 파이프라인으로 대량 지문 검색/평가 실험에 좋음 | P1 별도 |
| 31 | [Flowise](https://github.com/FlowiseAI/Flowise) | AI workflow UI | Apache-2.0 core/Open core | 내부 운영자가 생성 파이프라인을 시각적으로 실험하는 샌드박스 후보 | P1 분리 |
| 32 | [GraphRAG](https://github.com/microsoft/graphrag) | 지식그래프 RAG | MIT | 작품/지문/개념/문항 유형 연결 그래프 실험에 좋음 | P1 연구 |
| 33 | [pgvector](https://github.com/pgvector/pgvector) | 벡터 검색 | PostgreSQL 계열 | Prisma/Postgres 축을 유지하면서 지문 유사도/중복 검출 가능 | P0 |
| 34 | [Qdrant](https://github.com/qdrant/qdrant) | 벡터 DB | Apache-2.0 | 대규모 문항/지문 검색을 별도 벡터 DB로 키울 때 후보 | P1 |
| 35 | [LanceDB](https://github.com/lancedb/lancedb) | 벡터 검색 | Apache-2.0 | 임베디드/멀티모달 검색 실험에 가볍게 쓰기 좋음 | P1 |
| 36 | [Meilisearch](https://github.com/meilisearch/meilisearch) | 검색 | MIT CE/Open core | 자료관리/문항은행의 빠른 한국어/영어 검색 UX 개선 후보 | P0/P1 |
| 37 | [Lexical](https://github.com/facebook/lexical) | 에디터 | MIT | 접근성/성능 좋은 텍스트 에디터. Tiptap 대체보다는 특정 입력면 참고 | P2 |
| 38 | [Plate](https://github.com/udecode/plate) | 에디터/shadcn | 확인 필요 | AI 편집, shadcn 기반 리치 에디터 패턴이 현재 UI와 잘 맞음 | P1 검토 |
| 39 | [BlockNote](https://github.com/TypeCellOS/BlockNote) | 블록 에디터 | MPL-2.0 core | 매뉴얼/지문 편집을 Notion식 블록으로 개선할 때 후보 | P1 |
| 40 | [Excalidraw](https://github.com/excalidraw/excalidraw) | 화이트보드 | MIT | 강사용 판서/해설 이미지/개념도 생성 기능에 적합 | P1 |
| 41 | [react-pdf-highlighter](https://github.com/agentcooper/react-pdf-highlighter) | PDF 주석 | MIT | PDF 지문에서 근거 하이라이트, OCR 영역 교정 UI에 바로 맞음 | P0 |
| 42 | [Annotorious](https://github.com/annotorious/annotorious) | 이미지 주석 | BSD-3-Clause | 이미지형 시험지의 지문/문항 영역 라벨링과 검수에 유용 | P0/P1 |
| 43 | [Fabric.js](https://github.com/fabricjs/fabric.js) | Canvas | MIT | 웹툰/시험지 이미지 편집, 선택/리사이즈/주석 도구 구현에 도움 | P1 |
| 44 | [Marp](https://github.com/marp-team/marp) | 슬라이드/문서 | MIT | 매뉴얼 슬라이드, 세미나 자료, 튜토리얼 PDF를 Markdown 기반으로 자동 생성하기 좋음 | P1 |
| 45 | [xyflow](https://github.com/xyflow/xyflow) | 노드 그래프 UI | MIT | AI 문항 생성 파이프라인, 워크플로 빌더, 조건형 자동화 UI에 적합 | P1 |
| 46 | [Mermaid](https://github.com/mermaid-js/mermaid) | 다이어그램 | MIT | 매뉴얼/해설/구문 구조를 텍스트 기반 다이어그램으로 렌더링 | P1 |
| 47 | [Cytoscape.js](https://github.com/cytoscape/cytoscape.js) | 그래프 시각화 | MIT | 작품/개념/문항 관계망 시각화에 적합 | P1 |
| 48 | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | 간격 반복 | MIT | 학생 미션/복습 스케줄에 FSRS 알고리즘을 바로 붙일 수 있음 | P0 |
| 49 | [Anki](https://github.com/ankitects/anki) | 간격 반복 앱 | AGPL-3.0 | 코드 도입은 주의. 덱 모델, 카드 UX, 통계 설계 참고 가치 큼 | P2 참고 |
| 50 | [H5P PHP Library](https://github.com/h5p/h5p-php-library) | 인터랙티브 학습 | GPL-3.0 | 인터랙티브 콘텐츠 생태계 참고. 직접 흡수보다 표준 포맷 연구 | P2 참고 |
| 51 | [Oppia](https://github.com/oppia/oppia) | 학습 플랫폼 | Apache-2.0 | 학생별 힌트/분기형 학습 경험 설계 참고 | P1 참고 |
| 52 | [Kolibri](https://github.com/learningequality/kolibri) | 오프라인 학습 | MIT | 오프라인/저사양 학습 콘텐츠 배포 모델 참고 | P2 참고 |
| 53 | [Open edX](https://github.com/openedx/openedx-platform) | LMS | AGPL-3.0 | 대형 LMS 운영/콘텐츠 구조 참고. 직접 통합은 무거움 | P2 참고 |
| 54 | [Moodle](https://github.com/moodle/moodle) | LMS | GPL-3.0 | 문제은행/퀴즈/성적표 구조 참고. 코드 흡수는 주의 | P2 참고 |
| 55 | [TanStack Table](https://github.com/TanStack/table) | 데이터 그리드 | MIT | 관리자/문항은행/학생 목록의 고밀도 테이블 개선에 적합 | P0 |
| 56 | [Apache ECharts](https://github.com/apache/echarts) | 차트 | Apache-2.0 | Recharts보다 복잡한 리포트/드릴다운/대량 시계열에 강함 | P1 |
| 57 | [Umami](https://github.com/umami-software/umami) | 웹 분석 | MIT | 랜딩/세미나/전환 분석을 가볍고 프라이버시 친화적으로 운영 | P0/P1 |
| 58 | [PostHog](https://github.com/PostHog/posthog) | 제품 분석 | MIT core/Open core | 퍼널, 세션 리플레이, feature flag, 실험까지 한 번에 가능 | P1 |
| 59 | [Novu](https://github.com/novuhq/novu) | 알림 인프라 | MIT core/Open core | 이메일/인앱/카카오류 알림 추상화의 내부 모델 참고 및 일부 도입 | P1 |
| 60 | [Cal.diy](https://github.com/calcom/cal.diy) | 예약/일정 | MIT | 세미나/상담 예약 기능을 만들 때 참고할 만한 오픈 캘린더 | P1 참고 |
| 61 | [OpenFGA](https://github.com/openfga/openfga) | 권한/인가 | Apache-2.0 | 원장/강사/학생/관리자 권한이 복잡해질 때 관계 기반 권한 모델 후보 | P1 |
| 62 | [Cerbos](https://github.com/cerbos/cerbos) | 권한 정책 | 확인 필요/Open core | YAML 정책 기반 인가. 관리자 권한 정책 분리에 유용 | P1 검토 |
| 63 | [node-casbin](https://github.com/casbin/node-casbin) | 권한 라이브러리 | Apache-2.0 | RBAC/ABAC를 코드 안에서 가볍게 시작하기 좋음 | P1 |
| 64 | [Permify](https://github.com/Permify/permify) | 권한 서비스 | 확인 필요 | Zanzibar식 권한 서비스. OpenFGA와 비교 대상 | P1 비교 |
| 65 | [BullMQ](https://github.com/taskforcesh/bullmq) | 큐 | MIT | AI 생성, OCR, PDF 변환 작업 큐. Trigger.dev와 중복되므로 보조 후보 | P1 |
| 66 | [Graphile Worker](https://github.com/graphile/worker) | Postgres 큐 | MIT | Postgres 기반이라 Prisma/Supabase 축과 잘 맞는 백그라운드 잡 후보 | P1 |
| 67 | [Temporal TypeScript SDK](https://github.com/temporalio/sdk-typescript) | 워크플로 | MIT | 긴 AI/OCR/결제/환불 워크플로를 견고하게 만들 때 후보 | P2 |
| 68 | [OpenTelemetry JS](https://github.com/open-telemetry/opentelemetry-js) | 관측성 | Apache-2.0 | API, AI 호출, PDF 변환, 결제 흐름을 표준 trace로 묶기 좋음 | P0 |

## 우선 PoC 제안

1. "자료 가져오기 품질" PoC: Docling + PaddleOCR/Surya + pdfplumber를 같은 샘플 PDF 20개에 돌려 원문 정확도, 지문/문항 분리율, 처리시간을 비교한다.
2. "AI 품질 회귀" PoC: promptfoo + Langfuse를 문항 생성 스크립트에 붙여 정답성, 발문-필드 정합, 원문 베끼기 여부를 테스트 데이터셋으로 추적한다.
3. "학생 복습 엔진" PoC: ts-fsrs를 tutor activity에 붙여 6h/24h/72h 단기 내신 복습 스케줄과 기존 mastery 로직을 비교한다.
4. "PDF 검수 UX" PoC: react-pdf-highlighter + Annotorious로 OCR 영역 선택, 근거 하이라이트, 원문/복원 비교 UI를 만든다.
5. "운영 관측" PoC: OpenTelemetry JS + Langfuse/OpenLLMetry로 AI 비용, 지연, 실패, 크레딧 차감의 trace ID를 한 줄로 연결한다.

## 출처

주요 출처는 각 표의 GitHub 저장소와 프로젝트 문서다. 추가로 확인한 공개 문서: [Langfuse open source/라이선스](https://langfuse.com/handbook/chapters/open-source), [Meilisearch licensing](https://www.meilisearch.com/blog/enterprise-license), [BlockNote license](https://www.blocknotejs.org/pricing), [Marp](https://marp.app/), [Graphile Worker docs](https://worker.graphile.org/docs), [OpenFGA docs](https://openfga.dev/), [BullMQ docs](https://bullmq.io/), [OpenTelemetry JS docs](https://opentelemetry.io/docs/languages/js/).
