const { PARAMETER_SCHEMA } = require("./parameterRegistry");

function validateParameter(param, value) {
  const validation = { valid: false, error: null, value: value };
  if (!PARAMETER_SCHEMA[param]) {
    validation.error = `Invalid parameter: ${param}`;
    return validation;
  }
  const schema = PARAMETER_SCHEMA[param];

  // Convert numbers to booleans (for Max compatibility: 0 → false, 1 → true)
  if (schema.type === "boolean" && typeof value === "number") {
    validation.value = Boolean(value);
  }

  if (schema.type === "enum") {
    if (!schema.values.includes(validation.value)) {
      validation.error = `Invalid value for parameter ${param}: must be one of ${schema.values.join(", ")}`;
      return validation;
    }
    validation.valid = true;
    return validation;
  }
  if (typeof validation.value !== schema.type) {
    validation.error = `Invalid type for parameter ${param}: expected ${schema.type}, got ${typeof validation.value}`;
    return validation;
  }
  if (schema.type === "number") {
    if (schema.min !== undefined && validation.value < schema.min) {
      validation.error = `Invalid value for parameter ${param}: must be at least ${schema.min}`;
      return validation;
    }
    if (schema.max !== undefined && validation.value > schema.max) {
      validation.error = `Invalid value for parameter ${param}: must be at most ${schema.max}`;
      return validation;
    }
    validation.valid = true;
    return validation;
  }
  if (schema.type === "boolean") {
    validation.valid = true;
    return validation;
  }
  if (schema.type === "array") {
    if (!Array.isArray(validation.value)) {
      validation.error = `Invalid type for parameter ${param}: expected array, got ${typeof validation.value}`;
      return validation;
    }
    validation.valid = true;
    return validation;
  }
}

function getDefaultParameters() {
  const defaultValues = {};
  for (const param in PARAMETER_SCHEMA) {
    defaultValues[param] = PARAMETER_SCHEMA[param].default;
  }
  return defaultValues;
}

function distributeValuesToClients(
  valuesList,
  clientIds,
  mode = "beginning",
  groups = 0,
  delay = 0,
) {
  if (!Array.isArray(valuesList) || valuesList.length === 0) {
    return [];
  }

  if (!Array.isArray(clientIds) || clientIds.length === 0) {
    return [];
  }

  let targetClients = [...clientIds];

  // Apply distribution mode
  switch (mode) {
    case "end":
      targetClients.reverse();
      break;
    case "random":
      // Shuffle array using Fisher-Yates algorithm
      for (let i = targetClients.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [targetClients[i], targetClients[j]] = [
          targetClients[j],
          targetClients[i],
        ];
      }
      break;
    case "beginning":
    default:
      // No change needed, already in order
      break;
  }

  const assignments = [];

  // Normalize delay to array format
  const delayArray = Array.isArray(delay) ? delay : [delay];

  // Group mode: divide clients into groups
  if (groups > 0) {
    const clientsPerGroup = Math.floor(targetClients.length / groups);
    const remainder = targetClients.length % groups;

    let clientIndex = 0;
    let cumulativeDelay = 0;
    for (let groupIndex = 0; groupIndex < groups; groupIndex++) {
      // Distribute remainder across first groups (so groups are more evenly sized)
      const groupSize = clientsPerGroup + (groupIndex < remainder ? 1 : 0);
      const value =
        valuesList[groupIndex] !== undefined
          ? valuesList[groupIndex]
          : valuesList[valuesList.length - 1];

      for (
        let i = 0;
        i < groupSize && clientIndex < targetClients.length;
        i++
      ) {
        assignments.push({
          clientId: targetClients[clientIndex],
          value: value,
          delay: cumulativeDelay,
        });
        clientIndex++;
      }

      // Add delay for next group
      cumulativeDelay += delayArray[groupIndex % delayArray.length];
    }
  } else {
    // Original behavior: 1:1 distribution
    const maxAssignments = Math.min(valuesList.length, targetClients.length);

    let cumulativeDelay = 0;
    for (let i = 0; i < maxAssignments; i++) {
      assignments.push({
        clientId: targetClients[i],
        value: valuesList[i],
        delay: cumulativeDelay,
      });
      // Add delay for next client
      cumulativeDelay += delayArray[i % delayArray.length];
    }
  }

  return assignments;
}

module.exports = {
  validateParameter,
  getDefaultParameters,
  distributeValuesToClients,
};
