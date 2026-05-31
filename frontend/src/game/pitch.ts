import { centsBetween, frequencyToMidi, midiToNoteName } from "./music";

export type DetectedPitch = {
  frequency: number;
  midi: number;
  noteName: string;
  clarity: number;
  timestampMs: number;
};

export type PitchTracker = {
  start: (onPitch: (pitch: DetectedPitch | null) => void) => Promise<void>;
  stop: () => void;
  getStream: () => MediaStream | null;
};

export function createPitchTracker(): PitchTracker {
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let stream: MediaStream | null = null;
  let animationFrame = 0;
  let smoothedMidi: number | null = null;

  return {
    async start(onPitch) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);

      const tick = () => {
        if (!analyser || !audioContext) {
          return;
        }

        analyser.getFloatTimeDomainData(buffer);
        const result = detectPitchYin(buffer, audioContext.sampleRate);
        if (result) {
          const midi = frequencyToMidi(result.frequency);
          smoothedMidi = smoothedMidi === null ? midi : smoothedMidi * 0.72 + midi * 0.28;
          onPitch({
            frequency: result.frequency,
            midi: smoothedMidi,
            noteName: midiToNoteName(smoothedMidi),
            clarity: result.clarity,
            timestampMs: performance.now(),
          });
        } else {
          onPitch(null);
        }

        animationFrame = requestAnimationFrame(tick);
      };

      tick();
    },
    stop() {
      cancelAnimationFrame(animationFrame);
      source?.disconnect();
      audioContext?.close();
      stream?.getTracks().forEach((track) => track.stop());
      audioContext = null;
      analyser = null;
      source = null;
      stream = null;
      smoothedMidi = null;
    },
    getStream() {
      return stream;
    },
  };
}

export function detectPitchYin(
  samples: Float32Array,
  sampleRate: number,
  minFrequency = 180,
  maxFrequency = 3200,
): { frequency: number; clarity: number } | null {
  const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  if (rms < 0.015) {
    return null;
  }

  const minTau = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxTau = Math.min(samples.length - 1, Math.ceil(sampleRate / minFrequency));
  const difference = new Float32Array(maxTau + 1);

  for (let tau = minTau; tau <= maxTau; tau += 1) {
    let sum = 0;
    for (let index = 0; index < samples.length - tau; index += 1) {
      const delta = samples[index] - samples[index + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  let runningSum = 0;
  let bestTau = -1;
  let bestValue = Number.POSITIVE_INFINITY;

  for (let tau = minTau; tau <= maxTau; tau += 1) {
    runningSum += difference[tau];
    const normalized = runningSum > 0 ? (difference[tau] * tau) / runningSum : 1;
    difference[tau] = normalized;

    if (normalized < 0.12) {
      bestTau = tau;
      while (bestTau + 1 <= maxTau && difference[bestTau + 1] < difference[bestTau]) {
        bestTau += 1;
      }
      break;
    }

    if (normalized < bestValue) {
      bestValue = normalized;
      bestTau = tau;
    }
  }

  if (bestTau < 0 || difference[bestTau] > 0.28) {
    return null;
  }

  const refinedTau = parabolicInterpolate(difference, bestTau);
  const frequency = sampleRate / refinedTau;
  const clarity = Math.max(0, Math.min(1, 1 - difference[bestTau]));
  return Number.isFinite(frequency) ? { frequency, clarity } : null;
}

export function pitchErrorCents(pitch: DetectedPitch, targetMidi: number): number {
  return centsBetween(pitch.midi, targetMidi);
}

function parabolicInterpolate(values: Float32Array, tau: number): number {
  const left = values[tau - 1];
  const center = values[tau];
  const right = values[tau + 1];
  const denominator = left - 2 * center + right;

  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) {
    return tau;
  }

  return tau + (left - right) / (2 * denominator);
}
