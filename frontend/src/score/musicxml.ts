import { strFromU8, unzipSync } from "fflate";
import type { ParsedScore, ScoreNote, UploadKind } from "./types";

const step_to_semitone: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export async function readMusicXmlFile(file: File | Blob): Promise<{ xmlText: string; kind: UploadKind }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (looksLikeZip(bytes)) {
    const archive = unzipSync(bytes);
    const container = archive["META-INF/container.xml"];
    let rootPath: string | undefined;

    if (container) {
      const containerDoc = parseXml(strFromU8(container));
      rootPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path") ?? undefined;
    }

    const xmlPath =
      rootPath ??
      Object.keys(archive).find((path) => /\.(musicxml|xml)$/i.test(path) && !path.endsWith("container.xml"));

    if (!xmlPath || !archive[xmlPath]) {
      throw new Error("The compressed MusicXML file did not contain a readable score.");
    }

    return { xmlText: strFromU8(archive[xmlPath]), kind: "mxl" };
  }

  return { xmlText: new TextDecoder("utf-8").decode(bytes), kind: "musicxml" };
}

export function parseMusicXml(xmlText: string, sourceKind: UploadKind, sourceBlob?: Blob): ParsedScore {
  const doc = parseXml(xmlText);
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("The MusicXML file could not be parsed.");
  }

  const title =
    textContent(doc.querySelector("movement-title")) ??
    textContent(doc.querySelector("work-title")) ??
    "Uploaded violin score";
  const parts = Array.from(doc.querySelectorAll("part"));
  const partNames = readPartNames(doc);
  const notes: ScoreNote[] = [];
  const warnings: string[] = [];

  for (const part of parts) {
    let divisions = 1;
    let tempo = 100;
    let currentSec = 0;
    let lastNoteStartSec = 0;
    const partId = part.getAttribute("id") ?? "part";
    const partName = partNames.get(partId);

    for (const measure of Array.from(part.children).filter((node) => node.tagName === "measure")) {
      const divisionsText = textContent(measure.querySelector("attributes > divisions"));
      if (divisionsText) {
        divisions = positiveNumber(divisionsText, divisions);
      }

      const tempoCandidate = readTempo(measure);
      if (tempoCandidate) {
        tempo = tempoCandidate;
      }

      for (const child of Array.from(measure.children)) {
        if (child.tagName !== "note") {
          continue;
        }

        const durationUnits = positiveNumber(textContent(child.querySelector("duration")) ?? "0", 0);
        const durationSec = durationUnits > 0 ? (durationUnits / divisions) * (60 / tempo) : 0;
        const isChord = child.querySelector("chord") !== null;
        const isGrace = child.querySelector("grace") !== null;
        const startSec = isChord ? lastNoteStartSec : currentSec;
        const pitchMidi = readPitchMidi(child);

        if (pitchMidi !== null && durationSec > 0) {
          notes.push({
            id: `${partId}-${notes.length}`,
            pitchMidi,
            startSec,
            durationSec,
            partName,
          });
        }

        if (!isChord && !isGrace) {
          lastNoteStartSec = currentSec;
          currentSec += durationSec;
        }
      }
    }
  }

  if (parts.length > 1) {
    warnings.push("Multiple parts were found; all detected pitched notes are included in the game timeline.");
  }

  return {
    title,
    notes: notes.sort((a, b) => a.startSec - b.startSec || a.pitchMidi - b.pitchMidi),
    sourceKind,
    sourceBlob,
    warnings,
  };
}

function readPitchMidi(note: Element): number | null {
  if (note.querySelector("rest")) {
    return null;
  }

  const pitch = note.querySelector("pitch");
  const step = textContent(pitch?.querySelector("step") ?? null);
  const octaveText = textContent(pitch?.querySelector("octave") ?? null);
  if (!pitch || !step || !octaveText || step_to_semitone[step] === undefined) {
    return null;
  }

  const alter = Number(textContent(pitch.querySelector("alter")) ?? "0");
  const octave = Number(octaveText);
  if (!Number.isFinite(octave)) {
    return null;
  }

  return (octave + 1) * 12 + step_to_semitone[step] + (Number.isFinite(alter) ? alter : 0);
}

function readTempo(measure: Element): number | null {
  const soundTempo = measure.querySelector("direction sound[tempo]")?.getAttribute("tempo");
  if (soundTempo) {
    return positiveNumber(soundTempo, 0) || null;
  }

  const perMinute = textContent(measure.querySelector("direction metronome per-minute"));
  return perMinute ? positiveNumber(perMinute, 0) || null : null;
}

function readPartNames(doc: Document): Map<string, string> {
  const partNames = new Map<string, string>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list score-part"))) {
    const id = scorePart.getAttribute("id");
    const name = textContent(scorePart.querySelector("part-name"));
    if (id && name) {
      partNames.set(id, name);
    }
  }

  return partNames;
}

function textContent(element: Element | null): string | null {
  const value = element?.textContent?.trim();
  return value ? value : null;
}

function positiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseXml(xmlText: string): Document {
  return new DOMParser().parseFromString(xmlText, "application/xml");
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}
