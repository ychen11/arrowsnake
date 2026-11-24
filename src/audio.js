// Effects are synthesized locally. Web Audio is resumed from the first user
// gesture to satisfy iOS Safari and Android browser autoplay policies.
export function createGameAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return { unlock: () => {}, clear: () => {}, hit: () => {}, victory: () => {}, failure: () => {}, stop: () => {} };

  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0.84;
  master.connect(context.destination);
  let unlocked = false;
  const activeClearSounds = new Set();
  let failureSound = null;
  let hitCount = 0;

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function clear() {
    if (unlocked) {
      const now = context.currentTime;
      const duration = 1;
      const noiseBuffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1180;
      filter.Q.value = 0.72;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.11);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(220, now);
      oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.94);
      const engineGain = context.createGain();
      engineGain.gain.setValueAtTime(0.0001, now);
      engineGain.gain.exponentialRampToValueAtTime(0.035, now + 0.14);
      engineGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      noise.connect(filter).connect(gain).connect(master);
      oscillator.connect(engineGain).connect(master);
      noise.start(now);
      noise.stop(now + duration + 0.03);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
      const sound = { noise, oscillator, filter, gain, engineGain };
      activeClearSounds.add(sound);
      window.setTimeout(() => {
        for (const node of [noise, oscillator, filter, gain, engineGain]) node.disconnect();
        activeClearSounds.delete(sound);
      }, duration * 1000 + 100);
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
    const now = context.currentTime + 0.015 + (hitCount++ % 2) * 0.035;
    // Clean, dry G3 double beep: a short first note and a longer second note.
    tone(196, now, 0.10, 0.55, 'sine');
    tone(196, now + 0.19, 0.30, 0.55, 'sine');
  }

  function victory() {
    if (!unlocked) return;
    const now = context.currentTime + 0.04;
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 880, 1046.5, 1318.51];
    notes.forEach((frequency, index) => {
      const start = now + index * 0.19;
      tone(frequency, start, 0.31, 0.11, 'sine');
      tone(frequency * 2, start, 0.22, 0.025, 'triangle');
    });
    for (const frequency of [523.25, 659.25, 783.99, 1046.5]) tone(frequency, now + 1.52, 0.46, 0.075, 'sine');
  }

  function failure() {
    if (!unlocked) return;
    const notes = [1318.51, 1046.5, 880, 783.99];
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.floor(rate * 1.42), rate);
    const samples = buffer.getChannelData(0);
    const envelope = (t, release) =>
      Math.min(1, t / 0.012) * Math.exp(-Math.max(0, t - release) * 18) * (1 - Math.exp(-t * 220));
    for (let i = 0; i < samples.length; i++) {
      const time = i / rate;
      let sample = 0;
      for (let n = 0; n < notes.length; n++) {
        const t = time - (0.04 + n * 0.19);
        if (t >= 0 && t < 0.31) {
          const phase = 2 * Math.PI * notes[n] * t;
          sample += envelope(t, 0.24) * (0.11 * Math.sin(phase) + 0.0382 * Math.sin(2 * phase));
        }
        const chordTime = time - 0.8;
        if (chordTime >= 0 && chordTime < 0.46) {
          sample += 0.075 * envelope(chordTime, 0.38) * Math.sin(2 * Math.PI * notes[n] * chordTime);
        }
      }
      samples[i] = sample;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    source.onended = () => {
      source.disconnect();
      if (failureSound === source) failureSound = null;
    };
    failureSound = source;
    source.start();
  }

  function stop() {
    if (failureSound) {
      failureSound.stop();
      failureSound = null;
    }
    for (const sound of activeClearSounds) {
      for (const node of [sound.noise, sound.oscillator, sound.filter, sound.gain, sound.engineGain]) node.disconnect();
    }
    activeClearSounds.clear();
  }
  return { unlock, clear, hit, victory, failure, stop };
}
