const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const maxApi = require("max-api");
const cookieParser = require("cookie-parser");
const { PARAMETER_SCHEMA } = require("./parameters/parameterRegistry");
const {
  validateParameter,
  getDefaultParameters,
  distributeValuesToClients,
} = require("./parameters/parameterManager");
const { registerMaxHandlers } = require("./parameters/parameterMaxHandlers");

// ===== Configuration Constants =====
const CONFIG = {
  SERVER_PORT: 8000,
  CLIENT_LIST_UPDATE_INTERVAL: 5000, // milliseconds
};

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(cookieParser());

let users = {}; // { socketId: { id, frequency, amplitude, ... } }
let oscUsers = {}; // Only users from /osc.html
let userSessions = {}; // { sessionId: { userId, timestamp } }
let debugMode = false;

// Get default parameters from schema
const defaultParams = getDefaultParameters();

// ===== Central Parameter Setting Function =====
function setParametersForClients(parameters, clientIds = null) {
  const results = { success: [], errors: [] };

  // Validate all parameters and separate valid from invalid
  const validParameters = {};
  for (const [param, value] of Object.entries(parameters)) {
    const validation = validateParameter(param, value);
    if (!validation.valid) {
      results.errors.push({ param, value, error: validation.error });
    } else {
      validParameters[param] = validation.value;
    }
  }

  // If no valid parameters, return early
  if (Object.keys(validParameters).length === 0) {
    return results;
  }

  // Determine target clients
  let targetClients = [];
  if (clientIds === null) {
    // Apply to all clients
    targetClients = Object.keys(users);
  } else {
    // Apply to specific clients
    targetClients = clientIds.filter((id) => users[id]);
  }

  // Update user data for all valid parameters
  for (const [param, value] of Object.entries(validParameters)) {
    if (targetClients.length === 0) {
      // Update default params if no specific clients
      defaultParams[param] = value;
      // Update all user data
      Object.keys(users).forEach((socketId) => {
        users[socketId][param] = value;
        if (oscUsers[socketId]) {
          oscUsers[socketId][param] = value;
        }
      });
    } else {
      // Update specific clients
      targetClients.forEach((socketId) => {
        users[socketId][param] = value;
        if (oscUsers[socketId]) {
          oscUsers[socketId][param] = value;
        }
      });
    }

    results.success.push({
      param,
      value,
      clients: targetClients.length || "all",
    });
  }

  // Send bulk parameter update via socket (only valid parameters)
  if (targetClients.length === 0) {
    // Emit to all clients
    io.emit("setParameters", validParameters);
  } else {
    // Emit to specific clients
    targetClients.forEach((socketId) => {
      io.to(socketId).emit("setParameters", validParameters);
    });
  }

  // Update web dashboard
  updateClientListOutlet();

  return results;
}

// ===== List Parameter Setting Function =====
function setParametersListForClients(
  param,
  valuesList,
  mode = "beginning",
  clientIds = null,
) {
  // Get current clients
  const availableClients = clientIds
    ? clientIds.filter((id) => users[id])
    : Object.keys(users);

  // Distribute values to clients
  const assignments = distributeValuesToClients(
    valuesList,
    availableClients,
    mode,
  );

  // Apply each assignment individually
  const results = { success: [], errors: [] };
  assignments.forEach(({ clientId, value }) => {
    const result = setParametersForClients({ [param]: value }, [clientId]);
    results.success.push(...result.success);
    results.errors.push(...result.errors);
  });

  return results;
}

// ===== FFT Data Distribution Function =====
function setFFTDataForClients(
  fftDataArray,
  mode = "beginning",
  clientIds = null,
) {
  const results = { success: [], errors: [] };

  // Validate FFT data array
  if (!Array.isArray(fftDataArray)) {
    results.errors.push({ error: "FFT data must be an array" });
    return results;
  }

  if (fftDataArray.length % 2 !== 0) {
    results.errors.push({
      error: "FFT data array must have even length (amp/freq pairs)",
    });
    return results;
  }

  // Parse FFT data into amp/freq pairs
  const fftPairs = [];
  for (let i = 0; i < fftDataArray.length; i += 2) {
    fftPairs.push({
      amplitude: fftDataArray[i],
      frequency: fftDataArray[i + 1],
    });
  }

  // Get current clients
  const availableClients = clientIds
    ? clientIds.filter((id) => users[id])
    : Object.keys(users);

  // Distribute FFT pairs to clients using existing distribution logic
  const assignments = distributeValuesToClients(
    fftPairs,
    availableClients,
    mode,
  );

  // Apply each assignment (both amplitude and frequency for each client)
  assignments.forEach(({ clientId, value }) => {
    const result = setParametersForClients(
      {
        amplitude: value.amplitude,
        frequency: value.frequency,
      },
      [clientId],
    );
    results.success.push({
      clientId,
      amplitude: value.amplitude,
      frequency: value.frequency,
      parameterResults: result,
    });
    results.errors.push(...result.errors);
  });

  return results;
}

