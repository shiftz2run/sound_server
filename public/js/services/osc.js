const socket = io();
let context;
let oscillator;
let userId = null;

const startButton = document.querySelector("#startText");

// Button click
window.addEventListener("click", () => {
  if (!oscillator || !oscillator.isStarted) {
    initAudio();
  }
  // Hide the text after click
  if (startButton) startButton.style.display = "none";
});

// Initialize audio context and oscillator
function initAudio() {
  if (!context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      context = new AudioContext();
    } else {
      alert("Sorry, but the Web Audio API is not supported by your browser.");
      return false;
    }
  }

  if (!oscillator) {
    oscillator = new WebAudioOscillator(context);

    // Register auto-generated parameter listeners
    registerSocketParameterListeners(socket, oscillator);
    // Register additional non-parameter listeners
    registerAdditionalSocketListeners(socket, oscillator);
  }

  oscillator.start();
  return true;
}

// Expose oscillator for debugging/manual control
window.audioControl = {
  getOscillator: () => oscillator,
};
