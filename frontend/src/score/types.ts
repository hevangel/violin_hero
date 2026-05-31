export type UploadKind = "musicxml" | "mxl" | "midi" | "omr" | "builtin";

export type ScoreNote = {
  id: string;
  pitchMidi: number;
  startSec: number;
  durationSec: number;
  velocity?: number;
  partName?: string;
  cursorStep?: number;
};

export type ParsedScore = {
  title: string;
  notes: ScoreNote[];
  sourceKind: UploadKind;
  sourceBlob?: Blob;
  extractionBlob?: Blob;
  omrHints?: OmrHints;
  warnings: string[];
};

export type OmrHints = {
  title?: string;
  violinPartAliases?: string[];
  recognizedText?: string[];
};

export type ScoreIngestResult = {
  parsedScore: ParsedScore;
  convertedFileName?: string;
};
