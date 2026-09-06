const DEFAULT_VOLUME = 100;
const MAX_VOLUME = 200;
const STORAGE_KEY = "progress";

let audioGraph = null;

if (document.readyState === "complete") {
  initialize();
} else {
  window.addEventListener("load", initialize, { once: true });
}

function initialize() {
  console.log(
    "Audible Volume Control - Active! Slide the volume controller and hear the magic happen!"
  );
  injectVolumeSlider();
}

async function injectVolumeSlider() {
  const savedVolume = getSavedVolume();
  const [bookmarkMenu, audio] = await Promise.all([
    waitForElement("[class*='_playerMenu']"),
    waitForElement("#audible-player")
  ]);

  // Check if we already injected it to avoid duplicates.
  if (document.getElementById("audio-control-outer-div")) return;

  bookmarkMenu.insertAdjacentHTML(
    "afterend",
    `<div class="bc-row" id="audio-control-outer-div">
      <div id="volume-icon" aria-hidden="true"><svg height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg"><path fill="#343434" d="m4 6v8l5.2 3.9c.3.3.8 0 .8-.5v-14.8c0-.5-.5-.8-.8-.5zm0 8h-3a1 1 0 0 1 -1-1v-6a1 1 0 0 1 1-1h3m0 0"/><path fill="#343434" d="m16.4 17.4a1 1 0 0 1 -.7-1.7 8 8 0 0 0 0-11.4 1 1 0 0 1 1.3-1.3 10 10 0 0 1 0 14.2 1 1 0 0 1 -.7.3z"/><path fill="#343434" d="m13.5 14.5a1 1 0 0 1 -.7-.3 1 1 0 0 1 0-1.4 4 4 0 0 0 0-5.6 1 1 0 0 1 1.4-1.4 6 6 0 0 1 0 8.4 1 1 0 0 1 -.7.3z"/></svg></div>
      <div id="slider-and-progress" class="bc-range">
        <div id="audio-progress"></div>
        <div id="audio-unity-marker" title="100%"></div>
        <input id="audio-slider" type="range" min="0" max="${MAX_VOLUME}" step="1" value="${savedVolume}" aria-label="Audible volume">
      </div>
      <output id="audio-volume-value" for="audio-slider">${savedVolume}%</output>
    </div>`
  );

  const audioSlider = document.getElementById("audio-slider");
  const audioProgress = document.getElementById("audio-progress");
  const audioVolumeValue = document.getElementById("audio-volume-value");

  updateSliderUi(audioSlider, audioProgress, audioVolumeValue, savedVolume);
  const initialVolumeWasApplied = applyVolume(audio, savedVolume, false);

  if (!initialVolumeWasApplied) {
    setAndSaveVolume(audio, audioSlider, audioProgress, audioVolumeValue, DEFAULT_VOLUME, false);
  }

  audio.addEventListener("play", resumeAudioContext);
  if (!audio.paused) {
    resumeAudioContext();
  }

  audioSlider.addEventListener("input", event => {
    const requestedVolume = normalizeVolume(event.target.value);
    setAndSaveVolume(
      audio,
      audioSlider,
      audioProgress,
      audioVolumeValue,
      requestedVolume,
      true
    );
  });

  [
    "mousedown",
    "mousemove",
    "mouseup",
    "mouseenter",
    "mouseleave",
    "click",
    "focus",
    "blur",
    "keydown",
    "keyup"
  ].forEach(eventName => {
    audioSlider.addEventListener(eventName, stopPropagation, {
      capture: true,
      passive: false
    });
  });
}

function setAndSaveVolume(
  audio,
  audioSlider,
  audioProgress,
  audioVolumeValue,
  requestedVolume,
  shouldResumeAudio
) {
  const volumeWasApplied = applyVolume(audio, requestedVolume, shouldResumeAudio);
  const appliedVolume = volumeWasApplied ? requestedVolume : DEFAULT_VOLUME;

  if (!volumeWasApplied) {
    console.warn(
      "Audible Volume Control could not initialize Web Audio. Volume was reset to 100%."
    );
  }

  updateSliderUi(audioSlider, audioProgress, audioVolumeValue, appliedVolume);
  window.localStorage.setItem(STORAGE_KEY, String(appliedVolume));
}

function applyVolume(audio, volume, shouldResumeAudio) {
  const amplitude = perceptualToAmplitude(volume);

  // Native media volume is the safest path until amplification is requested.
  if (volume <= DEFAULT_VOLUME && !audioGraph) {
    audio.volume = amplitude;
    return true;
  }

  if (!audioGraph) {
    audioGraph = createAudioGraph(audio);
  }

  if (!audioGraph) {
    audio.volume = Math.min(amplitude, 1);
    return volume <= DEFAULT_VOLUME;
  }

  // Once connected to Web Audio, leave the native element at unity and control
  // every level through the gain node so moving above and below 100% is smooth.
  audio.volume = 1;
  audioGraph.gain.gain.setValueAtTime(amplitude, audioGraph.context.currentTime);

  if (shouldResumeAudio) {
    resumeAudioContext();
  }

  return true;
}

function createAudioGraph(audio) {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextConstructor) return null;

  try {
    const context = new AudioContextConstructor();
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    const limiter = context.createDynamicsCompressor();

    // Compress boosted peaks to reduce clipping; this is not a brick-wall limiter.
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;

    source.connect(gain);
    gain.connect(limiter);
    limiter.connect(context.destination);

    return { audio, context, gain, limiter, source };
  } catch (error) {
    console.error("Audible Volume Control could not create an audio graph.", error);
    return null;
  }
}

function resumeAudioContext() {
  if (!audioGraph || audioGraph.context.state !== "suspended") return;

  audioGraph.context.resume().catch(error => {
    console.warn("Audible Volume Control could not resume Web Audio.", error);
  });
}

function updateSliderUi(audioSlider, audioProgress, audioVolumeValue, volume) {
  audioSlider.value = String(volume);
  audioSlider.setAttribute("aria-valuetext", `${volume}%`);
  audioSlider.title = `Volume: ${volume}%`;
  audioProgress.style.width = `${(volume / MAX_VOLUME) * 100}%`;
  audioVolumeValue.value = `${volume}%`;
  audioVolumeValue.textContent = `${volume}%`;
}

function getSavedVolume() {
  const savedVolume = window.localStorage.getItem(STORAGE_KEY);
  return savedVolume === null ? DEFAULT_VOLUME : normalizeVolume(savedVolume);
}

function normalizeVolume(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return DEFAULT_VOLUME;

  return Math.min(MAX_VOLUME, Math.max(0, Math.round(numericValue)));
}

function waitForElement(selector) {
  return new Promise(resolve => {
    const existingElement = document.querySelector(selector);

    if (existingElement) {
      return resolve(existingElement);
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);

      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

function stopPropagation(event) {
  event.stopPropagation();
  event.stopImmediatePropagation();
}

// Adapted from https://github.com/discord/perceptual/blob/master/src/index.ts
function perceptualToAmplitude(perceptual) {
  if (perceptual === 0) {
    return 0;
  }

  let db;
  if (perceptual > DEFAULT_VOLUME) {
    db = ((perceptual - DEFAULT_VOLUME) / DEFAULT_VOLUME) * 6;
  } else {
    db = (perceptual / DEFAULT_VOLUME) * 50 - 50;
  }

  return Math.round((Math.pow(10, db / 20) + Number.EPSILON) * 1000) / 1000;
}
