export function createNoiseBuffer(
  ctx: AudioContext,
  durationSeconds = 1.0,
  type: 'white' | 'pink' = 'pink'
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.floor(sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const output = buffer.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  } else {
    // Paul Kellet's pink noise algorithm
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  return buffer;
}

export function createDistortionCurve(amount = 20, nSamples = 256): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(nSamples);
  const deg = Math.PI / 180;
  for (let i = 0; i < nSamples; i++) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export function triggerDecayingOsc(
  ctx: AudioContext,
  osc: OscillatorNode,
  destination: AudioNode,
  startTime: number,
  duration: number,
  initialVol = 0.5,
  endVol = 0.001
): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(initialVol, startTime);
  gain.gain.exponentialRampToValueAtTime(endVol, startTime + duration);

  osc.connect(gain);
  gain.connect(destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
  return gain;
}

export function triggerFilteredOsc(
  ctx: AudioContext,
  osc: OscillatorNode,
  filter: BiquadFilterNode,
  destination: AudioNode,
  startTime: number,
  duration: number,
  initialVol = 0.5,
  endVol = 0.001
): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(initialVol, startTime);
  gain.gain.exponentialRampToValueAtTime(endVol, startTime + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
  return gain;
}
