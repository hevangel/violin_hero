from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.background import BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.omr import OmrError, convert_upload_with_audiveris

app = FastAPI(title="Violin Hero OMR API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/omr")
async def convert_score(file: UploadFile, background_tasks: BackgroundTasks) -> FileResponse:
    try:
        converted = await convert_upload_with_audiveris(file)
    except OmrError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    background_tasks.add_task(converted.cleanup)
    media_type = media_type_for(converted.path)
    return FileResponse(
        converted.path,
        media_type=media_type,
        filename=converted.path.name,
        background=background_tasks,
    )


def media_type_for(path: Path) -> str:
    if path.suffix.lower() == ".mxl":
        return "application/vnd.recordare.musicxml"
    return "application/vnd.recordare.musicxml+xml"
