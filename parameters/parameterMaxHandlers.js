const { PARAMETER_SCHEMA } = require("./parameterRegistry");

function registerMaxHandlers(maxApi, setParametersForClients) {
  // Auto-generate all Max handlers
  Object.keys(PARAMETER_SCHEMA).forEach((param) => {
    maxApi.addHandler(`set${capitalize(param)}`, (value, clientId) => {
      return setParametersForClients(
        { [param]: value },
        clientId ? [clientId] : null,
      );
    });
  });
}

module.exports = { registerMaxHandlers };
