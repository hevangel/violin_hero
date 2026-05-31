import type { ScoreNote } from "../score/types";
import type { DetectedPitch } from "./pitch";
import type { PitchFrame } from "./pitchHistory";
import { centsBetween } from "./music";

export type JudgementName = "perfect" | "good" | "miss";

export type Judgement = {
  noteId: string;
  name: JudgementName;
  points: number;
  centsError: number | null;
  timingErrorMs: number;
};

export type JudgeMode = "simple" | "expert";
export type PracticeFlowMode = "continuous" | "single-note";

type NoteProfile = {
  earlyMs: number;
  lateMs: number;
  missAfterMs: number;
  perfectCents: number;
  goodCents: number;
  minClarity: number;
  minFrames: number;
  minWindowSec: number;
  durationPortion: number;
};

export type ScoreState = {
  points: number;
  combo: number;
  bestCombo: number;
  perfect: number;
  good: number;
  miss: number;
  lastJudgement?: Judgement;
};

export const initialScoreState: ScoreState = {
  points: 0,
  combo: 0,
  bestCombo: 0,
  perfect: 0,
  good: 0,
  miss: 0,
};

export function judgeNote(note: ScoreNote, currentSec: number, pitch: DetectedPitch | null): Judgement | null {
  const timingErrorMs = (currentSec - note.startSec) * 1000;
  if (timingErrorMs < -180) {
    return null;
  }

  if (!pitch) {
    return timingErrorMs > 280
      ? {
          noteId: note.id,
          name: "miss",
          points: 0,
          centsError: null,
          timingErrorMs,
        }
      : null;
  }

  const centsError = centsBetween(pitch.midi, note.pitchMidi);
  const absCents = Math.abs(centsError);
  const absTiming = Math.abs(timingErrorMs);

  if (absTiming <= 80 && absCents <= 25) {
    return {
      noteId: note.id,
      name: "perfect",
      points: 1000,
      centsError,
      timingErrorMs,
    };
  }

  if (absTiming <= 180 && absCents <= 55) {
    return {
      noteId: note.id,
      name: "good",
      points: 600,
      centsError,
      timingErrorMs,
    };
  }

  if (timingErrorMs > 280) {
    return {
      noteId: note.id,
      name: "miss",
      points: 0,
      centsError,
      timingErrorMs,
    };
  }

  return null;
}

export function judgeNoteWindow(note: ScoreNote, currentSec: number, frames: PitchFrame[]): Judgement | null {
  const profile = noteProfile(note);
  const timingErrorMs = (currentSec - note.startSec) * 1000;

  if (timingErrorMs < -profile.earlyMs) {
    return null;
  }

  const windowStart = note.startSec - profile.earlyMs / 1000;
  const windowEnd = note.startSec + Math.max(note.durationSec * profile.durationPortion, profile.minWindowSec);

  if (currentSec < windowEnd && timingErrorMs < profile.lateMs) {
    return null;
  }

  const usableFrames = frames.filter(
    (frame) => frame.sec >= windowStart && frame.sec <= windowEnd && frame.clarity >= profile.minClarity,
  );

  if (usableFrames.length < profile.minFrames) {
    return timingErrorMs > profile.missAfterMs
      ? {
          noteId: note.id,
          name: "miss",
          points: 0,
          centsError: null,
          timingErrorMs,
        }
      : null;
  }

  const medianCents = median(usableFrames.map((frame) => centsBetween(frame.midi, note.pitchMidi)));
  if (medianCents === null) {
    return null;
  }

  const absMedian = Math.abs(medianCents);
  if (absMedian <= profile.perfectCents) {
    return {
      noteId: note.id,
      name: "perfect",
      points: 1000,
      centsError: medianCents,
      timingErrorMs,
    };
  }

  if (absMedian <= profile.goodCents) {
    return {
      noteId: note.id,
      name: "good",
      points: 600,
      centsError: medianCents,
      timingErrorMs,
    };
  }

  return timingErrorMs > profile.missAfterMs
    ? {
        noteId: note.id,
        name: "miss",
        points: 0,
        centsError: medianCents,
        timingErrorMs,
      }
    : null;
}

export function judgeSingleNote(note: ScoreNote, pitch: DetectedPitch | null): Judgement | null {
  if (!pitch) {
    return null;
  }

  return judgementFromCents(note.id, centsBetween(pitch.midi, note.pitchMidi), 0, 25, 55);
}

export function judgeSingleNoteWindow(note: ScoreNote, frames: PitchFrame[]): Judgement | null {
  const usableFrames = frames.filter((frame) => frame.clarity >= 0.6);
  if (usableFrames.length < 2) {
    return null;
  }

  const medianCents = median(usableFrames.map((frame) => centsBetween(frame.midi, note.pitchMidi)));
  return medianCents === null ? null : judgementFromCents(note.id, medianCents, 0, 30, 60);
}

export function applyJudgement(state: ScoreState, judgement: Judgement): ScoreState {
  const isHit = judgement.name !== "miss";
  const combo = isHit ? state.combo + 1 : 0;
  const comboBonus = isHit ? Math.min(combo, 25) * 10 : 0;

  return {
    points: state.points + judgement.points + comboBonus,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    perfect: state.perfect + (judgement.name === "perfect" ? 1 : 0),
    good: state.good + (judgement.name === "good" ? 1 : 0),
    miss: state.miss + (judgement.name === "miss" ? 1 : 0),
    lastJudgement: judgement,
  };
}

function noteProfile(note: ScoreNote): NoteProfile {
  const fast = note.durationSec <= 0.22;
  const veryFast = note.durationSec <= 0.13;
  const long = note.durationSec >= 0.8;

  if (veryFast) {
    return {
      earlyMs: 90,
      lateMs: 170,
      missAfterMs: 260,
      perfectCents: 45,
      goodCents: 80,
      minClarity: 0.55,
      minFrames: 1,
      minWindowSec: 0.08,
      durationPortion: 1,
    };
  }

  if (fast) {
    return {
      earlyMs: 100,
      lateMs: 190,
      missAfterMs: 300,
      perfectCents: 35,
      goodCents: 65,
      minClarity: 0.58,
      minFrames: 2,
      minWindowSec: 0.12,
      durationPortion: 0.9,
    };
  }

  if (long) {
    return {
      earlyMs: 120,
      lateMs: 240,
      missAfterMs: 420,
      perfectCents: 25,
      goodCents: 55,
      minClarity: 0.6,
      minFrames: 4,
      minWindowSec: 0.25,
      durationPortion: 0.7,
    };
  }

  return {
    earlyMs: 100,
    lateMs: 200,
    missAfterMs: 320,
    perfectCents: 30,
    goodCents: 60,
    minClarity: 0.6,
    minFrames: 2,
    minWindowSec: 0.14,
    durationPortion: 0.8,
  };
}

function judgementFromCents(
  noteId: string,
  centsError: number,
  timingErrorMs: number,
  perfectCents: number,
  goodCents: number,
): Judgement | null {
  const absCents = Math.abs(centsError);
  if (absCents <= perfectCents) {
    return {
      noteId,
      name: "perfect",
      points: 1000,
      centsError,
      timingErrorMs,
    };
  }

  if (absCents <= goodCents) {
    return {
      noteId,
      name: "good",
      points: 600,
      centsError,
      timingErrorMs,
    };
  }

  return null;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
