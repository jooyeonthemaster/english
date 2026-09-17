/**
 * 빌더 시험지 → HWPX 문서(IR) 조립 — E36 「구역 3분할」.
 *
 *   section0  표지    1단 · 머리말 없음 · 쪽번호 없음            (항상 생성)
 *   section1  본문    layout.columns 단 · 머리말 없음 · 쪽번호 1부터 재시작
 *   section2  정답표  1단 전체폭 · 머리말 없음 · 쪽번호 이어짐   (정답 미포함일 때만)
 *
 * 한컴 실측(SPEC §0)에 기댄 전제:
 *  - P1 다구역 문서가 정상 동작한다. P2 새 구역은 언제나 새 쪽에서 시작한다
 *    (그래서 표지·정답표에 pageBreak 를 따로 걸지 않는다).
 *  - P3 구역마다 단 수를 다르게 줄 수 있다(본문 2단 + 정답표 1단).
 *  - P7 <hp:startNum page="1"/> 로 본문 구역부터 쪽번호가 1로 재시작한다.
 *
 * 머리말(hp:header)은 **어느 구역에도** 넣지 않는다 — 사용자 확정("저런 머릿글 형태 다
 * 없애주고"). 예전에는 전체폭 제목/학생정보 밴드를 머리말로 얹었는데 한컴이 그 밴드를
 * 모든 쪽에 반복해 그렸다(P8). 제목·학교/반/이름·안내문은 전부 표지로 옮겼고, 머리말이
 * 사라졌으므로 marginHeader 는 전 구역 mm(0) 이다(본문이 marginTop 바로 아래서 시작).
 */

import { A4_HEIGHT, A4_WIDTH, B4_HEIGHT, B4_WIDTH, mm } from "./units";
import type { BlockNode, HwpxDocument, SectionSpec } from "./types";
import { renderAnswerKey } from "./render/answer-key";
import { renderCoverPage } from "./render/cover";
import { estimateBlocksHeight } from "./section-xml";
import { bodyFontForTemplate } from "@/app/api/exams/[examId]/export-docx/_lib/styles";
import type {
  BuilderHeader,
  BuilderLayout,
} from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
// BuilderCover 는 배럴(build-builder-document/index.ts)이 아직 내보내지 않아 정의 모듈에서
// 직접 가져온다(ko-set-passage 와 같은 깊은 import 패턴).
import type { BuilderCover } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/model";
import { suppressKoSetMemberInlinePassages } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/ko-set-passage";
import { type BreakPlan, computeBreakPlan, computePaginatedLayout } from "./break-plan";
import type { FragmentRenderOptions } from "./render/fragment";
import type { BuildHwpxOptions } from "./builder-types";
import { appendBlocksInOrder, buildColumnPageTable, renderColumn, renderGroupsToUnits } from "./builder-tables";

export type {
  BuildHwpxOptions,
} from "./builder-types";

/** 구역 3개가 공유하는 용지/여백 치수. */
interface PageMetrics {
  pageWidth: number;
  pageHeight: number;
  marginLR: number;
  marginTB: number;
  columnGap: number;
  contentWidth: number;
}

/**
 * 표지 구역(section0) — SPEC §1·§2.
 *
 * 표지는 `cover.enabled` 와 무관하게 **항상** 나온다. enabled 는 표지의 유무가 아니라
 * 모양/구성만 좌우한다(SPEC §1):
 *   enabled=true  → cover 의 template/eyebrow/footnote/showLogo/showInfo 를 그대로.
 *   enabled=false → 기본 구성(classic · showLogo · showInfo · eyebrow=header.subtitle
 *                   · footnote 없음).
 * 표지 구역은 언제나 꼬리말 없음(pageNumberStyle="none", SPEC §5).
 */
