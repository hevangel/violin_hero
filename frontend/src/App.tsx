import { useEffect, useMemo, useRef, useState } from "react";
import { GameHud } from "./components/GameHud";
import { NoteHighway } from "./components/NoteHighway";
import { ScorePreview } from "./components/ScorePreview";
import { ScoreUploader } from "./components/ScoreUploader";
import { SongLibrary } from "./components/SongLibrary";
import { startDemoPlayback, type DemoPlayer } from "./game/demoPlayback";
import { createPitchTracker, type DetectedPitch, type PitchTracker } from "./game/pitch";
import { applyJudgement, initialScoreState, judgeNote, type Judgement, type ScoreState } from "./game/scoring";
import { midiToNoteName } from "./game/music";
import { builtInSongToScore, type BuiltInSong } from "./score/builtinSongs";
import { ingestScoreFile } from "./score/ingest";
import type { ParsedScore, ScoreNote } from "./score/types";
import {
  deleteUploadedSong,
  loadUploadedSongs,
  saveUploadedSong,
  uploadedSongToScore,
  type UploadedSong,
} from "./score/uploadedSongs";

const preroll_seconds = 3;

export default function App() {
  const [parsedScore, setParsedScore] = useState<ParsedScore | null>(null);
  const [status, setStatus] = useState("No score loaded yet.");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<"practice" | "demo" | null>(null);
  const [currentSec, setCurrentSec] = useState(-preroll_seconds);
  const [pitch, setPitch] = useState<DetectedPitch | null>(null);
  const [score, setScore] = useState<ScoreState>(initialScoreState);
  const [uploadedSongs, setUploadedSongs] = useState<UploadedSong[]>([]);
  const [isSetupExpanded, setIsSetupExpanded] = useState(true);
  const trackerRef = useRef<PitchTracker | null>(null);
  const demoPlayerRef = useRef<DemoPlayer | null>(null);
  const playStartMsRef = useRef(0);
  const scoredNoteIdsRef = useRef<Set<string>>(new Set());
  const pitchRef = useRef<DetectedPitch | null>(null);
  const notesRef = useRef<ScoreNote[]>([]);

  const notes = useMemo(() => parsedScore?.notes ?? [], [parsedScore]);
  const totalDurationSec = useMemo(
    () => notes.reduce((max, note) => Math.max(max, note.startSec + note.durationSec), 0),
    [notes],
  );
  const currentNoteIndex = useMemo(() => {
    if (currentSec < 0) {
      return null;
    }

    const index = notes.findIndex(
      (note) => currentSec >= note.startSec && currentSec <= note.startSec + Math.max(note.durationSec, 0.12),
    );
    return index >= 0 ? index : null;
  }, [currentSec, notes]);
  const currentNote = currentNoteIndex === null ? null : notes[currentNoteIndex];

  useEffect(() => {
    pitchRef.current = pitch;
  }, [pitch]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let animationFrame = 0;
    const tick = () => {
      const elapsedSec = (performance.now() - playStartMsRef.current) / 1000;
      setCurrentSec(elapsedSec);
      if (playbackMode === "practice") {
        scoreDueNotes(elapsedSec);
      }

      if (elapsedSec > totalDurationSec + 1.5) {
        demoPlayerRef.current?.stop();
        demoPlayerRef.current = null;
        setIsPlaying(false);
        setPlaybackMode(null);
        setStatus("Run complete. Upload another score or start again.");
        return;
      }

      animationFrame = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, playbackMode, totalDurationSec]);

  useEffect(() => {
    return () => {
      trackerRef.current?.stop();
      demoPlayerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    loadUploadedSongs()
      .then(setUploadedSongs)
      .catch(() => setStatus("Could not load saved uploaded songs from this browser."));
  }, []);

  async function handleUpload(file: File) {
    stopRun();
    setIsLoading(true);
    setStatus(`Loading ${file.name}...`);

    try {
      const result = await ingestScoreFile(file);
      if (result.parsedScore.notes.length === 0) {
        throw new Error("No playable pitched notes were found in this score.");
      }

      selectScore(result.parsedScore);
      const noteRange = describeRange(result.parsedScore.notes);
      const conversion = result.convertedFileName ? ` OMR produced ${result.convertedFileName}.` : "";
      try {
        const savedSong = await saveUploadedSong(file.name, result.parsedScore);
        setUploadedSongs((previous) => [savedSong, ...previous]);
        setStatus(
          `Loaded and saved ${result.parsedScore.title}: ${result.parsedScore.notes.length} notes, ${noteRange}.${conversion}`,
        );
      } catch {
        setStatus(
          `Loaded ${result.parsedScore.title}: ${result.parsedScore.notes.length} notes, ${noteRange}. Browser storage failed, so it was not saved.${conversion}`,
        );
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load the score.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleBuiltInSong(song: BuiltInSong) {
    stopRun();
    selectScore(builtInSongToScore(song));
    setStatus(`Loaded built-in song: ${song.title}. ${song.subtitle}.`);
  }

  function handleUploadedSong(song: UploadedSong) {
    stopRun();
    selectScore(uploadedSongToScore(song));
    setStatus(`Loaded saved upload: ${song.title}.`);
  }

  async function handleDeleteUploadedSong(song: UploadedSong) {
    await deleteUploadedSong(song.id);
    setUploadedSongs((previous) => previous.filter((candidate) => candidate.id !== song.id));
    setStatus(`Removed saved upload: ${song.title}.`);
  }

  function selectScore(nextScore: ParsedScore) {
    setParsedScore(nextScore);
    setScore(initialScoreState);
    scoredNoteIdsRef.current = new Set();
    setCurrentSec(-preroll_seconds);
    setIsSetupExpanded(false);
  }

  async function toggleMic() {
    if (isListening) {
      trackerRef.current?.stop();
      trackerRef.current = null;
      setIsListening(false);
      setPitch(null);
      return;
    }

    try {
      const tracker = createPitchTracker();
      trackerRef.current = tracker;
      await tracker.start(setPitch);
      setIsListening(true);
    } catch (error) {
      trackerRef.current = null;
      setStatus(error instanceof Error ? error.message : "Microphone access was blocked.");
    }
  }

  function handlePractice() {
    if (playbackMode === "practice") {
      if (isPlaying) {
        pauseRun();
      } else {
        resumeRun();
      }
      return;
    }

    startPracticeRun();
  }

  function startPracticeRun() {
    if (!parsedScore || !isListening) {
      setStatus("Load a score and enable the microphone before starting.");
      return;
    }

    setScore(initialScoreState);
    demoPlayerRef.current?.stop();
    demoPlayerRef.current = null;
    scoredNoteIdsRef.current = new Set();
    playStartMsRef.current = performance.now() + preroll_seconds * 1000;
    setCurrentSec(-preroll_seconds);
    setPlaybackMode("practice");
    setIsPlaying(true);
    setStatus(`Playing ${parsedScore.title}. Count in: ${preroll_seconds} seconds.`);
  }

  function handleDemo() {
    if (playbackMode === "demo") {
      if (isPlaying) {
        pauseRun();
      } else {
        resumeRun();
      }
      return;
    }

    startDemo();
  }

  function startDemo() {
    if (!parsedScore) {
      setStatus("Load a score before starting demo mode.");
      return;
    }

    setScore(initialScoreState);
    scoredNoteIdsRef.current = new Set();
    demoPlayerRef.current?.stop();
    try {
      demoPlayerRef.current = startDemoPlayback(notes, preroll_seconds);
      playStartMsRef.current = performance.now() + preroll_seconds * 1000;
      setCurrentSec(-preroll_seconds);
      setPlaybackMode("demo");
      setIsPlaying(true);
      setStatus(`Demo mode: playing ${parsedScore.title}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Demo playback could not start.");
    }
  }

  function stopRun() {
    demoPlayerRef.current?.stop();
    demoPlayerRef.current = null;
    setIsPlaying(false);
    setPlaybackMode(null);
    setCurrentSec(-preroll_seconds);
  }

  function pauseRun() {
    demoPlayerRef.current?.stop();
    demoPlayerRef.current = null;
    setIsPlaying(false);
    setStatus(`Paused ${parsedScore?.title ?? "run"}.`);
  }

  function resumeRun() {
    if (!parsedScore || !playbackMode) {
      return;
    }

    if (playbackMode === "practice" && !isListening) {
      setStatus("Enable the microphone before resuming practice.");
      return;
    }

    if (playbackMode === "demo") {
      const offsetSec = Math.max(0, currentSec);
      const delaySec = currentSec < 0 ? Math.abs(currentSec) : 0;
      try {
        demoPlayerRef.current = startDemoPlayback(notes, delaySec, offsetSec);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Demo playback could not resume.");
        return;
      }
    }

    playStartMsRef.current = performance.now() - currentSec * 1000;
    setIsPlaying(true);
    setStatus(`Resumed ${parsedScore.title}.`);
  }

  function scoreDueNotes(elapsedSec: number) {
    const pitchSnapshot = pitchRef.current;
    const judgements: Judgement[] = [];

    for (const note of notesRef.current) {
      if (scoredNoteIdsRef.current.has(note.id)) {
        continue;
      }

      if (note.startSec > elapsedSec + 0.2) {
        break;
      }

      const judgement = judgeNote(note, elapsedSec, pitchSnapshot);
      if (judgement) {
        scoredNoteIdsRef.current.add(note.id);
        judgements.push(judgement);
      }
    }

    if (judgements.length > 0) {
      setScore((previous) => judgements.reduce(applyJudgement, previous));
    }
  }

  return (
    <main className="app-shell">
      {isSetupExpanded || !parsedScore ? (
        <header className="hero">
          <div>
            <p className="eyebrow">Browser rhythm trainer</p>
            <h1>Violin Hero</h1>
            <p>
              Upload a score, watch the colorful notes fly toward the hit line, then play violin into
              your microphone for pitch and rhythm scoring.
            </p>
          </div>
        </header>
      ) : (
        <header className="hero hero-compact">
          <div className="compact-title">
            <p className="eyebrow">Browser rhythm trainer</p>
            <h1>Violin Hero</h1>
            <p>Upload a score, watch the notes, and play into your microphone.</p>
          </div>
          <div className="setup-collapsed">
            <div className="selected-song-pill">
              <span>Selected song</span>
              <strong>{parsedScore.title}</strong>
            </div>
            <button type="button" onClick={() => setIsSetupExpanded(true)}>
              New song
            </button>
          </div>
        </header>
      )}

      {isSetupExpanded || !parsedScore ? (
        <div className="setup-layout">
          <ScoreUploader isLoading={isLoading} status={status} onUpload={handleUpload} />
          <SongLibrary
            uploadedSongs={uploadedSongs}
            onSelectBuiltIn={handleBuiltInSong}
            onSelectUploaded={handleUploadedSong}
            onDeleteUploaded={handleDeleteUploadedSong}
          />
        </div>
      ) : null}

      <ScorePreview sourceBlob={parsedScore?.sourceBlob} currentNote={currentNote} currentNoteIndex={currentNoteIndex} />

      <div className="play-layout">
        <section className="panel game-panel">
          <div className="game-heading">
            <h2>{parsedScore?.title ?? "Load a score to begin"}</h2>
            <div className="note-count">{notes.length ? `${notes.length} notes` : "No notes"}</div>
          </div>
          <NoteHighway
            notes={notes}
            currentSec={currentSec}
            activePitchMidi={pitch?.midi ?? null}
            lastJudgement={score.lastJudgement}
          />
          {parsedScore?.warnings.map((warning) => (
            <p className="warning" key={warning}>
              {warning}
            </p>
          ))}
        </section>

        <div className="play-controls">
          <GameHud
            score={score}
            pitch={pitch}
            isListening={isListening}
            isPlaying={isPlaying}
            isDemoPlaying={playbackMode === "demo"}
            playbackMode={playbackMode}
            onToggleMic={toggleMic}
            onPractice={handlePractice}
            onDemo={handleDemo}
            onStop={stopRun}
            canPlay={notes.length > 0 && isListening}
            canDemo={notes.length > 0}
          />
        </div>
      </div>

    </main>
  );
}

function describeRange(notes: ScoreNote[]): string {
  const pitches = notes.map((note) => note.pitchMidi);
  return `${midiToNoteName(Math.min(...pitches))} to ${midiToNoteName(Math.max(...pitches))}`;
}
