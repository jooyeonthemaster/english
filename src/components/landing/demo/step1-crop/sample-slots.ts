"use client";

// Step1 데모용 샘플 교재 페이지 — 워크벤치 튜토리얼의 검증된 패턴
// (generate-upload-panel.tsx createGenerateTourSampleImageFile)과 동일하게
// 브라우저 캔버스로 그려 File 로 만들고, 실제 추출 파이프라인의 imagesToSlots 로
// ClientPageSlot 을 만든다. 네트워크·서버 의존 0.
import { imagesToSlots } from "@/lib/extraction/pdf-splitter";
import type { ClientPageSlot } from "@/lib/extraction/types";
import { DEMO_PASSAGE } from "../fixtures/passage";

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 교재 스캔 페이지처럼 보이는 샘플 이미지(2단 지문·페이지 번호)를 그려 File 로 반환. */
async function createSampleTextbookPageFile(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1650;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D 컨텍스트를 열 수 없습니다.");

  // 종이 배경
  context.fillStyle = "#f6f5f1";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(15, 23, 42, 0.10)";
  context.shadowBlur = 26;
  context.shadowOffsetY = 10;
  context.fillRect(70, 60, 1100, 1530);
  context.shadowColor = "transparent";

  // 단원 헤더
  context.fillStyle = "#1d4ed8";
  context.font = "800 26px Arial, sans-serif";
  context.fillText("UNIT 07", 130, 150);
  context.fillStyle = "#475569";
  context.font = "700 22px Arial, sans-serif";
  context.fillText("Reading Comprehension — Classic Short Stories", 240, 150);
  context.strokeStyle = "#cbd5e1";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(130, 176);
  context.lineTo(1110, 176);
  context.stroke();

  // 지문 제목
  context.fillStyle = "#0f172a";
  context.font = "800 30px Georgia, serif";
  context.fillText(DEMO_PASSAGE.title, 130, 240);

  // 2단 본문 — 데모 지문을 앞/뒤로 나눠 좌우 칼럼에 흘린다.
  const words = DEMO_PASSAGE.text.split(/\s+/);
  const half = Math.ceil(words.length / 2);
  const columns = [words.slice(0, half).join(" "), words.slice(half).join(" ")];

  context.strokeStyle = "#e2e8f0";
  context.beginPath();
  context.moveTo(620, 290);
  context.lineTo(620, 1440);
  context.stroke();

  context.fillStyle = "#1f2937";
  context.font = "400 24px Georgia, serif";
  const columnX = [130, 660];
  columns.forEach((columnText, columnIndex) => {
    let y = 320;
    for (const line of wrapCanvasText(context, columnText, 450)) {
      context.fillText(line, columnX[columnIndex], y);
      y += 38;
    }
  });

  // 페이지 번호
  context.fillStyle = "#94a3b8";
  context.font = "700 22px Arial, sans-serif";
  context.fillText("— 142 —", 590, 1550);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("샘플 페이지 생성에 실패했습니다."));
        return;
      }
      resolve(result);
    }, "image/png");
  });

  return new File([blob], "교재_p.142.png", { type: "image/png" });
}

/** 데모 크롭보드에 시드할 슬롯 생성 — 실제 파이프라인(imagesToSlots) 그대로.
 *  slotId 는 워크벤치 호스트(appendSlots)가 부여하는 값 — 없으면 크롭보드가
 *  박스를 집계하지 않아(우측 '추출될 지문' 카드 미표시) 여기서 직접 부여한다. */
export async function createSampleSlots(): Promise<ClientPageSlot[]> {
  const file = await createSampleTextbookPageFile();
  const slots = await imagesToSlots([file]);
  return slots.map((slot, index) => ({
    ...slot,
    slotId: slot.slotId ?? `landing-demo-slot-${index}`,
  }));
}
