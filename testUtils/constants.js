// Test constants derived from parameter schema
const { PARAMETER_SCHEMA } = require("../parameters/parameterRegistry");

const WAVEFORM_TYPES = {};
if (PARAMETER_SCHEMA.waveform && PARAMETER_SCHEMA.waveform.values) {
  PARAMETER_SCHEMA.waveform.values.forEach((type) => {
    WAVEFORM_TYPES[type] = type;
  });
}

module.exports = {
  WAVEFORM_TYPES,
};
