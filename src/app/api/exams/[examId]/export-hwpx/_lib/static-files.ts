/**
 * HWPX OPC 컨테이너의 정적 파일들.
 *
 * 한컴 호환 검증된 blank.hwpx (neolord0/hwpxlib testFile) 와 동일한 구조.
 *
 *  - mimetype (STORE, 첫 엔트리)
 *  - META-INF/container.xml  ← 한컴은 이 파일로 rootfile 위치를 먼저 찾는다
 *  - META-INF/manifest.xml   (빈 매니페스트로 OK)
 *  - version.xml
 *  - settings.xml
 *  - Contents/content.hpf    (OPF 패키지)
 */

import { escapeXml } from "./escape";

export const MIMETYPE = "application/hwp+zip";

// 공통 namespace 묶음 (content.hpf / header.xml / section0.xml 모두 이 풀세트를 사용)
export const HWPX_NS = [
  `xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"`,
  `xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"`,
  `xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph"`,
  `xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"`,
  `xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"`,
  `xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"`,
  `xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history"`,
  `xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page"`,
  `xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"`,
  `xmlns:dc="http://purl.org/dc/elements/1.1/"`,
  `xmlns:opf="http://www.idpf.org/2007/opf/"`,
  `xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart"`,
  `xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"`,
  `xmlns:epub="http://www.idpf.org/2007/ops"`,
  `xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"`,
].join(" ");

export function containerXml(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`,
    `<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">`,
    `<ocf:rootfiles>`,
    `<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>`,
    `</ocf:rootfiles>`,
    `</ocf:container>`,
  ].join("");
}

export function manifestXml(): string {
  // 한컴 blank.hwpx 는 매니페스트가 빈 컨테이너 한 줄.
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`,
    `<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`,
  ].join("");
}

export function versionXml(): string {
  // "tagetApplication" 오타는 한컴 공식 표기. WORDPROCESSOR 값 필수.
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`,
    `<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="0" micro="5" buildNumber="0" xmlVersion="1.4" application="Nara Workbench" appVersion="1.0.0.0"/>`,
  ].join("");
}

export function settingsXml(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`,
    `<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">`,
    `<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>`,
    `</ha:HWPApplicationSetting>`,
  ].join("");
}

export interface ContentHpfOptions {
  title: string;
  createdIso?: string; // ISO 8601 timestamp
}

export function contentHpfXml(opts: ContentHpfOptions): string {
  const { title, createdIso } = opts;
  const iso = createdIso ?? new Date().toISOString().slice(0, 19) + "Z";
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`,
    `<opf:package ${HWPX_NS} version="" unique-identifier="" id="">`,
    `<opf:metadata>`,
    `<opf:title>${escapeXml(title)}</opf:title>`,
    `<opf:language>ko</opf:language>`,
    `<opf:meta name="creator" content="text"/>`,
    `<opf:meta name="subject" content="text"/>`,
    `<opf:meta name="description" content="text"/>`,
    `<opf:meta name="lastsaveby" content="text"/>`,
    `<opf:meta name="CreatedDate" content="text">${iso}</opf:meta>`,
    `<opf:meta name="ModifiedDate" content="text">${iso}</opf:meta>`,
    `<opf:meta name="date" content="text">${iso}</opf:meta>`,
    `<opf:meta name="keyword" content="text"/>`,
    `</opf:metadata>`,
    `<opf:manifest>`,
    `<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>`,
    `<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>`,
    `<opf:item id="settings" href="settings.xml" media-type="application/xml"/>`,
    `</opf:manifest>`,
    `<opf:spine>`,
    `<opf:itemref idref="header"/>`,
    `<opf:itemref idref="section0"/>`,
    `</opf:spine>`,
    `</opf:package>`,
  ].join("");
}
