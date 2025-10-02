/**
 * max-normalize.js
 *
 * Normalizes a list of values to a maximum of 1.0
 *
 * Usage:
 *   [js max-normalize.js]
 *
 * Inlets:
 *   0: list - values to normalize
 *
 * Outlets:
 *   0: list - normalized values (scaled so maximum = 1.0)
 */

autowatch = 1;

// Declare inlets and outlets
inlets = 1;
outlets = 1;

/**
 * Main list handler - receives values and outputs normalized version
 */
function list() {
  var values = arrayfromargs(arguments);

  if (values.length === 0) {
    return;
  }

  // Find maximum value
  var max = Math.max.apply(null, values);

  // Avoid division by zero
  if (max === 0) {
    outlet(0, values);
    return;
  }

  // Normalize to max = 1.0
  var normalized = [];
  for (var i = 0; i < values.length; i++) {
    normalized.push(values[i] / max);
  }

  outlet(0, normalized);
}
