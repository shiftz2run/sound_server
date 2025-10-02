/**
 * max-fft-combine.js
 *
 * Recombines separated frequencies and magnitudes into interleaved format.
 * Companion to max-fft-peaks.js for processing peaks between split and recombine.
 *
 * Usage:
 *   [js max-fft-combine.js]
 *
 * Inlets:
 *   0: list - frequencies [freq1, freq2, ..., freqN] (triggers output)
 *   1: list - magnitudes [mag1, mag2, ..., magN]
 *
 * Outlets:
 *   0: list - [freq1, mag1, freq2, mag2, ..., freqN, magN]
 *
 * Note: Both lists must be received before output. The left inlet (0) triggers output.
 */

autowatch = 1;

// Storage for received data
var freqs = [];
var mags = [];

// Declare inlets and outlets
inlets = 2;
outlets = 1;

/**
 * Inlet handlers
 */
function list() {
  if (inlet == 0) {
    freqs = arrayfromargs(arguments);
    // Left inlet triggers output
    outputCombined();
  } else if (inlet == 1) {
    mags = arrayfromargs(arguments);
  }
}

/**
 * Combine frequencies and magnitudes into interleaved format and output
 */
function outputCombined() {
  var len = Math.min(freqs.length, mags.length);

  if (len === 0) {
    post("Warning: No data to combine\n");
    return;
  }

  if (freqs.length !== mags.length) {
    post(
      "Warning: Frequency and magnitude list lengths don't match (" +
        freqs.length +
        " vs " +
        mags.length +
        ")\n",
    );
  }

  var combined = [];
  for (var i = 0; i < len; i++) {
    combined.push(freqs[i]);
    combined.push(mags[i]);
  }

  outlet(0, combined);
}
