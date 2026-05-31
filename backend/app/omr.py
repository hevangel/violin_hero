from __future__ import annotations

import os
import shlex
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile
from PIL import Image

from app.ocr_hints import build_omr_hints

allowed_omr_extensions = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
raster_omr_extensions = {".png", ".jpg", ".jpeg", ".webp"}
export_extensions = {".mxl", ".musicxml", ".xml"}
target_raster_max_dimension = 3600


class OmrError(RuntimeError):
    """Raised when score conversion cannot produce a usable MusicXML file."""


@dataclass
class ConvertedScore:
    path: Path
    temp_dir: tempfile.TemporaryDirectory[str]
    hints: dict[str, object]

    def cleanup(self) -> None:
        self.temp_dir.cleanup()


def validate_omr_upload(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in allowed_omr_extensions:
        supported = ", ".join(sorted(allowed_omr_extensions))
        raise OmrError(f"Unsupported OMR file type '{suffix}'. Supported types: {supported}.")
    return suffix


async def convert_upload_with_audiveris(upload: UploadFile) -> ConvertedScore:
    suffix = validate_omr_upload(upload.filename or "")

    temp_dir = tempfile.TemporaryDirectory(prefix="violin-hero-omr-")
    job_dir = Path(temp_dir.name)
    input_path = job_dir / f"score{suffix}"
    output_dir = job_dir / "output"
    output_dir.mkdir()

    try:
        with input_path.open("wb") as destination:
            while chunk := await upload.read(1024 * 1024):
                destination.write(chunk)

        prepared_path = prepare_input_for_omr(input_path, suffix)
        run_audiveris(prepared_path, output_dir)
        exported = find_exported_score(output_dir)
        hints = collect_hints_safely(prepared_path, exported)
        return ConvertedScore(path=exported, temp_dir=temp_dir, hints=hints)
    except Exception:
        temp_dir.cleanup()
        raise


def run_audiveris(input_path: Path, output_dir: Path) -> None:
    command = shlex.split(os.environ.get("AUDIVERIS_COMMAND", "Audiveris"))
    timeout = int(os.environ.get("AUDIVERIS_TIMEOUT_SECONDS", "180"))
    args = [
        *command,
        "-batch",
        "-export",
        "-option",
        "org.audiveris.omr.sheet.BookManager.useSeparateBookFolders=false",
        "-output",
        str(output_dir),
        str(input_path),
    ]

    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
    except FileNotFoundError as exc:
        raise OmrError(
            "Audiveris was not found. Install Audiveris and set AUDIVERIS_COMMAND if it is not on PATH."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise OmrError("Audiveris timed out while converting the score.") from exc

    if result.returncode != 0:
        output = "\n".join(part for part in [result.stdout, result.stderr] if part).strip()
        detail = f" Audiveris output: {summarize_process_output(output)}" if output else ""
        raise OmrError(f"Audiveris could not convert this score.{detail}")


def prepare_input_for_omr(input_path: Path, suffix: str) -> Path:
    if suffix not in raster_omr_extensions:
        return input_path

    try:
        with Image.open(input_path) as image:
            width, height = image.size
            scale = max(1, min(4, -(-target_raster_max_dimension // max(width, height))))
            prepared_path = input_path.with_name("score-prepared.png")
            prepared_image = image.convert("RGB")
            if scale > 1:
                prepared_image = prepared_image.resize((width * scale, height * scale), Image.Resampling.LANCZOS)
            prepared_image.save(prepared_path)
            return prepared_path
    except OSError as exc:
        raise OmrError("The uploaded image could not be opened for OMR preprocessing.") from exc


def find_exported_score(output_dir: Path) -> Path:
    candidates = [
        path
        for path in output_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in export_extensions and "container.xml" not in path.name.lower()
    ]
    if not candidates:
        raise OmrError("Audiveris finished, but no MusicXML or MXL output was found.")

    candidates.sort(key=lambda path: (path.suffix.lower() != ".mxl", -path.stat().st_size, path.name))
    return candidates[0]


def collect_hints_safely(scan_path: Path, musicxml_path: Path) -> dict[str, object]:
    try:
        return build_omr_hints(scan_path, musicxml_path)
    except Exception:
        return {}


def summarize_process_output(output: str, limit: int = 1800) -> str:
    if len(output) <= limit:
        return output

    half = limit // 2
    return f"{output[:half]}\n...\n{output[-half:]}"

