import type { ScoreNote } from "../score/types";
import type { DetectedPitch } from "./pitch";
import { centsBetween } from "./music";

export type JudgementName = "perfect" | "good" | "miss";

export type Judgement = {
  noteId: string;
  name: JudgementName;
  points: number;
  centsError: number | null;
  timingErrorMs: number;
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
