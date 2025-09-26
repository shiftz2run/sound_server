const { PARAMETER_SCHEMA } = require("./parameterRegistry");

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function registerMaxHandlers(maxApi, setParametersForClients) {
  // Auto-generate all Max handlers
  Object.keys(PARAMETER_SCHEMA).forEach((param) => {
    maxApi.addHandler(`set${capitalize(param)}`, (value, clientIds) => {
      return setParametersForClients(
        { [param]: value },
        clientIds ? [clientIds] : null,
      );
    });
  });
}

module.exports = { registerMaxHandlers };
