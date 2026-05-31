import { useEffect, useRef } from "react";
import type { ScoreNote } from "../score/types";
import type { Judgement } from "../game/scoring";
import { clamp, midiToNoteName, violin_max_midi, violin_min_midi } from "../game/music";

type NoteHighwayProps = {
  notes: ScoreNote[];
  currentSec: number;
  activePitchMidi: number | null;
  lastJudgement?: Judgement;
};

const lead_seconds = 4;
const note_colors = ["#4cc9f0", "#4895ef", "#4361ee", "#7209b7", "#f72585", "#f77f00", "#fcbf49"];

export function NoteHighway({ notes, currentSec, activePitchMidi, lastJudgement }: NoteHighwayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.scale(scale, scale);
    draw(ctx, rect.width, rect.height, notes, currentSec, activePitchMidi, lastJudgement);
  }, [notes, currentSec, activePitchMidi, lastJudgement]);

  return <canvas ref={canvasRef} className="note-highway" aria-label="Violin Hero note highway" />;
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  notes: ScoreNote[],
  currentSec: number,
  activePitchMidi: number | null,
  lastJudgement?: Judgement,
) {
  const paddingX = 36;
  const topY = 28;
  const hitY = height - 96;
  const laneWidth = width - paddingX * 2;
  const laneCount = 8;

  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#151829");
  gradient.addColorStop(1, "#080a12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let lane = 0; lane <= laneCount; lane += 1) {
    const x = paddingX + (lane / laneCount) * laneWidth;
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x, hitY + 36);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(paddingX, hitY - 4, laneWidth, 8);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 13px Inter, system-ui, sans-serif";
  ctx.fillText("Hit line", paddingX, hitY - 14);

  for (const note of notes) {
    const timeUntilHit = note.startSec - currentSec;
    const y = hitY - (timeUntilHit / lead_seconds) * (hitY - topY);
    if (y < topY - 80 || y > height + 80) {
      continue;
    }

    const noteHeight = clamp((note.durationSec / lead_seconds) * (hitY - topY), 14, 90);
    const pitchRatio = clamp((note.pitchMidi - violin_min_midi) / (violin_max_midi - violin_min_midi), 0, 1);
    const x = paddingX + pitchRatio * laneWidth;
    const color = note_colors[Math.round(note.pitchMidi) % note_colors.length];

    ctx.fillStyle = color;
    roundRect(ctx, x - 18, y - noteHeight, 36, noteHeight, 12);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.fillText(midiToNoteName(note.pitchMidi), x - 14, y - noteHeight - 6);
  }

  if (activePitchMidi !== null) {
    const pitchRatio = clamp((activePitchMidi - violin_min_midi) / (violin_max_midi - violin_min_midi), 0, 1);
    const x = paddingX + pitchRatio * laneWidth;
    ctx.strokeStyle = "#8fffba";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, hitY, 16, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (lastJudgement) {
    ctx.fillStyle = lastJudgement.name === "miss" ? "#ff6b6b" : "#8fffba";
    ctx.font = "800 42px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(lastJudgement.name.toUpperCase(), width / 2, 78);
    ctx.textAlign = "start";
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
