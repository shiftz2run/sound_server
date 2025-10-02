/**
 * max-fft-peaks.js
 *
 * Find the N maximum magnitudes with frequencies from FFT analysis data
 * using the Quickselect algorithm for O(n) average-case performance.
 *
 * Usage:
 *   [js max-fft-peaks.js @N 10 @sorted 0 @samplerate 44100 @fftsize 0]
 *
 * Inlets:
 *   0: list - FFT magnitude data (index = bin number)
 *      int - set N parameter (number of peaks to find)
 *      message "sorted 0/1" - toggle sorting mode
 *      message "samplerate <sr>" - set sample rate in Hz
 *      message "fftsize <size>" - set FFT size (0 = auto-detect)
 *
 * Outlets:
 *   0: list - [freq1, freq2, ..., freqN] (frequencies in Hz)
 *   1: list - [mag1, mag2, ..., magN] (magnitudes only)
 *
 * Parameters:
 *   @N (int) - Number of peaks to find (default: 10)
 *   @sorted (int) - 0 = no sort (pure quickselect, unordered, fastest)
 *                   1 = sort by magnitude (descending, largest first)
 *                   2 = sort by frequency (ascending, lowest first)
 *   @samplerate (float) - Sample rate in Hz (default: 44100)
 *   @fftsize (int) - FFT size for frequency conversion (default: 0 = auto-detect as magnitudes.length * 2)
 */

autowatch = 1;

// Parameters
var N = 0;
var sorted = 0;
var samplerate = 44100;
var fftsize = 0;

// Cache for bin indices to avoid regeneration when FFT size stays constant
var cachedBins = [];
var cachedLength = 0;

// Declare inlets and outlets
inlets = 1;
outlets = 2;

/**
 * Swap elements at indices i and j in both arrays
 */
function swap(arr, indices, i, j) {
  var temp = arr[i];
  arr[i] = arr[j];
  arr[j] = temp;

  temp = indices[i];
  indices[i] = indices[j];
  indices[j] = temp;
}

/**
 * Partition array around pivot for quickselect
 * Moves larger elements to the left (for finding maximum values)
 * Returns the final position of the pivot
 */
function partition(arr, indices, left, right, pivotIndex) {
  var pivotValue = arr[pivotIndex];

  // Move pivot to end
  swap(arr, indices, pivotIndex, right);
  var storeIndex = left;

  // Move all elements LARGER than pivot to the left
  // (this finds maximum values instead of minimum)
  for (var i = left; i < right; i++) {
    if (arr[i] > pivotValue) {
      swap(arr, indices, i, storeIndex);
      storeIndex++;
    }
  }

  // Move pivot to its final position
  swap(arr, indices, storeIndex, right);
  return storeIndex;
}

/**
 * Quickselect algorithm to partition the k largest elements to the front
 * After this runs, indices 0 to k-1 contain the k largest elements (unordered)
 */
function quickselect(arr, indices, left, right, k) {
  if (left === right) {
    return left;
  }

  // Choose pivot (using middle element for better average-case performance)
  var pivotIndex = Math.floor((left + right) / 2);
  pivotIndex = partition(arr, indices, left, right, pivotIndex);

  // Check if we've found the kth position
  if (k === pivotIndex) {
    return k;
  } else if (k < pivotIndex) {
    // kth largest is in left partition
    return quickselect(arr, indices, left, pivotIndex - 1, k);
  } else {
    // kth largest is in right partition
    return quickselect(arr, indices, pivotIndex + 1, right, k);
  }
}

/**
 * Find top N peaks from FFT magnitude data
 * Mode 0: Pure quickselect (fastest, O(n), unordered results)
 * Mode 1: Quickselect + sort by magnitude (O(n) + O(N log N), descending)
 * Mode 2: Quickselect + sort by frequency (O(n) + O(N log N), ascending)
 */
