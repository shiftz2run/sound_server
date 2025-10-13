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

let users = {}; // { clientIndex: { id, socketId, connected, active, frequency, amplitude, ... } }
let clientIndexCounter = 1; // Auto-incrementing index for clients
let socketToIndexMap = {}; // { socket.id: clientIndex } for fast lookups
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

  // Normalize clientIds to array
  let normalizedClientIds = clientIds;
  if (clientIds !== null && !Array.isArray(clientIds)) {
    normalizedClientIds = [clientIds];
  }

  // Determine target clients (indexes)
  let targetIndexes = [];
  if (normalizedClientIds === null) {
    // Apply to all connected clients
    targetIndexes = Object.keys(users).filter(
      (index) => users[index].connected,
    );
  } else {
    // Apply to specific clients (only if connected)
    targetIndexes = normalizedClientIds.filter(
      (index) => users[index] && users[index].connected,
    );
  }

  // Update user data for all valid parameters
  for (const [param, value] of Object.entries(validParameters)) {
    if (targetIndexes.length === 0) {
      // Update default params if no specific clients
      defaultParams[param] = value;
      // Update all user data (both connected and disconnected)
      Object.keys(users).forEach((index) => {
        users[index][param] = value;
      });
    } else {
      // Update specific clients
      targetIndexes.forEach((index) => {
        users[index][param] = value;
      });
    }

    results.success.push({
      param,
      value,
      clients: targetIndexes.length || "all",
    });
  }

  // Send bulk parameter update via socket (only to connected clients)
  if (targetIndexes.length === 0) {
    // Emit to all connected clients
    Object.keys(users).forEach((index) => {
      if (users[index].connected) {
        io.to(users[index].socketId).emit("setParameters", validParameters);
      }
    });
  } else {
    // Emit to specific clients
    targetIndexes.forEach((index) => {
      io.to(users[index].socketId).emit("setParameters", validParameters);
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
  groups = 0,
  delay = 0,
) {
  // Normalize clientIds to array
  let normalizedClientIds = clientIds;
  if (clientIds !== null && !Array.isArray(clientIds)) {
    normalizedClientIds = [clientIds];
  }

  // Get current connected clients (indexes)
  const availableClients = normalizedClientIds
    ? normalizedClientIds.filter(
        (index) => users[index] && users[index].connected,
      )
    : Object.keys(users).filter((index) => users[index].connected);

  // Distribute values to clients
  const assignments = distributeValuesToClients(
    valuesList,
    availableClients,
    mode,
    groups,
    delay,
  );

  // Apply each assignment individually, with delays
  const results = { success: [], errors: [] };
  assignments.forEach(({ clientId, value, delay }) => {
    if (delay > 0) {
      setTimeout(() => {
        setParametersForClients({ [param]: value }, [clientId]);
      }, delay);
      results.success.push({ clientId, param, value, delay });
    } else {
      const result = setParametersForClients({ [param]: value }, [clientId]);
      results.success.push(...result.success);
      results.errors.push(...result.errors);
    }
  });

  return results;
}

// ===== FFT Data Distribution Function =====
function setFFTDataForClients(
  fftDataArray,
  mode = "beginning",
  clientIds = null,
  groups = 0,
  delay = 0,
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

  // Normalize clientIds to array
  let normalizedClientIds = clientIds;
  if (clientIds !== null && !Array.isArray(clientIds)) {
    normalizedClientIds = [clientIds];
  }

  // Get current connected clients
  const availableClients = normalizedClientIds
    ? normalizedClientIds.filter(
        (index) => users[index] && users[index].connected,
      )
    : Object.keys(users).filter((index) => users[index].connected);

  // Distribute FFT pairs to clients using existing distribution logic
  const assignments = distributeValuesToClients(
    fftPairs,
    availableClients,
    mode,
    groups,
    delay,
  );

  // Apply each assignment (both amplitude and frequency for each client), with delays
  assignments.forEach(({ clientId, value, delay }) => {
    if (delay > 0) {
      setTimeout(() => {
        setParametersForClients(
          {
            amplitude: value.amplitude,
            frequency: value.frequency,
          },
          [clientId],
        );
      }, delay);
      results.success.push({
        clientId,
        amplitude: value.amplitude,
        frequency: value.frequency,
        delay,
      });
    } else {
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
    }
  });

  return results;
}

// Function to send updated client list to Max
function updateClientListOutlet() {
  // Get only connected clients
  const connectedClientList = Object.keys(users).filter(
    (index) => users[index].connected,
  );
  const connectedClientCount = connectedClientList.length;

  // Send connected client list and count to Max
  maxApi.outlet("connectedClientList", connectedClientList);
  maxApi.outlet("connectedClientCount", connectedClientCount);
  maxApi.outlet(connectedClientCount); // Send just the number directly

  // Send users object directly with index as key
  maxApi.outlet("usersObject", users);
}

// ===== Max API Handlers =====
// Register the new centralized parameter handlers
registerMaxHandlers(
  maxApi,
  setParametersForClients,
  setParametersListForClients,
  setFFTDataForClients,
  io,
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
  const clientCount = Object.keys(users).length;
  const waveformTypes = PARAMETER_SCHEMA.waveform
    ? PARAMETER_SCHEMA.waveform.values
    : [];

  console.log("=== DEBUG INFO ===");
  console.log("Debug Mode:", debugMode);
  console.log("Connected Clients:", Object.keys(users));
  console.log("Client Count:", clientCount);
  console.log("Available Waveforms:", waveformTypes);
  console.log("Parameter Schema:", Object.keys(PARAMETER_SCHEMA));

  // Send debug info to Max
  maxApi.outlet("debug", {
    debugMode: debugMode,
    clients: Object.keys(users),
    clientCount: clientCount,
    waveformTypes: waveformTypes,
    parameters: Object.keys(PARAMETER_SCHEMA),
  });

  return { debugMode, clientCount };
});

// ===== Static Files =====
app.use(express.static(path.join(__dirname, "../public")));

// ===== Socket connection =====
io.on("connection", (socket) => {
  // Assign session ID / user ID
  let sessionId;
  if (debugMode) {
    // In debug mode, create unique ID for each connection
    sessionId = uuidv4();
  } else {
    // Try to get existing session from query params, then cookies, then generate new
    const queryUserId = socket.handshake.query.userId;
    const cookieUserId = socket.handshake.headers.cookie
      ?.split(";")
      .find((c) => c.trim().startsWith("oscSession="))
      ?.split("=")[1];

    sessionId =
      queryUserId && queryUserId !== ""
        ? queryUserId
        : cookieUserId || uuidv4();
  }

  let userId = sessionId;
  let clientIndex;

  // In non-debug mode, check if this sessionId already exists and reuse its index
  if (!debugMode) {
    const existingIndex = Object.keys(users).find(
      (index) => users[index].id === userId,
    );

    if (existingIndex) {
      // Reuse existing index for returning user
      clientIndex = existingIndex;
      users[clientIndex].socketId = socket.id;
      users[clientIndex].connected = true;
    } else {
      // New user - assign new index
      clientIndex = clientIndexCounter++;
      users[clientIndex] = {
        id: userId,
        socketId: socket.id,
        connected: true,
        active: false,
        ...defaultParams,
      };
    }
  } else {
    // Debug mode: always assign new index
    clientIndex = clientIndexCounter++;
    users[clientIndex] = {
      id: userId,
      socketId: socket.id,
      connected: true,
      active: false,
      ...defaultParams,
    };
  }

  socketToIndexMap[socket.id] = clientIndex;

  updateClientListOutlet();

  // Send initial params using bulk update
  socket.emit("setParameters", defaultParams);
  socket.emit("setUserId", userId);

  // Send available waveform types
  const waveformTypes = PARAMETER_SCHEMA.waveform
    ? PARAMETER_SCHEMA.waveform.values
    : [];
  socket.emit("waveformTypes", waveformTypes);

  // Handle parameter schema requests
  socket.on("getParameterSchema", () => {
    socket.emit("parameterSchema", PARAMETER_SCHEMA);
  });

  // Handle client activation status updates
  socket.on("setActive", (isActive) => {
    const clientIndex = socketToIndexMap[socket.id];
    if (clientIndex && users[clientIndex]) {
      users[clientIndex].active = Boolean(isActive);
      updateClientListOutlet();
    }
  });

  socket.on("disconnect", () => {
    const clientIndex = socketToIndexMap[socket.id];
    if (clientIndex && users[clientIndex]) {
      users[clientIndex].connected = false;
      users[clientIndex].active = false;
      delete socketToIndexMap[socket.id];
      updateClientListOutlet();
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
