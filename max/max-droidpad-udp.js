const dgram = require("dgram");
const maxApi = require("max-api");

// ===== Configuration =====
const DEFAULT_UDP_PORT = 8080;

// Parse command line arguments for custom port
const args = process.argv.slice(2);
let udpPort = DEFAULT_UDP_PORT;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    udpPort = parseInt(args[i + 1], 10);
    if (isNaN(udpPort)) {
      udpPort = DEFAULT_UDP_PORT;
    }
  }
}

// Create UDP socket
const server = dgram.createSocket("udp4");

// Store single DroidPad client for bidirectional communication
let lastClient = null; // { address, port }

// ===== Data Transformation Functions =====

/**
 * Transform DroidPad JSON data to Max-friendly format
 * @param {Object} data - Parsed JSON from DroidPad
 * @returns {Object} - { id, output } where output is the value(s) to send to Max
 */
function transformDroidPadData(data) {
  const { id, type } = data;

  switch (type) {
    case "SWITCH":
      // Switch: true/false → 0/1
      return { id, output: data.state ? 1 : 0 };

    case "BUTTON":
      // Button: PRESS → 1, RELEASE → 0, CLICK → "bang"
      if (data.state === "PRESS") {
        return { id, output: 1 };
      } else if (data.state === "RELEASE") {
        return { id, output: 0 };
      } else if (data.state === "CLICK") {
        return { id, output: "bang" };
      }
      break;

    case "JOYSTICK":
      // Joystick: send as list [x, y]
      return { id, output: [data.x, data.y] };

    case "SLIDER":
      // Slider: send value as-is
      return { id, output: data.value };

    case "DPAD":
      // DPAD: send button and state
      return { id, output: { button: data.button, state: data.state } };

    case "STEERING_WHEEL":
      // Steering wheel: send angle
      return { id, output: data.angle };

    case "ACCELEROMETER":
    case "GYROSCOPE":
      // Sensors: send as list [x, y, z]
      return { id: type.toLowerCase(), output: [data.x, data.y, data.z] };

    default:
      // Unknown type: send all data as dict
      const { id: _id, type: _type, ...rest } = data;
      return { id, output: rest };
  }
}

/**
 * Send data to DroidPad client
 * @param {Object} data - JSON data to send
 */
function sendToDroidPad(data) {
  if (!lastClient) {
    return;
  }

  const message = JSON.stringify(data);
  const buffer = Buffer.from(message);

  server.send(buffer, lastClient.port, lastClient.address, (err) => {
    if (err) {
      console.log(`Error sending to DroidPad: ${err.message}`);
    }
  });
}

/**
 * Helper to validate and send control value to DroidPad
 * @param {string} id - Control ID
 * @param {string} type - Control type
 * @param {string} valueKey - Key name for the value (e.g., "state", "value")
 * @param {*} value - Value to send
 */
function sendControlValue(id, type, valueKey, value) {
  if (!id || value === undefined) {
    return;
  }

  sendToDroidPad({
    id,
    type,
    [valueKey]: value,
  });
}

// ===== UDP Event Handlers =====
server.on("error", (err) => {
  console.log(`UDP server error: ${err.message}`);
  server.close();
});

server.on("message", (msg, rinfo) => {
  try {
    // Store client info for bidirectional communication
    if (
      !lastClient ||
      lastClient.address !== rinfo.address ||
      lastClient.port !== rinfo.port
    ) {
      lastClient = {
        address: rinfo.address,
        port: rinfo.port,
      };
      console.log(`DroidPad client connected: ${rinfo.address}:${rinfo.port}`);
    }

    // Parse incoming JSON message from DroidPad
    const messageStr = msg.toString();
    const data = JSON.parse(messageStr);

    // Transform data to Max-friendly format
    const transformed = transformDroidPadData(data);

    if (!transformed.id) {
      return;
    }

    // Output to Max in format: id value(s)
    if (Array.isArray(transformed.output)) {
      maxApi.outlet(transformed.id, ...transformed.output);
    } else {
      maxApi.outlet(transformed.id, transformed.output);
    }
  } catch (err) {
    console.log(`Error parsing DroidPad message: ${err.message}`);
  }
});

server.on("listening", () => {
  const address = server.address();
  console.log(`DroidPad UDP receiver listening on port ${address.port}`);
  maxApi.outlet("status", {
    listening: true,
    port: address.port,
    address: address.address,
  });
});

// ===== Max API Handlers =====

/**
 * Set LED state on DroidPad
 * Usage from Max: setLED led1 ON
 */
maxApi.addHandler("setLED", (ledId, state) => {
  const validStates = ["ON", "OFF", "BLINK"];
  const upperState = state.toString().toUpperCase();

  if (!validStates.includes(upperState)) {
    return;
  }

  sendControlValue(ledId, "LED", "state", upperState);
});

/**
 * Set SWITCH state on DroidPad
 * Usage from Max: setSwitch switch1 1 (or 0)
 */
maxApi.addHandler("setSwitch", (switchId, state) => {
  const numValue = Number(state);
  if (isNaN(numValue)) {
    return;
  }

  sendControlValue(switchId, "SWITCH", "state", Boolean(numValue));
});

/**
 * Set SLIDER value on DroidPad
 * Usage from Max: setSlider slider1 0.5
 */
maxApi.addHandler("setSlider", (sliderId, value) => {
  const numValue = parseFloat(value);
  if (isNaN(numValue)) {
    return;
  }

  sendControlValue(sliderId, "SLIDER", "value", numValue);
});

/**
 * Set Gauge value on DroidPad
 * Usage from Max: setGauge gauge1 75
 */
maxApi.addHandler("setGauge", (gaugeId, value) => {
  const numValue = parseFloat(value);
  if (isNaN(numValue)) {
    return;
  }

  sendControlValue(gaugeId, "GAUGE", "value", numValue);
});

/**
 * Get UDP port
 */
maxApi.addHandler("getPort", () => {
  const address = server.address();
  if (address) {
    maxApi.outlet("port", address.port);
    return address.port;
  }
  return null;
});

/**
 * Get server status
 */
maxApi.addHandler("getStatus", () => {
  const address = server.address();
  const status = {
    listening: !!address,
    port: address ? address.port : null,
    clientConnected: !!lastClient,
  };
  maxApi.outlet("status", status);
  return status;
});

// ===== Start Server =====
server.bind(udpPort);

// Handle graceful shutdown
process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
