import { A4_HEIGHT, A4_WIDTH, B4_HEIGHT, B4_WIDTH, mm } from "./units";
import { type BlockNode, type HwpxDocument, type SectionSpec, txt } from "./types";
import { COLORS, SIZE } from "./tokens";
import { renderPageHeader } from "./render/page-header";
import type { BuilderItemResolved } from "./render/question";
import { renderAnswerKey } from "./render/answer-key";
import { estimateBlocksHeight } from "./section-xml";
import { bodyFontForTemplate } from "@/app/api/exams/[examId]/export-docx/_lib/styles";
import type { BuilderBlock, BuilderHeader, BuilderLayout } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import { type BreakPlan, computeBreakPlan, computePaginatedLayout } from "./break-plan";
import type { FragmentRenderOptions } from "./render/fragment";
import type { BuildHwpxOptions } from "./builder-types";
import { floatHeaderBlocks, renderCustomBlock } from "./builder-blocks";
import { appendBlocksInOrder, buildColumnPageTable, renderColumn, renderGroupsToUnits } from "./builder-tables";

export type {
  BuildHwpxOptions,
} from "./builder-types";
export function buildBuilderHwpxDocument(
  opts: BuildHwpxOptions,
): HwpxDocument {
  const { title, settings, resolvedItems, includeAnswers } = opts;
  // 템플릿(세리프/산세리프)별 본문 글꼴 — 미리보기·DOCX 와 동일 기준으로 통일.
  const bodyFont = bodyFontForTemplate(settings?.template);
  const header: BuilderHeader = settings?.header ?? {};
  const layout: BuilderLayout = settings?.layout ?? {};
  const compact = layout.density === "compact";
  const passageStyle = "plain";
  const showPassageTitle = layout.showPassageTitle === true;
  const columns: 1 | 2 = layout.columns === 1 ? 1 : 2;

  // 미리보기와 동일한 페이지/단 분할을 재현하기 위한 break plan.
  // 정답포함 모드는 해설 블록 때문에 미리보기와 레이아웃이 본질적으로 다르므로,
  // 강제 분할을 적용하지 않고 한컴 자동 흐름에 맡긴다(빈 plan).
  const { plan: breakPlan } = includeAnswers
    ? { plan: new Map() as BreakPlan }
    : computeBreakPlan({
        blocks: settings?.blocks,
        resolvedItems,
        layout,
        template: settings?.template,
      });

  // 페이지 설정 — 미리보기(A4PaperPage)의 px padding 을 mm로 정확히 환산.
  // 미리보기: comfortable px-[42px] py-[38px], compact px-[34px] py-[30px].
  // 미리보기는 가상 A4(760px=210mm) 모델 → 1px = 210/760 = 0.276316mm.
  //   (96dpi(0.264583mm) 가 아님. 그게 직전 패스의 버그였다.)
  const MM_PER_PX = 210 / 760; // 0.276316
  const paperSize = layout.paperSize === "B4" ? "B4" : "A4";
  // 전체 여백 축소(5차): 미리보기 a4-paper-page.tsx 의 새 px 패딩을 그대로 환산한다.
  //   comfortable px-[34px] py-[28px], compact px-[28px] py-[24px].
  //   좌우는 줄넘김 안정성을 위해 소폭(42→34, 34→28)만, 상하는 더 적극적으로 축소.
  //   (직전의 LR_TRIM 별도 보정은 제거 — 미리보기 패딩 자체를 줄였으므로 불필요.)
  const LR_PX = compact ? 28 : 34;
  const TB_PX = compact ? 24 : 28;
  const marginLR = mm(LR_PX * MM_PER_PX);
  const marginTB = mm(TB_PX * MM_PER_PX);
  const pageWidth = paperSize === "B4" ? B4_WIDTH : A4_WIDTH;
  const pageHeight = paperSize === "B4" ? B4_HEIGHT : A4_HEIGHT;
  const contentWidth = pageWidth - 2 * marginLR;
  const columnGap = mm(32 * MM_PER_PX); // gap-8 = 32px ≈ 8.84mm
  // 줄넘김(칸당 글자수)은 본문 칸 폭으로 결정된다. 칸 폭은 미리보기의 콘텐츠 폭
  // (새 좌우 패딩 34/28px 기준)으로 고정해 미리보기 pagination.ts 와 동일 폭을 쓴다.
  // (좌우 패딩을 미리보기·pagination·HWPX·DOCX 에서 함께 바꿨으므로 줄넘김이 어긋나지 않는다.)
  const previewContentWidth = pageWidth - 2 * marginLR;
  const columnWidth =
    columns === 1
      ? previewContentWidth
      : Math.floor((previewContentWidth - columnGap) / 2);

  // =========================================================================
  // 네이티브 2단 경로 (한컴 검증 방식·기본 활성): per-page 표를 폐기하고, 본문을
  // 한컴 섹션 다단(secPr colCount=2)에 "문단으로 흘려" 한컴이 자동으로 페이지/단을
  // 꽉 채우게 한다 → 옛 그리디 표 방식의 "칸 하단 여백/왼쪽→오른쪽 조기 넘어감"
  // 문제 제거. 전체폭 헤더(제목/학생정보)는 떠 있는 표로 머리말 밴드에 얹는다.
  //   (한컴 실제 시험지 인코딩 역공학으로 확인: header control + colCount=2.)
  //   비활성화하려면 env HWPX_NATIVE_2COL=0. (1단/정답포함은 기존 경로.)
  // 커스텀 블록(이미지·텍스트·섹션 등)이 있어도 2단 칸 안에 함께 흘려보낸다(A안).
  // =========================================================================
  if (
    process.env.HWPX_NATIVE_2COL !== "0" &&
    columns === 2 &&
    !includeAnswers
  ) {
    const rawHeader: BlockNode[] = renderPageHeader({
      subtitle: header.subtitle,
      title,
      schoolName: header.schoolName,
      className: header.className,
      studentNameLabel: header.studentNameLabel,
      compact,
      contentWidthHpu: contentWidth,
    });
    // (전역 안내문 header.instructions 는 네이티브 경로에서 제외 — 매쪽 반복·문항별
    //  지시문과 중복. 사용자 요청.) 머리말을 떠있는 표로(secPr 오염 방지) + 밴드 예약.
    const floatedHeader = floatHeaderBlocks(rawHeader, contentWidth);
    const headerBlocks = floatedHeader.blocks;

    const nativeColW = Math.floor((contentWidth - columnGap) / 2);
    // 첫 블록은 secPr+colPr+머리말 컨트롤을 품는다. 거기에 본문 텍스트가 있으면
    // 한컴이 그 문단을 전체폭으로 그려(머리말 컨트롤 영향) 첫 지문이 칸을 벗어난다.
    // → 빈 문단을 맨 앞에 둬 컨트롤만 품게 하고 실제 본문은 둘째 블록부터 흐르게 한다.
    const bodyBlocks: BlockNode[] = [{ kind: "p", style: { spaceAfter: 0 }, runs: [] }];
    appendBlocksInOrder({
      target: bodyBlocks,
      blocks: settings?.blocks,
      resolvedItems,
      layout,
      includeAnswers,
      compact,
      passageStyle,
      showPassageTitle,
      contentWidthHpu: nativeColW,
      // 이미지는 단 폭(nativeColW) 기준으로 그려 칸 안에 들어가게 한다(2단 칸).
      imageColWidthHpu: nativeColW,
      imageMaxHeightHpu: pageHeight - 2 * marginTB - mm(10),
      breakPlan: new Map(), // 강제 분할 없음 — 한컴이 자동 흐름으로 채운다.
    });
    if (!includeAnswers && opts.fullExamQuestions.length > 0) {
      bodyBlocks.push(...renderAnswerKey(opts.fullExamQuestions, nativeColW));
    }

    // 핵심(실측): 한컴은 2단 본문을 marginHeader(머리말 밴드) 높이 아래에서 시작한다
    // (marginTop 이 아니라!). 따라서 marginHeader = 머리말 실제 높이 + 여백 으로 잡으면
    // 본문이 머리말 바로 아래에서 시작해 겹치지 않는다. marginTop 은 작게 둔다.
    //   env HWPX_HDR_BAND_MM 로 밴드(=본문 시작선) 미세조정 가능.
    const envBand = Number(process.env.HWPX_HDR_BAND_MM);
    const marginHeaderNative =
      Number.isFinite(envBand) && envBand > 0
        ? mm(envBand)
        : floatedHeader.heightHpu + mm(7);

    const section: SectionSpec = {
      pageWidthHpu: pageWidth,
      pageHeightHpu: pageHeight,
      marginLeft: marginLR,
      marginRight: marginLR,
      marginTop: marginTB,
      marginBottom: marginTB,
      marginHeader: marginHeaderNative,
      marginFooter: mm(7),
      columns: 2,
      columnGapHpu: columnGap,
      header: headerBlocks,
      // 머리말 1쪽 전용은 한컴 제약으로 보류: applyPageType 에 "FIRST" 가 없고(BOTH/EVEN/ODD뿐),
      // 본문 떠있는 표(TOP_AND_BOTTOM)는 2단 중 한 칸만 밀어 반대 칸이 겹친다(검증). 진짜 1쪽
      // 전용은 마스터페이지(FIRST) 또는 2구역 분할 필요 → 후속. 현재는 모든 쪽 머리말(밴드 채움).
      headerApplyFirstOnly: false,
      blocks: bodyBlocks,
    };
    return { title, sections: [section], defaultFontKr: bodyFont, defaultFontLatin: bodyFont };
  }

  const blocks: BlockNode[] = [];

  // 1) 페이지 헤더 (제목, 학교/반/이름)
  //    미리보기처럼 헤더는 항상 전체 본문 폭을 사용하고, 본문 직전에 다단을 켠다.
  blocks.push(
    ...renderPageHeader({
      subtitle: header.subtitle,
      title,
      schoolName: header.schoolName,
      className: header.className,
      studentNameLabel: header.studentNameLabel,
      compact,
      contentWidthHpu: contentWidth,
    }),
  );

  // 2) 안내문
  const instructions = (header.instructions || "").trim();
  if (instructions) {
    blocks.push({
      kind: "p",
      style: {
        align: "LEFT",
        // 미리보기 instructions 는 헤더 바로 아래(mt-2)에 붙어 있다.
        // 본문 위 빈공간을 줄이려 위/아래 간격을 축소.
        spaceBefore: 60,
        spaceAfter: 120,
        lineSpacingPct: 150,
      },
      runs: [
        txt(instructions, {
          size: SIZE.instructions,
          color: COLORS.gray,
        }),
      ],
    });
  } else {
    blocks.push({ kind: "p", style: { spaceAfter: 60 }, runs: [] });
  }

  // 3) 본문 — 결정론적 명시 2단 표.
  //   한컴은 본문 중간 colPr(신문 다단)을 적용하지 않는다(검증: 전체폭 단일단으로
  //   렌더됨). 그래서 페이지마다 [좌칸 | 간격 | 우칸] 무테 표로 배치를 강제하고,
  //   각 문항을 미리보기 pagination 이 정한 (페이지, 단) 으로 라우팅해 미리보기와
  //   동일한 단/페이지 배치를 얻는다. (명시 셀 폭은 한컴이 정확히 지킨다 — 검증됨.)
  const lastColWidth =
    columns === 1 ? columnWidth : contentWidth - columnWidth - columnGap;

  // 커스텀 블록(섹션/구분선/이미지 등)이 섞인 빌더는 placement 라우팅이 복잡하므로
  // 폴백(전체폭 흐름)으로 처리한다. 순수 문항 시험지는 명시 2단 표 경로를 쓴다.
  const hasCustomBlocks = (settings?.blocks ?? []).some(
    (b) => b.blockType && b.blockType !== "question",
  );

  // 2단 시험지(순수 문항)는 우리 자신의 높이 측정으로 그리디 패킹한다.
  //   미리보기 pagination 의 (페이지,단) 배치를 그대로 쓰면 미리보기와 한컴의 글꼴
  //   메트릭/줄바꿈 차이로 칸이 페이지를 넘쳐 (treatAsChar 원자) 표가 통째로 다음
  //   장으로 밀린다(1쪽이 헤더만 남는 현상). 대신 estimateBlocksHeight(렌더와 동일
  //   모델)로 각 칸을 페이지 용량까지만 채워 넘침/빈 페이지가 생기지 않게 한다.
  const useColumnTables = columns === 2 && !hasCustomBlocks;

  if (useColumnTables) {
    // 미리보기(paginateGroups)가 확정한 (페이지 → 단 → fragment) 배치를 그대로
    // 셀에 채운다. 문항/지문이 칸·페이지 경계에서 분할되어 웹과 동일한 연속 흐름이
    // 된다(칸당 1문항만 들어가 하단 40%가 비던 과소충전·페이지 늘어남 문제 해소).
    // 1쪽 헤더(제목/학생정보/안내문)는 본문 표 위 별도 블록으로 그린다. 한컴 실제
    // 렌더 높이를 pagination 의 page-0 용량에서 빼지 않으면 첫 표가 1쪽에 못 들어가
    // 2쪽으로 통째로 밀린다(1쪽 헤더만 남는 현상). estimateBlocksHeight 는 헤더의
    // 중첩 표(학생정보 박스)를 과소추정하므로, 환산값에 보정 오버헤드를 더한다.
    //   px = HPU * 760 / (210 * 283.465)   (가상 A4: 760px=210mm)
    const HPU_TO_PX = 760 / (210 * 283.465);
    const headerEstPx = estimateBlocksHeight([...blocks], contentWidth) * HPU_TO_PX;
    const envHdr = Number(process.env.HWPX_HDR_PX);
    const HEADER_TABLE_UNDERCOUNT_PX = 92; // 헤더 박스(학생정보 3행) 과소추정 실측 보정
    const firstPageHeaderPx =
      Number.isFinite(envHdr) && envHdr > 0
        ? envHdr
        : Math.round(headerEstPx + HEADER_TABLE_UNDERCOUNT_PX);

    // 한컴 실제 렌더가 pagination 추정보다 미세하게 클 때(특히 구조화 박스 유형)
    // 원자 페이지 표가 넘쳐 통째로 다음 장으로 밀리는 것을 막는 페이지 용량 안전 여백.
    const envSafety = Number(process.env.HWPX_SAFETY_PX);
    const contentSafetyPx = Number.isFinite(envSafety) ? envSafety : 40;

    // 정답포함 모드는 해설 블록 때문에 미리보기 pagination 과 레이아웃이 본질적으로
    // 다르므로(해설은 pagination 대상 아님) 프래그먼트 경로를 쓰지 않고 그리디 폴백
    // (renderQuestionBlock 가 해설을 렌더)으로 처리한다.
    const pageLayout = includeAnswers
      ? null
      : computePaginatedLayout({
          blocks: settings?.blocks,
          resolvedItems,
          layout,
          template: settings?.template,
          firstPageHeaderPx,
          contentSafetyPx,
        });

    let usedFragment = false;
    if (pageLayout && pageLayout.pages.length > 0) {
      const fopts: FragmentRenderOptions = {
        passageStyle,
        showPassageTitle,
        showQuestionMeta: layout.showQuestionMeta !== false,
        showAnswerSpace: layout.showAnswerSpace !== false,
        compact,
        template: settings?.template,
        columnWidthHpu: columnWidth,
      };
      const pageCols = pageLayout.pages.map((page) => ({
        left: renderColumn(page[0] ?? [], fopts),
        right: renderColumn(page[1] ?? [], fopts),
      }));
      // 정답표: 웹은 마지막 문항 뒤 흐름에 이어진다 → 마지막 페이지 우칸 끝에 잇는다.
      if (
        !includeAnswers &&
        opts.fullExamQuestions.length > 0 &&
        pageCols.length > 0
      ) {
        const ak = renderAnswerKey(opts.fullExamQuestions, columnWidth);
        pageCols[pageCols.length - 1].right.push(...ak);
      }

      // 일관된 HWPX 높이 모델(estimateBlocksHeight)로 페이지별 오버플로를 검사한다.
      // 구조화 박스 유형(요약/순서/주제 등)은 pagination 추정보다 타게 렌더되어
      // 헤더로 줄어든 page-0 칸을 넘칠 수 있는데, 페이지 표는 원자(treatAsChar)라
      // 넘치면 통째로 다음 장으로 밀려 빈 페이지가 생긴다. 한 페이지라도 넘치면
      // 안전한 그리디 패킹으로 폴백한다(과소충전이지만 빈 페이지·잘림 없음).
      const pageContentHpu = pageHeight - marginTB - marginTB;
      const headerHpu = Math.round(firstPageHeaderPx / HPU_TO_PX);
      const fits = pageCols.every((cols, idx) => {
        const colH = Math.max(
          estimateBlocksHeight(cols.left, columnWidth),
          estimateBlocksHeight(cols.right, columnWidth),
        );
        const avail = pageContentHpu - (idx === 0 ? headerHpu : 0);
        return colH <= avail;
      });

      if (fits) {
        pageCols.forEach((cols, idx) => {
          blocks.push(
            buildColumnPageTable({
              leftBlocks: cols.left,
              rightBlocks: cols.right,
              colWidthHpu: columnWidth,
              gapHpu: columnGap,
              lastColWidthHpu: lastColWidth,
              pageBreak: idx > 0,
            }),
          );
        });
        usedFragment = true;
      }
    }

    if (!usedFragment) {
      // 폴백: fragment 가 한컴에서 넘치거나 pagination 실패 시 자체 높이추정 그리디
      // 패킹(문항 통째). 안전(빈 페이지·잘림 없음)하나 칸당 1문항이라 다소 성김.
      const units = renderGroupsToUnits({
        items: resolvedItems,
        layout,
        includeAnswers,
        compact,
        passageStyle,
        showPassageTitle,
        columnWidthHpu: columnWidth,
      });
      if (!includeAnswers && opts.fullExamQuestions.length > 0) {
        units.push({
          placeKey: null,
          blocks: renderAnswerKey(opts.fullExamQuestions, columnWidth),
        });
      }
      const pageContentH = pageHeight - marginTB - marginTB;
      const SAFETY = 0.95;
      const colCapacity = Math.floor(pageContentH * SAFETY);
      const headerH = estimateBlocksHeight([...blocks], contentWidth);
      const capAt = (pg: number) =>
        Math.max(1, colCapacity - (pg === 0 ? headerH : 0));

      const pages: BlockNode[][][] = [[[], []]];
      let p = 0;
      let col = 0;
      let used = 0;
      for (const unit of units) {
        const h = estimateBlocksHeight(unit.blocks, columnWidth);
        if (pages[p][col].length > 0 && used + h > capAt(p)) {
          if (col === 0) {
            col = 1;
          } else {
            p += 1;
            col = 0;
            pages[p] = [[], []];
          }
          used = 0;
        }
        pages[p][col].push(...unit.blocks);
        used += h;
      }

      pages.forEach((cols, idx) => {
        blocks.push(
          buildColumnPageTable({
            leftBlocks: cols[0] ?? [],
            rightBlocks: cols[1] ?? [],
            colWidthHpu: columnWidth,
            gapHpu: columnGap,
            lastColWidthHpu: lastColWidth,
            pageBreak: idx > 0,
          }),
        );
      });
    }
  } else {
    // 폴백: 전체폭 단일 흐름 (1단 / 정답포함 / pagination 실패).
    // colPr 다단은 한컴에서 작동하지 않으므로 쓰지 않는다.
    const flatWidth = contentWidth;
    appendBlocksInOrder({
      target: blocks,
      blocks: settings?.blocks,
      resolvedItems,
      layout,
      includeAnswers,
      compact,
      passageStyle,
      showPassageTitle,
      contentWidthHpu: flatWidth,
      // 1단 흐름이라도 이미지는 미리보기의 단 폭(2단이면 columnWidth) 기준 크기로 그린다.
      imageColWidthHpu: columns === 2 ? columnWidth : flatWidth,
      imageMaxHeightHpu: pageHeight - 2 * marginTB - mm(10),
      breakPlan,
    });
    if (!includeAnswers && opts.fullExamQuestions.length > 0) {
      blocks.push(...renderAnswerKey(opts.fullExamQuestions, flatWidth));
    }
  }

  const section: SectionSpec = {
    pageWidthHpu: pageWidth,
    pageHeightHpu: pageHeight,
    marginLeft: marginLR,
    marginRight: marginLR,
    marginTop: marginTB,
    marginBottom: marginTB,
    // 머리말은 실제로 쓰지 않고(헤더를 본문 블록으로 그림) 본문 위 죽은 공간만
    // 만들므로 0 에 가깝게. 한컴은 top 여백 안에 header 밴드를 잡으므로 0이면
    // 본문이 marginTop 바로 아래에서 시작한다.
    marginHeader: mm(0),
    // 꼬리말(autoNum 페이지번호)은 살아있어야 하므로 적당한 값 유지.
    marginFooter: mm(7),
    columns: 1,
    columnGapHpu: columnGap,
    blocks,
  };

  return { title, sections: [section], defaultFontKr: bodyFont, defaultFontLatin: bodyFont };
}
