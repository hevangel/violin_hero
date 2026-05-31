import { strFromU8, unzipSync } from "fflate";
import type { OmrHints, ParsedScore, ScoreNote, UploadKind } from "./types";

const step_to_semitone: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

type PartMetadata = {
  name?: string;
  labels: string[];
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

export function parseMusicXml(xmlText: string, sourceKind: UploadKind, sourceBlob?: Blob, hints?: OmrHints): ParsedScore {
  const doc = parseXml(xmlText);
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("The MusicXML file could not be parsed.");
  }

  const allParts = Array.from(doc.querySelectorAll("part"));
  const partMetadata = readPartMetadata(doc);
  const title = normalizeTitle(hints?.title ?? "") || readScoreTitle(doc, partMetadata) || "Uploaded violin score";
  const violinParts = allParts.filter((part) => isViolinPart(part, partMetadata, hints));
  const voiceParts = violinParts.length > 0 ? [] : selectVoiceFallbackParts(allParts, partMetadata);
  const fallbackParts =
    violinParts.length > 0 || voiceParts.length > 0 ? [] : selectNonPianoFallbackParts(allParts, partMetadata);
  const selectedParts =
    violinParts.length > 0 ? violinParts : voiceParts.length > 0 ? voiceParts : fallbackParts.length > 0 ? fallbackParts : allParts;
  const shouldFilterParts = selectedParts.length > 0 && selectedParts.length < allParts.length;
  const previewBlob =
    sourceBlob && shouldFilterParts
      ? createFilteredMusicXmlBlob(doc, selectedParts)
      : sourceBlob;
  const notes: ScoreNote[] = [];
  const warnings: string[] = [];

  for (const part of selectedParts) {
    let divisions = 1;
    let tempo = 100;
    let currentSec = 0;
    let lastNoteStartSec = 0;
    let cursorStep = 0;
    const partId = part.getAttribute("id") ?? "part";
    const partName = partMetadata.get(partId)?.name;

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
            cursorStep,
          });
        }

        if (!isChord && !isGrace) {
          lastNoteStartSec = currentSec;
          currentSec += durationSec;
          cursorStep += 1;
        }
      }
    }
  }

  if (violinParts.length > 0 && allParts.length > violinParts.length) {
    warnings.push("Multiple parts were found; only the violin part is used for gameplay.");
  } else if (voiceParts.length > 0) {
    warnings.push("A part labeled voice was found with piano; using it as the violin part for gameplay.");
  } else if (fallbackParts.length > 0) {
    warnings.push("Multiple parts were found; the non-piano part is used for gameplay.");
  } else if (allParts.length > 1) {
    warnings.push("Multiple parts were found, but no part was labeled violin; all pitched notes are included.");
  }

  return {
    title,
    notes: notes.sort((a, b) => a.startSec - b.startSec || a.pitchMidi - b.pitchMidi),
    sourceKind,
    sourceBlob: previewBlob,
    extractionBlob: sourceBlob,
    omrHints: hints,
    warnings,
  };
}

function createFilteredMusicXmlBlob(doc: Document, partsToKeep: Element[]): Blob {
  const filteredDoc = doc.cloneNode(true) as Document;
  const partIdsToKeep = new Set(partsToKeep.map((part) => part.getAttribute("id")).filter(Boolean));

  for (const scorePart of Array.from(filteredDoc.querySelectorAll("part-list score-part"))) {
    const id = scorePart.getAttribute("id");
    if (!id || !partIdsToKeep.has(id)) {
      scorePart.remove();
    }
  }

  for (const partGroup of Array.from(filteredDoc.querySelectorAll("part-list part-group"))) {
    partGroup.remove();
  }

  for (const part of Array.from(filteredDoc.querySelectorAll("part"))) {
    const id = part.getAttribute("id");
    if (!id || !partIdsToKeep.has(id)) {
      part.remove();
    }
  }

  const xmlText = new XMLSerializer().serializeToString(filteredDoc);
  return new Blob([xmlText], { type: "application/vnd.recordare.musicxml+xml" });
}

function isViolinPart(part: Element, partMetadata: Map<string, PartMetadata>, hints?: OmrHints): boolean {
  const partId = part.getAttribute("id") ?? "";
  const searchText = partSearchText(partId, partMetadata);
  if (/\b(vln|violin|violino|violon)\b/i.test(searchText)) {
    return true;
  }

  return (hints?.violinPartAliases ?? []).some((alias) => matchesPartAlias(searchText, alias));
}

function isPianoPart(part: Element, partMetadata: Map<string, PartMetadata>): boolean {
  const partId = part.getAttribute("id") ?? "";
  return /\b(pno|piano|pianoforte|keyboard)\b/i.test(partSearchText(partId, partMetadata));
}

function isVoicePart(part: Element, partMetadata: Map<string, PartMetadata>): boolean {
  const partId = part.getAttribute("id") ?? "";
  return /\b(voice|vocal|singer|melody)\b/i.test(partSearchText(partId, partMetadata));
}

