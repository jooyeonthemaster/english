from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz
from PIL import Image


DEFAULT_MODEL = "gemini-3-flash-preview"
DEFAULT_OUTPUT_DIR = Path("data/ocr/2024_suneung_english_questions")

SYSTEM_PROMPT = """You are a high-accuracy OCR engine for Korean exam papers.

Extract every visible printed text from the page image exactly as it appears.
Do not summarize, translate, solve, explain, normalize, or correct the text.
Include headers, footers, page numbers, question numbers, instructions, passages,
answer choices, table text, diagram labels, captions, and small visible notes.
Preserve line breaks as much as possible. For multi-column pages, read in natural
exam order: top to bottom within the left column, then top to bottom within the
right column, unless the visual layout clearly indicates another order.
Keep original symbols such as circled numbers, brackets, punctuation, math-like
marks, and Korean/English capitalization. If a character is unclear, write [?].
Return only the extracted plain text. No Markdown fences. No JSON. No comments."""


def build_user_prompt(
    page_number: int,
    total_pages: int,
    crop_label: str | None = None,
) -> str:
    if crop_label:
        return (
            f"This image is {crop_label}, a cropped region from page {page_number} "
            f"of {total_pages} from a PDF exam paper.\n"
            "Extract all visible text from this cropped region, verbatim, in reading order."
        )

    return (
        f"This image is page {page_number} of {total_pages} from a PDF exam paper.\n"
        "Extract all visible text from this single page, verbatim, in reading order."
    )


