const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../audio-control.js"), "utf8");

function load({ saved = null, webAudio = true, failAudio = false } = {}) {
  const storage = new Map(saved === null ? [] : [["progress", saved]]);
  const contexts = [];
  const loadListeners = [];
  class AudioContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 0;
      this.destination = {};
      this.resumes = 0;
      contexts.push(this);
    }
    createMediaElementSource(audio) {
      if (failAudio) throw new Error("Media cannot be routed through Web Audio");
      this.audio = audio;
      return { connect() {} };
    }
    createGain() {
      return { connect() {}, gain: { value: 1, setValueAtTime(value) { this.value = value; } } };
    }
    createDynamicsCompressor() {
      return { connect() {}, threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} };
    }
    resume() {
      this.resumes++;
      this.state = "running";
      return Promise.resolve();
    }
  }
  const window = {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    addEventListener: (name, listener) => loadListeners.push([name, listener]),
  };
  if (webAudio) window.AudioContext = AudioContext;
  const scope = vm.createContext({ window, document: { readyState: "loading" }, console });
  vm.runInContext(source, scope);
  return { scope, contexts, storage, loadListeners, run: code => vm.runInContext(code, scope) };
}

test("existing volume curve is preserved and boosting reaches +6 dB", () => {
  const { scope } = load();
  assert.equal(scope.perceptualToAmplitude(0), 0);
  for (let volume = 1; volume <= 100; volume++) {
    const expected = Math.round((10 ** ((volume / 100 * 50 - 50) / 20) + Number.EPSILON) * 1000) / 1000;
    assert.equal(scope.perceptualToAmplitude(volume), expected);
  }
  assert.equal(scope.perceptualToAmplitude(100), 1);
  assert.equal(scope.perceptualToAmplitude(200), 1.995);
  for (let volume = 101; volume <= 200; volume++) {
    assert.ok(scope.perceptualToAmplitude(volume) >= scope.perceptualToAmplitude(volume - 1));
  }
});

test("saved settings are retained, bounded, and validated", () => {
  for (const [saved, expected] of [[null, 100], ["0", 0], ["75", 75], ["150", 150], ["900", 200], ["-2", 0], ["invalid", 100]]) {
    assert.equal(load({ saved }).scope.getSavedVolume(), expected);
  }
});

test("ordinary volume changes do not create a Web Audio context", () => {
  const { scope, contexts } = load();
  const audio = { volume: 1 };
  assert.equal(scope.applyVolume(audio, 50, true), true);
  assert.equal(audio.volume, 0.056);
  assert.equal(contexts.length, 0);
});

test("boosting reuses one graph when moving below and above 100%", () => {
  const { scope, contexts, run } = load();
  const audio = { volume: 0.5 };
  for (const volume of [150, 50, 0, 200, 100]) {
    assert.equal(scope.applyVolume(audio, volume, true), true);
    assert.equal(audio.volume, 1);
    assert.equal(run("audioGraph.gain.gain.value"), scope.perceptualToAmplitude(volume));
  }
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].audio, audio);
  assert.equal(contexts[0].resumes, 1);
});

test("unavailable or rejected Web Audio restores the displayed and saved volume", () => {
  for (const options of [{ webAudio: false }, { failAudio: true }]) {
    const { scope, storage } = load(options);
    const audio = { volume: 0.5 };
    const slider = { setAttribute() {} };
    const progress = { style: {} };
    const output = {};
    scope.setAndSaveVolume(audio, slider, progress, output, 175, true);
    assert.equal(audio.volume, 1);
    assert.equal(slider.value, "100");
    assert.equal(progress.style.width, "50%");
    assert.equal(output.textContent, "100%");
    assert.equal(storage.get("progress"), "100");
    assert.equal(scope.applyVolume(audio, 0, true), true);
    assert.equal(audio.volume, 0);
  }
});

test("readout and progress reflect the extended slider range", () => {
  const { scope } = load();
  const attributes = {};
  const slider = { setAttribute: (name, value) => { attributes[name] = value; } };
  const progress = { style: {} };
  const output = {};
  scope.updateSliderUi(slider, progress, output, 150);
  assert.equal(progress.style.width, "75%");
  assert.equal(output.value, "150%");
  assert.equal(attributes["aria-valuetext"], "150%");
});

test("injection waits for the media element and does not duplicate controls", async () => {
  const { scope } = load();
  let resolveAudio;
  const mediaReady = new Promise(resolve => { resolveAudio = resolve; });
  const elements = {};
  let insertions = 0;
  const menu = { insertAdjacentHTML(position, html) {
    insertions++;
    assert.match(html, /max="200"/);
    elements["audio-control-outer-div"] = {};
    elements["audio-slider"] = { setAttribute() {}, addEventListener() {} };
    elements["audio-progress"] = { style: {} };
    elements["audio-volume-value"] = {};
  } };
  scope.document.getElementById = id => elements[id];
  scope.waitForElement = selector => selector === "#audible-player" ? mediaReady : Promise.resolve(menu);
  const injection = scope.injectVolumeSlider();
  await Promise.resolve();
  assert.equal(insertions, 0);
  resolveAudio({ volume: 1, paused: true, addEventListener() {} });
  await injection;
  await scope.injectVolumeSlider();
  assert.equal(insertions, 1);
});
