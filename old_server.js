1   const express = require("express");
2   const http = require("http");
3   const { Server } = require("socket.io");
4   const { v4: uuidv4 } = require("uuid");
5   const maxApi = require("max-api");
6
7   const app = express();
8   const server = http.createServer(app);
9   const io = new Server(server);
10
11  let users = {}; // { socketId: { id, frequency } }
12
13  // Simple function to pick a random frequency
14  function assignFrequency() {
15    const min = 100;
16    const max = 1000;
17    return Math.floor(Math.random() * (max - min + 1)) + min;
18  }
19
20  // Handle parameters from Max
21  maxApi.addHandler("parameters", (socketId, frequency) => {
22    if (users[socketId]) {
23      users[socketId].frequency = frequency;
24      io.to(socketId).emit("setFrequency", frequency);
25      io.emit("usersUpdate", Object.values(users));
26      maxApi.outlet("connections", Object.keys(users).length);
27    }
28  });
29
30  io.on("connection", (socket) => {
31    console.log("New socket connected:", socket.id);
32
33    // Wait for client to identify itself
34    socket.on("register", (clientType) => {
35      if (clientType === "oscillator") {
36        const frequency = assignFrequency();
37
38        // ===== LINE WHERE ID IS ASSIGNED =====
39        users[socket.id] = { id: socket.id, frequency }; // <--- This is the id assignment
40
41        socket.emit("setFrequency", frequency);
42        io.emit("usersUpdate", Object.values(users));
43        maxApi.outlet("connections", Object.keys(users).length);
44      }
45    });
46
47    // Allow dynamic frequency changes from browser/control panel
48    socket.on("setFrequency", ({ id, frequency }) => {
49      if (users[id]) {
50        users[id].frequency = frequency;
51        io.to(id).emit("setFrequency", frequency);
52        io.emit("usersUpdate", Object.values(users));
53      }
54    });
55
56    socket.on("disconnect", () => {
57      if (users[socket.id]) {
58        console.log(`Oscillator disconnected: ${users[socket.id].id}`);
59        delete users[socket.id];
60        io.emit("usersUpdate", Object.values(users));
61        maxApi.outlet("connections", Object.keys(users).length);
62      }
63    });
64  });
65
66  // Serve static files (osc.html, osc.js, etc.)
67  app.use(express.static(__dirname));
68
69  // Default route serves control panel
70  app.get("/", (req, res) => {
71    res.sendFile(__dirname + "/index.html");
72  });
73
74  server.listen(8000, () => {
75    console.log("Server running on http://localhost:8000");
76  });