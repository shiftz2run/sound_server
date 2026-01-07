// Get stored userId from localStorage if it exists
const storedUserId = localStorage.getItem("oscSession");
const socket = io({
  query: { userId: storedUserId || "" },
});

let context;
let oscillator;
let userId = null;
let noSleep = new NoSleep();
let isAudioStarted = false; // Track if audio was started
let hasConnectedBefore = false; // Track if this is initial connection or reconnection

// Register setUserId listener immediately so it catches the event from server
socket.on("setUserId", (id) => {
  userId = id;
  // Store userId in localStorage for persistence across page reloads
  localStorage.setItem("oscSession", id);
  console.log("User ID set to:", userId);
});

// Handle connection (both initial and reconnection)
socket.on("connect", () => {
  // Only restore state if this is a REconnection (not initial connection)
  if (hasConnectedBefore && isAudioStarted) {
    console.log("Reconnected - re-registering as active");
    socket.emit("setActive", true);
    socket.emit("getParameterSchema");
  }
  hasConnectedBefore = true; // Mark that we've connected at least once
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
      isAudioStarted = true; // Track that audio has started
    }
  }

  // Enable NoSleep to prevent screen dimming
  try {
    noSleep.enable();
    console.log("NoSleep enabled - screen will stay awake");
  } catch (err) {
    console.warn("NoSleep failed to enable:", err);
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
