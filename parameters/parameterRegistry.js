// parameterRegistry.js
const PARAMETER_SCHEMA = {
  // === OSCILLATOR PARAMETERS ===
  frequency: {
    type: "number",
    min: 0,
    max: 20000,
    default: 440,
    unit: "Hz",
    category: "oscillator",
    requiresRestart: false,
    description: "Oscillator frequency",
  },

  amplitude: {
    type: "number",
    min: 0,
    max: 1,
    default: 0.5,
    unit: "linear",
    category: "oscillator",
    requiresRestart: false,
    description: "Oscillator amplitude",
  },

  waveform: {
    type: "enum",
    values: ["sine", "square", "sawtooth", "triangle", "custom"],
    default: "sine",
    unit: null,
    category: "oscillator",
    requiresRestart: true,
    description: "Oscillator waveform type",
  },

  customWaveform: {
    type: "array",
    elementType: "number",
    default: null,
    unit: "coefficients",
    category: "oscillator",
    requiresRestart: true,
    description: "Custom waveform harmonic coefficients",
  },

  // === ENVELOPE PARAMETERS ===
  attackTime: {
    type: "number",
    min: 0,
    max: null,
    default: 0.1,
    unit: "s",
    category: "envelope",
    requiresRestart: false,
    description: "Attack time for envelope",
  },

  decayTime: {
    type: "number",
    min: 0,
    max: null,
    default: 0.1,
    unit: "s",
    category: "envelope",
    requiresRestart: false,
    description: "Decay time for envelope",
  },

  sustainLevel: {
    type: "number",
    min: 0,
    max: 1,
    default: 0.5,
    unit: "linear",
    category: "envelope",
    requiresRestart: false,
    description: "Sustain level for envelope",
  },

  adsOn: {
    type: "boolean",
    default: false,
    unit: null,
    category: "envelope",
    requiresRestart: false,
    description: "Enable/disable ADS envelope",
  },

  // === SMOOTHING PARAMETERS ===
  frequencySmoothing: {
    type: "number",
    min: 0,
    max: null,
    default: 0,
    unit: "coefficient",
    category: "smoothing",
    requiresRestart: false,
    description:
      "Frequency change smoothing factor (0=instant, 0.99=very slow)",
  },

  amplitudeSmoothing: {
    type: "number",
    min: 0,
    max: null,
    default: 0,
    unit: "coefficient",
    category: "smoothing",
    requiresRestart: false,
    description:
      "Amplitude change smoothing factor (0=instant, 0.99=very slow)",
  },
};

module.exports = {
  PARAMETER_SCHEMA,
  PARAMETER_CATEGORIES,
};
