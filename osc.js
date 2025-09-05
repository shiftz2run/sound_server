const socket = io();
let context, oscillator, gainNode;
let isStarted = false;
let adsOn = false;
let userId = null;

// Waveform variables
let currentWaveform = 'sine';
let customWaveformData = null;
let availableWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];

// Smoothed parameters
let frequency = 440, targetFrequency = 440;
let amplitude = 0.5, targetAmplitude = 0.5;
let frequencySmoothing = 0.1, amplitudeSmoothing = 0.1;
let attackTime = 0.01, decayTime = 0.1, sustainLevel = 0.5;

const startButton = document.querySelector('#startText');

// Button click
window.addEventListener('click', () => {
    if (!isStarted) startOscillator();
    // Hide the text after click
    if (startButton) startButton.style.display = 'none';
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

// Create oscillator with current waveform settings
function createOscillatorWithWaveform() {
    const osc = context.createOscillator();
    
    // Apply waveform based on current settings
    if (currentWaveform === 'custom' && customWaveformData) {
        // Create custom waveform using PeriodicWave
        try {
            const real = new Float32Array(customWaveformData.length);
            const imag = new Float32Array(customWaveformData);
            
            // Ensure arrays are properly formatted for PeriodicWave
            for (let i = 0; i < customWaveformData.length; i++) {
                real[i] = 0; // Real part (cosine components)
                imag[i] = customWaveformData[i]; // Imaginary part (sine components)
            }
            
            const periodicWave = context.createPeriodicWave(real, imag);
            osc.setPeriodicWave(periodicWave);
            console.log("Applied custom waveform");
        } catch (error) {
            console.warn("Failed to create custom waveform, falling back to sine:", error);
            osc.type = 'sine';
        }
    } else if (['sine', 'square', 'sawtooth', 'triangle'].includes(currentWaveform)) {
        osc.type = currentWaveform;
        console.log("Applied waveform:", currentWaveform);
    } else {
        console.warn(`Unknown waveform type: ${currentWaveform}, defaulting to sine`);
        osc.type = 'sine';
    }
    
    osc.frequency.value = frequency;
    return osc;
}

// Update waveform of running oscillator
function updateWaveform() {
    if (!isStarted || !context) return;
    
    // We need to recreate the oscillator to change waveform
    const wasPlaying = oscillator !== null;
    
    if (wasPlaying) {
        // Store current state
        const currentTime = context.currentTime;
        const currentFreq = frequency;
        const currentAmp = amplitude;
        
        // Stop current oscillator
        oscillator.stop(currentTime + 0.1);
        oscillator.disconnect();
        
        // Create new oscillator with new waveform
        oscillator = createOscillatorWithWaveform();
        oscillator.frequency.value = currentFreq;
        
        // Reconnect audio chain
        oscillator.connect(gainNode);
        
        // Start new oscillator
        oscillator.start(currentTime + 0.1);
        
        console.log("Waveform updated to:", currentWaveform);
    }
}

function startOscillator() {
    initAudio();
    if (context.state === 'suspended') context.resume();
    
    // Stop existing oscillator if running
    if (oscillator) {
        oscillator.stop();
        oscillator.disconnect();
    }
    
    // Create oscillator with current waveform
    oscillator = createOscillatorWithWaveform();
    
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
    if (!gainNode || !context) return;
    
    const now = context.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    
    if (!adsOn) {
        gainNode.gain.setValueAtTime(amplitude, now);
        return;
    }
    
    // ADS Envelope
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
    
    if (freqChanged && oscillator) {
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    }
    
    if (ampChanged && !adsOn && gainNode) {
        gainNode.gain.setValueAtTime(amplitude, context.currentTime);
    }
    
    requestAnimationFrame(animate);
}

// Update display function (optional - for debugging)
function updateDisplay() {
    console.log(`User: ${userId}, Freq: ${frequency.toFixed(1)}, Amp: ${amplitude.toFixed(3)}, Waveform: ${currentWaveform}`);
}

// ==== Socket listeners - Enhanced with waveform support ====

// Existing parameter listeners
socket.on("frequency", (value) => {
    targetFrequency = value;
    console.log("Frequency set to:", value);
});

socket.on("amplitude", (value) => {
    targetAmplitude = value;
    console.log("Amplitude set to:", value);
});

socket.on("attackTime", (value) => {
    attackTime = value;
    console.log("Attack time set to:", value);
});

socket.on("decayTime", (value) => {
    decayTime = value;
    console.log("Decay time set to:", value);
});

socket.on("sustainLevel", (value) => {
    sustainLevel = value;
    console.log("Sustain level set to:", value);
});

socket.on("adsOn", (value) => {
    adsOn = value;
    console.log("ADS envelope:", adsOn ? "ON" : "OFF");
    if (isStarted) applyADS();
});

socket.on("frequencySmoothing", (value) => {
    frequencySmoothing = value;
    console.log("Frequency smoothing set to:", value);
});

socket.on("amplitudeSmoothing", (value) => {
    amplitudeSmoothing = value;
    console.log("Amplitude smoothing set to:", value);
});

// NEW: Waveform listeners
socket.on("waveform", (value) => {
    currentWaveform = value;
    console.log("Waveform set to:", value);
    updateWaveform();
});

socket.on("customWaveform", (waveformData) => {
    if (Array.isArray(waveformData)) {
        customWaveformData = waveformData;
        console.log("Custom waveform data received:", waveformData.length, "samples");
        
        // If we're currently using custom waveform, update it
        if (currentWaveform === 'custom') {
            updateWaveform();
        }
    } else {
        console.warn("Invalid custom waveform data received");
    }
});

socket.on("waveformTypes", (types) => {
    if (Array.isArray(types)) {
        availableWaveforms = types;
        console.log("Available waveforms:", types);
    }
});

// Additional socket listeners for server communication
socket.on("setUserId", (id) => {
    userId = id;
    console.log("User ID set to:", userId);
});

socket.on("clientType", (type) => {
    console.log("Client type:", type);
});

socket.on("noteOn", () => {
    console.log("Note on trigger");
    if (isStarted) applyADS();
});

// Connection status
socket.on("connect", () => {
    console.log("Connected to server");
});

socket.on("disconnect", () => {
    console.log("Disconnected from server");
});

// Handle parameter updates with backwards compatibility
socket.on("setFrequency", (value) => {
    targetFrequency = value;
    console.log("Frequency set to:", value);
});

socket.on("setVolume", (value) => {
    targetAmplitude = value;
    console.log("Volume/Amplitude set to:", value);
});

socket.on("setAttackTime", (value) => {
    attackTime = value;
    console.log("Attack time set to:", value);
});

socket.on("setDecayTime", (value) => {
    decayTime = value;
    console.log("Decay time set to:", value);
});

socket.on("setSustainLevel", (value) => {
    sustainLevel = value;
    console.log("Sustain level set to:", value);
});

socket.on("setFrequencySmoothing", (value) => {
    frequencySmoothing = value;
    console.log("Frequency smoothing set to:", value);
});

socket.on("setAmplitudeSmoothing", (value) => {
    amplitudeSmoothing = value;
    console.log("Amplitude smoothing set to:", value);
});

// Optional: Send parameter changes back to server
function sendParameterToServer(param, value) {
    socket.emit("parameterChange", { param, value, userId });
}

// Utility functions for waveform management
function setWaveform(waveformType) {
    if (availableWaveforms.includes(waveformType)) {
        currentWaveform = waveformType;
        updateWaveform();
        console.log("Local waveform changed to:", waveformType);
    } else {
        console.warn("Unsupported waveform type:", waveformType);
    }
}

function createCustomWaveform(harmonics) {
    // Helper function to create custom waveform from harmonic series
    // harmonics should be an array of amplitude values for each harmonic
    if (Array.isArray(harmonics) && harmonics.length > 0) {
        customWaveformData = harmonics;
        currentWaveform = 'custom';
        updateWaveform();
        console.log("Custom waveform created with", harmonics.length, "harmonics");
    }
}

// Example preset waveforms
function createSawtoothWaveform() {
    // Create sawtooth using harmonic series: 1, 1/2, 1/3, 1/4, ...
    const harmonics = [];
    for (let i = 1; i <= 32; i++) {
        harmonics.push(1 / i);
    }
    createCustomWaveform(harmonics);
}

function createSquareWaveform() {
    // Create square wave using odd harmonics: 1, 0, 1/3, 0, 1/5, 0, ...
    const harmonics = [];
    for (let i = 1; i <= 32; i++) {
        harmonics.push(i % 2 === 1 ? 1 / i : 0);
    }
    createCustomWaveform(harmonics);
}

// Expose functions globally for debugging/manual control
window.audioControl = {
    setWaveform,
    createCustomWaveform,
    createSawtoothWaveform,
    createSquareWaveform,
    getCurrentWaveform: () => currentWaveform,
    getAvailableWaveforms: () => availableWaveforms,
    updateDisplay
};