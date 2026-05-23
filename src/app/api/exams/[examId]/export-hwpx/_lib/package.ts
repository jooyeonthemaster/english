/**
 * HWPX OPC 컨테이너 ZIP 빌더.
 * 규약:
 *  - mimetype 은 첫 엔트리, **압축 없이(STORE)** 저장.
 *  - 나머지는 DEFLATE.
 *  - 디렉토리 엔트리는 명시 생성하지 않는다 (경로에서 자동).
 */

import JSZip from "jszip";

import { buildHeaderXml } from "./header-xml";
import { buildSectionXml } from "./section-xml";
import { ShapeRegistry } from "./shapes";
import {
  containerXml,
  contentHpfXml,
  manifestXml,
  MIMETYPE,
  settingsXml,
  versionXml,
} from "./static-files";
import type { HwpxDocument } from "./types";

export async function packageHwpx(doc: HwpxDocument): Promise<Buffer> {
  const zip = new JSZip();

  // 1) mimetype — STORE, 첫 엔트리 (압축 X)
  zip.file("mimetype", MIMETYPE, { compression: "STORE" });

  // 2) META-INF/container.xml — 한컴이 rootfile 위치를 찾는 진입점
  zip.file("META-INF/container.xml", containerXml(), {
    compression: "DEFLATE",
  });

  // 3) META-INF/manifest.xml
  zip.file("META-INF/manifest.xml", manifestXml(), {
    compression: "DEFLATE",
  });

  // 4) version.xml
  zip.file("version.xml", versionXml(), { compression: "DEFLATE" });

  // 5) settings.xml
  zip.file("settings.xml", settingsXml(), { compression: "DEFLATE" });

  // 6) Contents/content.hpf
  zip.file("Contents/content.hpf", contentHpfXml({ title: doc.title }), {
    compression: "DEFLATE",
  });

  // 6) Section XML (단일 섹션 가정 — Phase 0)
  const registry = new ShapeRegistry();
  const sectionXmls = doc.sections.map((sec) =>
    buildSectionXml(sec, registry),
  );

  // 7) header.xml — 모든 섹션 빌드 후 (shape 등록 끝난 후) 작성
  const headerXml = buildHeaderXml(registry, doc.sections.length);
  zip.file("Contents/header.xml", headerXml, { compression: "DEFLATE" });

  sectionXmls.forEach((xml, idx) => {
    zip.file(`Contents/section${idx}.xml`, xml, { compression: "DEFLATE" });
  });

  // 빌드
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    mimeType: MIMETYPE,
  });
  return buf;
}
