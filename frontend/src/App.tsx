import { useEffect, useMemo, useRef, useState } from "react";
import { GameHud } from "./components/GameHud";
import { NoteHighway } from "./components/NoteHighway";
import { ScorePreview } from "./components/ScorePreview";
import { ScoreUploader } from "./components/ScoreUploader";
import { ScoreViewerModal } from "./components/ScoreViewerModal";
import { SongLibrary } from "./components/SongLibrary";
import { startDemoPlayback, type DemoPlayer } from "./game/demoPlayback";
import { createPitchTracker, type DetectedPitch, type PitchTracker } from "./game/pitch";
import { PitchHistory } from "./game/pitchHistory";
import {
  applyJudgement,
  initialScoreState,
  judgeNote,
  judgeNoteWindow,
  judgeSingleNote,
  judgeSingleNoteWindow,
  type JudgeMode,
  type PracticeFlowMode,
  type Judgement,
  type ScoreState,
} from "./game/scoring";
import { midiToNoteName } from "./game/music";
import { builtInSongToScore, type BuiltInSong } from "./score/builtinSongs";
import { ingestScoreFile, reprocessOmrFile } from "./score/ingest";
import type { ParsedScore, ScoreNote } from "./score/types";
import {
  deleteUploadedSong,
  loadUploadedSongs,
  renameUploadedSong,
  saveUploadedSong,
  updateUploadedSong,
  uploadedSongToScore,
  type UploadedSong,
} from "./score/uploadedSongs";

const preroll_seconds = 3;
const min_tempo_scale = 0.5;
const max_tempo_scale = 1.5;
const tempo_step = 0.1;

type PlaybackMode = "practice" | "demo" | "review" | null;

type ReviewPitchSample = {
  timeSec: number;
  midi: number | null;
  noteName?: string;
  frequency?: number;
  clarity?: number;
};

type ReviewJudgement = Judgement & {
  judgedAtSec: number;
};

type ReviewRun = {
  id: number;
  title: string;
  durationSec: number;
  tempoScale: number;
  score: ScoreState;
  pitchSamples: ReviewPitchSample[];
  judgements: ReviewJudgement[];
  audioUrl?: string;
};

