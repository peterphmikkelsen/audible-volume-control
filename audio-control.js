var audioContainer = document.getElementById("adbl-cloud-player-container");

audioContainer.innerHTML += '<div id="audio-control-outer-div"><div id="volume-icon"><svg height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg"><path fill="#343434" d="m4 6v8l5.2 3.9c.3.3.8 0 .8-.5v-14.8c0-.5-.5-.8-.8-.5zm0 8h-3a1 1 0 0 1 -1-1v-6a1 1 0 0 1 1-1h3m0 0"/><path fill="#343434" d="m16.4 17.4a1 1 0 0 1 -.7-1.7 8 8 0 0 0 0-11.4 1 1 0 0 1 1.3-1.3 10 10 0 0 1 0 14.2 1 1 0 0 1 -.7.3z"/><path fill="#343434" d="m13.5 14.5a1 1 0 0 1 -.7-.3 1 1 0 0 1 0-1.4 4 4 0 0 0 0-5.6 1 1 0 0 1 1.4-1.4 6 6 0 0 1 0 8.4 1 1 0 0 1 -.7.3z"/></svg></div><div class="bc-range"><div id="audio-progress"></div><input id="audio-slider" type="range" min="0" max="100" value="100"></div></div>';

var audioSlider = document.getElementById("audio-slider");
var audioProgress = document.getElementById("audio-progress");

audioSlider.oninput = (event) => {
  audioProgress.style.width = `${event.target.value}%`;
  document.getElementsByTagName("audio")[0].volume = event.target.value / 100;
}