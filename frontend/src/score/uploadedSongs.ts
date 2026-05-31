import type { ParsedScore, ScoreNote, UploadKind } from "./types";

const db_name = "violin-hero-songs";
const store_name = "uploaded-songs";
const db_version = 1;

export type UploadedSong = {
  id: string;
  title: string;
  originalFileName: string;
  sourceKind: UploadKind;
  notes: ScoreNote[];
  sourceBlob?: Blob;
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

export async function saveUploadedSong(originalFileName: string, parsedScore: ParsedScore): Promise<UploadedSong> {
  const song: UploadedSong = {
    id: crypto.randomUUID(),
    title: parsedScore.title,
    originalFileName,
    sourceKind: parsedScore.sourceKind,
    notes: parsedScore.notes,
    sourceBlob: parsedScore.sourceBlob,
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

export function uploadedSongToScore(song: UploadedSong): ParsedScore {
  return {
    title: song.title,
    notes: song.notes,
    sourceKind: song.sourceKind,
    sourceBlob: song.sourceBlob,
    warnings: song.warnings,
  };
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