function buildCoverSection(args: {
  title: string;
  header: BuilderHeader;
  cover: BuilderCover | undefined;
  examDateLabel: string;
  compact: boolean;
  page: PageMetrics;
}): SectionSpec {
  const { header, cover, page } = args;
  const styled = cover?.enabled === true ? cover : undefined;
  const showLogo = styled ? styled.showLogo !== false : true;

  return {
    pageWidthHpu: page.pageWidth,
    pageHeightHpu: page.pageHeight,
    marginLeft: page.marginLR,
    marginRight: page.marginLR,
    marginTop: page.marginTB,
    marginBottom: page.marginTB,
    // 머리말 없음 → 밴드 높이를 0 으로 둬야 표지가 marginTop 바로 아래서 시작한다.
    marginHeader: mm(0),
    // 표지는 pageNumberStyle="none" 이라 꼬리말이 아예 없다 → 밴드도 0.
    // 7mm 를 예약해 두면 아래 contentHeightHpu 가 실제 본문 높이보다 7mm 커져서
    // "표지를 1쪽 안에 유지" 클램프가 과대한 높이 위에서 돌아 2쪽으로 넘칠 수 있다.
    marginFooter: mm(0),
    columns: 1,
    columnGapHpu: page.columnGap,
    pageNumberStyle: "none",
    blocks: renderCoverPage({
      template: styled?.template ?? "classic",
      eyebrow: styled?.eyebrow || header.subtitle || "",
      title: args.title,
      footnote: styled?.footnote || "",
      logoDataUrl: showLogo ? header.academyLogoDataUrl ?? null : null,
      showInfo: styled ? styled.showInfo !== false : true,
      schoolName: header.schoolName ?? "",
      className: header.className ?? "",
      studentNameLabel: header.studentNameLabel || "이름",
      examDateLabel: args.examDateLabel,
      // 안내문(header.instructions)은 매쪽 반복되던 본문 머리말에서 표지로 옮겼다.
      instructions: (header.instructions || "").trim(),
      compact: args.compact,
      contentWidthHpu: page.contentWidth,
      contentHeightHpu: page.pageHeight - 2 * page.marginTB,
    }),
  };
}

