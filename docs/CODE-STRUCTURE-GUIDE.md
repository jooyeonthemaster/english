# 코드 구조 가이드

> 이 프로젝트의 코드 분리 및 구조화 규칙

---

## 1. 핵심 규칙

### 1.1 파일 크기 제한
- **모든 파일은 500줄 이내**로 유지
- 500줄 초과 시 반드시 분리
- 단순히 줄 수로 자르지 않고, **기능/역할 단위**로 분리

### 1.2 분리 기준
파일 분리 시 다음 순서로 고려:

1. **타입/인터페이스** → `types.ts`
2. **상수/설정값** → `constants.ts` 또는 `constants/` 폴더
3. **유틸리티 함수** → `utils/` 폴더
4. **API 호출 로직** → `api/` 또는 `services/` 폴더
5. **커스텀 훅** → `hooks/` 폴더
6. **하위 UI 컴포넌트** → `components/` 폴더
7. **메인 컴포넌트** → `index.tsx`

---

## 2. React 컴포넌트 분리 패턴

### 2.1 폴더 구조 (500줄 초과 컴포넌트)

```
ComponentName/
├── types.ts                 # 타입 정의
├── constants.ts             # 상수 (또는 constants/ 폴더)
├── constants/
│   ├── options.ts           # 옵션 데이터
│   └── messages.ts          # 메시지/텍스트 데이터
├── utils/
│   └── helperFunction.ts    # 유틸리티 함수
├── hooks/
│   └── useCustomHook.ts     # 커스텀 훅
├── components/
│   ├── SubComponent1.tsx    # 하위 컴포넌트
│   └── SubComponent2.tsx
└── index.tsx                # 메인 컴포넌트 (진입점)
```

### 2.2 타입 export 패턴

```typescript
// types.ts
export interface ComponentProps {
  // ...
}

export interface DataType {
  // ...
}

// index.tsx - 타입 re-export
export type { ComponentProps, DataType } from './types';
```

### 2.3 상수 분리 기준
- **10줄 이하**: 메인 파일에 유지
- **10-50줄**: `constants.ts` 단일 파일
- **50줄 이상**: `constants/` 폴더로 분리

### 2.4 컴포넌트 분리 기준
- **독립적인 UI 섹션**: 별도 컴포넌트로 분리
- **재사용 가능한 UI**: 별도 컴포넌트로 분리
- **100줄 이상의 JSX 블록**: 분리 고려

---

## 3. Next.js API 라우트 분리 패턴

### 3.1 폴더 구조 (500줄 초과 API)

```
api/feature-name/
├── types.ts                 # API 요청/응답 타입
├── prompts/                 # AI 프롬프트 (해당 시)
│   ├── systemPrompt.ts
│   └── promptBuilder.ts
├── services/
│   ├── externalApi.ts       # 외부 API 호출
│   └── dataProcessor.ts     # 데이터 처리
├── utils/
│   ├── validator.ts         # 유효성 검사
│   └── errorHandler.ts      # 에러 처리
└── route.ts                 # 메인 라우트 (100줄 이내 권장)
```

### 3.2 route.ts 구조

```typescript
// route.ts - 깔끔하게 유지
import { NextRequest, NextResponse } from 'next/server';
import { RequestBodyType } from './types';
import { buildPrompt } from './prompts/promptBuilder';
import { callExternalApi } from './services/externalApi';
import { processData } from './services/dataProcessor';
import { transformError } from './utils/errorHandler';

export const maxDuration = 300; // Vercel Pro

export async function POST(req: NextRequest) {
  try {
    const body: RequestBodyType = await req.json();

    // 1. 입력 검증
    // 2. 비즈니스 로직 (서비스 함수 호출)
    // 3. 응답 반환

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = transformError(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
```

---

## 4. 3D/Canvas 컴포넌트 분리 패턴

### 4.1 폴더 구조

```
Renderer3D/
├── types.ts                 # 타입 정의
├── constants.ts             # 색상, 폰트 맵 등
├── layers/
│   ├── Layer1.tsx           # 개별 레이어 컴포넌트
│   └── Layer2.tsx
├── utils/
│   └── layerGenerator.ts    # 레이어 생성 로직
├── scenes/
│   ├── MainScene.tsx        # 메인 씬
│   └── CaptureScene.tsx     # 캡처용 씬
└── index.tsx                # 메인 렌더러
```

