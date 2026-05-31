import { useEffect, useMemo, useRef, useState } from "react";
import { GameHud } from "./components/GameHud";
import { NoteHighway } from "./components/NoteHighway";
import { ScorePreview } from "./components/ScorePreview";
import { ScoreUploader } from "./components/ScoreUploader";
import { createPitchTracker, type DetectedPitch, type PitchTracker } from "./game/pitch";
import { applyJudgement, initialScoreState, judgeNote, type Judgement, type ScoreState } from "./game/scoring";
import { midiToNoteName } from "./game/music";
import { ingestScoreFile } from "./score/ingest";
import type { ParsedScore, ScoreNote } from "./score/types";

const preroll_seconds = 3;

export default function App() {
  const [parsedScore, setParsedScore] = useState<ParsedScore | null>(null);
  const [status, setStatus] = useState("No score loaded yet.");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(-preroll_seconds);
  const [pitch, setPitch] = useState<DetectedPitch | null>(null);
  const [score, setScore] = useState<ScoreState>(initialScoreState);
  const trackerRef = useRef<PitchTracker | null>(null);
  const playStartMsRef = useRef(0);
  const scoredNoteIdsRef = useRef<Set<string>>(new Set());
  const pitchRef = useRef<DetectedPitch | null>(null);
  const notesRef = useRef<ScoreNote[]>([]);

  const notes = useMemo(() => parsedScore?.notes ?? [], [parsedScore]);
  const totalDurationSec = useMemo(
    () => notes.reduce((max, note) => Math.max(max, note.startSec + note.durationSec), 0),
    [notes],
  );

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
      scoreDueNotes(elapsedSec);

      if (elapsedSec > totalDurationSec + 1.5) {
        setIsPlaying(false);
        setStatus("Run complete. Upload another score or start again.");
        return;
      }

      animationFrame = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, totalDurationSec]);

  useEffect(() => {
    return () => trackerRef.current?.stop();
  }, []);

  async function handleUpload(file: File) {
    setIsLoading(true);
    setIsPlaying(false);
    setStatus(`Loading ${file.name}...`);

    try {
      const result = await ingestScoreFile(file);
      if (result.parsedScore.notes.length === 0) {
        throw new Error("No playable pitched notes were found in this score.");
      }

      setParsedScore(result.parsedScore);
      setScore(initialScoreState);
      scoredNoteIdsRef.current = new Set();
      setCurrentSec(-preroll_seconds);
      const noteRange = describeRange(result.parsedScore.notes);
      const conversion = result.convertedFileName ? ` OMR produced ${result.convertedFileName}.` : "";
      setStatus(
        `Loaded ${result.parsedScore.title}: ${result.parsedScore.notes.length} notes, ${noteRange}.${conversion}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load the score.");
    } finally {
      setIsLoading(false);
    }
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

  function startRun() {
    if (!parsedScore || !isListening) {
      setStatus("Load a score and enable the microphone before starting.");
      return;
    }

    setScore(initialScoreState);
    scoredNoteIdsRef.current = new Set();
    playStartMsRef.current = performance.now() + preroll_seconds * 1000;
    setCurrentSec(-preroll_seconds);
    setIsPlaying(true);
    setStatus(`Playing ${parsedScore.title}. Count in: ${preroll_seconds} seconds.`);
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

      <div className="layout">
        <div className="sidebar">
          <ScoreUploader isLoading={isLoading} status={status} onUpload={handleUpload} />
          <GameHud
            score={score}
            pitch={pitch}
            isListening={isListening}
            isPlaying={isPlaying}
            onToggleMic={toggleMic}
            onStart={startRun}
            canPlay={notes.length > 0 && isListening}
          />
        </div>

        <section className="panel game-panel">
          <div className="game-heading">
            <div>
              <p className="eyebrow">Step 3</p>
              <h2>{parsedScore?.title ?? "Load a score to begin"}</h2>
            </div>
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
      </div>

      <ScorePreview sourceBlob={parsedScore?.sourceBlob} />
    </main>
  );
}

function describeRange(notes: ScoreNote[]): string {
  const pitches = notes.map((note) => note.pitchMidi);
  return `${midiToNoteName(Math.min(...pitches))} to ${midiToNoteName(Math.max(...pitches))}`;
}
