import type { ScoreNote } from "./types";

const divisions = 4;
const beats_per_measure = 4;
const measure_units = divisions * beats_per_measure;

type MusicXmlEvent = {
  pitchMidi: number | null;
  durationUnits: number;
  chord: boolean;
  noteId?: string;
};

export type GeneratedMusicXmlPreview = {
  blob: Blob;
  cursorStepsByNoteId: Map<string, number>;
};

export function scoreNotesToMusicXmlBlob(title: string, notes: ScoreNote[], tempoBpm = 96): Blob {
  return new Blob([scoreNotesToMusicXml(title, notes, tempoBpm)], {
    type: "application/vnd.recordare.musicxml+xml",
  });
}

export function scoreNotesToMusicXmlPreview(title: string, notes: ScoreNote[], tempoBpm = 96): GeneratedMusicXmlPreview {
  const { xmlText, cursorStepsByNoteId } = scoreNotesToMusicXmlWithCursorSteps(title, notes, tempoBpm);
  return {
    blob: new Blob([xmlText], { type: "application/vnd.recordare.musicxml+xml" }),
    cursorStepsByNoteId,
  };
}

export function scoreNotesToMusicXml(title: string, notes: ScoreNote[], tempoBpm = 96): string {
  return scoreNotesToMusicXmlWithCursorSteps(title, notes, tempoBpm).xmlText;
}

function scoreNotesToMusicXmlWithCursorSteps(
  title: string,
  notes: ScoreNote[],
  tempoBpm = 96,
): { xmlText: string; cursorStepsByNoteId: Map<string, number> } {
  const events = notesToEvents(notes, tempoBpm);
  const cursorStepsByNoteId = cursorStepsFromEvents(events);
  const measureXml = eventsToMeasures(events)
    .map((eventsInMeasure, index) => measureToXml(eventsInMeasure, index, tempoBpm))
    .join("\n");

  const xmlText = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <movement-title>${escapeXml(title)}</movement-title>
  <part-list>
    <score-part id="P1">
      <part-name>Violin</part-name>
    </score-part>
  </part-list>
  <part id="P1">
${measureXml}
  </part>
</score-partwise>`;

  return { xmlText, cursorStepsByNoteId };
}

function measureToXml(events: MusicXmlEvent[], index: number, tempoBpm: number): string {
  const attributes =
    index === 0
      ? `
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
      </attributes>`
      : "";
  const direction =
    index === 0
      ? `
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>${Math.round(tempoBpm)}</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="${Math.round(tempoBpm)}"/>
      </direction>
`
      : "";
  const noteXml = events.map(eventToXml).join("\n");
  return `    <measure number="${index + 1}">${attributes}${direction}${noteXml}
    </measure>`;
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
        noteId: note.id,
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

function cursorStepsFromEvents(events: MusicXmlEvent[]): Map<string, number> {
  const cursorStepsByNoteId = new Map<string, number>();
  let cursorStep = 0;

  for (const event of events) {
    if (event.noteId && !cursorStepsByNoteId.has(event.noteId)) {
      cursorStepsByNoteId.set(event.noteId, cursorStep);
    }

    if (!event.chord) {
      cursorStep += 1;
    }
  }

  return cursorStepsByNoteId;
}

function eventsToMeasures(events: MusicXmlEvent[]): MusicXmlEvent[][] {
  const measures: MusicXmlEvent[][] = [[]];
  let measureCursor = 0;

  for (const event of events) {
    if (event.chord) {
      measures[measures.length - 1].push(event);
      continue;
    }

    let remainingUnits = event.durationUnits;
    while (remainingUnits > 0) {
      if (measureCursor === measure_units) {
        measures.push([]);
        measureCursor = 0;
      }

      const chunkUnits = Math.min(remainingUnits, measure_units - measureCursor);
      measures[measures.length - 1].push({
        ...event,
        durationUnits: chunkUnits,
      });
      remainingUnits -= chunkUnits;
      measureCursor += chunkUnits;
    }
  }

  return measures;
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
