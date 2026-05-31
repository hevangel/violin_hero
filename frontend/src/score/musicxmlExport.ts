import type { ScoreNote } from "./types";

const divisions = 4;

type MusicXmlEvent = {
  pitchMidi: number | null;
  durationUnits: number;
  chord: boolean;
};

export function scoreNotesToMusicXmlBlob(title: string, notes: ScoreNote[], tempoBpm = 96): Blob {
  return new Blob([scoreNotesToMusicXml(title, notes, tempoBpm)], {
    type: "application/vnd.recordare.musicxml+xml",
  });
}

export function scoreNotesToMusicXml(title: string, notes: ScoreNote[], tempoBpm = 96): string {
  const events = notesToEvents(notes, tempoBpm);
  const noteXml = events.map(eventToXml).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <movement-title>${escapeXml(title)}</movement-title>
  <part-list>
    <score-part id="P1">
      <part-name>Violin</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>${divisions}</divisions>
        <key>
          <fifths>2</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>${Math.round(tempoBpm)}</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="${Math.round(tempoBpm)}"/>
      </direction>
${noteXml}
    </measure>
  </part>
</score-partwise>`;
}

function notesToEvents(notes: ScoreNote[], tempoBpm: number): MusicXmlEvent[] {
  const secondsPerBeat = 60 / tempoBpm;
  const sortedNotes = [...notes].sort((a, b) => a.startSec - b.startSec || a.pitchMidi - b.pitchMidi);
  const groups = new Map<number, ScoreNote[]>();

  for (const note of sortedNotes) {
    const startUnits = Math.max(0, Math.round((note.startSec / secondsPerBeat) * divisions));
    groups.set(startUnits, [...(groups.get(startUnits) ?? []), note]);
  }

  let cursorUnits = 0;
  const events: MusicXmlEvent[] = [];

  for (const [startUnits, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    if (startUnits > cursorUnits) {
      events.push({
        pitchMidi: null,
        durationUnits: startUnits - cursorUnits,
        chord: false,
      });
      cursorUnits = startUnits;
    }

    const noteEvents = group
      .map((note) => ({
        pitchMidi: Math.round(note.pitchMidi),
        durationUnits: Math.max(1, Math.round((note.durationSec / secondsPerBeat) * divisions)),
      }))
      .sort((a, b) => a.pitchMidi - b.pitchMidi);

    const maxDuration = Math.max(...noteEvents.map((note) => note.durationUnits));
    noteEvents.forEach((note, index) => {
      events.push({
        ...note,
        chord: index > 0,
      });
    });
    cursorUnits = Math.max(cursorUnits, startUnits + maxDuration);
  }

  return events;
}

function eventToXml(event: MusicXmlEvent): string {
  const chord = event.chord ? "\n        <chord/>" : "";
  if (event.pitchMidi === null) {
    return `      <note>
        <rest/>
        <duration>${event.durationUnits}</duration>
        <type>${durationType(event.durationUnits)}</type>
      </note>`;
  }

  const pitch = midiToMusicXmlPitch(event.pitchMidi);
  return `      <note>${chord}
        <pitch>
          <step>${pitch.step}</step>${pitch.alter === 0 ? "" : `\n          <alter>${pitch.alter}</alter>`}
          <octave>${pitch.octave}</octave>
        </pitch>
        <duration>${event.durationUnits}</duration>
        <type>${durationType(event.durationUnits)}</type>
      </note>`;
}

function midiToMusicXmlPitch(midi: number): { step: string; alter: number; octave: number } {
  const octave = Math.floor(midi / 12) - 1;
  const pitchClass = ((midi % 12) + 12) % 12;
  const pitches = [
    { step: "C", alter: 0 },
    { step: "C", alter: 1 },
    { step: "D", alter: 0 },
    { step: "D", alter: 1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "F", alter: 1 },
    { step: "G", alter: 0 },
    { step: "G", alter: 1 },
    { step: "A", alter: 0 },
    { step: "A", alter: 1 },
    { step: "B", alter: 0 },
  ];

  return { ...pitches[pitchClass], octave };
}

function durationType(durationUnits: number): string {
  if (durationUnits <= 1) {
    return "16th";
  }
  if (durationUnits <= 2) {
    return "eighth";
  }
  if (durationUnits <= 4) {
    return "quarter";
  }
  if (durationUnits <= 8) {
    return "half";
  }
  return "whole";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
