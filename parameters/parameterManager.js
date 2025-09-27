const { PARAMETER_SCHEMA } = require("./parameterRegistry");

function validateParameter(param, value) {
  const validation = { valid: false, error: null };
  if (!PARAMETER_SCHEMA[param]) {
    validation.error = `Invalid parameter: ${param}`;
    return validation;
  }
  const schema = PARAMETER_SCHEMA[param];
  if (typeof value !== schema.type) {
    validation.error = `Invalid type for parameter ${param}: expected ${schema.type}, got ${typeof value}`;
    return validation;
  }
  if (schema.type === "number") {
    if (schema.min !== undefined && value < schema.min) {
      validation.error = `Invalid value for parameter ${param}: must be at least ${schema.min}`;
      return validation;
    }
    if (schema.max !== undefined && value > schema.max) {
      validation.error = `Invalid value for parameter ${param}: must be at most ${schema.max}`;
      return validation;
    }
    validation.valid = true;
    return validation;
  }
  if (schema.type === "enum") {
    if (!schema.values.includes(value)) {
      validation.error = `Invalid value for parameter ${param}: must be one of ${schema.values.join(", ")}`;
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
    if (!Array.isArray(value)) {
      validation.error = `Invalid type for parameter ${param}: expected array, got ${typeof value}`;
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

module.exports = { validateParameter, getDefaultParameters };
