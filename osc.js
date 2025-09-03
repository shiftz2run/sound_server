const socket = io();

let context, oscillator, gainNode;
let isStarted = false;
let adsOn = false;

// Smoothed parameters
let frequency = 0, targetFrequency = 0;
let amplitude = 0.5, targetAmplitude = 0.5;
let frequencySmoothing = 0.1, amplitudeSmoothing = 0.1;
let attackTime = 0.01, decayTime = 0.1, sustainLevel = 0.1;

const startButton = document.querySelector('#startText');

// Button click
window.addEventListener('click', () => {
    if (!isStarted) startOscillator();
    // Hide the text after click
    startButton.style.display = 'none';
});

// Initialize audio context early
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
    return true;
}

function startOscillator() {
    initAudio();
    if (context.state === 'suspended') context.resume();

    oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    gainNode = context.createGain();
    gainNode.gain.setValueAtTime(0, context.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    applyADS();

    oscillator.start();
    isStarted = true;
    animate();
}

function applyADS() {
    if (!gainNode) return;
    const now = context.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    if (!adsOn) {
        gainNode.gain.setValueAtTime(amplitude, now);
        return;
    }
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(amplitude, now + attackTime);
    gainNode.gain.setTargetAtTime(sustainLevel * amplitude, now + attackTime, decayTime);
}

function smoothValue(current, target, smoothing) {
    if (smoothing === 0) return target;
    return current + (target - current) * (1 - smoothing);
}

function animate() {
    if (!isStarted) return;

    let freqChanged = false;
    let ampChanged = false;

    if (Math.abs(frequency - targetFrequency) > 0.1) {
        frequency = smoothValue(frequency, targetFrequency, frequencySmoothing);
        freqChanged = true;
    }
    if (Math.abs(amplitude - targetAmplitude) > 0.001) {
        amplitude = smoothValue(amplitude, targetAmplitude, amplitudeSmoothing);
        ampChanged = true;
    }

    if (freqChanged && oscillator) oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    if (ampChanged && !adsOn && gainNode) gainNode.gain.setValueAtTime(amplitude, context.currentTime);

    requestAnimationFrame(animate);
}

// ==== Socket listeners ====
socket.on("setFrequency", (value) => targetFrequency = value);
socket.on("setVolume", (value) => targetAmplitude = value);
socket.on("setAttackTime", (value) => attackTime = value);
socket.on("setDecayTime", (value) => decayTime = value);
socket.on("setSustainLevel", (value) => sustainLevel = value);
socket.on("adsOn", (value) => adsOn = value);
socket.on("setFrequencySmoothing", (value) => frequencySmoothing = value);
socket.on("setAmplitudeSmoothing", (value) => amplitudeSmoothing = value);
socket.on("noteOn", () => applyADS());