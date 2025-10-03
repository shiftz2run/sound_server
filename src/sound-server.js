const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const maxApi = require("max-api");
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

let users = {}; // { socketId: { id, frequency, amplitude, ... } }
let oscUsers = {}; // Only users from /osc.html
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
      frequency: fftDataArray[i],
      amplitude: fftDataArray[i + 1],
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

// ===== Static Files =====
app.use(express.static(path.join(__dirname, "../public")));

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
