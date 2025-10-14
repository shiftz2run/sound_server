#!/usr/bin/env node
//
// qrcodegen.js
// Usage:
//   node qrcodegen.js <port> <path> <output_file> [interval_ms]
// Examples:
//   node qrcodegen.js 8000 /index.html ../../assets/qr_osc.png 3000
//   node qrcodegen.js 8001 none ../../assets/qr_control.png 5000
//

const os = require("os");
const QRCode = require("qrcode");
const maxApi = require("max-api");

// positional args - robust parsing for Max MSP compatibility
const argv = process.argv.slice(2);

// Debug logging
console.log("Full process.argv:", process.argv);
console.log("Arguments received:", argv);

// Help
if (argv[0] === "-h" || argv[0] === "--help" || argv[0] === "help") {
  console.log(
    "Usage: node qrcodegen.js [port] [path] [output_file] [interval_ms]",
  );
  console.log("  port: Server port number (default: 8000)");
  console.log("  path: URL path or 'none' for no path (default: 'index.html')");
  console.log(
    "  output_file: Output PNG file path (default: '../../assets/qr.png')",
  );
  console.log("  interval_ms: IP check interval in ms (default: 3000)");
  console.log("\nMax MSP Usage:");
  console.log(
    "  With autostart: @autostart 1 @args 8000 /index.html qr.png 3000",
  );
  console.log("  Manual start: [script start 8000 /index.html qr.png 3000]");
  process.exit(0);
}

// Parse with defaults (allows script to work even if args not passed from Max)
let port = argv[0] ? Number(argv[0]) : 8000;
const rawPath = argv[1] ? String(argv[1]) : "index.html";
const outputFile = argv[2] ? String(argv[2]) : "../../assets/qr.png";
const intervalMs = argv[3] ? Math.max(500, Number(argv[3])) : 3000;

// Validate port
if (isNaN(port) || port <= 0 || port > 65535) {
  console.error("Error: Invalid port number:", argv[0]);
  console.error("Using default port 8000");
  port = 8000;
}

// Log configuration
console.log("=== QR Code Generator Configuration ===");
console.log("Port:", port);
console.log("Path:", rawPath);
console.log("Output:", outputFile);
console.log("Interval:", intervalMs, "ms");
console.log("======================================");

function normalizePath(p) {
  if (!p || p.trim() === "" || p.toLowerCase() === "none") {
    return "";
  }
  return p.startsWith("/") ? p : "/" + p;
}

function getLocalIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (
        net.family === "IPv4" &&
        !net.internal &&
        net.address !== "127.0.0.1"
      ) {
        return net.address;
      }
    }
  }
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4") return net.address;
    }
  }
  return null;
}

async function generate(url) {
  try {
    await QRCode.toFile(outputFile, url, { errorCorrectionLevel: "quartile" });
    console.log(new Date().toISOString(), `Saved: ${outputFile}`);
    // Output bang to Max MSP to trigger QR image reload
    maxApi.outlet("bang");
  } catch (err) {
    console.error("Failed to write PNG:", err);
  }

  try {
    const term = await QRCode.toString(url, { type: "terminal", small: true });
    console.log("\nURL:", url, "\n");
    // console.log(term);
  } catch (err) {
    console.error("Failed to print terminal QR:", err);
  }
}

(async function main() {
  const path = normalizePath(rawPath);
  let lastIp = null;

  function buildUrl(ip) {
    return `http://${ip}:${port}${path}`;
  }

  async function check(force = false) {
    const ip = getLocalIPv4();
    if (!ip) {
      console.warn(new Date().toISOString(), "No IPv4 address detected");
      return;
    }

    if (force || ip !== lastIp) {
      const url = buildUrl(ip);
      console.log(new Date().toISOString(), `Detected IP: ${ip}`);
      await generate(url);
      lastIp = ip;
    }
  }

  // Max API handler for manual refresh
  maxApi.addHandler("bang", async () => {
    console.log(new Date().toISOString(), "Manual refresh triggered");
    await check(true);
  });

  // initial run
  await check(true);

  console.log(
    `Watching for IP changes every ${intervalMs} ms (port=${port}, path=${path}, output=${outputFile}). Ctrl+C to stop.`,
  );
  setInterval(() => {
    check(false).catch((err) => console.error("Watcher error:", err));
  }, intervalMs);
})();
