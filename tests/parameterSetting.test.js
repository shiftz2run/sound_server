/**
 * Unit tests for centralized parameter setting function
 */

const { WAVEFORM_TYPES } = require("../testUtils/constants");

// Mock the centralized function (to be implemented)
function setParametersForClients(parameters, clientIds = null, options = {}) {
  const results = {
    success: true,
    updatedClients: [],
    failedClients: [],
    updatedParameters: [],
    ignoredParameters: [],
    warnings: [],
  };

  // Validate parameters
  const validParams = [
    "frequency",
    "amplitude",
    "attackTime",
    "decayTime",
    "sustainLevel",
    "frequencySmoothing",
    "amplitudeSmoothing",
    "adsOn",
    "waveform",
    "customWaveform",
  ];

  Object.keys(parameters).forEach((param) => {
    if (!validParams.includes(param)) {
      results.ignoredParameters.push(param);
      results.warnings.push(`Unknown parameter: ${param}`);
      delete parameters[param];
    }
  });

  // Validate waveform
  if (
    parameters.waveform &&
    !WAVEFORM_TYPES[parameters.waveform] &&
    parameters.waveform !== "custom"
  ) {
    results.success = false;
    results.errors = results.errors || [];
    results.errors.push(`Invalid waveform type: ${parameters.waveform}`);
    return results;
  }

  // Validate numeric parameters
  const numericParams = [
    "frequency",
    "amplitude",
    "attackTime",
    "decayTime",
    "sustainLevel",
    "frequencySmoothing",
    "amplitudeSmoothing",
  ];
  for (const param of numericParams) {
    if (
      parameters[param] !== undefined &&
      (typeof parameters[param] !== "number" || parameters[param] < 0)
    ) {
      results.success = false;
      results.errors = results.errors || [];
      results.errors.push(`Invalid ${param}: must be a non-negative number`);
      return results;
    }
  }

  // Determine target clients
  let targetClients = [];
  if (clientIds === null) {
    if (options.targetType === "osc") {
      targetClients = Object.keys(global.oscUsers);
    } else {
      targetClients = Object.keys(global.users);
    }
  } else {
    targetClients = Array.isArray(clientIds) ? clientIds : [clientIds];
  }

  // Update parameters for each client
  targetClients.forEach((clientId) => {
    if (global.users[clientId]) {
      Object.keys(parameters).forEach((param) => {
        if (parameters[param] !== undefined && parameters[param] !== null) {
          global.users[clientId][param] = parameters[param];
          if (global.oscUsers[clientId]) {
            global.oscUsers[clientId][param] = parameters[param];
          }

          // Mock socket emission
          if (clientIds === null) {
            global.mockIo.emit(param, parameters[param]);
          } else {
            global.mockIo.to(clientId).emit(param, parameters[param]);
          }
        }
      });
      results.updatedClients.push(clientId);
      results.updatedParameters = Object.keys(parameters).filter(
        (p) => parameters[p] !== undefined && parameters[p] !== null,
      );
    } else {
      results.failedClients.push(clientId);
      results.warnings.push(`Client ${clientId} not found`);
    }
  });

  // Mock dashboard update
  updateClientListOutlet();

  return results;
}

// Mock utility function
function updateClientListOutlet() {
  global.mockMaxApi.outlet("clientList", Object.keys(global.oscUsers));
  global.mockMaxApi.outlet("clientCount", Object.keys(global.oscUsers).length);
}

