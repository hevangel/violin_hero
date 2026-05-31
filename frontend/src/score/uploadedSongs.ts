import type { OmrHints, ParsedScore, ScoreNote, UploadKind } from "./types";
import { parseMusicXml, readMusicXmlFile } from "./musicxml";

const db_name = "violin-hero-songs";
const store_name = "uploaded-songs";
const db_version = 1;

export type UploadedSong = {
  id: string;
  title: string;
  originalFileName: string;
  originalBlob?: Blob;
  originalMimeType?: string;
  sourceKind: UploadKind;
  notes: ScoreNote[];
  sourceBlob?: Blob;
  extractionBlob?: Blob;
  omrHints?: OmrHints;
  omrHintsRefreshedAt?: number;
  warnings: string[];
  createdAt: number;
};

export async function loadUploadedSongs(): Promise<UploadedSong[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store_name, "readonly");
    const request = transaction.objectStore(store_name).getAll();
    request.onsuccess = () => {
      resolve((request.result as UploadedSong[]).sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveUploadedSong(
  originalFileName: string,
  parsedScore: ParsedScore,
  originalFile?: File,
): Promise<UploadedSong> {
  const song: UploadedSong = {
    id: crypto.randomUUID(),
    title: parsedScore.title,
    originalFileName,
    originalBlob: originalFile,
    originalMimeType: originalFile?.type,
    sourceKind: parsedScore.sourceKind,
    notes: parsedScore.notes,
    sourceBlob: parsedScore.sourceBlob,
    extractionBlob: parsedScore.extractionBlob,
    omrHints: parsedScore.omrHints,
    omrHintsRefreshedAt: isScanFile(originalFileName) ? Date.now() : undefined,
    warnings: parsedScore.warnings,
    createdAt: Date.now(),
  };

  const db = await openDatabase();
  await requestPromise(db.transaction(store_name, "readwrite").objectStore(store_name).put(song));
  return song;
}

export async function deleteUploadedSong(id: string): Promise<void> {
  const db = await openDatabase();
  await requestPromise(db.transaction(store_name, "readwrite").objectStore(store_name).delete(id));
}

export async function renameUploadedSong(id: string, title: string): Promise<UploadedSong> {
  const db = await openDatabase();
  const song =
    (await requestValue<UploadedSong>(db.transaction(store_name, "readonly").objectStore(store_name).get(id))) ?? null;
  if (!song) {
    throw new Error("Saved upload was not found.");
  }

  const updatedSong = { ...song, title };
  await requestPromise(db.transaction(store_name, "readwrite").objectStore(store_name).put(updatedSong));
  return updatedSong;
}

export async function updateUploadedSong(song: UploadedSong): Promise<UploadedSong> {
  const db = await openDatabase();
  await requestPromise(db.transaction(store_name, "readwrite").objectStore(store_name).put(song));
  return song;
}

export async function uploadedSongToScore(song: UploadedSong): Promise<ParsedScore> {
  const parseableBlob = song.extractionBlob ?? song.sourceBlob;
  if (parseableBlob && (song.sourceKind === "musicxml" || song.sourceKind === "mxl" || song.sourceKind === "omr")) {
    try {
      const { xmlText, kind } = await readMusicXmlFile(parseableBlob);
      return parseMusicXml(xmlText, kind, parseableBlob, song.omrHints);
    } catch {
      // Fall back to the cached parsed data if an older saved blob cannot be reparsed.
    }
  }

  return {
    title: song.title,
    notes: song.notes,
    sourceKind: song.sourceKind,
    sourceBlob: song.sourceBlob,
    extractionBlob: song.extractionBlob,
    omrHints: song.omrHints,
    warnings: song.warnings,
  };
}

function isScanFile(fileName: string): boolean {
  return /\.(pdf|png|jpe?g|webp)$/i.test(fileName);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(db_name, db_version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(store_name)) {
        db.createObjectStore(store_name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestPromise(request: IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function requestValue<T>(request: IDBRequest<T | undefined>): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
