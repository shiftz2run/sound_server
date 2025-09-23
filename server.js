const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const maxApi = require("max-api");
const cookieParser = require("cookie-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(cookieParser());

let users = {}; // { socketId: { id, frequency, amplitude, ... } }
let oscUsers = {}; // Only users from /osc.html
let userSessions = {}; // { sessionId: { userId, timestamp } }
let debugMode = false;

// Available waveform types
const WAVEFORM_TYPES = {
  sine: "sine",
  square: "square",
  sawtooth: "sawtooth",
  triangle: "triangle",
};

// Global default parameters
let defaultParams = {
  frequencySmoothing: 0,
  amplitudeSmoothing: 0,
  attackTime: 0,
  decayTime: 0,
  sustainLevel: 0.5,
  adsOn: false,
  frequency: 440,
  amplitude: 0.5,
  waveform: "sine", // New waveform parameter
};

// ===== Utility to emit to one or all =====
function emitParam(param, value, clientId) {
  if (clientId && users[clientId]) {
    io.to(clientId).emit(param, value);
  } else {
    io.emit(param, value);
  }
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
    frequency: user.frequency || 440,
    amplitude: user.amplitude || 0.5,
    attackTime: user.attackTime || 0,
    decayTime: user.decayTime || 0,
    sustainLevel: user.sustainLevel || 0.5,
    frequencySmoothing: user.frequencySmoothing || 0,
    amplitudeSmoothing: user.amplitudeSmoothing || 0,
    adsOn: user.adsOn || false,
    waveform: user.waveform || "sine",
    customWaveform: user.customWaveform || null,
  }));

  io.emit("usersUpdate", userData);
}

// ===== Max API Handlers =====
maxApi.addHandler("setParameter", (param, value, clientId) => {
  // Update global default if no clientId
  if (!clientId) defaultParams[param] = value;

  // Update user data
  if (clientId && users[clientId]) {
    users[clientId][param] = value;
    if (oscUsers[clientId]) {
      oscUsers[clientId][param] = value;
    }
  } else {
    // Update all users
    Object.keys(users).forEach((socketId) => {
      users[socketId][param] = value;
    });
    Object.keys(oscUsers).forEach((socketId) => {
      oscUsers[socketId][param] = value;
    });
  }

  // Emit to the right client(s)
  emitParam(param, value, clientId);

  // Update web dashboard
  updateClientListOutlet();

  console.log(
    `Parameter "${param}" set to ${value} ${clientId ? `for client ${clientId}` : "for all clients"}`,
  );
});

// Enhanced parameters handler with waveform support
maxApi.addHandler("parameters", (...params) => {
  // params format: [clientId?, amp, freq, attack, decay, sustain, waveform?]
  let offset = 0;
  let clientId = null;

  if (typeof params[0] === "string") {
    clientId = params[0]; // first arg is client ID
    offset = 1;
  }

  const [amp, freq, attack, decay, sustain, waveform] = params.slice(offset);

  if (amp !== undefined) emitParam("amplitude", amp, clientId);
  if (freq !== undefined) emitParam("frequency", freq, clientId);
  if (attack !== undefined) emitParam("attackTime", attack, clientId);
  if (decay !== undefined) emitParam("decayTime", decay, clientId);
  if (sustain !== undefined) emitParam("sustainLevel", sustain, clientId);
  if (waveform !== undefined && WAVEFORM_TYPES[waveform]) {
    emitParam("waveform", waveform, clientId);
  }

  // Update web dashboard after parameter changes
  updateClientListOutlet();
});

// Enhanced bulk parameters handler with waveform support
maxApi.addHandler(
  "parametersByNumber",
  (userNumber, amp, freq, attack, decay, sustain, waveform) => {
    const socketIds = Object.keys(oscUsers);
    const index = userNumber - 1; // Convert to 0-based index

    if (index >= 0 && index < socketIds.length) {
      const socketId = socketIds[index];

      if (amp !== undefined) {
        oscUsers[socketId].amplitude = amp;
        users[socketId].amplitude = amp;
        io.to(socketId).emit("amplitude", amp);
      }
      if (freq !== undefined) {
        oscUsers[socketId].frequency = freq;
        users[socketId].frequency = freq;
        io.to(socketId).emit("frequency", freq);
      }
      if (attack !== undefined) {
        oscUsers[socketId].attackTime = attack;
        users[socketId].attackTime = attack;
        io.to(socketId).emit("attackTime", attack);
      }
      if (decay !== undefined) {
        oscUsers[socketId].decayTime = decay;
        users[socketId].decayTime = decay;
        io.to(socketId).emit("decayTime", decay);
      }
      if (sustain !== undefined) {
        oscUsers[socketId].sustainLevel = sustain;
        users[socketId].sustainLevel = sustain;
        io.to(socketId).emit("sustainLevel", sustain);
      }
      if (waveform !== undefined && WAVEFORM_TYPES[waveform]) {
        oscUsers[socketId].waveform = waveform;
        users[socketId].waveform = waveform;
        io.to(socketId).emit("waveform", waveform);
      }

      // Update web dashboard
      updateClientListOutlet();

      console.log(
        `Bulk parameters updated for user ${userNumber} (${socketId})`,
      );
      maxApi.outlet("parametersSet", {
        userNumber,
        amp,
        freq,
        attack,
        decay,
        sustain,
        waveform,
      });
      return true;
    } else {
      console.log(`User ${userNumber} not found for bulk parameter update`);
      maxApi.outlet("userNotFound", userNumber);
      return false;
    }
  },
);