function findTopNPeaks(magnitudes, numPeaks, sortResults) {
  var len = magnitudes.length;
  numPeaks = Math.min(numPeaks, len); // Don't request more than available

  if (numPeaks <= 0 || len === 0) {
    return [];
  }

  // Create working copies
  var mags = magnitudes.slice();

  // Use cached bins if FFT size hasn't changed, otherwise regenerate
  var bins;
  if (len === cachedLength) {
    bins = cachedBins.slice(); // Reuse cached bins
  } else {
    bins = [];
    for (var i = 0; i < len; i++) {
      bins[i] = i;
    }
    // Update cache
    cachedBins = bins.slice();
    cachedLength = len;
  }

  // Use quickselect to partition: top N will be in indices 0 to N-1
  if (numPeaks < len) {
    quickselect(mags, bins, 0, len - 1, numPeaks - 1);
  }

  if (sortResults === 1) {
    // Sort by magnitude (descending, largest first)
    var pairs = [];
    for (var i = 0; i < numPeaks; i++) {
      pairs.push({ bin: bins[i], mag: mags[i] });
    }
    pairs.sort(function (a, b) {
      return b.mag - a.mag;
    });

    // Update bins and mags arrays in-place with sorted results
    for (var i = 0; i < numPeaks; i++) {
      bins[i] = pairs[i].bin;
      mags[i] = pairs[i].mag;
    }
  } else if (sortResults === 2) {
    // Sort by frequency (ascending, lowest first) - sort by bin number
    var pairs = [];
    for (var i = 0; i < numPeaks; i++) {
      pairs.push({ bin: bins[i], mag: mags[i] });
    }
    pairs.sort(function (a, b) {
      return a.bin - b.bin;
    });

    // Update bins and mags arrays in-place with sorted results
    for (var i = 0; i < numPeaks; i++) {
      bins[i] = pairs[i].bin;
      mags[i] = pairs[i].mag;
    }
  }

  // Trim arrays to numPeaks length
  bins.length = numPeaks;
  mags.length = numPeaks;

  return { bins, mags };
}

/**
 * Convert bin numbers to frequencies in Hz
 */
function binsToFreqs(bins, fftLen) {
  var effectiveFftSize = fftsize > 0 ? fftsize : fftLen * 2;
  var freqs = [];
  for (var i = 0; i < bins.length; i++) {
    freqs.push((bins[i] * samplerate) / effectiveFftSize);
  }
  return freqs;
}

/**
 * Main list handler - receives FFT magnitude data
 */
function list() {
  var magnitudes = arrayfromargs(arguments);
  var peaks = findTopNPeaks(magnitudes, N, sorted);
  var freqs = binsToFreqs(peaks.bins, magnitudes.length);
  outlet(1, peaks.mags); // Output magnitudes to outlet 1 (right outlet)
  outlet(0, freqs); // Output frequencies to outlet 0 (left outlet)
}

/**
 * Integer handler - sets N parameter
 */
function msg_int(n) {
  N = Math.max(1, n);
  post("N set to " + N + "\n");
}

/**
 * Message handler for setting sorted mode
 */
function sorted(f) {
  sorted = Math.max(0, Math.min(2, Math.floor(f)));
  var modeText = ["no sort", "sort by magnitude", "sort by frequency"][sorted];
  post("sorted mode set to " + sorted + " (" + modeText + ")\n");
}

/**
 * Message handler for setting sample rate
 */
function samplerate(sr) {
  samplerate = Math.max(1, sr);
  post("samplerate set to " + samplerate + " Hz\n");
}

/**
 * Message handler for setting FFT size
 */
function fftsize(size) {
  fftsize = Math.max(0, size);
  post("fftsize set to " + (fftsize === 0 ? "auto-detect" : fftsize) + "\n");
}

/**
 * Attribute setters
 */
function setN(n) {
  N = Math.max(1, n);
}

function setSorted(s) {
  sorted = Math.max(0, Math.min(2, Math.floor(s)));
}

function setSamplerate(sr) {
  samplerate = Math.max(1, sr);
}

function setFftsize(size) {
  fftsize = Math.max(0, size);
}

/**
 * Attribute getters
 */
function getN() {
  return N;
}

function getSorted() {
  return sorted;
}

function getSamplerate() {
  return samplerate;
}

function getFftsize() {
  return fftsize;
}

// Register attributes
setN.local = 1;
setSorted.local = 1;
setSamplerate.local = 1;
setFftsize.local = 1;
