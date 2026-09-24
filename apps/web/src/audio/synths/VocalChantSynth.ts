/**
 * VocalChantSynth: pre-rendered Klatt-lite hype vocals.
 * Clips render once at construction (milliseconds of CPU for seconds of
 * audio), then trigger as plain buffer sources — no DSP cost at runtime,
 * no worklet, no assets.
 */

import { renderVoice, type VoiceEvent } from '../voice/klatt';
import { HYPE_WORDS, hypeWord } from '../voice/lyrics';

export type ChantKind = 'oh4' | 'aah' | 'oh' | 'ah' | 'go' | 'hey' | 'yes' | 'rave' | 'high';

function ohStab(f0: number): VoiceEvent {
  return {
    vowel: 'oh',
    f0Start: f0,
    f0End: f0 * 0.98,
    seconds: 0.22,
    gapAfter: 0.06,
    gain: 0.9,
    breath: 0.25,
    attack: 0.004,
  };
}

function ohChant(): readonly VoiceEvent[] {
  return [ohStab(110), ohStab(130.81), ohStab(164.81), { ...ohStab(220), gapAfter: 0 }];
}

function ohSingle(): readonly VoiceEvent[] {
  return [{ ...ohStab(220), gapAfter: 0 }];
}

function ahStab(): readonly VoiceEvent[] {
  return [
    {
      vowel: 'ah',
      f0Start: 165,
      f0End: 165,
      seconds: 0.25,
      gain: 0.85,
      breath: 0.25,
      attack: 0.005,
    },
  ];
}

function aahAnthem(): readonly VoiceEvent[] {
  return [
    {
      vowel: 'ah',
      f0Start: 220,
      f0End: 220,
      seconds: 1.6,
      gain: 0.8,
      breath: 0.2,
      attack: 0.03,
      vibratoHz: 5.5,
      vibratoDepth: 0.006,
    },
  ];
}

export class VocalChantSynth {
  private readonly ctx: AudioContext;
  private readonly clips = new Map<ChantKind, AudioBuffer>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.clips.set('oh4', this.renderClip(ohChant()));
    this.clips.set('aah', this.renderClip(aahAnthem()));
    this.clips.set('oh', this.renderClip(ohSingle()));
    this.clips.set('ah', this.renderClip(ahStab()));
    for (const word of HYPE_WORDS) this.clips.set(word, this.renderClip(hypeWord(word)));
  }

  public playChant(
    destination: AudioNode,
    kind: ChantKind = 'oh4',
    volume = 0.8,
    when?: number
  ): void {
    const clip = this.clips.get(kind);
    if (!clip) return;
    const t = when ?? this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = clip;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    src.connect(gain);
    gain.connect(destination);
    src.start(t);
  }

  private renderClip(events: readonly VoiceEvent[]): AudioBuffer {
    const data = renderVoice(this.ctx.sampleRate, events);
    const buffer = this.ctx.createBuffer(1, Math.max(1, data.length), this.ctx.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  }
}