### 4.2 스타일별 로직 분리
- 스타일/테마별 분기가 많은 경우 → `utils/styleGenerator.ts`로 분리
- switch문이 100줄 이상 → 각 case를 별도 함수로 분리

---

## 5. 파일 명명 규칙

### 5.1 컴포넌트
- PascalCase: `ComponentName.tsx`
- 폴더명도 PascalCase: `ComponentName/`

### 5.2 유틸리티/서비스
- camelCase: `helperFunction.ts`, `apiService.ts`

### 5.3 타입/상수
- camelCase: `types.ts`, `constants.ts`
- 여러 파일: `types/index.ts`, `constants/options.ts`

### 5.4 훅
- camelCase with use prefix: `useCustomHook.ts`

---

## 6. Import 순서

```typescript
// 1. React/Next.js
import { useState, useEffect } from 'react';
import { NextRequest, NextResponse } from 'next/server';

// 2. 외부 라이브러리
import { Canvas } from '@react-three/fiber';

// 3. 내부 타입
import { ComponentProps, DataType } from './types';

// 4. 내부 상수
import { OPTIONS, MESSAGES } from './constants';

// 5. 내부 유틸리티
import { helperFunction } from './utils/helper';

// 6. 내부 훅
import { useCustomHook } from './hooks/useCustomHook';

// 7. 내부 컴포넌트
import SubComponent from './components/SubComponent';
```

---

## 7. 미사용 코드 정책

### 7.1 삭제 기준
- **import되지 않는 파일**: 즉시 삭제
- **주석 처리된 코드**: 즉시 삭제 (Git 히스토리 활용)
- **deprecated 표시된 코드**: 대체 코드 확인 후 삭제

### 7.2 확인 방법
```bash
# 특정 export가 사용되는지 확인
grep -r "importName" src/

# 파일이 import되는지 확인
grep -r "from './FileName'" src/
grep -r "from '../FileName'" src/
```

---

## 8. 실제 적용 예시

### 8.1 CompositionInputStep (618줄 → 12개 파일)

```
CompositionInputStep/
├── types.ts                    (35줄)
├── constants/
│   ├── categories.ts           (20줄)
│   ├── styles.ts               (15줄)
│   ├── keywordMessages.ts      (75줄)
│   └── previewImages.ts        (20줄)
├── components/
│   ├── CategorySelector.tsx    (50줄)
│   ├── StyleSelector.tsx       (40줄)
│   ├── EventInfoFields.tsx     (90줄)
│   ├── PreviewPanel.tsx        (80줄)
│   └── MessageInputPanel.tsx   (120줄)
├── hooks/
│   └── useCompositionForm.ts   (60줄)
└── index.tsx                   (70줄)
```

### 8.2 generate-image API (512줄 → 10개 파일)

```
generate-image/
├── types.ts                    (35줄)
├── prompts/
│   ├── stylePrompts.ts         (15줄)
│   ├── categoryThemes.ts       (80줄)
│   ├── referenceImagePrompt.ts (55줄)
│   └── systemPromptBuilder.ts  (35줄)
├── services/
│   ├── higgsfield.ts           (150줄)
│   └── imageProcessor.ts       (40줄)
├── utils/
│   ├── referenceImageUploader.ts (40줄)
│   └── errorHandler.ts         (30줄)
└── route.ts                    (85줄)
```

---

## 9. 체크리스트

### 새 컴포넌트 작성 시
- [ ] 500줄 이내인가?
- [ ] 타입이 분리되어 있는가?
- [ ] 상수가 적절히 분리되어 있는가?
- [ ] 재사용 가능한 로직이 훅으로 분리되어 있는가?

### 코드 리뷰 시
- [ ] 미사용 import가 있는가?
- [ ] 미사용 변수/함수가 있는가?
- [ ] 500줄을 초과하는 파일이 있는가?
- [ ] 분리가 필요한 큰 함수가 있는가?

### 리팩토링 시
- [ ] 기존 import 경로가 깨지지 않는가?
- [ ] 타입 re-export가 되어 있는가?
- [ ] 빌드가 성공하는가?

---

## 10. 버전 히스토리

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-01-22 | 1.0 | 초기 문서 작성 |

