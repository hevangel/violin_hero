import type { ScoreState } from "../game/scoring";
import type { JudgeMode, PracticeFlowMode } from "../game/scoring";
import type { DetectedPitch } from "../game/pitch";

type GameHudProps = {
  score: ScoreState;
  pitch: DetectedPitch | null;
  pitchLabel?: string;
  isListening: boolean;
  isPlaying: boolean;
  isDemoPlaying: boolean;
  playbackMode: "practice" | "demo" | "review" | null;
  judgeMode: JudgeMode;
  onJudgeModeChange: (mode: JudgeMode) => void;
  onShowJudgeHelp: () => void;
  onShowPracticeHelp: () => void;
  tempoScale: number;
  onTempoSlower: () => void;
  onTempoFaster: () => void;
  onTempoReset: () => void;
  canChangeTempo: boolean;
  practiceFlowMode: PracticeFlowMode;
  onPracticeFlowModeChange: (mode: PracticeFlowMode) => void;
  canChangePracticeFlow: boolean;
  onToggleMic: () => void;
  onPractice: () => void;
  onDemo: () => void;
  onReview: () => void;
  onStop: () => void;
  canPlay: boolean;
  canDemo: boolean;
  canReview: boolean;
  hasReviewAudio: boolean;
};

export function GameHud({
  score,
  pitch,
  pitchLabel,
  isListening,
  isPlaying,
  isDemoPlaying,
  playbackMode,
  judgeMode,
  onJudgeModeChange,
  onShowJudgeHelp,
  onShowPracticeHelp,
  tempoScale,
  onTempoSlower,
  onTempoFaster,
  onTempoReset,
  canChangeTempo,
  practiceFlowMode,
  onPracticeFlowModeChange,
  canChangePracticeFlow,
  onToggleMic,
  onPractice,
  onDemo,
  onReview,
  onStop,
  canPlay,
  canDemo,
  canReview,
  hasReviewAudio,
}: GameHudProps) {
  const last = score.lastJudgement;
  const isPracticeMode = playbackMode === "practice";
  const isDemoMode = playbackMode === "demo";
  const isReviewMode = playbackMode === "review";
  const practiceLabel = isPracticeMode ? (isPlaying ? "Pause" : "Resume") : "Start run";
  const demoLabel = isDemoMode ? (isPlaying ? "Pause demo" : "Resume demo") : "Play demo";
  const reviewLabel = isReviewMode ? (isPlaying ? "Pause review" : "Resume review") : "Review last run";
  const displayedPitch = pitchLabel ?? (pitch ? `${pitch.noteName} (${Math.round(pitch.frequency)} Hz)` : "No pitch");

  return (
    <section className="panel hud">
      <div>
        <h2>Play into the mic</h2>
      </div>

      <div className="hud-stats-panel">
        <div className="stats-grid">
          <Metric label="Score" value={score.points.toLocaleString()} />
          <Metric label="Combo" value={`${score.combo}x`} />
          <Metric label="Best" value={`${score.bestCombo}x`} />
          <Metric label="Pitch" value={displayedPitch} />
          <Metric label="Last" value={last ? last.name.toUpperCase() : "Waiting"} />
          <Metric label="Timing" value={last ? `${Math.round(last.timingErrorMs)} ms` : "-"} />
        </div>
      </div>

      <div className="button-row">
        <button
          type="button"
          onClick={onPractice}
          disabled={(!canPlay && !isPracticeMode) || isDemoMode || isReviewMode}
          className="action-icon-button primary-action"
          aria-label={practiceLabel}
          title={practiceLabel}
          data-tooltip={practiceLabel}
        >
          {isPracticeMode && isPlaying ? <PauseIcon /> : isPracticeMode ? <ResumeIcon /> : <RunIcon />}
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={!playbackMode}
          className="action-icon-button"
          aria-label="Stop"
          title="Stop"
          data-tooltip="Stop"
        >
          <StopIcon />
        </button>
        <button
          type="button"
          onClick={onDemo}
          disabled={(!canDemo && !isDemoMode) || isPracticeMode || isReviewMode}
          className="action-icon-button"
          aria-label={demoLabel}
          title={demoLabel}
          data-tooltip={demoLabel}
        >
          {isDemoMode && isPlaying ? <PauseIcon /> : isDemoMode ? <ResumeIcon /> : <DemoIcon />}
        </button>
        <button
          type="button"
          onClick={onReview}
          disabled={(!canReview && !isReviewMode) || isPracticeMode || isDemoMode}
          className="action-icon-button"
          aria-label={reviewLabel}
          title={reviewLabel}
          data-tooltip={reviewLabel}
        >
          {isReviewMode && isPlaying ? <PauseIcon /> : isReviewMode ? <ResumeIcon /> : <ReviewIcon />}
        </button>
        <button
          type="button"
          onClick={onToggleMic}
          className={isListening ? "action-icon-button danger" : "action-icon-button"}
          aria-label={isListening ? "Stop microphone" : "Enable microphone"}
          title={isListening ? "Stop microphone" : "Enable microphone"}
          data-tooltip={isListening ? "Stop microphone" : "Enable microphone"}
        >
          {isListening ? <MicOffIcon /> : <MicIcon />}
        </button>
      </div>

      <div className="judge-mode-row">
        <span>Judge</span>
        <button
          type="button"
          className={judgeMode === "simple" ? "mode-icon-button active" : "mode-icon-button"}
          onClick={() => onJudgeModeChange("simple")}
          disabled={isPracticeMode}
          aria-label="Simple judge"
          title="Simple judge"
          data-tooltip="Simple judge"
        >
          <SimpleJudgeIcon />
        </button>
        <button
          type="button"
          className={judgeMode === "expert" ? "mode-icon-button active" : "mode-icon-button"}
          onClick={() => onJudgeModeChange("expert")}
          disabled={isPracticeMode}
          aria-label="Expert judge"
          title="Expert judge"
          data-tooltip="Expert judge"
        >
          <ExpertJudgeIcon />
        </button>
        <button type="button" className="help-button" onClick={onShowJudgeHelp} aria-label="Explain judge modes">
          ?
        </button>
      </div>

      <div className="practice-flow-row">
        <span>Practice</span>
        <button
          type="button"
          className={practiceFlowMode === "continuous" ? "mode-icon-button active" : "mode-icon-button"}
          onClick={() => onPracticeFlowModeChange("continuous")}
          disabled={!canChangePracticeFlow}
          aria-label="Continuous practice mode"
          title="Continuous practice mode"
          data-tooltip="Continuous mode"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7.5 7H14a4 4 0 0 1 3.5 5.94l1.46 1.46A6 6 0 0 0 14 5H7.5V2.5L3 6l4.5 3.5V7Z" />
            <path d="M16.5 17H10a4 4 0 0 1-3.5-5.94L5.04 9.6A6 6 0 0 0 10 19h6.5v2.5L21 18l-4.5-3.5V17Z" />
          </svg>
        </button>
        <button
          type="button"
          className={practiceFlowMode === "single-note" ? "mode-icon-button active" : "mode-icon-button"}
          onClick={() => onPracticeFlowModeChange("single-note")}
          disabled={!canChangePracticeFlow}
          aria-label="Single note practice mode"
          title="Single note practice mode"
          data-tooltip="Single note mode"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 6v9.2A3.2 3.2 0 1 0 9 18V9h4V6H7Zm-2 12a1.2 1.2 0 1 1 2.4 0A1.2 1.2 0 0 1 5 18Z" />
            <path d="M15 13h3.7l-1.35-1.35L18.7 10.3 22.05 14l-3.35 3.7-1.35-1.35L18.7 15H15v-2Z" />
          </svg>
        </button>
        <button type="button" className="help-button" onClick={onShowPracticeHelp} aria-label="Explain practice modes">
          ?
        </button>
      </div>

      <div className="tempo-row">
        <span>Tempo</span>
        <button
          type="button"
          className="tempo-icon-button"
          onClick={onTempoSlower}
          disabled={!canChangeTempo || tempoScale <= 0.5}
          aria-label="Slow tempo"
          title="Slow tempo"
          data-tooltip="Slow tempo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M19 11H5v2h14v-2Z" />
          </svg>
        </button>
        <strong>{Math.round(tempoScale * 100)}%</strong>
        <button
          type="button"
          className="tempo-icon-button"
          onClick={onTempoFaster}
          disabled={!canChangeTempo || tempoScale >= 1.5}
          aria-label="Speed up tempo"
          title="Speed up tempo"
          data-tooltip="Speed up tempo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
          </svg>
        </button>
        <button
          type="button"
          className="tempo-icon-button"
          onClick={onTempoReset}
          disabled={!canChangeTempo || tempoScale === 1}
          aria-label="Reset tempo"
          title="Reset tempo"
          data-tooltip="Reset tempo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 5a7 7 0 1 1-6.32 4H3l4-4 4 4H7.9A5 5 0 1 0 12 7V5Z" />
          </svg>
        </button>
      </div>

      <p className="small">
        {isReviewMode
          ? `Review mode replays your pitch trail${hasReviewAudio ? " with the recorded microphone audio" : ""}.`
          : isDemoPlaying
          ? "Demo mode plays the score for you and moves the note highway without scoring misses."
          : practiceFlowMode === "single-note"
          ? "Single-note mode waits for you to play the target pitch before advancing."
          : judgeMode === "expert"
          ? "Expert judge scores each note from a short pitch-history window using median pitch error."
          : "Simple judge uses the current pitch snapshot: perfect is within 80 ms and 25 cents, good is within 180 ms and 55 cents."}
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

function SimpleJudgeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" />
      <path d="M12 7a5 5 0 0 0-5 5h2a3 3 0 0 1 3-3V7Zm0 10a5 5 0 0 0 5-5h-2a3 3 0 0 1-3 3v2Z" />
      <path d="M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
    </svg>
  );
}

function ExpertJudgeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm0 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm0 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
      <path d="M9 6h5v2H9V6Zm0 5h5v2H9v-2Zm0 5h5v2H9v-2Z" />
      <path d="M15 12a4 4 0 1 1 1.17 2.83l1.42-1.42A2 2 0 1 0 17 12h-2Z" />
      <path d="m16.1 16.3 1.2-1.6 1.35 1-1.65 2.2h-1.8l-1.1-1.6 1.35-.95.65.95Z" />
    </svg>
  );
}

function RunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5v14l11-7L8 5Z" />
    </svg>
  );
}

function DemoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 5v9.3A3.4 3.4 0 1 0 8 17V8h6V5H6Zm-2 12a1.4 1.4 0 1 1 2.8 0A1.4 1.4 0 0 1 4 17Z" />
      <path d="M16 10.5v7l5.5-3.5-5.5-3.5Z" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5a7 7 0 1 1-6.32 4H3l4-4 4 4H7.9A5 5 0 1 0 12 7V5Z" />
      <path d="M11 8h2v4.2l3 1.8-1 1.7-4-2.4V8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
    </svg>
  );
}

function ResumeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 5h2v14H6V5Zm5 0v14l9-7-9-7Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7h10v10H7V7Z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M5 10h2v1a5 5 0 0 0 10 0v-1h2v1a7 7 0 0 1-6 6.92V21h-2v-3.08A7 7 0 0 1 5 11v-1Z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m4.3 3 16.7 16.7-1.4 1.4-3.05-3.05A6.94 6.94 0 0 1 13 19v2h-2v-2a7 7 0 0 1-6-6.92V11h2v1.08a5 5 0 0 0 7.96 4.03l-1.47-1.47A3 3 0 0 1 9 12V10.15L2.9 4.4 4.3 3Z" />
      <path d="M15 10.67V6a3 3 0 0 0-5.73-1.24L15 10.67Zm2 .33v1c0 .52-.08 1.03-.23 1.5l1.56 1.56A6.92 6.92 0 0 0 19 12v-1h-2Z" />
    </svg>
  );
}
