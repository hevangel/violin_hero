import { useState } from "react";
import { builtInSongs, type BuiltInSong } from "../score/builtinSongs";
import type { UploadedSong } from "../score/uploadedSongs";

type SongLibraryProps = {
  uploadedSongs: UploadedSong[];
  onSelectBuiltIn: (song: BuiltInSong) => void;
  onSelectUploaded: (song: UploadedSong) => void;
  onDeleteUploaded: (song: UploadedSong) => void;
};

export function SongLibrary({
  uploadedSongs,
  onSelectBuiltIn,
  onSelectUploaded,
  onDeleteUploaded,
}: SongLibraryProps) {
  const [activeTab, setActiveTab] = useState<"built-in" | "uploaded">("built-in");

  return (
    <section className="panel song-library-panel">
      <div className="song-library-header">
        <div className="tab-row" role="tablist" aria-label="Song library tabs">
          <button
            type="button"
            className={activeTab === "built-in" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("built-in")}
          >
            Built-in songs
          </button>
          <button
            type="button"
            className={activeTab === "uploaded" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("uploaded")}
          >
            Uploaded songs
          </button>
        </div>
      </div>

      {activeTab === "built-in" ? (
        <>
          <p>Beginner violin repertoire using public-domain melodies and violin MIDI data.</p>
          <div className="song-list">
            {builtInSongs.map((song) => (
              <button type="button" className="song-card" key={song.id} onClick={() => onSelectBuiltIn(song)}>
                <span>{song.title}</span>
                <small>
                  Violin MIDI • {song.notes.length} notes • {song.bpm} bpm
                </small>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>Uploaded scores are saved in this browser after they load successfully.</p>
          <div className="song-list">
            {uploadedSongs.length === 0 ? (
              <div className="empty-library">No uploaded songs yet.</div>
            ) : (
              uploadedSongs.map((song) => (
                <div className="uploaded-song-card" key={song.id}>
                  <button type="button" className="song-card" onClick={() => onSelectUploaded(song)}>
                    <span>{song.title}</span>
                    <small>
                      {song.notes.length} notes • {song.originalFileName}
                    </small>
                  </button>
                  <button type="button" className="icon-button" onClick={() => onDeleteUploaded(song)}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