// Function to send updated client list to Max and web dashboard
function updateClientListOutlet() {
  const clientList = Object.keys(oscUsers);
  const clientCount = clientList.length;

  // Send both the list and count to Max
  maxApi.outlet("clientList", clientList);
  maxApi.outlet("clientCount", clientCount);
  maxApi.outlet(clientCount); // Send just the number directly

  // Also emit to all web clients for dashboard updates
  const userData = Object.values(oscUsers).map((user) => ({
    id: user.id,
    frequency: user.frequency || defaultParams.frequency,
    amplitude: user.amplitude || defaultParams.amplitude,
    attackTime: user.attackTime || defaultParams.attackTime,
    decayTime: user.decayTime || defaultParams.decayTime,
    sustainLevel: user.sustainLevel || defaultParams.sustainLevel,
    frequencySmoothing:
      user.frequencySmoothing || defaultParams.frequencySmoothing,
    amplitudeSmoothing:
      user.amplitudeSmoothing || defaultParams.amplitudeSmoothing,
    adsOn: user.adsOn || defaultParams.adsOn,
    waveform: user.waveform || defaultParams.waveform,
    customWaveform: user.customWaveform || defaultParams.customWaveform,
  }));

  io.emit("usersUpdate", userData);
}

// ===== Max API Handlers =====
// Register the new centralized parameter handlers
registerMaxHandlers(
  maxApi,
  setParametersForClients,
  setParametersListForClients,
  setFFTDataForClients,
);

// Enhanced parameters handler with new system
maxApi.addHandler("parameters", (...params) => {
  // params format: [clientId?, amp, freq, attack, decay, sustain, waveform?]
  let offset = 0;
  let clientId = null;

  if (typeof params[0] === "string") {
    clientId = params[0];
    offset = 1;
  }

  const [amp, freq, attack, decay, sustain, waveform] = params.slice(offset);

  const parameters = {};
  if (amp !== undefined) parameters.amplitude = amp;
  if (freq !== undefined) parameters.frequency = freq;
  if (attack !== undefined) parameters.attackTime = attack;
  if (decay !== undefined) parameters.decayTime = decay;
  if (sustain !== undefined) parameters.sustainLevel = sustain;
  if (waveform !== undefined) parameters.waveform = waveform;

  const result = setParametersForClients(
    parameters,
    clientId ? [clientId] : null,
  );
  if (result.errors.length > 0) {
    console.error(`Parameters error: ${result.errors[0].error}`);
    maxApi.outlet("parameterError", result.errors[0]);
    return false;
  }
  return true;
});

// Enhanced bulk parameters handler using new system
maxApi.addHandler(
  "parametersByNumber",
  (userNumber, amp, freq, attack, decay, sustain, waveform) => {
    const socketIds = Object.keys(oscUsers);
    const index = userNumber - 1;

    if (index >= 0 && index < socketIds.length) {
      const socketId = socketIds[index];

      const parameters = {};
      if (amp !== undefined) parameters.amplitude = amp;
      if (freq !== undefined) parameters.frequency = freq;
      if (attack !== undefined) parameters.attackTime = attack;
      if (decay !== undefined) parameters.decayTime = decay;
      if (sustain !== undefined) parameters.sustainLevel = sustain;
      if (waveform !== undefined) parameters.waveform = waveform;

      const result = setParametersForClients(parameters, [socketId]);
      if (result.errors.length > 0) {
        console.error(
          `Bulk parameters error for user ${userNumber}: ${result.errors[0].error}`,
        );
        maxApi.outlet("parameterError", result.errors[0]);
        return false;
      }

      console.log(
        `Bulk parameters updated for user ${userNumber} (${socketId})`,
      );
      maxApi.outlet("parametersSet", { userNumber, ...parameters });
      return true;
    } else {
      console.log(`User ${userNumber} not found for bulk parameter update`);
      maxApi.outlet("userNotFound", userNumber);
      return false;
    }
  },
);

// Get available waveform types
maxApi.addHandler("getWaveformTypes", () => {
  const waveformSchema = PARAMETER_SCHEMA.waveform;
  const types = waveformSchema ? waveformSchema.values : [];
  maxApi.outlet("waveformTypes", types);
  return types;
});

// Handler to manually request client list update
maxApi.addHandler("refreshClientList", () => {
  updateClientListOutlet();
});

// Enhanced getClients handler
maxApi.addHandler("getClients", () => {
  updateClientListOutlet();
  return Object.keys(oscUsers);
});

