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
        amplitude: user.amplitude || 0.5,
        attackTime: user.attackTime || 0.1,
        decayTime: user.decayTime || 0.1,
        sustainLevel: user.sustainLevel || 0.5,
        frequencySmoothing: user.frequencySmoothing || 0.1,
        amplitudeSmoothing: user.amplitudeSmoothing || 0.1,
        adsOn: user.adsOn || false
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


// Handler to manually request client list update
maxApi.addHandler("refreshClientList", () => {
    updateClientListOutlet();
});

// Enhanced getClients handler
maxApi.addHandler("getClients", () => {
    updateClientListOutlet();
    return Object.keys(oscUsers);
});

// Get users as object
maxApi.addHandler("getUsersObject", () => {
    const usersObject = {};
    Object.entries(oscUsers).forEach(([socketId, userData], index) => {
        const userNumber = index + 1; // Start from 1
        usersObject[userNumber] = {
            socketId: socketId, // Keep original socket ID for reference
            id: userData.id,
            frequency: userData.frequency || 440,
            amplitude: userData.amplitude || 0.5,
            attackTime: userData.attackTime || 0.1,
            decayTime: userData.decayTime || 0.1,
            sustainLevel: userData.sustainLevel || 0.5,
            frequencySmoothing: userData.frequencySmoothing || 0.1,
            amplitudeSmoothing: userData.amplitudeSmoothing || 0.1,
            adsOn: userData.adsOn || false
        };
    });
    
    maxApi.outlet("usersObject", usersObject);
    return usersObject;
});

// Get specific user data by number (1, 2, 3...)
maxApi.addHandler("getUserByNumber", (userNumber) => {
    const socketIds = Object.keys(oscUsers);
    const index = userNumber - 1; // Convert to 0-based index
    
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
            adsOn: oscUsers[socketId].adsOn || false
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
    const index = userNumber - 1; // Convert to 0-based index
    
    if (index >= 0 && index < socketIds.length) {
        const socketId = socketIds[index];
        
        // Update user data
        oscUsers[socketId][param] = value;
        users[socketId][param] = value;
        
        // Emit to specific client
        io.to(socketId).emit(param, value);
        
        // Update dashboard
        updateClientListOutlet();
        
        console.log(`Parameter "${param}" set to ${value} for user ${userNumber} (${socketId})`);
        maxApi.outlet("parameterSet", { userNumber, param, value });
        return true;
    } else {
        console.log(`User ${userNumber} not found`);
        maxApi.outlet("userNotFound", userNumber);
        return false;
    }
});

// Get specific user data
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
            adsOn: oscUsers[socketId].adsOn || false
        };
        
        maxApi.outlet("userData", userData);
        maxApi.outlet("userFound", socketId);
        return userData;
    } else {
        maxApi.outlet("userNotFound", socketId);
        return null;
    }
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

app.get("/", (req, res) => res.sendFile(__dirname + "/control.html"));

// ===== Socket connection =====
io.on("connection", (socket) => {
    // Get the referer to determine which page the client came from
    const referer = socket.handshake.headers.referer;
    const isOSCClient = referer && referer.includes('/osc.html');
    
    // Assign session ID / user ID
    let sessionId = socket.handshake.headers.cookie?.split(";").find(c => c.trim().startsWith("oscSession="))?.split("=")[1] || uuidv4();
    let userId = sessionId;
    userSessions[sessionId] = { userId, timestamp: Date.now() };
    
    const userData = { id: userId, isOSCClient, ...defaultParams };
    users[socket.id] = userData;
    
    // Only add to oscUsers if they're from osc.html
    if (isOSCClient) {
        oscUsers[socket.id] = userData;
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