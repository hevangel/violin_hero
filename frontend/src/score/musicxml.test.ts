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
    expect(score.notes[0]).toMatchObject({ pitchMidi: 69, startSec: 0, durationSec: 0.5, cursorStep: 0 });
    expect(score.notes[1]).toMatchObject({ pitchMidi: 70, startSec: 1, durationSec: 1, cursorStep: 2 });
  });

  it("keeps only violin parts when a score has multiple labeled parts", () => {
    const score = parseMusicXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Violin I</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
</score-partwise>`,
      "musicxml",
    );

    expect(score.notes).toHaveLength(1);
    expect(score.notes[0]).toMatchObject({ pitchMidi: 69, partName: "Violin I" });
    expect(score.warnings[0]).toContain("only the violin part");
  });

  it("detects violin parts from score-instrument metadata", () => {
    const score = parseMusicXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Part 1</part-name>
      <score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument>
    </score-part>
    <score-part id="P2">
      <part-name>Part 2</part-name>
      <score-instrument id="P2-I1"><instrument-name>Violin</instrument-name></score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
</score-partwise>`,
      "musicxml",
    );

    expect(score.notes).toHaveLength(1);
    expect(score.notes[0]).toMatchObject({ pitchMidi: 69 });
    expect(score.warnings[0]).toContain("only the violin part");
  });

  it("uses the only non-piano part when violin is not explicitly labeled", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Part 2</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = parseMusicXml(xml, "musicxml", new Blob([xml], { type: "application/xml" }));
    const previewXml = await score.sourceBlob?.text();

    expect(score.notes).toHaveLength(1);
    expect(score.notes[0]).toMatchObject({ pitchMidi: 69, partName: "Part 2" });
    expect(score.warnings[0]).toContain("non-piano part");
    expect(previewXml).toContain('score-part id="P2"');
    expect(previewXml).not.toContain("Piano");
    expect(previewXml).not.toContain('part id="P1"');
  });

  it("treats a voice part as the violin line when OCR pairs it with piano", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Voice</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = parseMusicXml(xml, "musicxml", new Blob([xml], { type: "application/xml" }));
    const previewXml = await score.sourceBlob?.text();

    expect(score.notes).toHaveLength(1);
    expect(score.notes[0]).toMatchObject({ pitchMidi: 69, partName: "Voice" });
    expect(score.warnings[0]).toContain("labeled voice");
    expect(previewXml).toContain("Voice");
    expect(previewXml).not.toContain("Piano");
    expect(previewXml).not.toContain('part id="P1"');
  });

  it("uses RapidOCR hints to correct title and voice-as-violin parts", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Voice</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = parseMusicXml(xml, "musicxml", new Blob([xml], { type: "application/xml" }), {
      title: "twinkle, twinkle, little star",
      violinPartAliases: ["voice"],
    });
    const previewXml = await score.sourceBlob?.text();

    expect(score.title).toBe("twinkle, twinkle, little star");
    expect(score.notes).toHaveLength(1);
    expect(score.notes[0]).toMatchObject({ pitchMidi: 69, partName: "Voice" });
    expect(previewXml).toContain("Voice");
    expect(previewXml).not.toContain("Piano");
  });

  it("uses the score credit title and filters the preview blob to violin parts", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <credit page="1">
    <credit-type>title</credit-type>
    <credit-words>twinkle, twinkle, little star</credit-words>
  </credit>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Violin</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = parseMusicXml(xml, "musicxml", new Blob([xml], { type: "application/xml" }));
    const previewXml = await score.sourceBlob?.text();

    expect(score.title).toBe("twinkle, twinkle, little star");
    expect(score.notes).toHaveLength(1);
    expect(score.notes[0]).toMatchObject({ pitchMidi: 69, partName: "Violin" });
    expect(previewXml).toContain("twinkle, twinkle, little star");
    expect(previewXml).toContain('score-part id="P2"');
    expect(previewXml).toContain('part id="P2"');
    expect(previewXml).not.toContain("Piano");
    expect(previewXml).not.toContain('score-part id="P1"');
    expect(previewXml).not.toContain('part id="P1"');
  });

  it("finds the title from untyped score credits without choosing part names", () => {
    const score = parseMusicXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <credit page="1">
    <credit-words default-y="1500" font-size="10" justify="right">Traditional</credit-words>
  </credit>
  <credit page="1">
    <credit-words default-y="1450" font-size="24" justify="center">twinkle, twinkle, little star</credit-words>
  </credit>
  <credit page="1">
    <credit-words default-y="1200" font-size="12" justify="left">Violin</credit-words>
  </credit>
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration>
      </note>
    </measure>
  </part>
</score-partwise>`,
      "musicxml",
    );

    expect(score.title).toBe("twinkle, twinkle, little star");
  });
});
