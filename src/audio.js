// Effects are synthesized locally. Web Audio is resumed from the first user
// gesture to satisfy iOS Safari and Android browser autoplay policies.
export function createGameAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return { unlock: () => {}, setFlight: () => {}, hit: () => {}, victory: () => {}, stop: () => {} };

  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0.42;
  master.connect(context.destination);
  let unlocked = false;
  let flight = null;

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function setFlight(playing) {
    if (playing && !flight && unlocked) {
      const now = context.currentTime;
      const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 740;
      filter.Q.value = 0.72;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.16);
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(104, now);
      oscillator.frequency.linearRampToValueAtTime(82, now + 0.9);
      oscillator.frequency.linearRampToValueAtTime(108, now + 1.8);
      const engineGain = context.createGain();
      engineGain.gain.setValueAtTime(0.0001, now);
      engineGain.gain.exponentialRampToValueAtTime(0.018, now + 0.2);
      noise.connect(filter).connect(gain).connect(master);
      oscillator.connect(engineGain).connect(master);
      noise.start(now);
      oscillator.start(now);
      flight = { noise, oscillator, gain, engineGain };
    } else if (!playing && flight) {
      const now = context.currentTime;
      for (const gain of [flight.gain, flight.engineGain]) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0.0001, now, 0.035);
      }
      const oldFlight = flight;
      flight = null;
      window.setTimeout(() => {
        try { oldFlight.noise.stop(); oldFlight.oscillator.stop(); } catch {}
        oldFlight.noise.disconnect();
        oldFlight.oscillator.disconnect();
      }, 220);
    }
  }

  function tone(frequency, start, duration, volume, type = 'sine', endFrequency = frequency) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  function hit() {
    if (!unlocked) return;
    const now = context.currentTime + 0.015;
    for (const [offset, frequency] of [[0, 92], [0.17, 76]]) {
      tone(frequency, now + offset, 0.115, 0.24, 'sine', frequency * 0.82);
      tone(frequency * 0.5, now + offset, 0.09, 0.11, 'triangle', frequency * 0.43);
    }
  }

  function victory() {
    if (!unlocked) return;
    setFlight(false);
    const now = context.currentTime + 0.04;
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 880, 1046.5, 1318.51];
    notes.forEach((frequency, index) => {
      const start = now + index * 0.19;
      tone(frequency, start, 0.31, 0.11, 'sine');
      tone(frequency * 2, start, 0.22, 0.025, 'triangle');
    });
    for (const frequency of [523.25, 659.25, 783.99, 1046.5]) tone(frequency, now + 1.52, 0.46, 0.075, 'sine');
  }

  function stop() { setFlight(false); }
  return { unlock, setFlight, hit, victory, stop };
}
