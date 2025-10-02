/**
 * max-fft-peaks.js
 *
 * Find the N maximum magnitudes with bin numbers from FFT analysis data
 * using the Quickselect algorithm for O(n) average-case performance.
 *
 * Usage:
 *   [js max-fft-peaks.js @N 10 @sorted 0]
 *
 * Inlets:
 *   0: list - FFT magnitude data (index = bin number)
 *      int - set N parameter (number of peaks to find)
 *      message "sorted 0/1" - toggle sorting mode
 *
 * Outlets:
 *   0: list - [bin1, bin2, ..., binN] (bin numbers only)
 *   1: list - [mag1, mag2, ..., magN] (magnitudes only)
 *
 * Parameters:
 *   @N (int) - Number of peaks to find (default: 10)
 *   @sorted (int) - 0 = pure quickselect (fast, unordered)
 *                   1 = hybrid (quickselect + sort top N for ordered output)
 */

autowatch = 1;

// Parameters
var N = 0;
var sorted = 0;

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
 * Mode 1: Pure quickselect (fastest, O(n), unordered results)
 * Mode 2: Hybrid (quickselect + sort top N, O(n) + O(N log N), ordered results)
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

  if (sortResults) {
    // Hybrid mode: Sort the top N results by magnitude (descending)
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
  }

  // Trim arrays to numPeaks length
  bins.length = numPeaks;
  mags.length = numPeaks;

  return { bins, mags };
}

/**
 * Main list handler - receives FFT magnitude data
 */
function list() {
  var magnitudes = arrayfromargs(arguments);
  var peaks = findTopNPeaks(magnitudes, N, sorted);
  outlet(1, peaks.mags); // Output magnitudes to outlet 1 (right outlet)
  outlet(0, peaks.bins); // Output bins to outlet 0 (left outlet)
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
  sorted = f !== 0 ? 1 : 0;
  post("sorted mode set to " + sorted + "\n");
}

/**
 * Attribute setters
 */
function setN(n) {
  N = Math.max(1, n);
}

function setSorted(s) {
  sorted = s !== 0 ? 1 : 0;
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

// Register attributes
setN.local = 1;
setSorted.local = 1;
