#!/usr/bin/env node
//
// make_qr_watch_ip.js
// Usage:
//   node make_qr_watch_ip.js [port] [path] [interval_ms]
// Examples:
//   node make_qr_watch_ip.js
//   node make_qr_watch_ip.js 8000 osc.html 5000
//

const os = require("os");
const QRCode = require("qrcode");
const maxApi = require("max-api");

// positional args
const argv = process.argv.slice(2);
if (argv[0] === "-h" || argv[0] === "--help" || argv[0] === "help") {
  console.log("Usage: node make_qr_watch_ip.js [port] [path] [interval_ms]");
  process.exit(0);
}
const port = argv[0] ? Number(argv[0]) : 8000;
const rawPath = argv[1] ? String(argv[1]) : "";
const intervalMs = argv[2] ? Math.max(500, Number(argv[2])) : 3000;

function normalizePath(p) {
  if (!p) return "";
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

async function generate(url, outPng = "../../assets/qr.png") {
  try {
    await QRCode.toFile(outPng, url, { errorCorrectionLevel: "quartile" });
    console.log(new Date().toISOString(), `Saved: ${outPng}`);
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
      maxApi.outlet("bang");
      lastIp = ip;
    }
  }

  // initial run
  await check(true);

  console.log(
    `Watching for IP changes every ${intervalMs} ms (port=${port}, path=${path}). Ctrl+C to stop.`,
  );
  setInterval(() => {
    check(false).catch((err) => console.error("Watcher error:", err));
  }, intervalMs);
})();
