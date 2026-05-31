import { parseMidiFile } from "./midi";
import { parseMusicXml, readMusicXmlFile } from "./musicxml";
import type { ScoreIngestResult } from "./types";

const omr_extensions = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const musicxml_extensions = [".musicxml", ".xml", ".mxl"];
const midi_extensions = [".mid", ".midi"];

export async function ingestScoreFile(file: File): Promise<ScoreIngestResult> {
  const extension = fileExtension(file.name);

  if (musicxml_extensions.includes(extension)) {
    const { xmlText, kind } = await readMusicXmlFile(file);
    return {
      parsedScore: parseMusicXml(xmlText, kind, file),
    };
  }

  if (midi_extensions.includes(extension)) {
    return {
      parsedScore: await parseMidiFile(file),
    };
  }

  if (omr_extensions.includes(extension)) {
    const converted = await convertWithOmr(file);
    const { xmlText, kind } = await readMusicXmlFile(converted.blob);
    return {
      convertedFileName: converted.fileName,
      parsedScore: parseMusicXml(xmlText, kind, converted.blob),
    };
  }

  throw new Error("Unsupported score file. Upload MusicXML, MXL, MIDI, PDF, PNG, JPG, or WebP.");
}

async function convertWithOmr(file: File): Promise<{ blob: Blob; fileName: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/omr", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "The OMR backend could not convert this score.");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition");
  return {
    blob,
    fileName: readFilename(disposition) ?? "converted-score.mxl",
  };
}

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const payload = await response.json();
    return typeof payload.detail === "string" ? payload.detail : null;
  } catch {
    return response.statusText || null;
  }
}

function readFilename(disposition: string | null): string | null {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

function fileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}