// Enhanced getUsersObject with waveform data
maxApi.addHandler("getUsersObject", () => {
  const usersObject = {};
  Object.entries(oscUsers).forEach(([socketId, userData], index) => {
    const userNumber = index + 1; // Start from 1
    usersObject[userNumber] = {
      socketId: socketId,
      id: userData.id,
      frequency: userData.frequency || defaultParams.frequency,
      amplitude: userData.amplitude || defaultParams.amplitude,
      attackTime: userData.attackTime || defaultParams.attackTime,
      decayTime: userData.decayTime || defaultParams.decayTime,
      sustainLevel: userData.sustainLevel || defaultParams.sustainLevel,
      frequencySmoothing:
        userData.frequencySmoothing || defaultParams.frequencySmoothing,
      amplitudeSmoothing:
        userData.amplitudeSmoothing || defaultParams.amplitudeSmoothing,
      adsOn: userData.adsOn || defaultParams.adsOn,
      waveform: userData.waveform || defaultParams.waveform,
      customWaveform: userData.customWaveform || defaultParams.customWaveform,
    };
  });

  maxApi.outlet("usersObject", usersObject);
  return usersObject;
});

// Enhanced getUserByNumber with waveform data
maxApi.addHandler("getUserByNumber", (userNumber) => {
  const socketIds = Object.keys(oscUsers);
  const index = userNumber - 1;

  if (index >= 0 && index < socketIds.length) {
    const socketId = socketIds[index];
    const userData = {
      socketId: socketId,
      id: oscUsers[socketId].id,
      frequency: oscUsers[socketId].frequency || defaultParams.frequency,
      amplitude: oscUsers[socketId].amplitude || defaultParams.amplitude,
      attackTime: oscUsers[socketId].attackTime || defaultParams.attackTime,
      decayTime: oscUsers[socketId].decayTime || defaultParams.decayTime,
      sustainLevel:
        oscUsers[socketId].sustainLevel || defaultParams.sustainLevel,
      frequencySmoothing:
        oscUsers[socketId].frequencySmoothing ||
        defaultParams.frequencySmoothing,
      amplitudeSmoothing:
        oscUsers[socketId].amplitudeSmoothing ||
        defaultParams.amplitudeSmoothing,
      adsOn: oscUsers[socketId].adsOn || defaultParams.adsOn,
      waveform: oscUsers[socketId].waveform || defaultParams.waveform,
      customWaveform:
        oscUsers[socketId].customWaveform || defaultParams.customWaveform,
    };

    maxApi.outlet("userData", userData);
    maxApi.outlet("userFound", userNumber);
    return userData;
  } else {
    maxApi.outlet("userNotFound", userNumber);
    return null;
  }
});

// Send parameter to specific user by number
maxApi.addHandler("setParameterByNumber", (userNumber, param, value) => {
  const socketIds = Object.keys(oscUsers);
  const index = userNumber - 1;

  if (index >= 0 && index < socketIds.length) {
    const socketId = socketIds[index];

    const result = setParametersForClients({ [param]: value }, [socketId]);
    if (result.errors.length > 0) {
      console.error(
        `Parameter error for user ${userNumber}: ${result.errors[0].error}`,
      );
      maxApi.outlet("parameterError", result.errors[0]);
      return false;
    }

    maxApi.outlet("parameterSet", { userNumber, param, value });
    return true;
  } else {
    console.log(`User ${userNumber} not found`);
    maxApi.outlet("userNotFound", userNumber);
    return false;
  }
});

// Enhanced getUser with waveform data
maxApi.addHandler("getUser", (socketId) => {
  if (oscUsers[socketId]) {
    const userData = {
      id: oscUsers[socketId].id,
      frequency: oscUsers[socketId].frequency || defaultParams.frequency,
      amplitude: oscUsers[socketId].amplitude || defaultParams.amplitude,
      attackTime: oscUsers[socketId].attackTime || defaultParams.attackTime,
      decayTime: oscUsers[socketId].decayTime || defaultParams.decayTime,
      sustainLevel:
        oscUsers[socketId].sustainLevel || defaultParams.sustainLevel,
      frequencySmoothing:
        oscUsers[socketId].frequencySmoothing ||
        defaultParams.frequencySmoothing,
      amplitudeSmoothing:
        oscUsers[socketId].amplitudeSmoothing ||
        defaultParams.amplitudeSmoothing,
      adsOn: oscUsers[socketId].adsOn || defaultParams.adsOn,
      waveform: oscUsers[socketId].waveform || defaultParams.waveform,
      customWaveform:
        oscUsers[socketId].customWaveform || defaultParams.customWaveform,
    };

    maxApi.outlet("userData", userData);
    maxApi.outlet("userFound", socketId);
    return userData;
  } else {
    maxApi.outlet("userNotFound", socketId);
    return null;
  }
});

