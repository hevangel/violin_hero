from pathlib import Path

import pytest
from PIL import Image

from app.omr import OmrError, find_exported_score, prepare_input_for_omr, validate_omr_upload


def test_validate_omr_upload_accepts_supported_files() -> None:
    assert validate_omr_upload("score.pdf") == ".pdf"
    assert validate_omr_upload("scan.PNG") == ".png"


def test_validate_omr_upload_rejects_unsupported_files() -> None:
    with pytest.raises(OmrError):
        validate_omr_upload("score.txt")


def test_find_exported_score_prefers_mxl(tmp_path: Path) -> None:
    xml_path = tmp_path / "score.xml"
    mxl_path = tmp_path / "score.mxl"
    xml_path.write_text("<score-partwise />", encoding="utf-8")
    mxl_path.write_bytes(b"PK fake archive bytes")

    assert find_exported_score(tmp_path) == mxl_path


def test_prepare_input_for_omr_upscales_small_raster_image(tmp_path: Path) -> None:
    input_path = tmp_path / "score.png"
    Image.new("RGBA", (900, 800), "white").save(input_path)

    prepared_path = prepare_input_for_omr(input_path, ".png")

    assert prepared_path.name == "score-prepared.png"
    with Image.open(prepared_path) as image:
        assert image.size == (3600, 3200)
        assert image.mode == "RGB"
