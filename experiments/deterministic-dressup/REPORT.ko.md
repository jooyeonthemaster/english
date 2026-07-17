# 비생성형 2D 옷입히기 기술 조사 및 5×5 실험 보고서

조사·실험 기준일: 2026-07-11

## 한 줄 결론

**구현은 가능하지만, “아무 상품 사진 한 장을 아무 체형에 자동으로 붙이는 실사 가상 피팅”은 불가능에 가깝다.** 고정 촬영 부스와 옷입히기 게임 수준의 표현이라면 조건부로 가능하며, 모든 의상을 최초 1회 `캐노니컬 정면 스프라이트 + 의미 앵커 + 분할 메시 + 앞뒤 레이어`로 리깅해야 한다.

현재 프로토타입의 단일 공용 메시 실험은 25/25가 엄격한 왜곡 한계값을 넘었다. 따라서 이것은 성공 데모가 아니라, 어떤 추가 제작 공정이 필요한지를 보여주는 실패 경계 실험이다.

## 왜 일반 옷입히기 게임과 다른가

옷입히기 게임은 캐릭터 체형과 자세가 고정되고, 모든 옷이 그 실루엣에 맞춰 그려진다. 여기서는 다음 변수가 동시에 바뀐다.

- 키, 어깨/허리/골반 비율, 팔·다리 길이와 굵기
- 팔꿈치 각도, 손 높이, 발 간격, 좌우 비대칭
- 카메라 거리·높이·초점거리·회전
- 기존 머리카락, 손, 팔과 새 옷 사이의 가림 순서
- 옷 이미지에 존재하지 않는 옆면·안쪽·뒷면·주름·그림자

2D 워핑은 **존재하는 픽셀을 이동**할 뿐이다. 접혀 촬영된 바지를 펼치거나, 아래로 내려간 재킷 소매를 팔을 든 모양으로 바꾸면서 보이지 않던 천을 만들어낼 수는 없다.

## 관련 기술과 현실적인 선택

