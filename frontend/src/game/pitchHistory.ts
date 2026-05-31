import type { DetectedPitch } from "./pitch";

export type PitchFrame = DetectedPitch & {
  sec: number;
};

export class PitchHistory {
  private frames: PitchFrame[] = [];

  add(pitch: DetectedPitch | null, currentSec: number) {
    if (!pitch || currentSec < 0) {
      return;
    }

    this.frames.push({
      ...pitch,
      sec: currentSec,
    });

    const oldestSec = currentSec - 6;
    while (this.frames.length > 0 && this.frames[0].sec < oldestSec) {
      this.frames.shift();
    }
  }

  between(startSec: number, endSec: number): PitchFrame[] {
    return this.frames.filter((frame) => frame.sec >= startSec && frame.sec <= endSec);
  }

  recent(seconds: number, currentSec: number): PitchFrame[] {
    return this.between(currentSec - seconds, currentSec);
  }

  clear() {
    this.frames = [];
  }
}
