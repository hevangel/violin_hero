import { describe, expect, it } from "vitest";
import { frequencyToMidi } from "./music";
import {
  applyJudgement,
  initialScoreState,
  judgeNote,
  judgeNoteWindow,
  judgeSingleNote,
  judgeSingleNoteWindow,
} from "./scoring";
import type { DetectedPitch } from "./pitch";
import type { PitchFrame } from "./pitchHistory";
import type { ScoreNote } from "../score/types";

const note: ScoreNote = {
  id: "n1",
  pitchMidi: 69,
  startSec: 1,
  durationSec: 0.5,
};

function pitch(frequency: number): DetectedPitch {
  return {
    frequency,
    midi: frequencyToMidi(frequency),
    noteName: "A4",
    clarity: 0.95,
    timestampMs: 0,
  };
}

function frame(sec: number, midi: number, clarity = 0.95): PitchFrame {
  return {
    frequency: 440,
    midi,
    noteName: "A4",
    clarity,
    timestampMs: sec * 1000,
    sec,
  };
}

describe("judgeNote", () => {
  it("scores a perfect hit for accurate pitch and timing", () => {
    const judgement = judgeNote(note, 1.04, pitch(440));

    expect(judgement?.name).toBe("perfect");
  });

  it("scores a miss after the hit window passes", () => {
    const judgement = judgeNote(note, 1.4, null);

    expect(judgement?.name).toBe("miss");
  });
});

describe("judgeNoteWindow", () => {
  it("scores from median pitch frames in the note window", () => {
    const judgement = judgeNoteWindow(note, 1.4, [
      frame(0.95, 69.8),
      frame(1.02, 69.01),
      frame(1.12, 68.98),
      frame(1.2, 69.02),
    ]);

    expect(judgement?.name).toBe("perfect");
  });

  it("waits for enough frames before judging expert mode notes", () => {
    const judgement = judgeNoteWindow(note, 1.05, [frame(1.02, 69.01)]);

    expect(judgement).toBeNull();
  });
});

describe("single note judging", () => {
  it("waits until the held pitch matches the target", () => {
    expect(judgeSingleNote(note, pitch(392))).toBeNull();
    expect(judgeSingleNote(note, pitch(440))?.name).toBe("perfect");
  });

  it("uses recent median frames in expert single-note mode", () => {
    const judgement = judgeSingleNoteWindow(note, [frame(0.1, 70.2), frame(0.2, 69.02), frame(0.3, 68.98)]);

    expect(judgement?.name).toBe("perfect");
  });
});

describe("applyJudgement", () => {
  it("increments combo for hits", () => {
    const judgement = judgeNote(note, 1.01, pitch(440));
    expect(judgement).not.toBeNull();

    const score = applyJudgement(initialScoreState, judgement!);

    expect(score.combo).toBe(1);
    expect(score.points).toBeGreaterThan(1000);
  });
});
