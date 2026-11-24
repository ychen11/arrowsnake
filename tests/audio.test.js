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
    createBuffer(channels, frames, rate) {
      const samples = new Float32Array(frames);
      calls.push(['buffer', samples, rate]);
      return { getChannelData: () => samples };
    }
    createBufferSource() { return node('buffer'); }
    createBiquadFilter() { return node('filter'); }
    createOscillator() { const oscillator = node('oscillator'); calls.push(['oscillator']); return oscillator; }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  globalThis.window = { AudioContext: AudioContextMock, setTimeout: (fn) => fn() };
  return calls;
}

test('each clearing arrow gets an independent one-shot takeoff sound', () => {
  const calls = makeAudioHarness();
  const audio = createGameAudio();
  audio.unlock();
  audio.clear();
  audio.clear();
  assert.equal(calls.filter(([name]) => name === 'start').length, 4);
  assert.equal(calls.filter(([name]) => name === 'stop').length, 4);
});

test('collision makes a short and long dry G3 beep', () => {
  const calls = makeAudioHarness();
  const audio = createGameAudio();
  audio.unlock();
  audio.hit();
  audio.hit();
  assert.equal(calls.filter(([name]) => name === 'oscillator').length, 4);
  assert.equal(calls.filter(([name]) => name === 'set').filter((call) => call[1] === 196).length, 4);
});

test('victory plays a short resolving melody', () => {
  const calls = makeAudioHarness();
  const audio = createGameAudio();
  audio.unlock();
  audio.victory();
  assert.equal(calls.filter(([name]) => name === 'oscillator').length, 20);
});

test('failure plays the 1.42-second preview and stops on restart', () => {
  const calls = makeAudioHarness();
  const audio = createGameAudio();
  audio.unlock();
  audio.failure();
  const [, samples, rate] = calls.find(([name]) => name === 'buffer');
  assert.equal(samples.length / rate, 1.42);
  assert.ok(samples.some(sample => sample !== 0));
  assert.deepEqual(calls.filter(([name]) => name === 'start'), [['start', 'buffer']]);
  audio.stop();
  assert.deepEqual(calls.filter(([name]) => name === 'stop'), [['stop', 'buffer']]);
});