// New waveform-specific handlers
maxApi.addHandler("setWaveform", (waveform, clientId) => {
  if (!WAVEFORM_TYPES[waveform]) {
    console.log(`Invalid waveform type: ${waveform}`);
    maxApi.outlet("error", `Invalid waveform type: ${waveform}`);
    return false;
  }

  // Update user data
  if (clientId && users[clientId]) {
    users[clientId].waveform = waveform;
    if (oscUsers[clientId]) {
      oscUsers[clientId].waveform = waveform;
    }
    io.to(clientId).emit("waveform", waveform);
  } else {
    // Update all users
    Object.keys(users).forEach((socketId) => {
      users[socketId].waveform = waveform;
    });
    Object.keys(oscUsers).forEach((socketId) => {
      oscUsers[socketId].waveform = waveform;
    });
    io.emit("waveform", waveform);
  }

  updateClientListOutlet();
  console.log(
    `Waveform set to ${waveform} ${clientId ? `for client ${clientId}` : "for all clients"}`,
  );
  return true;
});

maxApi.addHandler("setWaveformByNumber", (userNumber, waveform) => {
  if (!WAVEFORM_TYPES[waveform]) {
    console.log(`Invalid waveform type: ${waveform}`);
    maxApi.outlet("error", `Invalid waveform type: ${waveform}`);
    return false;
  }

  const socketIds = Object.keys(oscUsers);
  const index = userNumber - 1;

  if (index >= 0 && index < socketIds.length) {
    const socketId = socketIds[index];

    oscUsers[socketId].waveform = waveform;
    users[socketId].waveform = waveform;
    io.to(socketId).emit("waveform", waveform);

    updateClientListOutlet();

    console.log(
      `Waveform set to ${waveform} for user ${userNumber} (${socketId})`,
    );
    maxApi.outlet("waveformSet", { userNumber, waveform });
    return true;
  } else {
    console.log(`User ${userNumber} not found for waveform update`);
    maxApi.outlet("userNotFound", userNumber);
    return false;
  }
});

// Custom waveform handler - accepts array of values for periodic wave
maxApi.addHandler("setCustomWaveform", (waveformData, clientId) => {
  if (!Array.isArray(waveformData)) {
    console.log("Custom waveform data must be an array");
    maxApi.outlet("error", "Custom waveform data must be an array");
    return false;
  }

  // Update user data
  if (clientId && users[clientId]) {
    users[clientId].customWaveform = waveformData;
    users[clientId].waveform = "custom";
    if (oscUsers[clientId]) {
      oscUsers[clientId].customWaveform = waveformData;
      oscUsers[clientId].waveform = "custom";
    }
    io.to(clientId).emit("customWaveform", waveformData);
    io.to(clientId).emit("waveform", "custom");
  } else {
    // Update all users
    Object.keys(users).forEach((socketId) => {
      users[socketId].customWaveform = waveformData;
      users[socketId].waveform = "custom";
    });
    Object.keys(oscUsers).forEach((socketId) => {
      oscUsers[socketId].customWaveform = waveformData;
      oscUsers[socketId].waveform = "custom";
    });
    io.emit("customWaveform", waveformData);
    io.emit("waveform", "custom");
  }

  updateClientListOutlet();
  console.log(
    `Custom waveform set ${clientId ? `for client ${clientId}` : "for all clients"}`,
  );
  return true;
});

