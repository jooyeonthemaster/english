/**
 * HWPX 의 모든 폰트/문자모양(charPr)/문단모양(paraPr)/테두리채움(borderFill)/
 * 스타일은 header.xml 에 미리 선언되고, section0.xml 은 ID 로 참조한다.
 *
 * 이 모듈이 ID 할당과 dedupe 를 담당.
 *
 * OWPML 의 fontfaces 는 언어별로 별도 ID 공간을 갖는다 (HANGUL/LATIN/...).
 * 그래서 한글/영문 폰트는 분리해서 등록한다.
 */

import type { BorderSpec, CellBorders, ParaStyle, RunStyle } from "./types";

export interface FontFaceSpec {
  face: string;
  type: "TTF" | "RFONT" | "HFT" | "NONE";
}

export interface CharShapeSpec {
  fontKrId: number;     // HANGUL/HANJA/JAPANESE/SYMBOL/USER 공통
  fontLatinId: number;  // LATIN/OTHER 공통
  heightHpu100: number; // 1/100 pt
  textColor: string;
  shadeColor: string;
  bold: boolean;
  italic: boolean;
  underline: "NONE" | "SOLID" | "DOTTED" | "DASHED";
  underlineColor: string;
  letterSpacing: number;
  borderFillIDRef: number;
}

export interface ParaShapeSpec {
  align: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY" | "DISTRIBUTE";
  indentFirst: number;
  leftMargin: number;
  rightMargin: number;
  spaceBefore: number;
  spaceAfter: number;
  lineSpacingPct: number;
}

export interface BorderFillSpec {
  left: BorderSpec;
  right: BorderSpec;
  top: BorderSpec;
  bottom: BorderSpec;
  fillColor?: string;
}

// =============================================================================
// 기본값
// =============================================================================

// HWPX 다운로드 본문 글꼴. 한컴 한글에 기본 번들된 "맑은 고딕"을 쓴다(Mac/Win 공통).
// NOTE: Noto Sans/Serif KR 통일은 미완 기능이라 보류 — 폰트값은 맑은 고딕으로 되돌리되
// 템플릿별 폰트 주입(constructor) plumbing 은 남겨 추후 완성 시 재사용한다.
export const DEFAULT_FONT_KR = "맑은 고딕";
export const DEFAULT_FONT_LATIN = "맑은 고딕";

const NO_BORDER: BorderSpec = { type: "NONE", widthMm: 0.1, color: "#000000" };

// =============================================================================
// 레지스트리
// =============================================================================

export class ShapeRegistry {
  krFonts: FontFaceSpec[] = [];
  latinFonts: FontFaceSpec[] = [];
  charShapes: CharShapeSpec[] = [];
  paraShapes: ParaShapeSpec[] = [];
  borderFills: BorderFillSpec[] = [];
  defaultFontKr: string;
  defaultFontLatin: string;

  // 템플릿별 본문 글꼴을 주입받는 plumbing(미완 — 현재는 맑은 고딕으로 보류).
  constructor(defaultFontKr = DEFAULT_FONT_KR, defaultFontLatin = DEFAULT_FONT_LATIN) {
    this.defaultFontKr = defaultFontKr;
    this.defaultFontLatin = defaultFontLatin;
    // 한글/영문 기본 폰트 등록 (각 lang ID 0 번)
    this.krFonts.push({ face: defaultFontKr, type: "TTF" });
    this.latinFonts.push({ face: defaultFontLatin, type: "TTF" });

    // BorderFill 0: 투명 (문단 외곽 기본)
    this.borderFills.push({
      left: NO_BORDER,
      right: NO_BORDER,
      top: NO_BORDER,
      bottom: NO_BORDER,
    });
    // BorderFill 1: 문자 외곽 기본
    this.borderFills.push({
      left: NO_BORDER,
      right: NO_BORDER,
      top: NO_BORDER,
      bottom: NO_BORDER,
    });
    // BorderFill 2: 실제 표가 필요할 때 재사용할 수 있는 얇은 검정 테두리.
    // 레이아웃용 표가 많으므로 미지정 셀은 보더 없음(0)을 기본으로 둔다.
    const thin: BorderSpec = { type: "SOLID", widthMm: 0.12, color: "#000000" };
    this.borderFills.push({
      left: thin,
      right: thin,
      top: thin,
      bottom: thin,
    });

    // 기본 charShape (id 0)
    this.charShapes.push({
      fontKrId: 0,
      fontLatinId: 0,
      heightHpu100: 1000, // 10pt
      textColor: "#000000",
      shadeColor: "none",
      bold: false,
      italic: false,
      underline: "NONE",
      underlineColor: "#000000",
      letterSpacing: 0,
      borderFillIDRef: 1,
    });

    // 기본 paraShape (id 0)
    this.paraShapes.push({
      align: "JUSTIFY",
      indentFirst: 0,
      leftMargin: 0,
      rightMargin: 0,
      spaceBefore: 0,
      spaceAfter: 0,
      // 미리보기 본문 line-height 1.58 과 일치(이전 160 은 한컴 기본값이라 미세 드리프트).
      lineSpacingPct: 158,
    });
  }

