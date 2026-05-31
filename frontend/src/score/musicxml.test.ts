import { describe, expect, it } from "vitest";
import { parseMusicXml } from "./musicxml";

const simpleMusicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <movement-title>Twinkle Test</movement-title>
  <part-list>
    <score-part id="P1">
      <part-name>Violin</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
      </attributes>
      <direction>
        <sound tempo="120"/>
      </direction>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <note>
        <rest/>
        <duration>1</duration>
      </note>
      <note>
        <pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch>
        <duration>2</duration>
        <type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

describe("parseMusicXml", () => {
  it("normalizes pitched notes into a timeline", () => {
    const score = parseMusicXml(simpleMusicXml, "musicxml");

    expect(score.title).toBe("Twinkle Test");
    expect(score.notes).toHaveLength(2);
    expect(score.notes[0]).toMatchObject({ pitchMidi: 69, startSec: 0, durationSec: 0.5 });
    expect(score.notes[1]).toMatchObject({ pitchMidi: 70, startSec: 1, durationSec: 1 });
  });
});
