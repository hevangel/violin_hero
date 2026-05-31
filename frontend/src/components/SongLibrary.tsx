import { useState } from "react";
import { builtInSongs, type BuiltInSong } from "../score/builtinSongs";
import type { UploadedSong } from "../score/uploadedSongs";

type SongLibraryProps = {
  uploadedSongs: UploadedSong[];
  onSelectBuiltIn: (song: BuiltInSong) => void;
  onSelectUploaded: (song: UploadedSong) => void;
  onViewUploaded: (song: UploadedSong) => void;
  onDeleteUploaded: (song: UploadedSong) => void;
};

export function SongLibrary({
  uploadedSongs,
  onSelectBuiltIn,
  onSelectUploaded,
  onViewUploaded,
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
                  <div className="uploaded-song-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onViewUploaded(song)}
                      aria-label={`View ${song.title}`}
                      title={`View ${song.title}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M12 5c5 0 8.5 4.1 9.7 6.2a1.6 1.6 0 0 1 0 1.6C20.5 14.9 17 19 12 19s-8.5-4.1-9.7-6.2a1.6 1.6 0 0 1 0-1.6C3.5 9.1 7 5 12 5Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => onDeleteUploaded(song)}
                      aria-label={`Delete ${song.title}`}
                      title={`Delete ${song.title}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
                        <path d="M6 9h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
