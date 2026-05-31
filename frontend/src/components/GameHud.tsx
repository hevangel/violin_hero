import type { ScoreState } from "../game/scoring";
import type { DetectedPitch } from "../game/pitch";

type GameHudProps = {
  score: ScoreState;
  pitch: DetectedPitch | null;
  isListening: boolean;
  isPlaying: boolean;
  onToggleMic: () => void;
  onStart: () => void;
  canPlay: boolean;
};

export function GameHud({ score, pitch, isListening, isPlaying, onToggleMic, onStart, canPlay }: GameHudProps) {
  const last = score.lastJudgement;

  return (
    <section className="panel hud">
      <div>
        <p className="eyebrow">Step 2</p>
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
        <button type="button" onClick={onStart} disabled={!canPlay || isPlaying}>
          {isPlaying ? "Playing..." : "Start run"}
        </button>
      </div>

      <p className="small">
        Hits are scored near the line: perfect is within 80 ms and 25 cents, good is within 180 ms
        and 55 cents.
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
