import { describe, expect, it } from "vitest";
import { scoreNotesToMusicXml } from "./musicxmlExport";
import { parseMusicXml } from "./musicxml";

describe("scoreNotesToMusicXml", () => {
  it("exports internal note timelines as parseable MusicXML", () => {
    const xml = scoreNotesToMusicXml("Generated Preview", [
      {
        id: "n1",
        pitchMidi: 62,
        startSec: 0,
        durationSec: 0.5,
      },
      {
        id: "n2",
        pitchMidi: 66,
        startSec: 0.5,
        durationSec: 1,
      },
    ]);

    const parsed = parseMusicXml(xml, "musicxml");

    expect(parsed.title).toBe("Generated Preview");
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.notes.map((note) => note.pitchMidi)).toEqual([62, 66]);
  });
});
