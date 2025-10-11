// Get stored userId from localStorage if it exists
const storedUserId = localStorage.getItem("oscSession");
const socket = io({
  query: { userId: storedUserId || "" },
});

let context;
let oscillator;
let userId = null;

// Register setUserId listener immediately so it catches the event from server
socket.on("setUserId", (id) => {
  userId = id;
  // Store userId in localStorage for persistence across page reloads
  localStorage.setItem("oscSession", id);
  console.log("User ID set to:", userId);
});

const startButton = document.querySelector("#startButton");

// Handle button click/tap - use both events for iOS compatibility
function handleStart(event) {
  event.preventDefault(); // Prevent double-firing on iOS

  if (!oscillator || !oscillator.isStarted) {
    const started = initAudio();

    // Send active status to server
    if (started) {
      socket.emit("setActive", true);
    }
  }

  // Hide the button after activation
  if (startButton) {
    startButton.style.display = "none";
  }
}

// Attach event listeners when button is ready
if (startButton) {
  startButton.addEventListener("click", handleStart);
  startButton.addEventListener("touchend", handleStart);
}

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
