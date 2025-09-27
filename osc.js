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

// Update display function (optional - for debugging)
function updateDisplay() {
  if (oscillator) {
    console.log(
      `User: ${userId}, Freq: ${oscillator.frequency.toFixed(1)}, Amp: ${oscillator.amplitude.toFixed(3)}, Waveform: ${oscillator.currentWaveform}`,
    );
  }
}

// Optional: Send parameter changes back to server
function sendParameterToServer(param, value) {
  socket.emit("parameterChange", { param, value, userId });
}

// Expose oscillator directly for debugging/manual control
window.audioControl = {
  updateDisplay,
  getOscillator: () => oscillator,
};
