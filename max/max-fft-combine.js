/**
 * max-fft-combine.js
 *
 * Recombines separated bin numbers and magnitudes into interleaved format.
 * Companion to max-fft-peaks.js for processing peaks between split and recombine.
 *
 * Usage:
 *   [js max-fft-combine.js]
 *
 * Inlets:
 *   0: list - bin numbers [bin1, bin2, ..., binN] (triggers output)
 *   1: list - magnitudes [mag1, mag2, ..., magN]
 *
 * Outlets:
 *   0: list - [bin1, mag1, bin2, mag2, ..., binN, magN]
 *
 * Note: Both lists must be received before output. The left inlet (0) triggers output.
 */

autowatch = 1;

// Storage for received data
var bins = [];
var mags = [];

// Declare inlets and outlets
inlets = 2;
outlets = 1;

/**
 * Inlet handlers
 */
function list() {
  if (inlet == 0) {
    bins = arrayfromargs(arguments);
    // Left inlet triggers output
    outputCombined();
  } else if (inlet == 1) {
    mags = arrayfromargs(arguments);
  }
}

/**
 * Combine bins and magnitudes into interleaved format and output
 */
function outputCombined() {
  var len = Math.min(bins.length, mags.length);

  if (len === 0) {
    post("Warning: No data to combine\n");
    return;
  }

  if (bins.length !== mags.length) {
    post(
      "Warning: Bin and magnitude list lengths don't match (" +
        bins.length +
        " vs " +
        mags.length +
        ")\n",
    );
  }

  var combined = [];
  for (var i = 0; i < len; i++) {
    combined.push(bins[i]);
    combined.push(mags[i]);
  }

  outlet(0, combined);
}
