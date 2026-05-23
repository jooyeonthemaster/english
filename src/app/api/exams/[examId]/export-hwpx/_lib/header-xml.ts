/**
 * Contents/header.xml 빌더.
 * 한컴 호환 검증된 blank.hwpx (neolord0/hwpxlib) 구조를 그대로 따른다.
 *
 * 핵심 포인트 (이전 시도 실패 원인 기록):
 *  - xmlns:hpf 는 "schema" (NO trailing 's')
 *  - borderFill width 는 "0.1 mm" (숫자와 mm 사이 공백)
 *  - fillBrush 는 hc: 네임스페이스 (hh:fillBrush 가 아님)
 *  - numbering 은 7개 paraHead (level 1~7) 필수
 *  - tabPr 는 children 없음, autoTabLeft/Right 만
 *  - paraPr margin/lineSpacing 은 <hp:switch>/<hp:case>/<hp:default> 로 감쌈
 *  - hc:intent/left/right/prev/next 는 unit="HWPUNIT" 속성 필수
 *  - compatibleDocument targetProgram="HWP201X" + <hh:layoutCompatibility/>
 *  - docOption 은 <hh:linkinfo .../> child
 *  - trackchageConfig flags="56" 한 줄 (오타 "trackchage" 유지)
 *  - forbiddenWordList / memoProperties / bullets 모두 생략 가능 (blank 에 없음)
 */

import type {
  BorderFillSpec,
  CharShapeSpec,
  FontFaceSpec,
  ParaShapeSpec,
  ShapeRegistry,
} from "./shapes";
import { escapeXml } from "./escape";
import { HWPX_NS } from "./static-files";

// =============================================================================
// 폰트
// =============================================================================

function fontXml(fonts: FontFaceSpec[], lang: string): string {
  const items = fonts
    .map(
      (f, i) =>
        `<hh:font id="${i}" face="${escapeXml(f.face)}" type="${f.type}" isEmbedded="0"/>`,
    )
    .join("");
  return `<hh:fontface lang="${lang}" fontCnt="${fonts.length}">${items}</hh:fontface>`;
}

// =============================================================================
// BorderFill
// =============================================================================

function borderXml(tag: string, b: BorderFillSpec["left"]): string {
  // 한컴 표기: "0.1 mm" (숫자 + 공백 + mm)
  const w = (b.widthMm ?? 0.1).toFixed(2);
  return `<hh:${tag} type="${b.type ?? "SOLID"}" width="${w} mm" color="${b.color ?? "#000000"}"/>`;
}

function borderFillXml(bf: BorderFillSpec, id: number): string {
  const parts = [
    `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">`,
    `<hh:slash type="NONE" Crooked="0" isCounter="0"/>`,
    `<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>`,
    borderXml("leftBorder", bf.left),
    borderXml("rightBorder", bf.right),
    borderXml("topBorder", bf.top),
    borderXml("bottomBorder", bf.bottom),
    `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>`,
  ];
  if (bf.fillColor) {
    // hc: 네임스페이스(hh: 아님)
    parts.push(
      `<hc:fillBrush><hc:winBrush faceColor="${bf.fillColor}" hatchColor="#FF000000" alpha="0"/></hc:fillBrush>`,
    );
  }
  parts.push(`</hh:borderFill>`);
  return parts.join("");
}

// =============================================================================
// CharShape
// =============================================================================

function charShapeXml(c: CharShapeSpec, id: number): string {
  const parts: string[] = [];
  parts.push(
    `<hh:charPr id="${id}" height="${c.heightHpu100}" textColor="${c.textColor}" shadeColor="${c.shadeColor}" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="${c.borderFillIDRef}">`,
  );
  // other/symbol/user 도 한글 폰트로 매핑.
  // 이유: ① 같은 enclosed alphanumerics (U+2460+) 가 한컴 내부에서
  // "other" 영역으로 분류될 때 Times New Roman 같은 라틴 폰트가 적용되어
  // ⓘ 비슷한 글리프로 폴백되는 현상 방지.
  parts.push(
    `<hh:fontRef hangul="${c.fontKrId}" latin="${c.fontLatinId}" hanja="${c.fontKrId}" japanese="${c.fontKrId}" other="${c.fontKrId}" symbol="${c.fontKrId}" user="${c.fontKrId}"/>`,
  );
  parts.push(
    `<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>`,
  );
  const sp = c.letterSpacing;
  parts.push(
    `<hh:spacing hangul="${sp}" latin="${sp}" hanja="${sp}" japanese="${sp}" other="${sp}" symbol="${sp}" user="${sp}"/>`,
  );
  parts.push(
    `<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>`,
  );
  parts.push(
    `<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>`,
  );
  if (c.italic) parts.push(`<hh:italic/>`);
  if (c.bold) parts.push(`<hh:bold/>`);
  parts.push(
    `<hh:underline type="${c.underline}" shape="SOLID" color="${c.underlineColor}"/>`,
  );
  parts.push(`<hh:strikeout shape="NONE" color="#000000"/>`);
  parts.push(`<hh:outline type="NONE"/>`);
  parts.push(
    `<hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/>`,
  );
  parts.push(`</hh:charPr>`);
  return parts.join("");
}