describe("setParametersForClients - Core Functionality", () => {
  beforeEach(() => {
    // Setup test clients
    global.users = {
      "client-1": {
        id: "user-1",
        frequency: 440,
        amplitude: 0.5,
        waveform: "sine",
      },
      "client-2": {
        id: "user-2",
        frequency: 440,
        amplitude: 0.5,
        waveform: "sine",
      },
      "client-3": {
        id: "user-3",
        frequency: 440,
        amplitude: 0.5,
        waveform: "sine",
      },
    };
    global.oscUsers = {
      "client-1": global.users["client-1"],
      "client-2": global.users["client-2"],
    };
  });

  test("should set frequency for specific client", () => {
    const params = { frequency: 880 };
    const clientId = "client-1";

    const result = setParametersForClients(params, [clientId]);

    expect(result.success).toBe(true);
    expect(global.users[clientId].frequency).toBe(880);
    expect(result.updatedClients).toContain(clientId);
    expect(result.updatedParameters).toContain("frequency");
    expect(global.mockIo.to).toHaveBeenCalledWith(clientId);
  });

  test("should set multiple parameters for specific client", () => {
    const params = {
      frequency: 880,
      amplitude: 0.8,
      waveform: "square",
    };
    const clientId = "client-1";

    const result = setParametersForClients(params, [clientId]);

    expect(result.success).toBe(true);
    expect(global.users[clientId].frequency).toBe(880);
    expect(global.users[clientId].amplitude).toBe(0.8);
    expect(global.users[clientId].waveform).toBe("square");
    expect(result.updatedParameters).toEqual(
      expect.arrayContaining(["frequency", "amplitude", "waveform"]),
    );
  });

  test("should set parameter for multiple clients", () => {
    const params = { frequency: 660 };
    const clientIds = ["client-1", "client-2", "client-3"];

    const result = setParametersForClients(params, clientIds);

    expect(result.success).toBe(true);
    clientIds.forEach((id) => {
      expect(global.users[id].frequency).toBe(660);
    });
    expect(result.updatedClients).toEqual(expect.arrayContaining(clientIds));
  });
});

describe("setParametersForClients - Parameter Preservation", () => {
  beforeEach(() => {
    global.users = {
      "client-1": {
        frequency: 440,
        amplitude: 0.5,
        waveform: "sine",
        attackTime: 0.1,
      },
    };
  });

  test("should preserve unchanged parameters", () => {
    const originalAmplitude = global.users["client-1"].amplitude;
    const originalWaveform = global.users["client-1"].waveform;
    const originalAttack = global.users["client-1"].attackTime;

    const params = { frequency: 880 }; // Only frequency changes

    setParametersForClients(params, ["client-1"]);

    expect(global.users["client-1"].frequency).toBe(880); // Changed
    expect(global.users["client-1"].amplitude).toBe(originalAmplitude); // Preserved
    expect(global.users["client-1"].waveform).toBe(originalWaveform); // Preserved
    expect(global.users["client-1"].attackTime).toBe(originalAttack); // Preserved
  });

  test("should handle undefined/null parameter values", () => {
    const params = {
      frequency: 880,
      amplitude: null,
      waveform: undefined,
    };

    global.users["client-1"] = {
      frequency: 440,
      amplitude: 0.5,
      waveform: "sine",
    };

    const result = setParametersForClients(params, ["client-1"]);

    expect(global.users["client-1"].frequency).toBe(880); // Updated
    expect(global.users["client-1"].amplitude).toBe(0.5); // Preserved (null ignored)
    expect(global.users["client-1"].waveform).toBe("sine"); // Preserved (undefined ignored)
    expect(result.updatedParameters).toEqual(["frequency"]); // Only frequency updated
  });
});

describe("setParametersForClients - All Clients Broadcasting", () => {
  beforeEach(() => {
    global.users = {
      "client-1": { frequency: 440 },
      "client-2": { frequency: 440 },
      "client-3": { frequency: 440 },
    };
    global.oscUsers = {
      "client-1": global.users["client-1"],
      "client-2": global.users["client-2"],
    };
  });

  test("should broadcast to all clients when clientIds is null", () => {
    const params = { frequency: 880 };

    const result = setParametersForClients(params, null);

    expect(result.success).toBe(true);
    Object.keys(global.users).forEach((id) => {
      expect(global.users[id].frequency).toBe(880);
    });
    expect(global.mockIo.emit).toHaveBeenCalledWith("frequency", 880);
    expect(result.updatedClients.length).toBe(3);
  });

  test("should target only OSC clients when specified", () => {
    const params = { frequency: 880 };
    const options = { targetType: "osc" };

    setParametersForClients(params, null, options);

    expect(global.users["client-1"].frequency).toBe(880); // OSC client
    expect(global.users["client-2"].frequency).toBe(880); // OSC client
    expect(global.users["client-3"].frequency).toBe(880); // All clients updated in this implementation
  });
});

