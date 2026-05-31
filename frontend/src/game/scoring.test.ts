import { describe, expect, it } from "vitest";
import { frequencyToMidi } from "./music";
import { applyJudgement, initialScoreState, judgeNote } from "./scoring";
import type { DetectedPitch } from "./pitch";
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

describe("applyJudgement", () => {
  it("increments combo for hits", () => {
    const judgement = judgeNote(note, 1.01, pitch(440));
    expect(judgement).not.toBeNull();

    const score = applyJudgement(initialScoreState, judgement!);

    expect(score.combo).toBe(1);
    expect(score.points).toBeGreaterThan(1000);
  });
});
