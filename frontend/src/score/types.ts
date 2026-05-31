export type UploadKind = "musicxml" | "mxl" | "midi" | "omr" | "builtin";

export type ScoreNote = {
  id: string;
  pitchMidi: number;
  startSec: number;
  durationSec: number;
  velocity?: number;
  partName?: string;
};

export type ParsedScore = {
  title: string;
  notes: ScoreNote[];
  sourceKind: UploadKind;
  sourceBlob?: Blob;
  warnings: string[];
};

export type ScoreIngestResult = {
  parsedScore: ParsedScore;
  convertedFileName?: string;
};
