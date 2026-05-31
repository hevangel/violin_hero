import type { ScoreState } from "../game/scoring";
import type { DetectedPitch } from "../game/pitch";

type GameHudProps = {
  score: ScoreState;
  pitch: DetectedPitch | null;
  isListening: boolean;
  isPlaying: boolean;
  isDemoPlaying: boolean;
  playbackMode: "practice" | "demo" | null;
  onToggleMic: () => void;
  onPractice: () => void;
  onDemo: () => void;
  onStop: () => void;
  canPlay: boolean;
  canDemo: boolean;
};

export function GameHud({
  score,
  pitch,
  isListening,
  isPlaying,
  isDemoPlaying,
  playbackMode,
  onToggleMic,
  onPractice,
  onDemo,
  onStop,
  canPlay,
  canDemo,
}: GameHudProps) {
  const last = score.lastJudgement;
  const isPracticeMode = playbackMode === "practice";
  const isDemoMode = playbackMode === "demo";
  const practiceLabel = isPracticeMode ? (isPlaying ? "Pause" : "Resume") : "Start run";
  const demoLabel = isDemoMode ? (isPlaying ? "Pause demo" : "Resume demo") : "Play demo";

  return (
    <section className="panel hud">
      <div>
        <h2>Play into the mic</h2>
      </div>

      <div className="stats-grid">
        <Metric label="Score" value={score.points.toLocaleString()} />
        <Metric label="Combo" value={`${score.combo}x`} />
        <Metric label="Best" value={`${score.bestCombo}x`} />
        <Metric label="Pitch" value={pitch ? `${pitch.noteName} (${Math.round(pitch.frequency)} Hz)` : "No pitch"} />
        <Metric label="Last" value={last ? last.name.toUpperCase() : "Waiting"} />
        <Metric label="Timing" value={last ? `${Math.round(last.timingErrorMs)} ms` : "-"} />
      </div>

      <div className="button-row">
        <button type="button" onClick={onToggleMic} className={isListening ? "secondary danger" : "secondary"}>
          {isListening ? "Stop microphone" : "Enable microphone"}
        </button>
        <button type="button" onClick={onPractice} disabled={(!canPlay && !isPracticeMode) || isDemoMode}>
          {practiceLabel}
        </button>
        <button type="button" onClick={onDemo} disabled={(!canDemo && !isDemoMode) || isPracticeMode} className="secondary">
          {demoLabel}
        </button>
        <button type="button" onClick={onStop} disabled={!playbackMode} className="secondary">
          Stop
        </button>
      </div>

      <p className="small">
        {isDemoPlaying
          ? "Demo mode plays the score for you and moves the note highway without scoring misses."
          : "Hits are scored near the line: perfect is within 80 ms and 25 cents, good is within 180 ms and 55 cents."}
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
