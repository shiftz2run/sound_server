class WebAudioOscillator {
  constructor(context) {
    this.context = context;
    this.oscillator = null;
    this.gainNode = null;
    this.isStarted = false;

    // Parameters
    this.frequency = 440;
    this.targetFrequency = 440;
    this.amplitude = 0.5;
    this.targetAmplitude = 0.5;
    this.currentWaveform = "sine";
    this.customWaveformData = null;

    // Smoothing
    this.frequencySmoothing = 0;
    this.amplitudeSmoothing = 0;

    // Envelope (stored internally in seconds for Web Audio API)
    this.attackTime = 0.1; // 100ms default
    this.decayTime = 0.1; // 100ms default
    this.sustainLevel = 0.5;
    this.adsOn = false;

    this.availableWaveforms = [
      "sine",
      "square",
      "sawtooth",
      "triangle",
      "custom",
    ];

    this.animationId = null;
  }

  start() {
    if (this.context.state === "suspended") {
      this.context.resume();
    }

    this.stop(); // Stop any existing oscillator

    this.oscillator = this.createOscillatorWithWaveform();
    this.gainNode = this.context.createGain();
    this.gainNode.gain.setValueAtTime(0, this.context.currentTime);

    this.oscillator.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);

    this.applyADS();
    this.oscillator.start();
    this.isStarted = true;
    this.animate();
  }

  stop() {
    if (this.oscillator) {
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.isStarted = false;
  }

  createOscillatorWithWaveform() {
    const osc = this.context.createOscillator();

    if (this.currentWaveform === "custom" && this.customWaveformData) {
      try {
        const real = new Float32Array(this.customWaveformData.length);
        const imag = new Float32Array(this.customWaveformData);

        for (let i = 0; i < this.customWaveformData.length; i++) {
          real[i] = 0;
          imag[i] = this.customWaveformData[i];
        }

        const periodicWave = this.context.createPeriodicWave(real, imag);
        osc.setPeriodicWave(periodicWave);
      } catch (error) {
        console.warn(
          "Failed to create custom waveform, falling back to sine:",
          error,
        );
        osc.type = "sine";
      }
    } else if (this.availableWaveforms.includes(this.currentWaveform)) {
      osc.type = this.currentWaveform;
    } else {
      console.warn(
        `Unknown waveform type: ${this.currentWaveform}, defaulting to sine`,
      );
      osc.type = "sine";
    }

    osc.frequency.value = this.frequency;
    return osc;
  }

  updateWaveform() {
    if (!this.isStarted || !this.context) return;

    const currentTime = this.context.currentTime;
    const currentFreq = this.frequency;

    this.oscillator.stop(currentTime + 0.1);
    this.oscillator.disconnect();

    this.oscillator = this.createOscillatorWithWaveform();
    this.oscillator.frequency.value = currentFreq;
    this.oscillator.connect(this.gainNode);
    this.oscillator.start(currentTime + 0.1);
  }

  applyADS() {
    if (!this.gainNode || !this.context) return;

    const now = this.context.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);

    if (!this.adsOn) {
      this.gainNode.gain.setValueAtTime(this.amplitude, now);
      return;
    }

    // Apply ADS envelope using times in seconds (already converted from ms in setters)
    // Attack: ramp from 0 to full amplitude
    this.gainNode.gain.setValueAtTime(0, now);
    this.gainNode.gain.linearRampToValueAtTime(
      this.amplitude,
      now + this.attackTime,
    );
    // Decay: exponentially approach sustain level
    this.gainNode.gain.setTargetAtTime(
      this.sustainLevel * this.amplitude,
      now + this.attackTime,
      this.decayTime,
    );
  }

  smoothValue(current, target, smoothing) {
    if (smoothing === 0) return target;
    return current + (target - current) * (1 - smoothing);
  }

  animate() {
    if (!this.isStarted) return;

    let freqChanged = false;
    let ampChanged = false;

    if (Math.abs(this.frequency - this.targetFrequency) > 0.1) {
      this.frequency = this.smoothValue(
        this.frequency,
        this.targetFrequency,
        this.frequencySmoothing,
      );
      freqChanged = true;
    }

    if (Math.abs(this.amplitude - this.targetAmplitude) > 0.001) {
      this.amplitude = this.smoothValue(
        this.amplitude,
        this.targetAmplitude,
        this.amplitudeSmoothing,
      );
      ampChanged = true;
    }

    if (freqChanged && this.oscillator) {
      this.oscillator.frequency.setValueAtTime(
        this.frequency,
        this.context.currentTime,
      );
    }

    if (ampChanged && !this.adsOn && this.gainNode) {
      this.gainNode.gain.setValueAtTime(
        this.amplitude,
        this.context.currentTime,
      );
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  // Parameter setters
  setFrequency(value) {
    this.targetFrequency = value;
  }

  setAmplitude(value) {
    this.targetAmplitude = value;
  }

  setWaveform(value) {
    this.currentWaveform = value;
    if (this.isStarted) {
      this.updateWaveform();
    }
  }

  setCustomWaveform(waveformData) {
    if (Array.isArray(waveformData)) {
      this.customWaveformData = waveformData;
      if (this.currentWaveform === "custom" && this.isStarted) {
        this.updateWaveform();
      }
    }
  }

  setAttackTime(value) {
    // Convert milliseconds to seconds for Web Audio API
    this.attackTime = value / 1000;
  }

  setDecayTime(value) {
    // Convert milliseconds to seconds for Web Audio API
    this.decayTime = value / 1000;
  }

  setSustainLevel(value) {
    this.sustainLevel = value;
  }

  setAdsOn(value) {
    this.adsOn = value;
    if (this.isStarted) {
      this.applyADS();
    }
  }

  setFrequencySmoothing(value) {
    this.frequencySmoothing = value;
  }

  setAmplitudeSmoothing(value) {
    this.amplitudeSmoothing = value;
  }

  // Utility method to update multiple parameters at once
  updateParameters(params) {
    for (const [key, value] of Object.entries(params)) {
      const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
      if (typeof this[setterName] === "function") {
        this[setterName](value);
      }
    }
  }

  triggerNote() {
    if (this.isStarted) {
      this.applyADS();
    }
  }
}