| 역할 | 후보 | 판단 |
|---|---|---|
| 실시간 자세 | [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/python) | 33개 랜드마크, 월드 좌표, 선택적 인물 마스크. Apache-2.0이며 MVP의 1순위 |
| 고정밀/전신 키포인트 | [MMPose](https://github.com/open-mmlab/mmpose) | whole-body와 패션 랜드마크 지원. Apache-2.0이나 배포가 더 무거움 |
| 밀집 인체 대응 | [Detectron2 DensePose](https://github.com/facebookresearch/detectron2/tree/main/projects/DensePose) | 픽셀을 인체 표면 UV에 대응. 옷의 부피·주름은 해결하지 못하며 Windows 공식 지원도 약함 |
| 인체/의복 파싱 | [SCHP](https://github.com/GoGoDuck912/Self-Correction-Human-Parsing) | 상의·코트·바지·팔·다리 클래스가 있으나 연구기이며 도메인 미세조정 필요 |
| 브라우저 메시 | [PixiJS Mesh](https://pixijs.com/8.x/guides/components/scene-objects/mesh) | 2D 정점·UV·인덱스 갱신에 적합. MIT, 현재 MVP 런타임 추천 |
| 3D 확장 가능 메시 | [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html) / [SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html) | 향후 뼈대·glTF·3D로 갈 계획이면 적합 |
| CPU 기준 구현 | [scikit-image PiecewiseAffine/TPS](https://scikit-image.org/docs/stable/auto_examples/transform/plot_piecewise_affine.html), [OpenCV transform](https://docs.opencv.org/master/da/d54/group__imgproc__transform.html) | 오프라인 베이킹·검증에 적합. 각각 BSD/Apache-2.0 계열 |
| 구조 보존 변형 | [ARAP](https://diglib.eg.org/items/e0b21a71-350e-41e7-a586-3bfa526ed21c/full), [libigl](https://libigl.github.io/tutorial/) | 단추·라펠·포켓 보존에 유리하지만 계산·구현 복잡도 상승 |

OpenPose는 기능은 충분하지만 [기본 라이선스가 비상업 연구용](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/LICENSE)이므로 신규 상용 MVP 기본값으로 권하지 않는다. 프레임워크 라이선스와 별도로 체크포인트·학습 데이터 권리도 반드시 검토해야 한다.

## 왜 생성형 VTON이 따로 존재하는가

[CP-VTON](https://openaccess.thecvf.com/content_ECCV_2018/papers/Bochao_Wang_Toward_Characteristic-Preserving_Image-based_ECCV_2018_paper.pdf)은 TPS로 옷을 대략 맞춘 뒤 경계 오류를 줄이기 위해 별도 합성 모듈을 사용한다. [VITON-HD](https://openaccess.thecvf.com/content/CVPR2021/papers/Choi_VITON-HD_High-Resolution_Virtual_Try-On_via_Misalignment-Aware_Normalization_CVPR_2021_paper.pdf)도 잘못 정렬된 영역을 생성기로 채운다. [IDM-VTON](https://github.com/yisol/IDM-VTON)과 [CatVTON](https://github.com/Zheng-Chong/CatVTON)은 아예 확산 생성기로 보이지 않는 천·경계·조명을 만든다.

이는 단순 워핑의 실패가 구현 미숙만의 문제가 아니라 **원본에 픽셀이 없는 정보 결손 문제**임을 보여준다. 또한 VITON-HD·HR-VITON·IDM-VTON·CatVTON의 공식 공개물은 대부분 비상업 조건이며, [DressCode 저장소](https://github.com/aimagelab/dress-code)는 민간 기업에 데이터셋을 배포하지 않는다고 명시한다.

## 이번에 직접 만든 것

- 실사형 고정 포즈 인물 5명: 짧고 슬림, 장신 마른형, 넓은 어깨 근육형, 플러스형, 장신·넓은 골반형
- 공용 의상 5세트: 네이비 정장, 차콜 차이나칼라 정장, 후디·조거, 데님·카고, 봄버·치노
- 사람별 의상 재생성 없이 동일 PNG를 5명에게 반복 적용
- 고정 토폴로지 31개 삼각형의 piecewise-affine 워핑
- 비교용 1-box 단순 스케일 모드
- 브라우저 Canvas 데모와 독립 CPU 기준 렌더러
- 25개 메시 결과와 25개 단순 스케일 결과, 정량 JSON

에셋 생성에는 네이티브 Codex 이미지 생성만 사용했다. 실제 합성 단계는 픽셀 변형과 알파 합성뿐이며 생성 AI를 사용하지 않는다.

## 5×5 결과

| 체형 | 최악 국소 면적 왜곡 / 중앙값 | 뒤집힌 삼각형 | 판정 |
|---|---:|---:|---|
| A 짧고 슬림 | 4.076× | 0 | 실패 |
| B 키 크고 마름 | 3.390× | 0 | 실패 |
| C 넓은 어깨·근육형 | 3.162× | 0 | 실패 |
| D 플러스형 | 7.768× | 0 | 실패 |
| E 장신·넓은 골반형 | 7.773× | 0 | 실패 |

하드 실패 기준은 중앙 삼각형 대비 국소 면적 왜곡 2.5배 초과 또는 삼각형 뒤집힘이다. 같은 메시 구조를 쓰므로 한 체형에서의 수치는 5개 의상에 동일하게 나타났고, **25/25가 왜곡 기준을 통과하지 못했다.**

육안으로는 다음이 확인됐다.

- 단순 스케일은 대체로 한 벌처럼 보이지만, 플러스·넓은 골반 체형의 폭과 굴곡을 따라가지 않는다.
- 메시 워핑은 허리·골반 폭을 더 따라가지만, 어깨와 허벅지 경계에 노출 틈이 생긴다.
- 의상별 실제 알파 외곽이 다른데도 공용 원본 앵커를 쓴 것이 주요 원인이다.
- 현재는 손·목·머리카락을 다시 앞에 올리는 신체 파트 마스크가 없어 복잡한 가림 관계를 처리할 수 없다.
- 사람이 직접 맞춘 랜드마크이므로 실제 촬영 오차와 포즈 검출 실패는 아직 포함하지 않았다.

따라서 현재 코드는 “가능성을 보여주는 완성품”이 아니라 “단일 에셋·단일 메시 접근의 실패를 재현하는 기준점”이다.

## 제품으로 만들 때 필요한 구조

### 1. 촬영 게이트

- 고정 카메라 높이·거리·초점거리, 바닥 발 마커, 손 목표점, 단색 배경
- 몸 전체·손목·발목이 모두 보이는지 확인
- 어깨/골반 yaw 5도 이내, 필수 랜드마크 신뢰도 0.8 이상
- 조건을 벗어나면 자동 보정하지 말고 재촬영 요청
- 절대 키가 필요하면 카메라 캘리브레이션 또는 실제 크기 기준물이 필수

### 2. 인물 분석

MediaPipe로 관절을 얻고, 인물 마스크의 단면을 샘플링해 가슴·허리·골반·허벅지·종아리 폭을 구한다. 관절만으로는 체형 폭을 알 수 없다. 필요하면 MMPose/DensePose를 서버측 보강으로 평가한다.

### 3. 의상 에셋 포맷

각 상품을 한 번만 다음 형식으로 제작한다.

```text
garment.png/webp
garment.json
  category, canonicalSize, allowedStretch
  semanticAnchors: neck, shoulder, armpit, cuff, waist, hip, crotch, knee, ankle, hem
  vertices, uvs, fixedTriangles
  fragments: rear, torso, leftSleeve, rightSleeve, pelvis, leftLeg, rightLeg, front
  zOrderRules
```

접힌 바지나 소매가 내려간 재킷 사진은 그대로 받지 않는다. 동일 상품의 정면 빈 마네킹 촬영, 3D 렌더, 또는 디자이너가 만든 캐노니컬 스프라이트가 필요하다.

### 4. 변형과 합성

1. 상품 카테고리와 목표 체형에 가장 가까운 소수의 기본 체형 템플릿을 선택한다.
2. 템플릿과 실제 몸 사이의 작은 차이만 piecewise-affine 또는 cage deformation으로 보정한다.
3. 단추·라펠·체크무늬처럼 구조 보존이 중요한 옷은 ARAP 또는 별도 강성 가중치를 사용한다.
4. 뒤 의상 → 인물 → 앞 의상 → 손·목·머리카락 순서로 파트 마스크를 이용해 합성한다.
5. 삼각형 뒤집힘, 특이값 기반 늘어남, 경계 누출, 미피복 면적을 검사하고 한계를 넘으면 해당 체형용 템플릿을 요구하거나 결과를 거부한다.

핵심은 “사람마다 새 옷 이미지를 만든다”가 아니라, **상품당 3~5개의 체형/사이즈 베이스를 미리 만들고 그 사이만 제한적으로 보간**하는 것이다. 이 정도는 여전히 결정론적이며 생성형 합성이 아니다.

## GO / NO-GO

### 조건부 GO

- 사용자가 옷입히기 게임 같은 2D 미리보기임을 이해한다.
- 촬영 부스를 강하게 통제하고 가이드 이탈 사진을 거부할 수 있다.
- 모든 의상을 리깅 가능한 캐노니컬 에셋으로 제작한다.
- 체형군별 소수 베이스와 명시적 스트레치 한계를 운영한다.
- 사이즈 적합성·실제 핏·실사 가상 피팅을 주장하지 않는다.

### NO-GO

- 임의 쇼핑몰 정면/접힘 상품 사진 한 장만 입력한다.
- 모든 키·체형·자세에 공용 PNG 하나를 무제한 변형한다.
- 실제 옷처럼 자연스러운 주름·두께·조명·가림을 요구한다.
- 결과로 실제 구매 사이즈나 물리적 맞음새를 판단한다.

## 다음 검증 단계

1. 의상 1벌을 torso/좌우 소매/골반/좌우 다리로 분할하고 의상별 알파 외곽 앵커를 저장한다.
2. 같은 의상에 slim/regular/plus 세 기본 체형만 제작해 현재 5명에게 적용한다.
3. 수동 좌표를 MediaPipe + 실루엣 폭 측정으로 교체한다.
4. 카메라 roll, 팔꿈치 ±10도, 손 높이 ±5%, 발 간격 ±10%의 교란 테스트를 추가한다.
5. 홀드아웃 인물 2명과 홀드아웃 의상 1벌로 튜닝 후 성능을 측정한다.
6. 통과 기준: 체형군별 시각 수용률 70% 이상, 전체 80% 이상, 통과 촬영 중 자동 하드체크 통과율 90% 이상, 재촬영률 15% 미만.

이 단계에서 통과하지 못하면 2D 범위를 더 밀기보다 3D 의상/아바타 파이프라인 또는 상업 라이선스가 명확한 생성형 VTON으로 전환하는 편이 낫다.