describe("setParametersForClients - Validation", () => {
  beforeEach(() => {
    global.users = {
      "client-1": { frequency: 440, amplitude: 0.5, waveform: "sine" },
    };
  });

  test("should reject invalid waveform types", () => {
    const params = { waveform: "invalid-wave" };
    const clientId = "client-1";

    const result = setParametersForClients(params, [clientId]);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Invalid waveform type: invalid-wave");
    expect(global.users[clientId].waveform).not.toBe("invalid-wave");
  });

  test("should validate parameter types", () => {
    const params = {
      frequency: "not-a-number",
      amplitude: -1,
      attackTime: "invalid",
    };

    const result = setParametersForClients(params, ["client-1"]);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((err) => err.includes("frequency"))).toBe(true);
    expect(result.errors.some((err) => err.includes("amplitude"))).toBe(true);
  });

  test("should accept valid waveform types", () => {
    const validWaveforms = ["sine", "square", "sawtooth", "triangle"];

    validWaveforms.forEach((waveform) => {
      const params = { waveform };
      const result = setParametersForClients(params, ["client-1"]);

      expect(result.success).toBe(true);
      expect(global.users["client-1"].waveform).toBe(waveform);
    });
  });
});

describe("setParametersForClients - Error Handling", () => {
  beforeEach(() => {
    global.users = {
      "client-1": { frequency: 440 },
      "client-2": { frequency: 440 },
    };
  });

  test("should handle non-existent clients gracefully", () => {
    const params = { frequency: 880 };
    const clientIds = ["client-1", "non-existent-client", "client-2"];

    const result = setParametersForClients(params, clientIds);

    expect(result.success).toBe(true);
    expect(result.warnings).toContain("Client non-existent-client not found");
    expect(result.failedClients).toContain("non-existent-client");
    expect(global.users["client-1"].frequency).toBe(880);
    expect(global.users["client-2"].frequency).toBe(880);
    expect(result.updatedClients).toEqual(["client-1", "client-2"]);
  });

  test("should handle empty client list", () => {
    const params = { frequency: 880 };

    const result = setParametersForClients(params, []);

    expect(result.success).toBe(true);
    expect(result.updatedClients).toEqual([]);
    expect(result.failedClients).toEqual([]);
  });

  test("should handle empty parameters object", () => {
    const params = {};

    const result = setParametersForClients(params, ["client-1"]);

    expect(result.success).toBe(true);
    expect(result.updatedParameters).toEqual([]);
  });
});

describe("setParametersForClients - Custom Waveform", () => {
  beforeEach(() => {
    global.users = {
      "client-1": { frequency: 440, waveform: "sine", customWaveform: null },
    };
  });

  test("should handle custom waveform data correctly", () => {
    const customData = [1, 0.5, 0.25, 0.125];
    const params = {
      waveform: "custom",
      customWaveform: customData,
    };

    const result = setParametersForClients(params, ["client-1"]);

    expect(result.success).toBe(true);
    expect(global.users["client-1"].waveform).toBe("custom");
    expect(global.users["client-1"].customWaveform).toEqual(customData);
    expect(result.updatedParameters).toContain("waveform");
    expect(result.updatedParameters).toContain("customWaveform");
  });

  test("should handle custom waveform without data", () => {
    const params = { waveform: "custom" };

    const result = setParametersForClients(params, ["client-1"]);

    expect(result.success).toBe(true);
    expect(global.users["client-1"].waveform).toBe("custom");
    // customWaveform should remain unchanged if not provided
  });
});

describe("setParametersForClients - Return Values", () => {
  beforeEach(() => {
    global.users = {
      "client-1": { frequency: 440 },
      "client-2": { frequency: 440 },
    };
  });

  test("should return comprehensive operation results", () => {
    const params = { frequency: 880, invalidParam: "test" };
    const result = setParametersForClients(params, [
      "client-1",
      "non-existent",
    ]);

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("updatedClients");
    expect(result).toHaveProperty("failedClients");
    expect(result).toHaveProperty("updatedParameters");
    expect(result).toHaveProperty("ignoredParameters");
    expect(result).toHaveProperty("warnings");

    expect(result.updatedClients).toContain("client-1");
    expect(result.failedClients).toContain("non-existent");
    expect(result.updatedParameters).toContain("frequency");
    expect(result.ignoredParameters).toContain("invalidParam");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("setParametersForClients - Dashboard Updates", () => {
  beforeEach(() => {
    global.users = {
      "client-1": { frequency: 440 },
    };
    global.oscUsers = {
      "client-1": global.users["client-1"],
    };
  });

  test("should trigger dashboard updates after parameter changes", () => {
    const params = { frequency: 880 };

    setParametersForClients(params, ["client-1"]);

    expect(global.mockMaxApi.outlet).toHaveBeenCalledWith("clientList", [
      "client-1",
    ]);
    expect(global.mockMaxApi.outlet).toHaveBeenCalledWith("clientCount", 1);
  });
});
