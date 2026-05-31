import { Midi } from "@tonejs/midi";
import type { ScoreNote } from "./types";

const violin_program = 40;

export function scoreNotesToViolinMidiBlob(title: string, notes: ScoreNote[]): Blob {
  const midi = new Midi();
  midi.name = title;
  const track = midi.addTrack();
  track.name = "Violin";
  track.instrument.number = violin_program;

  for (const note of notes) {
    track.addNote({
      midi: Math.round(note.pitchMidi),
      time: note.startSec,
      duration: Math.max(note.durationSec, 0.05),
      velocity: note.velocity ?? 0.82,
    });
  }

  const bytes = midi.toArray();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "audio/midi" });
}
