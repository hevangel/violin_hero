import { describe, expect, it } from "vitest";
import { builtInSongToScore, builtInSongs } from "./builtinSongs";

describe("builtInSongs", () => {
  it("provides playable beginner songs", () => {
    expect(builtInSongs.length).toBeGreaterThanOrEqual(5);

    for (const song of builtInSongs) {
      expect(song.notes.length).toBeGreaterThan(0);
      expect(song.notes[0].startSec).toBe(0);
      expect(song.notes.every((note) => note.pitchMidi >= 55 && note.pitchMidi <= 100)).toBe(true);
    }
  });

  it("converts built-in songs to parsed scores", () => {
    const score = builtInSongToScore(builtInSongs[0]);

    expect(score.sourceKind).toBe("builtin");
    expect(score.notes).toHaveLength(builtInSongs[0].notes.length);
    expect(score.warnings).toEqual([]);
  });
});
