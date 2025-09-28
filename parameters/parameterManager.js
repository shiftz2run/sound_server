const { PARAMETER_SCHEMA } = require("./parameterRegistry");

function validateParameter(param, value) {
  const validation = { valid: false, error: null, value: value };
  if (!PARAMETER_SCHEMA[param]) {
    validation.error = `Invalid parameter: ${param}`;
    return validation;
  }
  const schema = PARAMETER_SCHEMA[param];

  // Convert string booleans to actual booleans (for Max compatibility)
  if (schema.type === "boolean" && typeof value === "string") {
    if (value.toLowerCase() === "true") {
      validation.value = true;
    } else if (value.toLowerCase() === "false") {
      validation.value = false;
    }
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

function distributeValuesToClients(valuesList, clientIds, mode = "beginning") {
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

  // Create distribution pairs (only up to the smaller of the two arrays)
  const assignments = [];
  const maxAssignments = Math.min(valuesList.length, targetClients.length);

  for (let i = 0; i < maxAssignments; i++) {
    assignments.push({
      clientId: targetClients[i],
      value: valuesList[i],
    });
  }

  return assignments;
}

module.exports = {
  validateParameter,
  getDefaultParameters,
  distributeValuesToClients,
};
