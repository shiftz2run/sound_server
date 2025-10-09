const { PARAMETER_SCHEMA } = require("./parameterRegistry");

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function registerMaxHandlers(
  maxApi,
  setParametersForClients,
  setParametersListForClients,
  setFFTDataForClients,
  io,
) {
  // Auto-generate all Max handlers
  Object.keys(PARAMETER_SCHEMA).forEach((param) => {
    // Single parameter handler - paramDict: { value: <single_value>, clientIds?: <optional> }
    maxApi.addHandler(`set${capitalize(param)}`, (paramDict) => {
      const { value, clientIds = null } = paramDict;
      console.log(
        `set${capitalize(param)}(value=${value}, clientIds=${clientIds})`,
      );
      return setParametersForClients(
        { [param]: value },
        clientIds ? [clientIds] : null,
      );
    });

    // List parameter handler - paramDict: { values: <array>, mode?: <optional>, clientIds?: <optional>, groups?: <optional> }
    maxApi.addHandler(`set${capitalize(param)}List`, (paramDict) => {
      const {
        values,
        mode = "beginning",
        clientIds = null,
        groups = 0,
      } = paramDict;
      console.log(
        `set${capitalize(param)}List(values=${values}, mode=${mode}, clientIds=${clientIds}, groups=${groups})`,
      );
      return setParametersListForClients(
        param,
        values,
        mode,
        clientIds ? [clientIds] : null,
        groups,
      );
    });
  });

  // Manual parameters handler - paramDict: { frequency?: <value>, amplitude?: <value>, ..., clientIds?: <optional> }
  // All parameter keys are passed directly in the dict, clientIds is extracted if present
  maxApi.addHandler("setParameters", (paramDict) => {
    const { clientIds, ...params } = paramDict;
    return setParametersForClients(params, clientIds ? [clientIds] : null);
  });

  // FFT data distribution handler - paramDict: { values: <array>, mode?: <optional>, clientIds?: <optional>, groups?: <optional> }
  maxApi.addHandler("setFFTData", (paramDict) => {
    const {
      values,
      mode = "beginning",
      clientIds = null,
      groups = 0,
    } = paramDict;
    return setFFTDataForClients(
      values,
      mode,
      clientIds ? [clientIds] : null,
      groups,
    );
  });

  // Note trigger handler - paramDict: { frequency?: <value>, amplitude?: <value>, ..., clientIds?: <optional> }
  // Optionally updates parameters before triggering the note
  maxApi.addHandler("noteOn", (paramDict = {}) => {
    const { clientIds, ...params } = paramDict;

    console.log(
      `noteOn(params=${JSON.stringify(params)}, clientIds=${clientIds || "all"})`,
    );

    // If parameters are provided, update them first
    if (Object.keys(params).length > 0) {
      setParametersForClients(params, clientIds ? [clientIds] : null);
    }

    // Send noteOn event to trigger envelope
    if (!clientIds) {
      // Emit to all clients
      io.emit("noteOn", params);
    } else {
      // Emit to specific client
      io.to(clientIds).emit("noteOn", params);
    }

    return { triggered: true, clients: clientIds || "all", params };
  });
}

module.exports = { registerMaxHandlers };
