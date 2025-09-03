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

let users = {};       // { socketId: { id, frequency, amplitude, ... } }
let oscUsers = {};    // Only users from /osc.html
let userSessions = {}; // { sessionId: { userId, timestamp } }

// Global default parameters
let defaultParams = {
    frequencySmoothing: 0.1,
    amplitudeSmoothing: 0.1,
    attackTime: 0.1,
    decayTime: 0.1,
    sustainLevel: 0.5,
    adsOn: false,
    frequency: 440,
    amplitude: 0.5
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
    const userData = Object.values(oscUsers).map(user => ({
        id: user.id,
        frequency: user.frequency || 440,
        amplitude: user.amplitude || 0.5
    }));
    
    io.emit("usersUpdate", userData);
    
    console.log(`Client list updated: ${clientCount} OSC clients`, clientList);
    console.log("Sending to Max - clientCount:", clientCount);
    console.log("Sending to Max - clientList:", clientList);
    console.log("Sending to web clients - userData:", userData);
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
        Object.keys(users).forEach(socketId => {
            users[socketId][param] = value;
        });
        Object.keys(oscUsers).forEach(socketId => {
            oscUsers[socketId][param] = value;
        });
    }
    
    // Emit to the right client(s)
    emitParam(param, value, clientId);
    
    // Update web dashboard
    updateClientListOutlet();
    
    console.log(`Parameter "${param}" set to ${value} ${clientId ? `for client ${clientId}` : "for all clients"}`);
});

// Example: parameters array for individual or all
maxApi.addHandler("parameters", (...params) => {
    // params format: [clientId?, amp, freq, attack, decay, sustain]
    let offset = 0;
    let clientId = null;

    if (typeof params[0] === "string") {
        clientId = params[0]; // first arg is client ID
        offset = 1;
    }

    const [amp, freq, attack, decay, sustain] = params.slice(offset);

    if (amp !== undefined) emitParam("setVolume", amp, clientId);
    if (freq !== undefined) emitParam("setFrequency", freq, clientId);
    if (attack !== undefined) emitParam("setAttackTime", attack, clientId);
    if (decay !== undefined) emitParam("setDecayTime", decay, clientId);
    if (sustain !== undefined) emitParam("setSustainLevel", sustain, clientId);
    
    // Update web dashboard after parameter changes
    updateClientListOutlet();
});

// Test handler for Max communication
maxApi.addHandler("ping", () => {
    console.log("PING received in Node.js!");
    maxApi.outlet("pong");
    return "ping received";
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

// Test handler to verify Max communication
maxApi.addHandler("test", () => {
    console.log("Test handler called from Max");
    maxApi.outlet("test", "Max communication working!");
    maxApi.outlet(999); // Send test number
    return "test response";
});

// Debug handler to check current state
maxApi.addHandler("debug", () => {
    const oscClientCount = Object.keys(oscUsers).length;
    const allClientCount = Object.keys(users).length;
    console.log("=== DEBUG INFO ===");
    console.log("OSC Clients:", Object.keys(oscUsers));
    console.log("All Clients:", Object.keys(users));
    console.log("OSC Client Count:", oscClientCount);
    console.log("All Client Count:", allClientCount);
    
    // Send debug info to Max
    maxApi.outlet("debug", {
        oscClients: Object.keys(oscUsers),
        oscCount: oscClientCount,
        allCount: allClientCount
    });
    
    return { oscCount: oscClientCount, allCount: allClientCount };
});

// Update your parameter emission function to work with OSC-specific targeting
function emitParamToOSC(param, value, clientId) {
    if (clientId && oscUsers[clientId]) {
        io.to(clientId).emit(param, value);
    } else {
        // Emit to all OSC clients
        Object.keys(oscUsers).forEach(socketId => {
            io.to(socketId).emit(param, value);
        });
    }
}

// Add OSC-specific parameter handler
maxApi.addHandler("setOSCParameter", (param, value, clientId) => {
    // Update global default if no clientId
    if (!clientId) defaultParams[param] = value;
    
    // Update specific client data if clientId provided
    if (clientId && oscUsers[clientId]) {
        oscUsers[clientId][param] = value;
    } else {
        // Update all OSC users
        Object.keys(oscUsers).forEach(socketId => {
            oscUsers[socketId][param] = value;
        });
    }
    
    // Emit only to OSC clients
    emitParamToOSC(param, value, clientId);
    
    // Update web dashboard
    updateClientListOutlet();
    
    console.log(`OSC Parameter "${param}" set to ${value} ${clientId ? `for OSC client ${clientId}` : "for all OSC clients"}`);
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
    const isOSCClient = referer && referer.includes('/osc.html');
    
    console.log("New connection - Referer:", referer);
    console.log("Is OSC Client:", isOSCClient);
    
    // Assign session ID / user ID
    let sessionId = socket.handshake.headers.cookie?.split(";").find(c => c.trim().startsWith("oscSession="))?.split("=")[1] || uuidv4();
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

    // Send initial params
    Object.entries(defaultParams).forEach(([param, value]) => {
        socket.emit(param, value);
    });
    socket.emit("setUserId", userId);
    socket.emit("clientType", isOSCClient ? "osc" : "regular");

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

server.listen(8000, () => console.log("Server running on http://localhost:8000"));