export default function App() {
  const [parsedScore, setParsedScore] = useState<ParsedScore | null>(null);
  const [status, setStatus] = useState("No score loaded yet.");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(null);
  const [currentSec, setCurrentSec] = useState(-preroll_seconds);
  const [pitch, setPitch] = useState<DetectedPitch | null>(null);
  const [score, setScore] = useState<ScoreState>(initialScoreState);
  const [uploadedSongs, setUploadedSongs] = useState<UploadedSong[]>([]);
  const [isSetupExpanded, setIsSetupExpanded] = useState(true);
  const [reviewRun, setReviewRun] = useState<ReviewRun | null>(null);
  const [viewingSong, setViewingSong] = useState<UploadedSong | null>(null);
  const [judgeMode, setJudgeMode] = useState<JudgeMode>("simple");
  const [isJudgeHelpOpen, setIsJudgeHelpOpen] = useState(false);
  const [isPracticeHelpOpen, setIsPracticeHelpOpen] = useState(false);
  const [tempoScale, setTempoScale] = useState(1);
  const [practiceFlowMode, setPracticeFlowMode] = useState<PracticeFlowMode>("continuous");
  const [isReviewAudioPreparing, setIsReviewAudioPreparing] = useState(false);
  const trackerRef = useRef<PitchTracker | null>(null);
  const demoPlayerRef = useRef<DemoPlayer | null>(null);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const saveRecordingRef = useRef(false);
  const userDisabledMicRef = useRef(false);
  const playStartMsRef = useRef(0);
  const scoredNoteIdsRef = useRef<Set<string>>(new Set());
  const singleNoteIndexRef = useRef(0);
  const pitchRef = useRef<DetectedPitch | null>(null);
  const pitchHistoryRef = useRef(new PitchHistory());
  const notesRef = useRef<ScoreNote[]>([]);
  const pitchSamplesRef = useRef<ReviewPitchSample[]>([]);
  const reviewJudgementsRef = useRef<ReviewJudgement[]>([]);
  const lastPitchSampleSecRef = useRef(Number.NEGATIVE_INFINITY);
  const scoreRef = useRef<ScoreState>(initialScoreState);
  const reviewAudioUrlRef = useRef<string | null>(null);

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
  const reviewPitchSample = useMemo(() => {
    if (playbackMode !== "review" || !reviewRun) {
      return null;
    }

    let selectedSample: ReviewPitchSample | null = null;
    for (const sample of reviewRun.pitchSamples) {
      if (sample.timeSec > currentSec) {
        break;
      }
      selectedSample = sample;
    }

    return selectedSample && currentSec - selectedSample.timeSec <= 0.2 ? selectedSample : null;
  }, [currentSec, playbackMode, reviewRun]);
  const reviewLastJudgement = useMemo(() => {
    if (playbackMode !== "review" || !reviewRun) {
      return undefined;
    }

    let selectedJudgement: ReviewJudgement | undefined;
    for (const judgement of reviewRun.judgements) {
      if (judgement.judgedAtSec > currentSec) {
        break;
      }
      selectedJudgement = judgement;
    }

    return selectedJudgement && currentSec - selectedJudgement.judgedAtSec <= 1.2 ? selectedJudgement : undefined;
  }, [currentSec, playbackMode, reviewRun]);
  const activePitchMidi = playbackMode === "review" ? (reviewPitchSample?.midi ?? null) : (pitch?.midi ?? null);
  const activeJudgement = playbackMode === "review" ? reviewLastJudgement : score.lastJudgement;
  const activePitchTrail = playbackMode === "review" ? (reviewRun?.pitchSamples ?? []) : [];
  const hudScore =
    playbackMode === "review" && reviewRun
      ? {
          ...reviewRun.score,
          lastJudgement: reviewLastJudgement,
        }
      : score;
  const pitchLabel =
    playbackMode === "review"
      ? reviewPitchSample?.midi === null || !reviewPitchSample
        ? "No pitch"
        : `${reviewPitchSample.noteName ?? midiToNoteName(reviewPitchSample.midi)} replay`
      : undefined;

  useEffect(() => {
    pitchRef.current = pitch;
  }, [pitch]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let animationFrame = 0;
    const tick = () => {
      const elapsedRealSec = (performance.now() - playStartMsRef.current) / 1000;
      const activeTempoScale = playbackMode === "review" ? (reviewRun?.tempoScale ?? tempoScale) : tempoScale;
      const elapsedSec = scoreTimeFromRealTime(elapsedRealSec, activeTempoScale);
      if (playbackMode === "practice" && practiceFlowMode === "single-note") {
        tickSingleNotePractice(elapsedRealSec);
        animationFrame = requestAnimationFrame(tick);
        return;
      }

      setCurrentSec(elapsedSec);
      if (playbackMode === "practice") {
        pitchHistoryRef.current.add(pitchRef.current, elapsedSec);
        recordPitchSample(elapsedSec);
        scoreDueNotes(elapsedSec);
      }

      const runDurationSec = playbackMode === "review" ? (reviewRun?.durationSec ?? totalDurationSec) : totalDurationSec;
      if (elapsedSec > runDurationSec + 1.5) {
        demoPlayerRef.current?.stop();
        demoPlayerRef.current = null;
        reviewAudioRef.current?.pause();
        reviewAudioRef.current = null;
        setIsPlaying(false);
        setPlaybackMode(null);
        if (playbackMode === "practice") {
          finishPracticeRun();
        } else if (playbackMode === "review") {
          setStatus("Review complete. Play it again or start another run.");
        } else {
          setStatus("Demo complete. Start a run when you are ready.");
        }
        return;
      }

      animationFrame = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, playbackMode, practiceFlowMode, reviewRun, tempoScale, totalDurationSec]);

  useEffect(() => {
    return () => {
      stopPracticeRecording(false);
      trackerRef.current?.stop();
      demoPlayerRef.current?.stop();
      reviewAudioRef.current?.pause();
      if (reviewAudioUrlRef.current) {
        URL.revokeObjectURL(reviewAudioUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void startMic(false);
  }, []);

  useEffect(() => {
    loadUploadedSongs()
      .then((songs) => {
        setUploadedSongs(songs);
        void refreshSavedScanHints(songs);
      })
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
        const savedSong = await saveUploadedSong(file.name, result.parsedScore, file);
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

  async function handleUploadedSong(song: UploadedSong) {
    stopRun();
    setStatus(`Loading saved upload: ${song.title}.`);
    try {
      const { score: nextScore } = await refreshUploadedSong(song);
      selectScore(nextScore);
      setStatus(`Loaded saved upload: ${nextScore.title}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load the saved upload.");
    }
  }

  async function handleDeleteUploadedSong(song: UploadedSong) {
    await deleteUploadedSong(song.id);
    setUploadedSongs((previous) => previous.filter((candidate) => candidate.id !== song.id));
    setViewingSong((previous) => (previous?.id === song.id ? null : previous));
    setStatus(`Removed saved upload: ${song.title}.`);
  }

  async function handleViewUploadedSong(song: UploadedSong) {
    setStatus(`Opening saved upload: ${song.title}.`);
    try {
      const { song: refreshedSong } = await refreshUploadedSong(song);
      setViewingSong(refreshedSong);
    } catch {
      setViewingSong(song);
    }
  }

  async function handleRenameUploadedSong(song: UploadedSong, title: string) {
    const updatedSong = await renameUploadedSong(song.id, title);
    setUploadedSongs((previous) =>
      previous.map((candidate) => (candidate.id === updatedSong.id ? updatedSong : candidate)),
    );
    setViewingSong((previous) => (previous?.id === updatedSong.id ? updatedSong : previous));
    setStatus(`Renamed saved upload to ${updatedSong.title}.`);
  }

  async function refreshUploadedSong(song: UploadedSong): Promise<{ song: UploadedSong; score: ParsedScore }> {
    const nextScore = await uploadedSongToScore(song);
    const shouldUpdateTitle = shouldUseDetectedTitle(song.title, nextScore.title, song.originalFileName);
    const refreshedSong: UploadedSong = {
      ...song,
      title: shouldUpdateTitle ? nextScore.title : song.title,
      sourceKind: nextScore.sourceKind,
      notes: nextScore.notes,
      sourceBlob: nextScore.sourceBlob,
      extractionBlob: nextScore.extractionBlob ?? song.extractionBlob,
      omrHints: nextScore.omrHints ?? song.omrHints,
      omrHintsRefreshedAt: song.omrHintsRefreshedAt,
      warnings: nextScore.warnings,
    };

    setUploadedSongs((previous) =>
      previous.map((candidate) => (candidate.id === refreshedSong.id ? refreshedSong : candidate)),
    );

    try {
      await updateUploadedSong(refreshedSong);
    } catch {
      // The in-memory refresh still lets the current viewer/run use the extracted metadata.
    }

    return {
      song: refreshedSong,
      score: {
        ...nextScore,
        title: refreshedSong.title,
      },
    };
  }

  async function refreshSavedScanHints(songs: UploadedSong[]) {
    const candidates = songs.filter(shouldRefreshSavedScanHints);
    if (candidates.length === 0) {
      return;
    }

    setStatus(`Running RapidOCR on ${candidates.length} saved scan${candidates.length === 1 ? "" : "s"}...`);
    let refreshedCount = 0;
    for (const song of candidates) {
      try {
        const result = await reprocessOmrFile(song.originalFileName, song.originalBlob!);
        const shouldUpdateTitle = shouldUseDetectedTitle(song.title, result.parsedScore.title, song.originalFileName);
        const refreshedSong: UploadedSong = {
          ...song,
          title: shouldUpdateTitle ? result.parsedScore.title : song.title,
          sourceKind: result.parsedScore.sourceKind,
          notes: result.parsedScore.notes,
          sourceBlob: result.parsedScore.sourceBlob,
          extractionBlob: result.parsedScore.extractionBlob,
          omrHints: result.parsedScore.omrHints ?? {},
          omrHintsRefreshedAt: Date.now(),
          warnings: result.parsedScore.warnings,
        };

        await updateUploadedSong(refreshedSong);
        setUploadedSongs((previous) =>
          previous.map((candidate) => (candidate.id === refreshedSong.id ? refreshedSong : candidate)),
        );
        setViewingSong((previous) => (previous?.id === refreshedSong.id ? refreshedSong : previous));
        refreshedCount += 1;
      } catch (error) {
        const attemptedSong = {
          ...song,
          omrHintsRefreshedAt: Date.now(),
        };
        await updateUploadedSong(attemptedSong);
        setUploadedSongs((previous) =>
          previous.map((candidate) => (candidate.id === attemptedSong.id ? attemptedSong : candidate)),
        );
        console.error(`Could not refresh RapidOCR hints for ${song.title}.`, error);
      }
    }

    setStatus(
      refreshedCount > 0
        ? `Updated RapidOCR metadata for ${refreshedCount} saved scan${refreshedCount === 1 ? "" : "s"}.`
        : "RapidOCR did not update any saved scans.",
    );
  }

  function selectScore(nextScore: ParsedScore) {
    clearReviewRun();
    setParsedScore(nextScore);
    setScore(initialScoreState);
    scoreRef.current = initialScoreState;
    scoredNoteIdsRef.current = new Set();
    setCurrentSec(-preroll_seconds);
    setIsSetupExpanded(false);
  }

  async function toggleMic() {
    if (isListening) {
      userDisabledMicRef.current = true;
      stopMic();
      return;
    }

    userDisabledMicRef.current = false;
    await startMic(true);
  }

  async function startMic(showErrors: boolean) {
    if (isListening || trackerRef.current || userDisabledMicRef.current) {
      return;
    }

    try {
      const tracker = createPitchTracker();
      trackerRef.current = tracker;
      await tracker.start(setPitch);
      setIsListening(true);
    } catch (error) {
      trackerRef.current = null;
      if (showErrors) {
        setStatus(error instanceof Error ? error.message : "Microphone access was blocked.");
      } else {
        setStatus("Microphone is off. Use the microphone button if the browser did not enable it automatically.");
      }
    }
  }

  function stopMic() {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setIsListening(false);
    setPitch(null);
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
    scoreRef.current = initialScoreState;
    demoPlayerRef.current?.stop();
    demoPlayerRef.current = null;
    scoredNoteIdsRef.current = new Set();
    singleNoteIndexRef.current = 0;
    pitchSamplesRef.current = [];
    reviewJudgementsRef.current = [];
    pitchHistoryRef.current.clear();
    lastPitchSampleSecRef.current = Number.NEGATIVE_INFINITY;
    startPracticeRecording();
    playStartMsRef.current = performance.now() + preroll_seconds * 1000;
    setCurrentSec(-preroll_seconds);
    setPlaybackMode("practice");
    setIsPlaying(true);
    setStatus(
      practiceFlowMode === "single-note"
        ? `Single-note mode: play each target note to advance. Count in: ${preroll_seconds} seconds.`
        : `Playing ${parsedScore.title} at ${formatTempo(tempoScale)} speed. Count in: ${preroll_seconds} seconds.`,
    );
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

  function adjustTempo(delta: number) {
    if (playbackMode) {
      setStatus("Stop the current run before changing tempo.");
      return;
    }

    setTempoScale((previous) => clampTempo(previous + delta));
  }

  function resetTempo() {
    if (playbackMode) {
      setStatus("Stop the current run before changing tempo.");
      return;
    }

    setTempoScale(1);
  }

  function handlePracticeFlowModeChange(mode: PracticeFlowMode) {
    if (playbackMode) {
      setStatus("Stop the current run before changing practice mode.");
      return;
    }

    setPracticeFlowMode(mode);
  }

  function startDemo() {
    if (!parsedScore) {
      setStatus("Load a score before starting demo mode.");
      return;
    }

    setScore(initialScoreState);
    scoreRef.current = initialScoreState;
    scoredNoteIdsRef.current = new Set();
    demoPlayerRef.current?.stop();
    try {
      demoPlayerRef.current = startDemoPlayback(notes, preroll_seconds, 0, tempoScale);
      playStartMsRef.current = performance.now() + preroll_seconds * 1000;
      setCurrentSec(-preroll_seconds);
      setPlaybackMode("demo");
      setIsPlaying(true);
      setStatus(`Demo mode: playing ${parsedScore.title} at ${formatTempo(tempoScale)} speed.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Demo playback could not start.");
    }
  }

  function handleReview() {
    if (playbackMode === "review") {
      if (isPlaying) {
        pauseRun();
      } else {
        resumeRun();
      }
      return;
    }

    startReview();
  }

  function startReview() {
    if (!reviewRun) {
      setStatus("Finish a practice run to unlock review mode.");
      return;
    }

    if (isReviewAudioPreparing) {
      setStatus("Review audio is still being prepared. Try again in a moment.");
      return;
    }

    demoPlayerRef.current?.stop();
    demoPlayerRef.current = null;
    reviewAudioRef.current?.pause();
    reviewAudioRef.current = null;
    playStartMsRef.current = performance.now();
    setCurrentSec(0);
    setPlaybackMode("review");
    setIsPlaying(true);

    if (reviewRun.audioUrl) {
      const audio = new Audio(reviewRun.audioUrl);
      audio.currentTime = preroll_seconds;
      audio.volume = 1;
      reviewAudioRef.current = audio;
      audio.play().catch(() => setStatus("Review visual replay started, but audio playback was blocked."));
    } else {
      setStatus("Review visual replay started, but no recorded microphone audio is available.");
    }

    if (reviewRun.audioUrl) {
      setStatus(`Reviewing ${reviewRun.title} with recorded audio.`);
    }
  }

  function stopRun() {
    demoPlayerRef.current?.stop();
    demoPlayerRef.current = null;
    reviewAudioRef.current?.pause();
    reviewAudioRef.current = null;
    stopPracticeRecording(false);
    setIsPlaying(false);
    setPlaybackMode(null);
    setCurrentSec(-preroll_seconds);
  }

  function pauseRun() {
    demoPlayerRef.current?.stop();
    demoPlayerRef.current = null;
    reviewAudioRef.current?.pause();
    if (playbackMode === "practice" && mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
    }
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
        demoPlayerRef.current = startDemoPlayback(notes, delaySec, offsetSec, tempoScale);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Demo playback could not resume.");
        return;
      }
    }

    if (playbackMode === "practice" && mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
    }

    if (playbackMode === "review" && reviewRun?.audioUrl) {
      const audio = reviewAudioRef.current ?? new Audio(reviewRun.audioUrl);
      audio.currentTime = realTimeFromScoreTime(Math.max(0, currentSec), reviewRun.tempoScale) + preroll_seconds;
      audio.volume = 1;
      reviewAudioRef.current = audio;
      audio.play().catch(() => setStatus("Review visual replay resumed, but audio playback was blocked."));
    }

    const activeTempoScale = playbackMode === "review" ? (reviewRun?.tempoScale ?? tempoScale) : tempoScale;
    playStartMsRef.current = performance.now() - realTimeFromScoreTime(currentSec, activeTempoScale) * 1000;
    setIsPlaying(true);
    setStatus(`Resumed ${playbackMode === "review" ? "review" : parsedScore.title}.`);
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

      const judgement =
        judgeMode === "expert"
          ? judgeNoteWindow(note, elapsedSec, pitchHistoryRef.current.between(note.startSec - 0.2, elapsedSec))
          : judgeNote(note, elapsedSec, pitchSnapshot);
      if (judgement) {
        scoredNoteIdsRef.current.add(note.id);
        reviewJudgementsRef.current.push({ ...judgement, judgedAtSec: elapsedSec });
        judgements.push(judgement);
      }
    }

    if (judgements.length > 0) {
      const nextScore = judgements.reduce(applyJudgement, scoreRef.current);
      scoreRef.current = nextScore;
      setScore(nextScore);
    }
  }

  function tickSingleNotePractice(elapsedRealSec: number) {
    if (elapsedRealSec < 0) {
      setCurrentSec(elapsedRealSec);
      return;
    }

    const targetNote = notesRef.current[singleNoteIndexRef.current];
    if (!targetNote) {
      setCurrentSec(totalDurationSec);
      setIsPlaying(false);
      setPlaybackMode(null);
      finishPracticeRun();
      return;
    }

    setCurrentSec(targetNote.startSec);
    pitchHistoryRef.current.add(pitchRef.current, elapsedRealSec);

    const judgement =
      judgeMode === "expert"
        ? judgeSingleNoteWindow(targetNote, pitchHistoryRef.current.recent(0.35, elapsedRealSec))
        : judgeSingleNote(targetNote, pitchRef.current);
    if (!judgement) {
      return;
    }

    scoredNoteIdsRef.current.add(targetNote.id);
    reviewJudgementsRef.current.push({ ...judgement, judgedAtSec: targetNote.startSec });
    const nextScore = applyJudgement(scoreRef.current, judgement);
    scoreRef.current = nextScore;
    setScore(nextScore);

    singleNoteIndexRef.current += 1;
    const nextNote = notesRef.current[singleNoteIndexRef.current];
    if (nextNote) {
      setCurrentSec(nextNote.startSec);
      setStatus(`Good. Next note: ${midiToNoteName(nextNote.pitchMidi)}.`);
      return;
    }

    setCurrentSec(totalDurationSec);
    setIsPlaying(false);
    setPlaybackMode(null);
    finishPracticeRun();
  }

  function recordPitchSample(elapsedSec: number) {
    if (elapsedSec < 0 || elapsedSec > totalDurationSec + 0.5) {
      return;
    }

    if (elapsedSec - lastPitchSampleSecRef.current < 0.04) {
      return;
    }

    const pitchSnapshot = pitchRef.current;
    lastPitchSampleSecRef.current = elapsedSec;
    pitchSamplesRef.current.push(
      pitchSnapshot
        ? {
            timeSec: elapsedSec,
            midi: pitchSnapshot.midi,
            noteName: pitchSnapshot.noteName,
            frequency: pitchSnapshot.frequency,
            clarity: pitchSnapshot.clarity,
          }
        : {
            timeSec: elapsedSec,
            midi: null,
          },
    );
  }

  function startPracticeRecording() {
    recordingChunksRef.current = [];
    saveRecordingRef.current = false;

    const stream = trackerRef.current?.getStream();
    if (!stream || typeof MediaRecorder === "undefined") {
      return;
    }

    try {
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const chunks = recordingChunksRef.current;
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        if (!saveRecordingRef.current || chunks.length === 0) {
          setIsReviewAudioPreparing(false);
          if (saveRecordingRef.current) {
            setStatus("Run complete. Review is ready, but no microphone audio was captured.");
          }
          return;
        }

        const audioUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        reviewAudioUrlRef.current = audioUrl;
        setReviewRun((previous) => {
          if (!previous) {
            URL.revokeObjectURL(audioUrl);
            reviewAudioUrlRef.current = null;
            return previous;
          }

          if (previous.audioUrl) {
            URL.revokeObjectURL(previous.audioUrl);
          }

          return { ...previous, audioUrl };
        });
        setIsReviewAudioPreparing(false);
        setStatus("Run complete. Review mode is ready with recorded audio.");
      };
      recorder.start();
    } catch {
      mediaRecorderRef.current = null;
    }
  }

  function stopPracticeRecording(saveReview: boolean) {
    saveRecordingRef.current = saveReview;
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      if (saveReview) {
        setIsReviewAudioPreparing(false);
      }
      return;
    }

    if (recorder.state === "recording" || recorder.state === "paused") {
      if (saveReview) {
        setIsReviewAudioPreparing(true);
      }
      recorder.stop();
      return;
    }

    mediaRecorderRef.current = null;
  }

  function finishPracticeRun() {
    const finalRun: ReviewRun = {
      id: Date.now(),
      title: parsedScore?.title ?? "Practice run",
      durationSec: totalDurationSec,
      tempoScale,
      score: scoreRef.current,
      pitchSamples: [...pitchSamplesRef.current],
      judgements: [...reviewJudgementsRef.current],
    };

    replaceReviewRun(finalRun);
    stopPracticeRecording(true);
    setStatus(mediaRecorderRef.current ? "Run complete. Preparing review audio..." : "Run complete. Review mode is ready.");
  }

  function clearReviewRun() {
    replaceReviewRun(null);
    reviewAudioRef.current?.pause();
    reviewAudioRef.current = null;
  }

  function replaceReviewRun(nextReviewRun: ReviewRun | null) {
    setReviewRun((previous) => {
      if (previous?.audioUrl) {
        URL.revokeObjectURL(previous.audioUrl);
        if (reviewAudioUrlRef.current === previous.audioUrl) {
          reviewAudioUrlRef.current = null;
        }
      }

      return nextReviewRun;
    });
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
            onViewUploaded={handleViewUploadedSong}
            onDeleteUploaded={handleDeleteUploadedSong}
          />
        </div>
      ) : null}

      <ScorePreview
        title={parsedScore?.title}
        sourceBlob={parsedScore?.sourceBlob}
        notes={notes}
        currentNote={currentNote}
        currentNoteIndex={currentNoteIndex}
      />

      <div className="play-layout">
        <section className="panel game-panel">
          <div className="game-heading">
            <h2>{parsedScore?.title ?? "Load a score to begin"}</h2>
            <div className="note-count">{notes.length ? `${notes.length} notes` : "No notes"}</div>
          </div>
          <NoteHighway
            notes={notes}
            currentSec={currentSec}
            activePitchMidi={activePitchMidi}
            pitchTrail={activePitchTrail}
            lastJudgement={activeJudgement}
          />
          {parsedScore?.warnings.map((warning) => (
            <p className="warning" key={warning}>
              {warning}
            </p>
          ))}
        </section>

        <div className="play-controls">
          <GameHud
            score={hudScore}
            pitch={pitch}
            pitchLabel={pitchLabel}
            isListening={isListening}
            isPlaying={isPlaying}
            isDemoPlaying={playbackMode === "demo"}
            playbackMode={playbackMode}
            judgeMode={judgeMode}
            onJudgeModeChange={setJudgeMode}
            onShowJudgeHelp={() => setIsJudgeHelpOpen(true)}
            onShowPracticeHelp={() => setIsPracticeHelpOpen(true)}
            tempoScale={tempoScale}
            onTempoSlower={() => adjustTempo(-tempo_step)}
            onTempoFaster={() => adjustTempo(tempo_step)}
            onTempoReset={resetTempo}
            canChangeTempo={!playbackMode}
            practiceFlowMode={practiceFlowMode}
            onPracticeFlowModeChange={handlePracticeFlowModeChange}
            canChangePracticeFlow={!playbackMode}
            onToggleMic={toggleMic}
            onPractice={handlePractice}
            onDemo={handleDemo}
            onReview={handleReview}
            onStop={stopRun}
            canPlay={notes.length > 0 && isListening}
            canDemo={notes.length > 0}
            canReview={reviewRun !== null && !isReviewAudioPreparing}
            hasReviewAudio={Boolean(reviewRun?.audioUrl)}
          />
        </div>
      </div>

      {viewingSong ? (
        <ScoreViewerModal
          song={viewingSong}
          onClose={() => setViewingSong(null)}
          onRename={handleRenameUploadedSong}
        />
      ) : null}

      {isJudgeHelpOpen ? <JudgeHelpModal onClose={() => setIsJudgeHelpOpen(false)} /> : null}
      {isPracticeHelpOpen ? <PracticeHelpModal onClose={() => setIsPracticeHelpOpen(false)} /> : null}

    </main>
  );
}

function JudgeHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="viewer-backdrop" role="dialog" aria-modal="true" aria-label="Judge mode explanation">
      <section className="panel judge-help-modal">
        <div className="viewer-header">
          <div className="viewer-title-block">
            <h2>Judge Modes</h2>
            <span>How Violin Hero scores your playing</span>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="judge-help-content">
          <section>
            <h3>Simple Judge</h3>
            <p>
              Simple judge is the original scoring algorithm. When a note reaches the hit line, it compares the
              current microphone pitch snapshot against the target note.
            </p>
            <p>
              A perfect hit must be within 80 ms and 25 cents. A good hit must be within 180 ms and 55 cents. If no
              matching pitch is found after the miss window, the note is marked missed.
            </p>
          </section>

          <section>
            <h3>Expert Judge</h3>
            <p>
              Expert judge records a rolling pitch history during the run. Each note is judged from a short window
              around the expected start time instead of one instant.
            </p>
            <p>
              It filters low-clarity frames, computes the median cents error in the note window, and adapts tolerance
              by note duration. Fast notes get wider pitch windows with fewer required frames. Long notes require more
              stable frames. This makes vibrato, short runs, and expressive timing less brittle.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

function PracticeHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="viewer-backdrop" role="dialog" aria-modal="true" aria-label="Practice mode explanation">
      <section className="panel judge-help-modal">
        <div className="viewer-header">
          <div className="viewer-title-block">
            <h2>Practice Modes</h2>
            <span>How the note highway advances</span>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="judge-help-content">
          <section>
            <h3>Continuous Mode</h3>
            <p>
              Continuous mode works like a rhythm game. The song clock keeps moving at the selected tempo, notes travel
              toward the hit line, and your timing plus pitch are judged as the music passes.
            </p>
            <p>
              Use Continuous mode when you want to practice performance flow, rhythm, tempo control, and full-run
              scoring.
            </p>
          </section>

          <section>
            <h3>Single Note Mode</h3>
            <p>
              Single note mode pauses the score on one target note at a time. The note highway waits until you play the
              correct pitch, scores that note, then advances to the next target note.
            </p>
            <p>
              Timing misses are not applied in this mode. It is meant for slow pitch learning, intonation practice, and
              getting familiar with difficult passages before trying them in time.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