function selectVoiceFallbackParts(parts: Element[], partMetadata: Map<string, PartMetadata>): Element[] {
  if (!parts.some((part) => isPianoPart(part, partMetadata))) {
    return [];
  }

  return parts.filter((part) => isVoicePart(part, partMetadata));
}

function selectNonPianoFallbackParts(parts: Element[], partMetadata: Map<string, PartMetadata>): Element[] {
  if (parts.length <= 1) {
    return [];
  }

  const nonPianoParts = parts.filter((part) => !isPianoPart(part, partMetadata));
  return nonPianoParts.length === 1 ? nonPianoParts : [];
}

function partSearchText(partId: string, partMetadata: Map<string, PartMetadata>): string {
  const metadata = partMetadata.get(partId);
  return [partId, metadata?.name, ...(metadata?.labels ?? [])].filter(Boolean).join(" ");
}

function matchesPartAlias(searchText: string, alias: string): boolean {
  const normalizedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${normalizedAlias}\\b`, "i").test(searchText);
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

function readScoreTitle(doc: Document, partMetadata: Map<string, PartMetadata>): string | null {
  const explicitTitle = textContent(doc.querySelector("movement-title")) ?? textContent(doc.querySelector("work-title"));
  if (explicitTitle) {
    return normalizeTitle(explicitTitle);
  }

  const candidates: Array<{ text: string; score: number }> = [];
  for (const credit of Array.from(doc.querySelectorAll("credit"))) {
    const creditType = textContent(credit.querySelector("credit-type"));
    const words = Array.from(credit.querySelectorAll("credit-words"))
      .map((word) => textContent(word))
      .filter((word): word is string => Boolean(word));
    const title = normalizeTitle(words.join(" "));
    if (!title) {
      continue;
    }

    if (creditType && /title|movement/i.test(creditType)) {
      if (title) {
        return title;
      }
    }

    candidates.push({
      text: title,
      score: scoreCreditTitleCandidate(credit, title, partMetadata),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score && candidates[0].score > 0 ? candidates[0].text : null;
}

function readPartMetadata(doc: Document): Map<string, PartMetadata> {
  const partMetadata = new Map<string, PartMetadata>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list score-part"))) {
    const id = scorePart.getAttribute("id");
    if (!id) {
      continue;
    }

    const labels = uniqueStrings([
      textContent(scorePart.querySelector("part-name")),
      textContent(scorePart.querySelector("part-abbreviation")),
      textContent(scorePart.querySelector("part-name-display display-text")),
      textContent(scorePart.querySelector("part-abbreviation-display display-text")),
      ...Array.from(scorePart.querySelectorAll("score-instrument instrument-name")).map((node) => textContent(node)),
      ...Array.from(scorePart.querySelectorAll("score-instrument instrument-abbreviation")).map((node) =>
        textContent(node),
      ),
      ...Array.from(scorePart.querySelectorAll("midi-instrument midi-name")).map((node) => textContent(node)),
    ]);

    partMetadata.set(id, {
      name: labels[0],
      labels,
    });
  }

  return partMetadata;
}

function textContent(element: Element | null): string | null {
  const value = element?.textContent?.trim();
  return value ? value : null;
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function scoreCreditTitleCandidate(credit: Element, title: string, partMetadata: Map<string, PartMetadata>): number {
  const lowerTitle = title.toLowerCase();
  const partNameValues = Array.from(partMetadata.values()).flatMap((metadata) =>
    metadata.labels.map((label) => label.toLowerCase()),
  );
  let score = Math.min(title.length, 60);

  if (partNameValues.some((partName) => lowerTitle === partName || lowerTitle === partName.replace(/\s+\d+$/g, ""))) {
    score -= 120;
  }

  if (/^(violin|vln|piano|voice|part|score)(\s+[ivx\d]+)?$/i.test(title)) {
    score -= 120;
  }

  if (/\b(composer|arranger|arr\.|transcriber|copyright|page)\b/i.test(title)) {
    score -= 45;
  }

  if (/[,:;!?]/.test(title)) {
    score += 12;
  }

  const creditWords = Array.from(credit.querySelectorAll("credit-words"));
  const fontSizes = creditWords
    .map((word) => Number.parseFloat(word.getAttribute("font-size") ?? ""))
    .filter((value) => Number.isFinite(value));
  const defaultYs = creditWords
    .map((word) => Number.parseFloat(word.getAttribute("default-y") ?? ""))
    .filter((value) => Number.isFinite(value));

  if (fontSizes.length > 0) {
    score += Math.max(...fontSizes) * 1.5;
  }

  if (defaultYs.length > 0) {
    score += Math.max(...defaultYs) / 25;
  }

  if (creditWords.some((word) => /center/i.test(word.getAttribute("justify") ?? word.getAttribute("halign") ?? ""))) {
    score += 20;
  }

  return score;
}

function uniqueStrings(values: Array<string | null>): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized.toLowerCase())) {
      continue;
    }

    seen.add(normalized.toLowerCase());
    results.push(normalized);
  }

  return results;
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
