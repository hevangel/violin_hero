import type { ParsedScore, ScoreNote } from "./types";
import { scoreNotesToViolinMidiBlob } from "./midiExport";
import { scoreNotesToMusicXmlBlob } from "./musicxmlExport";

type NoteSpec = [name: string, beats?: number];

export type BuiltInSong = {
  id: string;
  title: string;
  subtitle: string;
  bpm: number;
  notes: ScoreNote[];
  midiBlob: Blob;
};

const built_in_song_specs: Array<{
  id: string;
  title: string;
  subtitle: string;
  bpm: number;
  notes: NoteSpec[];
}> = [
  {
    id: "twinkle-theme-d",
    title: "Twinkle Theme",
    subtitle: "Public-domain beginner melody in D major",
    bpm: 92,
    notes: [
      ["D4"],
      ["D4"],
      ["A4"],
      ["A4"],
      ["B4"],
      ["B4"],
      ["A4", 2],
      ["G4"],
      ["G4"],
      ["F#4"],
      ["F#4"],
      ["E4"],
      ["E4"],
      ["D4", 2],
      ["A4"],
      ["A4"],
      ["G4"],
      ["G4"],
      ["F#4"],
      ["F#4"],
      ["E4", 2],
      ["A4"],
      ["A4"],
      ["G4"],
      ["G4"],
      ["F#4"],
      ["F#4"],
      ["E4", 2],
      ["D4"],
      ["D4"],
      ["A4"],
      ["A4"],
      ["B4"],
      ["B4"],
      ["A4", 2],
      ["G4"],
      ["G4"],
      ["F#4"],
      ["F#4"],
      ["E4"],
      ["E4"],
      ["D4", 2],
    ],
  },
  {
    id: "lightly-row",
    title: "Lightly Row",
    subtitle: "Public-domain folk melody practice",
    bpm: 96,
    notes: [
      ["A4"],
      ["F#4"],
      ["F#4"],
      ["G4"],
      ["E4"],
      ["E4"],
      ["D4"],
      ["E4"],
      ["F#4"],
      ["G4"],
      ["A4"],
      ["A4"],
      ["A4", 2],
      ["A4"],
      ["F#4"],
      ["F#4"],
      ["G4"],
      ["E4"],
      ["E4"],
      ["D4"],
      ["F#4"],
      ["A4"],
      ["A4"],
      ["D4", 2],
    ],
  },
  {
    id: "go-tell-aunt-rhody",
    title: "Go Tell Aunt Rhody",
    subtitle: "Public-domain beginner tune",
    bpm: 88,
    notes: [
      ["A4"],
      ["A4"],
      ["F#4"],
      ["F#4"],
      ["E4"],
      ["E4"],
      ["D4", 2],
      ["E4"],
      ["F#4"],
      ["G4"],
      ["A4"],
      ["B4"],
      ["A4"],
      ["F#4", 2],
      ["A4"],
      ["A4"],
      ["F#4"],
      ["F#4"],
      ["E4"],
      ["E4"],
      ["D4", 2],
      ["E4"],
      ["F#4"],
      ["E4"],
      ["D4"],
      ["D4", 2],
    ],
  },
  {
    id: "o-come-little-children",
    title: "O Come Little Children",
    subtitle: "Public-domain carol melody practice",
    bpm: 84,
    notes: [
      ["D4"],
      ["E4"],
      ["F#4"],
      ["G4"],
      ["A4", 2],
      ["A4"],
      ["B4"],
      ["A4"],
      ["G4"],
      ["F#4", 2],
      ["G4"],
      ["A4"],
      ["B4"],
      ["A4"],
      ["G4"],
      ["F#4"],
      ["E4", 2],
      ["D4"],
      ["E4"],
      ["F#4"],
      ["G4"],
      ["A4", 2],
      ["G4"],
      ["F#4"],
      ["E4"],
      ["D4", 2],
    ],
  },
  {
    id: "long-long-ago",
    title: "Long, Long Ago",
    subtitle: "Public-domain melody in beginner range",
    bpm: 80,
    notes: [
      ["A4"],
      ["F#4"],
      ["E4"],
      ["D4"],
      ["E4"],
      ["F#4"],
      ["G4"],
      ["A4", 2],
      ["B4"],
      ["A4"],
      ["G4"],
      ["F#4"],
      ["E4", 2],
      ["A4"],
      ["F#4"],
      ["E4"],
      ["D4"],
      ["E4"],
      ["F#4"],
      ["E4"],
      ["D4", 2],
    ],
  },
  {
    id: "perpetual-motion-practice",
    title: "Perpetual Motion Practice",
    subtitle: "Original scale-pattern etude for Book 1 skills",
    bpm: 112,
    notes: [
      ["D4", 0.5],
      ["E4", 0.5],
      ["F#4", 0.5],
      ["G4", 0.5],
      ["A4", 0.5],
      ["G4", 0.5],
      ["F#4", 0.5],
      ["E4", 0.5],
      ["D4", 0.5],
      ["E4", 0.5],
      ["F#4", 0.5],
      ["G4", 0.5],
      ["A4", 0.5],
      ["B4", 0.5],
      ["A4", 0.5],
      ["G4", 0.5],
      ["F#4", 0.5],
      ["G4", 0.5],
      ["A4", 0.5],
      ["B4", 0.5],
      ["C#5", 0.5],
      ["B4", 0.5],
      ["A4", 0.5],
      ["G4", 0.5],
      ["F#4", 0.5],
      ["E4", 0.5],
      ["D4", 1],
    ],
  },
];

export const builtInSongs: BuiltInSong[] = built_in_song_specs.map((song) => ({
  ...song,
  notes: buildNotes(song.id, song.notes, song.bpm),
})).map((song) => ({
  ...song,
  midiBlob: scoreNotesToViolinMidiBlob(song.title, song.notes),
}));

export function builtInSongToScore(song: BuiltInSong): ParsedScore {
  return {
    title: song.title,
    notes: song.notes,
    sourceKind: "builtin",
    sourceBlob: scoreNotesToMusicXmlBlob(song.title, song.notes, song.bpm),
    warnings: [],
  };
}

function buildNotes(songId: string, specs: NoteSpec[], bpm: number): ScoreNote[] {
  const secondsPerBeat = 60 / bpm;
  let beatCursor = 0;

  return specs.map(([name, beats = 1], index) => {
    const note: ScoreNote = {
      id: `${songId}-${index}`,
      pitchMidi: noteNameToMidi(name),
      startSec: beatCursor * secondsPerBeat,
      durationSec: beats * secondsPerBeat,
      partName: "Built-in Suzuki Level 1 practice",
    };
    beatCursor += beats;
    return note;
  });
}

function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!match) {
    throw new Error(`Invalid note name: ${name}`);
  }

  const [, step, accidental, octaveText] = match;
  const semitoneByStep: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const accidentalOffset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return (Number(octaveText) + 1) * 12 + semitoneByStep[step] + accidentalOffset;
}
