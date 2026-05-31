import { Midi } from "@tonejs/midi";
import type { ParsedScore, ScoreNote } from "./types";
import { scoreNotesToMusicXmlBlob } from "./musicxmlExport";

export async function parseMidiFile(file: File): Promise<ParsedScore> {
  const midi = new Midi(await file.arrayBuffer());
  const notes: ScoreNote[] = [];

  for (const track of midi.tracks) {
    for (const note of track.notes) {
      notes.push({
        id: `${track.channel ?? "track"}-${notes.length}`,
        pitchMidi: note.midi,
        startSec: note.time,
        durationSec: Math.max(note.duration, 0.05),
        velocity: note.velocity,
        partName: track.name || undefined,
      });
    }
  }

  const title = midi.name || file.name.replace(/\.(mid|midi)$/i, "") || "Uploaded MIDI score";
  const sortedNotes = notes.sort((a, b) => a.startSec - b.startSec || a.pitchMidi - b.pitchMidi);
  const tempoBpm = midi.header.tempos[0]?.bpm ?? 96;

  return {
    title,
    notes: sortedNotes,
    sourceKind: "midi",
    sourceBlob: scoreNotesToMusicXmlBlob(title, sortedNotes, tempoBpm),
    warnings: midi.tracks.length > 1 ? ["Multiple MIDI tracks were found; all notes are included."] : [],
  };
}