export function buildBuilderHwpxDocument(
  opts: BuildHwpxOptions,
): HwpxDocument {
  const { title, settings, includeAnswers } = opts;
  // KO 세트 멤버는 그룹 공유지문 1박스로 렌더하므로 멤버 인라인 지문을 억제한다
  // (라우트의 shouldForceSourcePassage 되살림 상쇄 — 영어/KO 솔로는 원소 그대로).
  const resolvedItems = suppressKoSetMemberInlinePassages(opts.resolvedItems);
  // 템플릿(세리프/산세리프)별 본문 글꼴 — 미리보기·DOCX 와 동일 기준으로 통일.
  const bodyFont = bodyFontForTemplate(settings?.template);
  const header: BuilderHeader = settings?.header ?? {};
  const layout: BuilderLayout = settings?.layout ?? {};
  const compact = layout.density === "compact";
  const passageStyle = "plain";
  const showPassageTitle = layout.showPassageTitle === true;
  const columns: 1 | 2 = layout.columns === 1 ? 1 : 2;

  // 「쪽당 N문제」 강제 배치(SPEC §3.1)는 **정답포함(해설) 모드에서 쓰지 않는다.**
  //   해설이 붙으면 문항 한 개가 칸 하나보다 확실히 커져서 내용이 자연스럽게 다음 칸으로
  //   넘친다. 거기에 그룹마다 columnBreak 를 또 넣으면 이미 넘어간 칸을 한 번 더 건너뛰어
  //   **완전히 빈 쪽**이 생긴다(실측: 해설 포함 13문항에서 6쪽이 꼬리말만 남은 백지).
  //   바로 아래 breakPlan 을 정답포함 모드에서 비우는 것과 같은 이유·같은 정책이다.
  //   (항목별 명시 breakBefore(§3.2)는 사용자가 직접 지정한 것이라 그대로 존중한다.)
  const forcePerPage: { columns: 1 | 2 } | undefined =
    layout.forceTwoPerPage && !includeAnswers ? { columns } : undefined;

  // 미리보기와 동일한 페이지/단 분할을 재현하기 위한 break plan.
  // 정답포함 모드는 해설 블록 때문에 미리보기와 레이아웃이 본질적으로 다르므로,
  // 강제 분할을 적용하지 않고 한컴 자동 흐름에 맡긴다(빈 plan).
  //
  // 「쪽당 N문제」가 켜져 있으면 이 plan 도 쓰지 않는다. computeBreakPlan 이 부르는
  // paginationSettingsFrom 은 forceTwoPerPage 를 pagination 에 **전달하지 않아서**,
  // 강제 배치를 모르는(= 칸을 촘촘히 채운) 배치 기준으로 나눔을 계산한다. 그 stale plan 을
  // §3.1 강제 나눔과 함께 먹이면 미리보기엔 없는 그룹 내부 쪽 나눔이 겹쳐 생긴다.
  // → 강제 배치 모드에서는 §3.1·§3.2 만 단독으로 집행한다(네이티브 경로와 같은 정책).
  const { plan: breakPlan } = includeAnswers || forcePerPage
    ? { plan: new Map() as BreakPlan }
    : computeBreakPlan({
        blocks: settings?.blocks,
        resolvedItems,
        layout,
        template: settings?.template,
      });

  // 페이지 설정 — 미리보기(A4PaperPage)의 px padding 을 mm로 정확히 환산.
  // 미리보기는 가상 A4(760px=210mm) 모델 → 1px = 210/760 = 0.276316mm.
  //   (96dpi(0.264583mm) 가 아님. 그게 직전 패스의 버그였다.)
  const MM_PER_PX = 210 / 760; // 0.276316
  const paperSize = layout.paperSize === "B4" ? "B4" : "A4";
  // 전체 여백 축소(5차): 미리보기 a4-paper-page.tsx 의 px 패딩을 그대로 환산한다.
  //   comfortable px-[34px] py-[28px], compact px-[28px] py-[24px].
  const LR_PX = compact ? 28 : 34;
  const TB_PX = compact ? 24 : 28;
  const marginLR = mm(LR_PX * MM_PER_PX);
  const marginTB = mm(TB_PX * MM_PER_PX);
  const pageWidth = paperSize === "B4" ? B4_WIDTH : A4_WIDTH;
  const pageHeight = paperSize === "B4" ? B4_HEIGHT : A4_HEIGHT;
  const contentWidth = pageWidth - 2 * marginLR;
  const columnGap = mm(32 * MM_PER_PX); // gap-8 = 32px ≈ 8.84mm
  const page: PageMetrics = {
    pageWidth,
    pageHeight,
    marginLR,
    marginTB,
    columnGap,
    contentWidth,
  };
  // 줄넘김(칸당 글자수)은 본문 칸 폭으로 결정된다. 칸 폭은 미리보기의 콘텐츠 폭
  // (좌우 패딩 34/28px 기준)으로 고정해 미리보기 pagination.ts 와 동일 폭을 쓴다.
  const previewContentWidth = pageWidth - 2 * marginLR;
  const columnWidth =
    columns === 1
      ? previewContentWidth
      : Math.floor((previewContentWidth - columnGap) / 2);

  // 본문(section1) 블록과 그 구역의 실제 단 수. 아래 두 갈래가 이 둘을 채운다.
  const bodyBlocks: BlockNode[] = [];
  let bodyColumns: 1 | 2 = 1;

  // =========================================================================
  // 네이티브 2단 경로 (한컴 검증 방식·기본 활성): per-page 표를 폐기하고, 본문을
  // 한컴 섹션 다단(secPr colCount=2)에 "문단으로 흘려" 한컴이 자동으로 페이지/단을
  // 꽉 채우게 한다 → 옛 그리디 표 방식의 "칸 하단 여백/왼쪽→오른쪽 조기 넘어감"
  // 문제 제거. 비활성화하려면 env HWPX_NATIVE_2COL=0. (1단은 아래 경로.)
  // 커스텀 블록(이미지·텍스트·섹션 등)이 있어도 2단 칸 안에 함께 흘려보낸다(A안).
  // 정답포함 모드(해설 동반)도 설정한 단 수(2단)를 그대로 따른다 — 해설은 한컴 자동
  // 흐름으로 칸/쪽에 채워진다(강제 분할 없이 breakPlan 비움).
  // =========================================================================
  const useNative2Col = process.env.HWPX_NATIVE_2COL !== "0" && columns === 2;
  if (useNative2Col) {
    bodyColumns = 2;
    const nativeColW = Math.floor((contentWidth - columnGap) / 2);
    // 첫 블록은 secPr+colPr 를 품는다. 거기에 본문 텍스트가 있으면 한컴이 그 문단을
    // 전체폭으로 그려 첫 지문이 칸을 벗어난다 → 빈 문단을 맨 앞에 둬 컨트롤만 품게
    // 하고 실제 본문은 둘째 블록부터 흐르게 한다.
    bodyBlocks.push({ kind: "p", style: { spaceAfter: 0 }, runs: [] });
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
      breakPlan: new Map(), // 한컴 자동 흐름 — 강제 분할은 forcePerPage/breakBefore 뿐.
      // 쪽당 N문제(§3.1)·항목별 breakBefore(§3.2). 예산은 이 구역의 실제 단 수다
      // (P4: columnBreak 가 네이티브 2단 구역에서 정확히 동작한다).
      forcePerPage,
      sectionColumns: 2,
    });
  } else {
    // =======================================================================
    // 비네이티브 경로 — 결정론적 명시 2단 표 / 전체폭 1단 흐름.
    //   한컴은 본문 중간 colPr(신문 다단)을 적용하지 않는다(검증: 전체폭 단일단으로
    //   렌더됨). 그래서 페이지마다 [좌칸 | 간격 | 우칸] 무테 표로 배치를 강제하고,
    //   각 문항을 미리보기 pagination 이 정한 (페이지, 단) 으로 라우팅한다.
    //   이 경로의 구역은 언제나 1단이다(단은 표가 그린다).
    // =======================================================================
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
    //   장으로 밀린다. 대신 estimateBlocksHeight(렌더와 동일 모델)로 각 칸을 페이지
    //   용량까지만 채워 넘침/빈 페이지가 생기지 않게 한다.
    const useColumnTables = columns === 2 && !hasCustomBlocks;

    if (useColumnTables) {
      // 1쪽 헤더가 사라졌으므로(제목/학생정보/안내문 전부 표지로 이동) page-0 용량에서
      // 뺄 헤더 높이는 0 이다. 헤더가 없는데 용량을 빼면 쪽수만 헛되이 늘어난다.
      // (예전의 HWPX_HDR_PX / HEADER_TABLE_UNDERCOUNT_PX 보정도 함께 폐기했다.)
      const firstPageHeaderPx = 0;

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
        const pageCols = pageLayout.pages.map((paperPage) => ({
          left: renderColumn(paperPage[0] ?? [], fopts),
          right: renderColumn(paperPage[1] ?? [], fopts),
        }));

        // 일관된 HWPX 높이 모델(estimateBlocksHeight)로 페이지별 오버플로를 검사한다.
        // 페이지 표는 원자(treatAsChar)라 넘치면 통째로 다음 장으로 밀려 빈 페이지가
        // 생긴다. 한 페이지라도 넘치면 안전한 그리디 패킹으로 폴백한다.
        // (헤더가 사라져 이제 1쪽도 다른 쪽과 용량이 같다.)
        const pageContentHpu = pageHeight - marginTB - marginTB;
        const fits = pageCols.every((cols) => {
          const colH = Math.max(
            estimateBlocksHeight(cols.left, columnWidth),
            estimateBlocksHeight(cols.right, columnWidth),
          );
          return colH <= pageContentHpu;
        });

        if (fits) {
          pageCols.forEach((cols, idx) => {
            bodyBlocks.push(
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
        const pageContentH = pageHeight - marginTB - marginTB;
        const SAFETY = 0.95;
        const colCapacity = Math.max(1, Math.floor(pageContentH * SAFETY));

        const pages: BlockNode[][][] = [[[], []]];
        let p = 0;
        let col = 0;
        let used = 0;
        for (const unit of units) {
          const h = estimateBlocksHeight(unit.blocks, columnWidth);
          if (pages[p][col].length > 0 && used + h > colCapacity) {
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
          bodyBlocks.push(
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
      // 폴백: 전체폭 단일 흐름 (1단 / 정답포함 / 커스텀 블록 혼재).
      // colPr 다단은 한컴에서 작동하지 않으므로 쓰지 않는다.
      const flatWidth = contentWidth;
      appendBlocksInOrder({
        target: bodyBlocks,
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
        // 이 구역은 1단이므로 예산도 1이고 breakBefore="column" 은 page 로 승격된다
        // (§3.1·§3.2). 2단 설정인데 이 경로로 떨어진 시험지는 쪽당 1문제가 된다 —
        // 1단 흐름에는 "다음 칸"이 없어서 예산 2를 표현할 수단이 없다.
        forcePerPage,
        sectionColumns: 1,
      });
    }
  }

  // ===========================================================================
  // 구역 조립 (SPEC §1)
  // ===========================================================================
  // 쪽번호는 본문·정답표가 같은 설정을 쓴다(표지만 "none"). SPEC §5.
  const pageNumberStyle = layout.pageNumberStyle ?? "center";
  // 표지는 시험지 기본값이지만, 문항 1개 내보내기 라우트는 명시적으로 끈다
  // (빈 표지 1쪽이 붙어 종이가 두 배로 나가는 것을 막는다 — BuildHwpxOptions.includeCover).
  const withCover = opts.includeCover !== false;
  const sections: SectionSpec[] = [
    ...(withCover
      ? [
          buildCoverSection({
            title,
            header,
            cover: settings?.cover,
            examDateLabel: opts.examDateLabel ?? "",
            compact,
            page,
          }),
        ]
      : []),
    {
      pageWidthHpu: pageWidth,
      pageHeightHpu: pageHeight,
      marginLeft: marginLR,
      marginRight: marginLR,
      marginTop: marginTB,
      marginBottom: marginTB,
      // 머리말을 쓰지 않으므로 밴드는 0 — 본문이 marginTop 바로 아래에서 시작한다.
      marginHeader: mm(0),
      // 꼬리말(autoNum 쪽번호)은 살아있어야 하므로 적당한 값 유지.
      marginFooter: mm(7),
      columns: bodyColumns,
      columnGapHpu: columnGap,
      // 표지 다음 쪽이 1쪽이 되도록 이 구역에서 쪽번호를 재시작한다(P7).
      startNumPage: 1,
      pageNumberStyle,
      blocks: bodyBlocks,
    },
  ];

  // 정답표는 별도 구역(1단 전체폭). 새 구역은 이미 새 쪽이므로(P2) pageBreak 를 주지
  // 않는다 — 주면 빈 쪽이 하나 더 생긴다. 칸 폭이 아니라 전체폭으로 그려야 머리 셀이
  // 2줄로 터지지 않는다(P10). 쪽번호는 본문에서 이어진다(startNumPage 미지정).
  if (!includeAnswers && opts.fullExamQuestions.length > 0) {
    sections.push({
      pageWidthHpu: pageWidth,
      pageHeightHpu: pageHeight,
      marginLeft: marginLR,
      marginRight: marginLR,
      marginTop: marginTB,
      marginBottom: marginTB,
      marginHeader: mm(0),
      marginFooter: mm(7),
      columns: 1,
      columnGapHpu: columnGap,
      pageNumberStyle,
      blocks: renderAnswerKey(opts.fullExamQuestions, contentWidth, {
        pageBreak: false,
      }),
    });
  }

  return { title, sections, defaultFontKr: bodyFont, defaultFontLatin: bodyFont };
}
