const { PARAMETER_SCHEMA } = require("./parameterRegistry");

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function registerMaxHandlers(
  maxApi,
  setParametersForClients,
  setParametersListForClients,
) {
  // Auto-generate all Max handlers
  Object.keys(PARAMETER_SCHEMA).forEach((param) => {
    maxApi.addHandler(`set${capitalize(param)}`, (value, clientIds) => {
      return setParametersForClients(
        { [param]: value },
        clientIds ? [clientIds] : null,
      );
    });

    // Auto-generate list handlers for each parameter
    maxApi.addHandler(
      `set${capitalize(param)}List`,
      (valuesList, mode = "beginning", clientIds = null) => {
        return setParametersListForClients(
          param,
          valuesList,
          mode,
          clientIds ? [clientIds] : null,
        );
      },
    );
  });

  maxApi.addHandler("setParameters", (params, clientIds) => {
    return setParametersForClients(params, clientIds ? [clientIds] : null);
  });
}

module.exports = { registerMaxHandlers };