// =============================================================================
// ParaShape — switch/case 로 margin+lineSpacing 감싸기
// =============================================================================

function marginAndLineSpacing(p: ParaShapeSpec): string {
  return [
    `<hh:margin>`,
    `<hc:intent value="${p.indentFirst}" unit="HWPUNIT"/>`,
    `<hc:left value="${p.leftMargin}" unit="HWPUNIT"/>`,
    `<hc:right value="${p.rightMargin}" unit="HWPUNIT"/>`,
    `<hc:prev value="${p.spaceBefore}" unit="HWPUNIT"/>`,
    `<hc:next value="${p.spaceAfter}" unit="HWPUNIT"/>`,
    `</hh:margin>`,
    `<hh:lineSpacing type="PERCENT" value="${p.lineSpacingPct}" unit="HWPUNIT"/>`,
  ].join("");
}

function paraShapeXml(p: ParaShapeSpec, id: number): string {
  const ml = marginAndLineSpacing(p);
  return [
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">`,
    `<hh:align horizontal="${p.align}" vertical="BASELINE"/>`,
    `<hh:heading type="NONE" idRef="0" level="0"/>`,
    `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>`,
    `<hp:switch>`,
    `<hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${ml}</hp:case>`,
    `<hp:default>${ml}</hp:default>`,
    `</hp:switch>`,
    `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>`,
    `<hh:border borderFillIDRef="0" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>`,
    `</hh:paraPr>`,
  ].join("");
}

// =============================================================================
// Header XML root
// =============================================================================

export function buildHeaderXml(registry: ShapeRegistry, secCnt = 1): string {
  // 7개 lang 모두 채우기. OTHER 도 한글 폰트로 (위 fontRef 매핑과 일치).
  const fontfaces = [
    fontXml(registry.krFonts, "HANGUL"),
    fontXml(registry.latinFonts, "LATIN"),
    fontXml(registry.krFonts, "HANJA"),
    fontXml(registry.krFonts, "JAPANESE"),
    fontXml(registry.krFonts, "OTHER"),
    fontXml(registry.krFonts, "SYMBOL"),
    fontXml(registry.krFonts, "USER"),
  ].join("");

  const borderFills = registry.borderFills
    .map((bf, i) => borderFillXml(bf, i))
    .join("");

  const charProps = registry.charShapes
    .map((c, i) => charShapeXml(c, i))
    .join("");

  // tabPr: blank.hwpx 처럼 2개. items 없음.
  const tabProps = [
    `<hh:tabProperties itemCnt="2">`,
    `<hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>`,
    `<hh:tabPr id="1" autoTabLeft="1" autoTabRight="0"/>`,
    `</hh:tabProperties>`,
  ].join("");

  // numbering: 7개 paraHead 필수.
  const paraHeads: string[] = [];
  const HEAD_FORMATS: Array<{ fmt: string; text: string }> = [
    { fmt: "DIGIT", text: "^1." },
    { fmt: "HANGUL_SYLLABLE", text: "^2." },
    { fmt: "DIGIT", text: "^3)" },
    { fmt: "HANGUL_SYLLABLE", text: "^4)" },
    { fmt: "DIGIT", text: "(^5)" },
    { fmt: "HANGUL_SYLLABLE", text: "(^6)" },
    { fmt: "CIRCLED_DIGIT", text: "^7" },
  ];
  for (let i = 0; i < 7; i++) {
    const { fmt, text } = HEAD_FORMATS[i];
    paraHeads.push(
      `<hh:paraHead start="1" level="${i + 1}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="${fmt}" charPrIDRef="4294967295" checkable="${i === 6 ? "1" : "0"}">${escapeXml(text)}</hh:paraHead>`,
    );
  }
  const numberings = [
    `<hh:numberings itemCnt="1">`,
    `<hh:numbering id="1" start="0">${paraHeads.join("")}</hh:numbering>`,
    `</hh:numberings>`,
  ].join("");

  const paraProps = registry.paraShapes
    .map((p, i) => paraShapeXml(p, i))
    .join("");

  const styles = [
    `<hh:styles itemCnt="1">`,
    `<hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>`,
    `</hh:styles>`,
  ].join("");

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`,
    `<hh:head ${HWPX_NS} version="1.4" secCnt="${secCnt}">`,
    `<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>`,
    `<hh:refList>`,
    `<hh:fontfaces itemCnt="7">${fontfaces}</hh:fontfaces>`,
    `<hh:borderFills itemCnt="${registry.borderFills.length}">${borderFills}</hh:borderFills>`,
    `<hh:charProperties itemCnt="${registry.charShapes.length}">${charProps}</hh:charProperties>`,
    tabProps,
    numberings,
    `<hh:paraProperties itemCnt="${registry.paraShapes.length}">${paraProps}</hh:paraProperties>`,
    styles,
    `</hh:refList>`,
    `<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>`,
    `<hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption>`,
    `<hh:trackchageConfig flags="56"/>`,
    `</hh:head>`,
  ].join("");
}
