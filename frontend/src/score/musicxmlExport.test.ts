import { describe, expect, it } from "vitest";
import { scoreNotesToMusicXml, scoreNotesToMusicXmlPreview } from "./musicxmlExport";
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

  it("splits generated previews into measures", () => {
    const xml = scoreNotesToMusicXml("Barred Preview", [
      {
        id: "n1",
        pitchMidi: 69,
        startSec: 0,
        durationSec: 1,
      },
      {
        id: "n2",
        pitchMidi: 71,
        startSec: 3,
        durationSec: 1,
      },
    ]);

    const parsed = parseMusicXml(xml, "musicxml");

    expect(xml).toContain('<measure number="1">');
    expect(xml).toContain('<measure number="2">');
    expect(parsed.notes.map((note) => note.pitchMidi)).toEqual([69, 71]);
  });

  it("maps generated cursor steps across inserted rests", () => {
    const preview = scoreNotesToMusicXmlPreview("Cursor Preview", [
      {
        id: "n1",
        pitchMidi: 69,
        startSec: 0,
        durationSec: 0.5,
      },
      {
        id: "n2",
        pitchMidi: 71,
        startSec: 2,
        durationSec: 0.5,
      },
    ]);

    expect(preview.cursorStepsByNoteId.get("n1")).toBe(0);
    expect(preview.cursorStepsByNoteId.get("n2")).toBe(2);
  });
});
