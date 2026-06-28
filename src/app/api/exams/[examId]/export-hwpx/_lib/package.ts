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
    createFolders: false,
  });

  // 3) META-INF/manifest.xml
  zip.file("META-INF/manifest.xml", manifestXml(), {
    compression: "DEFLATE",
    createFolders: false,
  });

  // 4) version.xml
  zip.file("version.xml", versionXml(), { compression: "DEFLATE" });

  // 5) settings.xml
  zip.file("settings.xml", settingsXml(), { compression: "DEFLATE" });

  // 6) Section XML — 먼저 빌드해 shape/이미지 등록을 끝낸다(content.hpf·header 가 이를 참조).
  const registry = new ShapeRegistry(doc.defaultFontKr, doc.defaultFontLatin);
  const sectionXmls = doc.sections.map((sec) =>
    buildSectionXml(sec, registry),
  );

  // 7) Contents/content.hpf — 섹션 빌드 후(임베드 이미지 매니페스트 포함) 작성.
  zip.file(
    "Contents/content.hpf",
    contentHpfXml({
      title: doc.title,
      sectionCount: doc.sections.length,
      images: registry.images.map((im) => ({
        id: im.id,
        href: `BinData/${im.id}.${im.ext}`,
        mime: im.mime,
      })),
    }),
    {
      compression: "DEFLATE",
      createFolders: false,
    },
  );

  // 8) BinData/*.{ext} — 임베드 이미지 바이너리.
  for (const im of registry.images) {
    zip.file(`BinData/${im.id}.${im.ext}`, im.buffer, {
      compression: "DEFLATE",
      createFolders: false,
    });
  }

  // 9) header.xml — 모든 섹션 빌드 후 (shape 등록 끝난 후) 작성
  const headerXml = buildHeaderXml(registry, doc.sections.length);
  zip.file("Contents/header.xml", headerXml, {
    compression: "DEFLATE",
    createFolders: false,
  });

  sectionXmls.forEach((xml, idx) => {
    zip.file(`Contents/section${idx}.xml`, xml, {
      compression: "DEFLATE",
      createFolders: false,
    });
  });

  // 빌드
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    mimeType: MIMETYPE,
  });
  return buf;
}
