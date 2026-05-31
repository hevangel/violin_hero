import type { ScoreNote } from "../score/types";
import { midiToFrequency } from "./music";

export type DemoPlayer = {
  stop: () => void;
};

export function startDemoPlayback(notes: ScoreNote[], startDelaySec: number, offsetSec = 0): DemoPlayer {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("This browser does not support Web Audio demo playback.");
  }

  const audioContext = new AudioContextClass();
  const violinWave = createViolinWave(audioContext);
  const masterGain = audioContext.createGain();
  const bodyFilter = audioContext.createBiquadFilter();
  const brightnessFilter = audioContext.createBiquadFilter();
  const ambience = audioContext.createDelay();
  const ambienceGain = audioContext.createGain();

  masterGain.gain.value = 0.14;
  bodyFilter.type = "peaking";
  bodyFilter.frequency.value = 520;
  bodyFilter.Q.value = 0.9;
  bodyFilter.gain.value = 5;
  brightnessFilter.type = "lowpass";
  brightnessFilter.frequency.value = 5200;
  brightnessFilter.Q.value = 0.55;
  ambience.delayTime.value = 0.045;
  ambienceGain.gain.value = 0.16;

  masterGain.connect(bodyFilter);
  bodyFilter.connect(brightnessFilter);
  brightnessFilter.connect(audioContext.destination);
  brightnessFilter.connect(ambience);
  ambience.connect(ambienceGain);
  ambienceGain.connect(audioContext.destination);

  const oscillators: OscillatorNode[] = [];
  const lfos: OscillatorNode[] = [];
  const startAt = audioContext.currentTime + startDelaySec;

  for (const note of notes) {
    const durationSec = Math.max(note.durationSec, 0.08);
    const noteEndSec = note.startSec + durationSec;
    if (noteEndSec <= offsetSec) {
      continue;
    }

    const oscillator = audioContext.createOscillator();
    const subOscillator = audioContext.createOscillator();
    const vibrato = audioContext.createOscillator();
    const vibratoDepth = audioContext.createGain();
    const subGain = audioContext.createGain();
    const noteGain = audioContext.createGain();
    const relativeStartSec = Math.max(0, note.startSec - offsetSec);
    const remainingDurationSec = noteEndSec - Math.max(note.startSec, offsetSec);
    const noteStart = startAt + relativeStartSec;
    const noteEnd = noteStart + remainingDurationSec;

    const frequency = midiToFrequency(note.pitchMidi);
    oscillator.setPeriodicWave(violinWave);
    oscillator.frequency.value = frequency;
    subOscillator.type = "triangle";
    subOscillator.frequency.value = frequency;
    subGain.gain.value = 0.18;
    vibrato.type = "sine";
    vibrato.frequency.value = 5.7;
    vibratoDepth.gain.setValueAtTime(0, noteStart);
    vibratoDepth.gain.linearRampToValueAtTime(frequency * 0.006, noteStart + 0.18);
    noteGain.gain.setValueAtTime(0.0001, noteStart);
    noteGain.gain.linearRampToValueAtTime(0.55, noteStart + 0.055);
    noteGain.gain.linearRampToValueAtTime(0.46, noteStart + 0.18);
    noteGain.gain.setValueAtTime(0.42, Math.max(noteStart + 0.19, noteEnd - 0.09));
    noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(oscillator.frequency);
    oscillator.connect(noteGain);
    subOscillator.connect(subGain);
    subGain.connect(noteGain);
    noteGain.connect(masterGain);
    oscillator.start(noteStart);
    subOscillator.start(noteStart);
    vibrato.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
    subOscillator.stop(noteEnd + 0.02);
    vibrato.stop(noteEnd + 0.02);
    oscillators.push(oscillator);
    oscillators.push(subOscillator);
    lfos.push(vibrato);
  }

  return {
    stop() {
      for (const oscillator of oscillators) {
        try {
          oscillator.stop();
        } catch {
          // Already stopped by its scheduled end time.
        }
      }
      for (const lfo of lfos) {
        try {
          lfo.stop();
        } catch {
          // Already stopped by its scheduled end time.
        }
      }
      audioContext.close();
    },
  };
}

function createViolinWave(audioContext: AudioContext): PeriodicWave {
  // Harmonic mix shaped to feel more like a bowed string than a pure oscillator.
  const real = new Float32Array([0, 1, 0.35, 0.55, 0.28, 0.18, 0.12, 0.08, 0.05]);
  const imag = new Float32Array(real.length);
  return audioContext.createPeriodicWave(real, imag, { disableNormalization: false });
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