function describeRange(notes: ScoreNote[]): string {
  const pitches = notes.map((note) => note.pitchMidi);
  return `${midiToNoteName(Math.min(...pitches))} to ${midiToNoteName(Math.max(...pitches))}`;
}

function shouldUseDetectedTitle(savedTitle: string, detectedTitle: string, originalFileName: string): boolean {
  if (!detectedTitle || detectedTitle === "Uploaded violin score" || detectedTitle === savedTitle) {
    return false;
  }

  const normalizedSavedTitle = normalizeTitleForComparison(savedTitle);
  return (
    normalizedSavedTitle === "uploaded violin score" ||
    normalizedSavedTitle === normalizeTitleForComparison(fileStem(originalFileName))
  );
}

function scoreTimeFromRealTime(realSec: number, tempoScale: number): number {
  return realSec < 0 ? realSec : realSec * tempoScale;
}

function realTimeFromScoreTime(scoreSec: number, tempoScale: number): number {
  return scoreSec < 0 ? scoreSec : scoreSec / tempoScale;
}

function formatTempo(tempoScale: number): string {
  return `${Math.round(tempoScale * 100)}%`;
}

function clampTempo(tempoScale: number): number {
  return Math.min(max_tempo_scale, Math.max(min_tempo_scale, Math.round(tempoScale * 10) / 10));
}

function shouldRefreshSavedScanHints(song: UploadedSong): boolean {
  return Boolean(
    song.originalBlob &&
      isScanFile(song.originalFileName) &&
      !song.omrHintsRefreshedAt &&
      (!song.omrHints || Object.keys(song.omrHints).length === 0),
  );
}

function isScanFile(fileName: string): boolean {
  return /\.(pdf|png|jpe?g|webp)$/i.test(fileName);
}

function fileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function normalizeTitleForComparison(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}
