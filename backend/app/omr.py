from __future__ import annotations

import os
import shlex
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

allowed_omr_extensions = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
export_extensions = {".mxl", ".musicxml", ".xml"}


class OmrError(RuntimeError):
    """Raised when score conversion cannot produce a usable MusicXML file."""


@dataclass
class ConvertedScore:
    path: Path
    temp_dir: tempfile.TemporaryDirectory[str]

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

        run_audiveris(input_path, output_dir)
        exported = find_exported_score(output_dir)
        return ConvertedScore(path=exported, temp_dir=temp_dir)
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
        output = (result.stderr or result.stdout or "").strip()
        detail = f" Audiveris output: {output[:1000]}" if output else ""
        raise OmrError(f"Audiveris could not convert this score.{detail}")


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