  // ---------------------------------------------------------------------------
  // 폰트
  // ---------------------------------------------------------------------------

  fontKrId(face: string): number {
    const idx = this.krFonts.findIndex((f) => f.face === face);
    if (idx >= 0) return idx;
    this.krFonts.push({ face, type: "TTF" });
    return this.krFonts.length - 1;
  }

  fontLatinId(face: string): number {
    const idx = this.latinFonts.findIndex((f) => f.face === face);
    if (idx >= 0) return idx;
    this.latinFonts.push({ face, type: "TTF" });
    return this.latinFonts.length - 1;
  }

  // ---------------------------------------------------------------------------
  // CharShape
  // ---------------------------------------------------------------------------

  registerCharShape(spec: CharShapeSpec): number {
    const key = JSON.stringify(spec);
    for (let i = 0; i < this.charShapes.length; i++) {
      if (JSON.stringify(this.charShapes[i]) === key) return i;
    }
    this.charShapes.push(spec);
    return this.charShapes.length - 1;
  }

  charShapeFromStyle(style: RunStyle | undefined): number {
    const s: RunStyle = style ?? {};
    const fontKr = s.fontKr ?? this.defaultFontKr;
    const fontLatin = s.fontLatin ?? this.defaultFontLatin;
    const sizePt = s.size ?? 10;
    return this.registerCharShape({
      fontKrId: this.fontKrId(fontKr),
      fontLatinId: this.fontLatinId(fontLatin),
      heightHpu100: Math.round(sizePt * 100),
      textColor: s.color ?? "#000000",
      shadeColor: s.shadeColor ?? "none",
      bold: !!s.bold,
      italic: !!s.italic,
      underline: s.underline ?? "NONE",
      underlineColor: s.underlineColor ?? "#000000",
      letterSpacing: s.letterSpacing ?? 0,
      borderFillIDRef: 1,
    });
  }

  // ---------------------------------------------------------------------------
  // ParaShape
  // ---------------------------------------------------------------------------

  registerParaShape(spec: ParaShapeSpec): number {
    const key = JSON.stringify(spec);
    for (let i = 0; i < this.paraShapes.length; i++) {
      if (JSON.stringify(this.paraShapes[i]) === key) return i;
    }
    this.paraShapes.push(spec);
    return this.paraShapes.length - 1;
  }

  paraShapeFromStyle(style: ParaStyle | undefined): number {
    const s: ParaStyle = style ?? {};
    return this.registerParaShape({
      align: s.align ?? "JUSTIFY",
      indentFirst: s.indentFirst ?? 0,
      leftMargin: s.leftMargin ?? 0,
      rightMargin: s.rightMargin ?? 0,
      spaceBefore: s.spaceBefore ?? 0,
      spaceAfter: s.spaceAfter ?? 0,
      lineSpacingPct: s.lineSpacingPct ?? 158,
    });
  }

  // ---------------------------------------------------------------------------
  // BorderFill
  // ---------------------------------------------------------------------------

  registerBorderFill(spec: BorderFillSpec): number {
    const key = JSON.stringify(spec);
    for (let i = 0; i < this.borderFills.length; i++) {
      if (JSON.stringify(this.borderFills[i]) === key) return i;
    }
    this.borderFills.push(spec);
    return this.borderFills.length - 1;
  }

  borderFillFromCell(border: CellBorders | undefined): number {
    if (!border) return 0;
    const def: BorderSpec = NO_BORDER;
    const spec: BorderFillSpec = {
      left: border.left ?? def,
      right: border.right ?? def,
      top: border.top ?? def,
      bottom: border.bottom ?? def,
      fillColor: border.fillColor,
    };
    return this.registerBorderFill(spec);
  }
}
