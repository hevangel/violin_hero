from __future__ import annotations

import json
import os
import re
import site
import zipfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree

import pypdfium2 as pdfium
import numpy as np
from PIL import Image
from rapidocr import RapidOCR


def add_nvidia_dll_directories() -> None:
    for site_dir in site.getsitepackages():
        nvidia_dir = Path(site_dir) / "nvidia"
        for relative_bin_dir in [
            Path("cublas") / "bin",
            Path("cuda_nvrtc") / "bin",
            Path("cuda_runtime") / "bin",
            Path("cudnn") / "bin",
            Path("cufft") / "bin",
            Path("nvjitlink") / "bin",
        ]:
            bin_dir = nvidia_dir / relative_bin_dir
            if not bin_dir.exists():
                continue

            if hasattr(os, "add_dll_directory"):
                os.add_dll_directory(str(bin_dir))
            os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}"


add_nvidia_dll_directories()
import onnxruntime as ort

raster_extensions = {".png", ".jpg", ".jpeg", ".webp"}
rapidocr_min_score = 0.5
rapidocr_use_cuda_env = "VIOLIN_HERO_RAPIDOCR_CUDA"


@dataclass(frozen=True)
class OcrLine:
    text: str
    score: float
    left: float
    top: float
    right: float
    bottom: float

    @property
    def height(self) -> float:
        return max(1, self.bottom - self.top)


def build_omr_hints(scan_path: Path, musicxml_path: Path) -> dict[str, object]:
    """Extract OCR metadata from the source scan to correct weak Audiveris labels."""
    lines = read_scan_text(scan_path)
    musicxml_text = read_musicxml_text(musicxml_path)
    return extract_hints_from_lines(lines, musicxml_text)


def encode_hints_header(hints: dict[str, object]) -> str:
    return quote(json.dumps(hints, separators=(",", ":")), safe="")


def extract_hints_from_lines(lines: list[OcrLine], musicxml_text: str | None = None) -> dict[str, object]:
    hints: dict[str, object] = {}
    title = choose_title(lines)
    if title:
        hints["title"] = title

    recognized_text = [line.text for line in lines if line.score >= rapidocr_min_score]
    if recognized_text:
        hints["recognizedText"] = recognized_text[:40]

    if has_violin_text(lines) and musicxml_has_piano_voice_parts(musicxml_text):
        hints["violinPartAliases"] = ["voice"]

    return hints


def read_scan_text(scan_path: Path) -> list[OcrLine]:
    images = scan_to_images(scan_path)
    if not images:
        return []

    ocr = create_rapidocr_engine()
    lines: list[OcrLine] = []
    for image in images[:1]:
        image_content = np.array(image) if isinstance(image, Image.Image) else image
        result = ocr(image_content)
        texts = result.txts if result.txts is not None else ()
        boxes = result.boxes if result.boxes is not None else ()
        scores = result.scores if result.scores is not None else ()
        for text, box, score in zip(texts, boxes, scores):
            normalized = normalize_text(str(text))
            if not normalized or float(score) < rapidocr_min_score:
                continue

            xs = [float(point[0]) for point in box]
            ys = [float(point[1]) for point in box]
            lines.append(
                OcrLine(
                    text=normalized,
                    score=float(score),
                    left=min(xs),
                    top=min(ys),
                    right=max(xs),
                    bottom=max(ys),
                )
            )

    return sorted(lines, key=lambda line: (line.top, line.left))


def scan_to_images(scan_path: Path) -> list[Image.Image | str]:
    suffix = scan_path.suffix.lower()
    if suffix in raster_extensions:
        return [str(scan_path)]

    if suffix == ".pdf":
        document = pdfium.PdfDocument(scan_path)
        if len(document) == 0:
            return []

        page = document[0]
        return [page.render(scale=2.5).to_pil()]

    return []


def create_rapidocr_engine() -> RapidOCR:
    use_cuda = should_use_cuda()
    try:
        return RapidOCR(params=rapidocr_params(use_cuda))
    except Exception:
        if not use_cuda:
            raise
        return RapidOCR(params=rapidocr_params(False))


def should_use_cuda() -> bool:
    requested = os.environ.get(rapidocr_use_cuda_env, "auto").strip().lower()
    if requested in {"0", "false", "no", "off", "cpu"}:
        return False

    providers = ort.get_available_providers()
    return ort.get_device() == "GPU" and "CUDAExecutionProvider" in providers


def rapidocr_params(use_cuda: bool) -> dict[str, bool]:
    return {"EngineConfig.onnxruntime.use_cuda": use_cuda}


def choose_title(lines: list[OcrLine]) -> str | None:
    candidates = [(line, score_title_candidate(line)) for line in lines]
    candidates = [(line, score) for line, score in candidates if score > 0]
    if not candidates:
        return None

    candidates.sort(key=lambda item: item[1], reverse=True)
    return candidates[0][0].text


def score_title_candidate(line: OcrLine) -> float:
    text = line.text
    lower = text.lower()
    score = min(len(text), 70) + line.score * 25

    if line.top <= 260:
        score += 28
    elif line.top <= 520:
        score += 12
    else:
        score -= 25

    score += min(line.height, 80) * 1.2

    if re.search(r"[,:;!?]", text):
        score += 10

    if re.fullmatch(r"(violin|voice|piano|part|score|page|traditional|composer|arranger)(\s+[ivx\d]+)?", lower):
        score -= 100

    if re.search(r"\b(arr\.|arranged|composer|copyright|public domain|page)\b", lower):
        score -= 60

    if len(text) < 4:
        score -= 80

    return score


def has_violin_text(lines: list[OcrLine]) -> bool:
    return any(re.search(r"\b(vln|violin|violino|violon)\b", line.text, re.IGNORECASE) for line in lines)


def musicxml_has_piano_voice_parts(musicxml_text: str | None) -> bool:
    if not musicxml_text:
        return False

    try:
        root = ElementTree.fromstring(musicxml_text)
    except ElementTree.ParseError:
        return False

    labels: list[str] = []
    for score_part in root.findall(".//score-part"):
        part_text = " ".join(text.strip() for text in score_part.itertext() if text and text.strip())
        labels.append(part_text.lower())

    has_piano = any(re.search(r"\b(pno|piano|pianoforte|keyboard)\b", label) for label in labels)
    has_voice = any(re.search(r"\b(voice|vocal|singer|melody)\b", label) for label in labels)
    return has_piano and has_voice


def read_musicxml_text(path: Path) -> str | None:
    if path.suffix.lower() == ".mxl":
        with zipfile.ZipFile(path) as archive:
            xml_names = [
                name
                for name in archive.namelist()
                if name.lower().endswith((".musicxml", ".xml")) and not name.lower().endswith("container.xml")
            ]
            if not xml_names:
                return None
            return archive.read(xml_names[0]).decode("utf-8", errors="replace")

    if path.suffix.lower() in {".musicxml", ".xml"}:
        return path.read_text(encoding="utf-8", errors="replace")

    return None


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()
