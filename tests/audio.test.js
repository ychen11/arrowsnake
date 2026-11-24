import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameAudio } from '../src/audio.js';

function makeAudioHarness() {
  const calls = [];
  const parameter = () => ({ value: 0, setValueAtTime(...args) { calls.push(['set', ...args]); },
    exponentialRampToValueAtTime(...args) { calls.push(['exponential', ...args]); },
    linearRampToValueAtTime(...args) { calls.push(['linear', ...args]); },
    cancelScheduledValues() {}, setTargetAtTime() {} });
  const node = (type) => ({ type, gain: parameter(), frequency: parameter(), Q: parameter(), connect() { return this; },
    start() { calls.push(['start', type]); }, stop() { calls.push(['stop', type]); }, disconnect() {} });
  class AudioContextMock {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
    createGain() { return node('gain'); }
    createBuffer() { return { getChannelData: () => new Float32Array(16000) }; }
    createBufferSource() { return node('buffer'); }
    createBiquadFilter() { return node('filter'); }
    createOscillator() { const oscillator = node('oscillator'); calls.push(['oscillator']); return oscillator; }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  globalThis.window = { AudioContext: AudioContextMock, setTimeout: (fn) => fn() };
  return calls;
}

test('flight sound starts and stops locally after first gesture unlock', () => {
  const calls = makeAudioHarness();
  const audio = createGameAudio();
  audio.setFlight(true);
  assert.equal(calls.some(([name]) => name === 'start'), false);
  audio.unlock();
  audio.setFlight(true);
  assert.equal(calls.filter(([name]) => name === 'start').length, 2);
  audio.setFlight(false);
  assert.equal(calls.filter(([name]) => name === 'stop').length, 2);
});

test('collision makes two short low notes', () => {
  const calls = makeAudioHarness();
  const audio = createGameAudio();
  audio.unlock();
  audio.hit();
  assert.equal(calls.filter(([name]) => name === 'oscillator').length, 4);
});

test('victory plays a short resolving melody', () => {
  const calls = makeAudioHarness();
  const audio = createGameAudio();
  audio.unlock();
  audio.victory();
  assert.equal(calls.filter(([name]) => name === 'oscillator').length, 20);
});
