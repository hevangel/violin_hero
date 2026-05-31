from pathlib import Path

import pytest
from PIL import Image

from app.ocr_hints import OcrLine, encode_hints_header, extract_hints_from_lines, rapidocr_params
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


def test_extract_hints_prefers_title_and_voice_alias() -> None:
    musicxml = """
    <score-partwise>
      <part-list>
        <score-part id="P1"><part-name>Piano</part-name></score-part>
        <score-part id="P2"><part-name>Voice</part-name></score-part>
      </part-list>
    </score-partwise>
    """
    hints = extract_hints_from_lines(
        [
            OcrLine("Violin", 0.98, 20, 260, 80, 284),
            OcrLine("twinkle, twinkle, little star", 0.96, 110, 35, 430, 70),
            OcrLine("Piano", 0.98, 20, 520, 80, 544),
        ],
        musicxml,
    )

    assert hints["title"] == "twinkle, twinkle, little star"
    assert hints["violinPartAliases"] == ["voice"]


def test_encode_hints_header_url_encodes_json() -> None:
    assert "%22title%22" in encode_hints_header({"title": "twinkle, twinkle"})


def test_rapidocr_params_toggle_cuda_for_all_stages() -> None:
    assert rapidocr_params(True) == {"EngineConfig.onnxruntime.use_cuda": True}
    assert rapidocr_params(False)["EngineConfig.onnxruntime.use_cuda"] is False