// Get available waveform types
maxApi.addHandler("getWaveformTypes", () => {
  const types = Object.keys(WAVEFORM_TYPES);
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
      frequency: userData.frequency || 440,
      amplitude: userData.amplitude || 0.5,
      attackTime: userData.attackTime || 0.1,
      decayTime: userData.decayTime || 0.1,
      sustainLevel: userData.sustainLevel || 0.5,
      frequencySmoothing: userData.frequencySmoothing || 0.1,
      amplitudeSmoothing: userData.amplitudeSmoothing || 0.1,
      adsOn: userData.adsOn || false,
      waveform: userData.waveform || "sine",
      customWaveform: userData.customWaveform || null,
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
      frequency: oscUsers[socketId].frequency || 440,
      amplitude: oscUsers[socketId].amplitude || 0.5,
      attackTime: oscUsers[socketId].attackTime || 0.1,
      decayTime: oscUsers[socketId].decayTime || 0.1,
      sustainLevel: oscUsers[socketId].sustainLevel || 0.5,
      frequencySmoothing: oscUsers[socketId].frequencySmoothing || 0.1,
      amplitudeSmoothing: oscUsers[socketId].amplitudeSmoothing || 0.1,
      adsOn: oscUsers[socketId].adsOn || false,
      waveform: oscUsers[socketId].waveform || "sine",
      customWaveform: oscUsers[socketId].customWaveform || null,
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

    // Validate waveform parameter
    if (param === "waveform" && !WAVEFORM_TYPES[value]) {
      console.log(`Invalid waveform type: ${value}`);
      maxApi.outlet("error", `Invalid waveform type: ${value}`);
      return false;
    }

    // Update user data
    oscUsers[socketId][param] = value;
    users[socketId][param] = value;

    // Emit to specific client
    io.to(socketId).emit(param, value);

    // Update dashboard
    updateClientListOutlet();

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
      frequency: oscUsers[socketId].frequency || 440,
      amplitude: oscUsers[socketId].amplitude || 0.5,
      attackTime: oscUsers[socketId].attackTime || 0.1,
      decayTime: oscUsers[socketId].decayTime || 0.1,
      sustainLevel: oscUsers[socketId].sustainLevel || 0.5,
      frequencySmoothing: oscUsers[socketId].frequencySmoothing || 0.1,
      amplitudeSmoothing: oscUsers[socketId].amplitudeSmoothing || 0.1,
      adsOn: oscUsers[socketId].adsOn || false,
      waveform: oscUsers[socketId].waveform || "sine",
      customWaveform: oscUsers[socketId].customWaveform || null,
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
  console.log("=== DEBUG INFO ===");
  console.log("Debug Mode:", debugMode);
  console.log("OSC Clients:", Object.keys(oscUsers));
  console.log("All Clients:", Object.keys(users));
  console.log("OSC Client Count:", oscClientCount);
  console.log("All Client Count:", allClientCount);
  console.log("Available Waveforms:", Object.keys(WAVEFORM_TYPES));

  // Send debug info to Max
  maxApi.outlet("debug", {
    debugMode: debugMode,
    oscClients: Object.keys(oscUsers),
    oscCount: oscClientCount,
    allCount: allClientCount,
    waveformTypes: Object.keys(WAVEFORM_TYPES),
  });

  return { debugMode, oscCount: oscClientCount, allCount: allClientCount };
});

// Update your parameter emission function to work with OSC-specific targeting
function emitParamToOSC(param, value, clientId) {
  if (clientId && oscUsers[clientId]) {
    io.to(clientId).emit(param, value);
  } else {
    // Emit to all OSC clients
    Object.keys(oscUsers).forEach((socketId) => {
      io.to(socketId).emit(param, value);
    });
  }
}

// Enhanced OSC-specific parameter handler
maxApi.addHandler("setOSCParameter", (param, value, clientId) => {
  // Validate waveform parameter
  if (param === "waveform" && !WAVEFORM_TYPES[value]) {
    console.log(`Invalid waveform type: ${value}`);
    maxApi.outlet("error", `Invalid waveform type: ${value}`);
    return false;
  }

  // Update global default if no clientId
  if (!clientId) defaultParams[param] = value;

  // Update specific client data if clientId provided
  if (clientId && oscUsers[clientId]) {
    oscUsers[clientId][param] = value;
  } else {
    // Update all OSC users
    Object.keys(oscUsers).forEach((socketId) => {
      oscUsers[socketId][param] = value;
    });
  }

  // Emit only to OSC clients
  emitParamToOSC(param, value, clientId);

  // Update web dashboard
  updateClientListOutlet();

  console.log(
    `OSC Parameter "${param}" set to ${value} ${clientId ? `for OSC client ${clientId}` : "for all OSC clients"}`,
  );
  return true;
});

// ===== Routes =====
app.get("/osc.html", (req, res) => {
  res.sendFile(__dirname + "/osc.html");
});

app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));

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

  // Send initial params including waveform
  Object.entries(defaultParams).forEach(([param, value]) => {
    socket.emit(param, value);
  });
  socket.emit("setUserId", userId);
  socket.emit("clientType", isOSCClient ? "osc" : "regular");

  // Send available waveform types
  socket.emit("waveformTypes", Object.keys(WAVEFORM_TYPES));

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
}, 5000); // Update every 5 seconds

app.use(express.static(__dirname));

server.listen(8000, () =>
  console.log("Server running on http://localhost:8000"),
);