// Fixed debug mode handler
maxApi.addHandler("setDebugMode", (mode) => {
  debugMode = Boolean(mode);
  console.log(`Debug mode ${debugMode ? "enabled" : "disabled"}`);
  maxApi.outlet("debugMode", debugMode);
  return debugMode;
});

// Enhanced debug handler
maxApi.addHandler("debug", () => {
  const oscClientCount = Object.keys(oscUsers).length;
  const allClientCount = Object.keys(users).length;
  const waveformTypes = PARAMETER_SCHEMA.waveform
    ? PARAMETER_SCHEMA.waveform.values
    : [];

  console.log("=== DEBUG INFO ===");
  console.log("Debug Mode:", debugMode);
  console.log("OSC Clients:", Object.keys(oscUsers));
  console.log("All Clients:", Object.keys(users));
  console.log("OSC Client Count:", oscClientCount);
  console.log("All Client Count:", allClientCount);
  console.log("Available Waveforms:", waveformTypes);
  console.log("Parameter Schema:", Object.keys(PARAMETER_SCHEMA));

  // Send debug info to Max
  maxApi.outlet("debug", {
    debugMode: debugMode,
    oscClients: Object.keys(oscUsers),
    oscCount: oscClientCount,
    allCount: allClientCount,
    waveformTypes: waveformTypes,
    parameters: Object.keys(PARAMETER_SCHEMA),
  });

  return { debugMode, oscCount: oscClientCount, allCount: allClientCount };
});

// Enhanced OSC-specific parameter handler
maxApi.addHandler("setOSCParameter", (param, value, clientId) => {
  // Determine target clients (only OSC clients)
  let targetClients = [];
  if (clientId && oscUsers[clientId]) {
    targetClients = [clientId];
  } else {
    targetClients = Object.keys(oscUsers);
  }

  const result = setParametersForClients(
    { [param]: value },
    targetClients.length ? targetClients : null,
  );
  if (result.errors.length > 0) {
    console.error(`OSC Parameter error: ${result.errors[0].error}`);
    maxApi.outlet("parameterError", result.errors[0]);
    return false;
  }

  console.log(
    `OSC Parameter "${param}" set to ${value} ${clientId ? `for OSC client ${clientId}` : "for all OSC clients"}`,
  );
  return true;
});

// ===== Static Files =====
app.use(express.static(path.join(__dirname, "..")));

// ===== Socket connection =====
io.on("connection", (socket) => {
  // Get the referer to determine which page the client came from
  const referer = socket.handshake.headers.referer;
  const isOSCClient = referer && referer.includes("/osc.html");

  // Assign session ID / user ID
  let sessionId;
  if (debugMode) {
    // In debug mode, create unique ID for each connection
    sessionId = uuidv4();
  } else {
    // Try to get existing session from cookies
    sessionId =
      socket.handshake.headers.cookie
        ?.split(";")
        .find((c) => c.trim().startsWith("oscSession="))
        ?.split("=")[1] || uuidv4();
  }

  let userId = sessionId;
  userSessions[sessionId] = { userId, timestamp: Date.now() };

  const userData = { id: userId, isOSCClient, ...defaultParams };
  users[socket.id] = userData;

  // Only add to oscUsers if they're from osc.html
  if (isOSCClient) {
    oscUsers[socket.id] = userData;
    console.log("OSC Client connected:", userId);
    console.log("Total OSC clients now:", Object.keys(oscUsers).length);
    updateClientListOutlet();
  } else {
    console.log("Regular client connected:", userId);
  }

  // Send initial params using bulk update
  socket.emit("setParameters", defaultParams);
  socket.emit("setUserId", userId);
  socket.emit("clientType", isOSCClient ? "osc" : "regular");

  // Send available waveform types
  const waveformTypes = PARAMETER_SCHEMA.waveform
    ? PARAMETER_SCHEMA.waveform.values
    : [];
  socket.emit("waveformTypes", waveformTypes);

  // Handle parameter schema requests
  socket.on("getParameterSchema", () => {
    socket.emit("parameterSchema", PARAMETER_SCHEMA);
  });

  socket.on("disconnect", () => {
    const wasOSCClient = users[socket.id]?.isOSCClient;

    delete users[socket.id];

    if (wasOSCClient) {
      delete oscUsers[socket.id];
      console.log("OSC Client disconnected:", userId);
      console.log("Total OSC clients now:", Object.keys(oscUsers).length);
      updateClientListOutlet();
    } else {
      console.log("Regular client disconnected:", userId);
    }
  });
});

// Optional: Add a periodic update every few seconds as backup
setInterval(() => {
  updateClientListOutlet();
}, CONFIG.CLIENT_LIST_UPDATE_INTERVAL);

server.listen(CONFIG.SERVER_PORT, () =>
  console.log(`Server running on http://localhost:${CONFIG.SERVER_PORT}`),
);