@dataclass
class GeminiResult:
    text: str
    raw: dict[str, Any]
    input_tokens: int | None
    output_tokens: int | None
    finish_reason: str | None = None


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or key in os.environ:
            continue

        if (
            len(value) >= 2
            and value[0] == value[-1]
            and value[0] in {"'", '"'}
        ):
            value = value[1:-1]

        os.environ[key] = value


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def ensure_source_pdf(input_pdf: Path, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    source_pdf = output_dir / "source.pdf"
    if input_pdf.resolve() != source_pdf.resolve():
        source_pdf.write_bytes(input_pdf.read_bytes())
    return source_pdf


def render_pdf_pages(
    pdf_path: Path,
    images_dir: Path,
    *,
    dpi: int,
    jpeg_quality: int,
    force: bool,
) -> list[dict[str, Any]]:
    images_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    zoom = dpi / 72
    matrix = fitz.Matrix(zoom, zoom)
    pages: list[dict[str, Any]] = []

    for page_index in range(doc.page_count):
        page_number = page_index + 1
        image_path = images_dir / f"page_{page_number:03d}.jpg"

        if force or not image_path.exists():
            page = doc.load_page(page_index)
            pix = page.get_pixmap(matrix=matrix, alpha=False, colorspace=fitz.csRGB)
            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            image.save(
                image_path,
                "JPEG",
                quality=jpeg_quality,
                optimize=True,
                progressive=False,
            )

        with Image.open(image_path) as img:
            width, height = img.size

        pages.append(
            {
                "pageNumber": page_number,
                "imagePath": str(image_path.as_posix()),
                "width": width,
                "height": height,
                "bytes": image_path.stat().st_size,
            }
        )

    doc.close()
    return pages


def read_candidate_text(body: dict[str, Any]) -> str:
    candidates = body.get("candidates") or []
    if not candidates:
        return ""

    parts = ((candidates[0].get("content") or {}).get("parts")) or []
    return "".join(part.get("text", "") for part in parts).strip()


def strip_markdown_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def call_gemini(
    *,
    api_key: str,
    model: str,
    image_path: Path,
    page_number: int,
    total_pages: int,
    timeout: int,
    max_retries: int,
    crop_label: str | None = None,
) -> GeminiResult:
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    image_b64 = base64.b64encode(image_path.read_bytes()).decode("ascii")
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": "image/jpeg",
                            "data": image_b64,
                        }
                    },
                    {"text": build_user_prompt(page_number, total_pages, crop_label)},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "topK": 1,
            "topP": 0,
            "maxOutputTokens": 16384,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }

    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        request = urllib.request.Request(
            endpoint,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
            candidate = (body.get("candidates") or [{}])[0]
            text = strip_markdown_fences(read_candidate_text(body))
            usage = body.get("usageMetadata") or {}
            return GeminiResult(
                text=text,
                raw=body,
                input_tokens=usage.get("promptTokenCount"),
                output_tokens=usage.get("candidatesTokenCount"),
                finish_reason=candidate.get("finishReason"),
            )
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_error = RuntimeError(f"Gemini HTTP {exc.code}: {detail[:1000]}")
            if exc.code not in {429, 500, 502, 503, 504} or attempt >= max_retries:
                raise last_error
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt >= max_retries:
                raise

        sleep_seconds = min(60, 2**attempt * 5)
        print(
            f"  retrying page {page_number} after {sleep_seconds}s: {last_error}",
            flush=True,
        )
        time.sleep(sleep_seconds)

    raise RuntimeError(f"Gemini request failed: {last_error}")


@dataclass
class CropInfo:
    label: str
    path: Path
    box: tuple[int, int, int, int]


def row_dark_scores(image: Image.Image, box: tuple[int, int, int, int]) -> list[int]:
    crop = image.crop(box).convert("L")
    binary = crop.point(lambda p: 1 if p < 225 else 0)
    width, height = binary.size
    data = list(binary.getdata())
    return [sum(data[y * width : (y + 1) * width]) for y in range(height)]


def choose_whitespace_cut(
    scores: list[int],
    start: int,
    target: int,
    *,
    min_height: int,
    max_search: int = 170,
) -> int:
    height = len(scores)
    low = max(start + min_height, target - max_search)
    high = min(height - min_height, target + max_search)
    if low >= high:
        return min(target, height)

    threshold = max(12, int(max(scores) * 0.015))
    best_pos = target
    best_score: tuple[int, int] | None = None

    for pos in range(low, high):
        window = scores[max(0, pos - 8) : min(height, pos + 9)]
        darkness = sum(window)
        distance = abs(pos - target)
        if darkness <= threshold * max(1, len(window)):
            score = (distance, darkness)
        else:
            score = (max_search + distance, darkness)
        if best_score is None or score < best_score:
            best_score = score
            best_pos = pos

    return best_pos


def split_column_box(
    image: Image.Image,
    box: tuple[int, int, int, int],
    *,
    max_height: int = 260,
    min_height: int = 120,
) -> list[tuple[int, int, int, int]]:
    x1, y1, x2, y2 = box
    local_height = y2 - y1
    if local_height <= max_height:
        return [box]

    scores = row_dark_scores(image, box)
    boxes: list[tuple[int, int, int, int]] = []
    start = 0
    while local_height - start > max_height:
        target = start + max_height
        cut = choose_whitespace_cut(scores, start, target, min_height=min_height)
        boxes.append((x1, y1 + start, x2, y1 + cut))
        start = cut
    boxes.append((x1, y1 + start, x2, y2))
    return boxes


def create_page_crops(
    image_path: Path,
    crops_dir: Path,
    *,
    force: bool,
) -> list[CropInfo]:
    crops_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(image_path) as original:
        image = original.convert("RGB")
        width, height = image.size

        top = int(height * 0.13)
        bottom = int(height * 0.925)
        center = width // 2
        left_margin = int(width * 0.075)
        right_margin = int(width * 0.055)

        crop_boxes: list[tuple[str, tuple[int, int, int, int]]] = [
            ("header", (0, 0, width, top)),
        ]

        left_column = (left_margin, top, center - 25, bottom)
        right_column = (center + 25, top, width - right_margin, bottom)

        for index, box in enumerate(split_column_box(image, left_column), start=1):
            crop_boxes.append((f"left column band {index}", box))
        for index, box in enumerate(split_column_box(image, right_column), start=1):
            crop_boxes.append((f"right column band {index}", box))

        crop_boxes.append(("footer", (0, bottom, width, height)))

        crops: list[CropInfo] = []
        for index, (label, box) in enumerate(crop_boxes, start=1):
            suffix = label.replace(" ", "_")
            crop_path = crops_dir / f"crop_{index:02d}_{suffix}.jpg"
            if force or not crop_path.exists():
                image.crop(box).save(
                    crop_path,
                    "JPEG",
                    quality=92,
                    optimize=True,
                    progressive=False,
                )
            crops.append(CropInfo(label=label, path=crop_path, box=box))

    return crops


def split_crop_to_subcrops(
    crop: CropInfo,
    parent_dir: Path,
    *,
    force: bool,
    max_height: int = 90,
    min_height: int = 35,
) -> list[CropInfo]:
    sub_dir = parent_dir / f"{crop.path.stem}_parts"
    sub_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(crop.path) as original:
        image = original.convert("RGB")
        width, height = image.size
        boxes = split_column_box(
            image,
            (0, 0, width, height),
            max_height=max_height,
            min_height=min_height,
        )

        subcrops: list[CropInfo] = []
        for index, box in enumerate(boxes, start=1):
            sub_path = sub_dir / f"part_{index:02d}.jpg"
            if force or not sub_path.exists():
                image.crop(box).save(
                    sub_path,
                    "JPEG",
                    quality=94,
                    optimize=True,
                    progressive=False,
                )
            subcrops.append(
                CropInfo(
                    label=f"{crop.label} part {index}",
                    path=sub_path,
                    box=box,
                )
            )
    return subcrops


def should_use_crop_fallback(result: GeminiResult) -> bool:
    return not result.text.strip() and result.finish_reason == "RECITATION"


def ocr_crop_with_subfallback(
    *,
    api_key: str,
    model: str,
    crop: CropInfo,
    page_number: int,
    total_pages: int,
    timeout: int,
    max_retries: int,
    page_crops_dir: Path,
    force: bool,
) -> tuple[str, dict[str, Any], int, int]:
    result = call_gemini(
        api_key=api_key,
        model=model,
        image_path=crop.path,
        page_number=page_number,
        total_pages=total_pages,
        timeout=timeout,
        max_retries=max_retries,
        crop_label=crop.label,
    )

    input_tokens = result.input_tokens or 0
    output_tokens = result.output_tokens or 0
    text = result.text.strip()
    record: dict[str, Any] = {
        "label": crop.label,
        "imagePath": str(crop.path.as_posix()),
        "box": crop.box,
        "text": text,
        "finishReason": result.finish_reason,
        "inputTokens": result.input_tokens,
        "outputTokens": result.output_tokens,
        "raw": result.raw,
    }

    if text or result.finish_reason != "RECITATION":
        return text, record, input_tokens, output_tokens

    print(f"      {crop.label}: RECITATION finish, retrying by subcrops", flush=True)
    subcrops = split_crop_to_subcrops(crop, page_crops_dir, force=force)
    sub_records: list[dict[str, Any]] = []
    sub_texts: list[str] = []

    for index, subcrop in enumerate(subcrops, start=1):
        print(f"        subcrop {index}/{len(subcrops)}", flush=True)
        sub_result = call_gemini(
            api_key=api_key,
            model=model,
            image_path=subcrop.path,
            page_number=page_number,
            total_pages=total_pages,
            timeout=timeout,
            max_retries=max_retries,
            crop_label=subcrop.label,
        )
        sub_text = sub_result.text.strip()
        if sub_text:
            sub_texts.append(sub_text)
        input_tokens += sub_result.input_tokens or 0
        output_tokens += sub_result.output_tokens or 0
        sub_records.append(
            {
                "label": subcrop.label,
                "imagePath": str(subcrop.path.as_posix()),
                "box": subcrop.box,
                "text": sub_text,
                "finishReason": sub_result.finish_reason,
                "inputTokens": sub_result.input_tokens,
                "outputTokens": sub_result.output_tokens,
                "raw": sub_result.raw,
            }
        )

    combined_text = "\n".join(sub_texts).strip()
    record["text"] = combined_text
    record["finishReason"] = "SUBCROP_FALLBACK"
    record["initialFinishReason"] = result.finish_reason
    record["subcrops"] = sub_records
    record["inputTokens"] = input_tokens or None
    record["outputTokens"] = output_tokens or None
    return combined_text, record, input_tokens, output_tokens


def ocr_page_with_fallback(
    *,
    api_key: str,
    model: str,
    image_path: Path,
    page_number: int,
    total_pages: int,
    timeout: int,
    max_retries: int,
    crops_root: Path,
    force: bool,
) -> GeminiResult:
    initial = call_gemini(
        api_key=api_key,
        model=model,
        image_path=image_path,
        page_number=page_number,
        total_pages=total_pages,
        timeout=timeout,
        max_retries=max_retries,
    )
    if not should_use_crop_fallback(initial):
        return initial

    print(f"  page {page_number}: RECITATION finish, retrying by crops", flush=True)
    page_crops_dir = crops_root / f"page_{page_number:03d}"
    crops = create_page_crops(image_path, page_crops_dir, force=force)

    crop_records: list[dict[str, Any]] = []
    crop_texts: list[str] = []
    input_tokens = initial.input_tokens or 0
    output_tokens = initial.output_tokens or 0

    for index, crop in enumerate(crops, start=1):
        print(f"    crop {index}/{len(crops)}: {crop.label}", flush=True)
        crop_text, crop_record, crop_input_tokens, crop_output_tokens = ocr_crop_with_subfallback(
            api_key=api_key,
            model=model,
            crop=crop,
            page_number=page_number,
            total_pages=total_pages,
            timeout=timeout,
            max_retries=max_retries,
            page_crops_dir=page_crops_dir,
            force=force,
        )
        if crop_text:
            crop_texts.append(crop_text)
        input_tokens += crop_input_tokens
        output_tokens += crop_output_tokens
        crop_records.append(crop_record)

    return GeminiResult(
        text="\n\n".join(crop_texts).strip(),
        raw={
            "fallback": "crops_after_recitation",
            "initial": initial.raw,
            "crops": crop_records,
        },
        input_tokens=input_tokens or None,
        output_tokens=output_tokens or None,
        finish_reason="CROP_FALLBACK",
    )


def write_manifest(output_dir: Path, manifest: dict[str, Any]) -> None:
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def result_from_existing_files(text_path: Path, response_path: Path) -> GeminiResult:
    text = text_path.read_text(encoding="utf-8").strip()
    if not response_path.exists():
        return GeminiResult(text=text, raw={}, input_tokens=None, output_tokens=None)

    raw = json.loads(response_path.read_text(encoding="utf-8"))
    if raw.get("fallback") == "crops_after_recitation":
        input_tokens = 0
        output_tokens = 0
        for crop in raw.get("crops", []):
            input_tokens += crop.get("inputTokens") or 0
            output_tokens += crop.get("outputTokens") or 0
        initial_usage = (raw.get("initial") or {}).get("usageMetadata") or {}
        input_tokens += initial_usage.get("promptTokenCount") or 0
        output_tokens += initial_usage.get("candidatesTokenCount") or 0
        return GeminiResult(
            text=text,
            raw=raw,
            input_tokens=input_tokens or None,
            output_tokens=output_tokens or None,
            finish_reason="CROP_FALLBACK",
        )

    usage = raw.get("usageMetadata") or {}
    candidate = (raw.get("candidates") or [{}])[0]
    return GeminiResult(
        text=text,
        raw=raw,
        input_tokens=usage.get("promptTokenCount"),
        output_tokens=usage.get("candidatesTokenCount"),
        finish_reason=candidate.get("finishReason"),
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render PDF pages to images and OCR each page with Gemini."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_OUTPUT_DIR / "source.pdf",
        help="Input PDF path.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for source copy, images, text files, raw responses, and manifest.",
    )
    parser.add_argument("--model", default=os.environ.get("GEMINI_OCR_MODEL", DEFAULT_MODEL))
    parser.add_argument("--dpi", type=int, default=200)
    parser.add_argument("--jpeg-quality", type=int, default=90)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--max-retries", type=int, default=3)
    parser.add_argument("--force", action="store_true", help="Regenerate images and OCR text.")
    args = parser.parse_args()

    root = project_root()
    os.chdir(root)
    load_dotenv(root / ".env")

    api_key = os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY")
    if not api_key:
        print("Missing GOOGLE_GENERATIVE_AI_API_KEY in environment or .env", file=sys.stderr)
        return 1

    output_dir = args.output_dir
    images_dir = output_dir / "pages"
    crops_dir = output_dir / "crops"
    texts_dir = output_dir / "texts"
    responses_dir = output_dir / "responses"
    texts_dir.mkdir(parents=True, exist_ok=True)
    responses_dir.mkdir(parents=True, exist_ok=True)

    input_pdf = args.input
    if not input_pdf.exists():
        print(f"Input PDF not found: {input_pdf}", file=sys.stderr)
        return 1

    source_pdf = ensure_source_pdf(input_pdf, output_dir)
    print(f"source: {source_pdf}")
    print(f"model: {args.model}")

    pages = render_pdf_pages(
        source_pdf,
        images_dir,
        dpi=args.dpi,
        jpeg_quality=args.jpeg_quality,
        force=args.force,
    )
    total_pages = len(pages)
    print(f"rendered images: {total_pages}")

    manifest: dict[str, Any] = {
        "sourcePdf": str(source_pdf.as_posix()),
        "originalInput": str(input_pdf.as_posix()),
        "model": args.model,
        "dpi": args.dpi,
        "jpegQuality": args.jpeg_quality,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "pageCount": total_pages,
        "pages": [],
    }

    all_pages: list[str] = []
    total_input_tokens = 0
    total_output_tokens = 0

    for page in pages:
        page_number = int(page["pageNumber"])
        text_path = texts_dir / f"page_{page_number:03d}.txt"
        response_path = responses_dir / f"page_{page_number:03d}.json"

        if args.force or not text_path.exists():
            print(f"ocr page {page_number}/{total_pages}", flush=True)
            result = ocr_page_with_fallback(
                api_key=api_key,
                model=args.model,
                image_path=Path(page["imagePath"]),
                page_number=page_number,
                total_pages=total_pages,
                timeout=args.timeout,
                max_retries=args.max_retries,
                crops_root=crops_dir,
                force=args.force,
            )
            text_path.write_text(result.text + "\n", encoding="utf-8")
            response_path.write_text(
                json.dumps(result.raw, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        else:
            print(f"skip existing OCR page {page_number}/{total_pages}", flush=True)
            result = result_from_existing_files(text_path, response_path)

        text = text_path.read_text(encoding="utf-8").strip()
        all_pages.append(f"===== page {page_number:03d} / {total_pages:03d} =====\n{text}\n")

        if result.input_tokens:
            total_input_tokens += result.input_tokens
        if result.output_tokens:
            total_output_tokens += result.output_tokens

        page_manifest = {
            **page,
            "textPath": str(text_path.as_posix()),
            "responsePath": str(response_path.as_posix()),
            "charCount": len(text),
            "inputTokens": result.input_tokens,
            "outputTokens": result.output_tokens,
        }
        manifest["pages"].append(page_manifest)
        write_manifest(output_dir, manifest)

    (output_dir / "all_pages.txt").write_text("\n".join(all_pages), encoding="utf-8")
    manifest["totalInputTokens"] = total_input_tokens or None
    manifest["totalOutputTokens"] = total_output_tokens or None
    manifest["completedAt"] = datetime.now(timezone.utc).isoformat()
    write_manifest(output_dir, manifest)

    print(f"done: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
