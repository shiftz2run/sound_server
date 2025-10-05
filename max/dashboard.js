// dashboard.js - v8ui client overview dashboard
// Displays connected clients and their parameter states in real-time

// Initialize mgraphics
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

// Dashboard state
let clients = [];
let clientCount = 0;
let scrollOffset = 0; // Vertical scroll offset
let isDraggingScrollbar = false;
let dragStartY = 0;
let dragStartScrollOffset = 0;

// Layout constants
const PADDING = 10;
const HEADER_HEIGHT = 40;
const CLIENT_CARD_HEIGHT = 120;
const CLIENT_CARD_MARGIN = 5;
const SCROLL_SPEED = 60; // Pixels per scroll wheel tick
const SCROLLBAR_WIDTH = 8;
const SCROLLBAR_MARGIN = 4;

// Color scheme
const COLORS = {
  background: [0.1, 0.1, 0.12, 1.0],
  header: [0.15, 0.15, 0.17, 1.0],
  card: [0.2, 0.2, 0.22, 1.0],
  cardActive: [0.25, 0.35, 0.25, 1.0], // Greenish tint for active clients
  cardDisconnected: [0.22, 0.15, 0.13, 1.0], // Reddish-brown for disconnected clients
  text: [0.9, 0.9, 0.9, 1.0],
  textDim: [0.6, 0.6, 0.6, 1.0],
  textDisconnected: [0.4, 0.4, 0.4, 1.0], // Dimmer text for disconnected
  accent: [0.3, 0.6, 0.9, 1.0],
  meter: [0.2, 0.8, 0.4, 1.0],
  meterBg: [0.15, 0.15, 0.17, 1.0],
  scrollbar: [0.4, 0.4, 0.45, 0.8],
  scrollbarBg: [0.15, 0.15, 0.17, 0.5],
  activeIndicator: [0.2, 0.9, 0.3, 1.0], // Bright green for active status
  disconnectedIndicator: [0.8, 0.3, 0.3, 1.0], // Red for disconnected
};

// Handle incoming data from Max
function anything() {
  const args = arrayfromargs(arguments);
  if (args.length === 0) return;

  try {
    // maxApi.outlet sends objects as dictionaries
    // First arg is either "dictionary" + name, or just the dict name string (starts with 'u')
    let dictName = null;

    if (args[0] === "dictionary" && args.length > 1) {
      dictName = args[1];
    } else if (typeof args[0] === "string" && args[0].startsWith("u")) {
      dictName = args[0];
    }

    if (dictName) {
      const dict = new Dict(dictName);
      const jsonString = dict.stringify();
      const data = JSON.parse(jsonString);

      // The data is an object with index as key
      if (data && typeof data === "object" && !Array.isArray(data)) {
        // Convert object to array with index property
        clients = Object.keys(data).map((index) => ({
          index: parseInt(index),
          ...data[index],
        }));
      } else if (Array.isArray(data)) {
        // Fallback: if it's already an array
        clients = data;
      } else {
        clients = [];
      }
    } else {
      // Data comes as direct arguments
      clients = parseClientData(args);
    }

    clientCount = Array.isArray(clients) ? clients.length : 0;
    mgraphics.redraw();
  } catch (e) {
    post("Dashboard error:", e.toString(), "\n");
  }
}

// Parse client data from Max arguments (fallback, not typically used)
function parseClientData(args) {
  if (args.length >= 1 && typeof args[0] === "number") {
    // Server sends: count, user1, user2, user3...
    const userObjects = args.slice(1);
    return userObjects.filter(
      (obj) => typeof obj === "object" && obj !== null && "id" in obj,
    );
  }

  // Fallback: if args is already an array of objects with id property
  if (
    args.length > 0 &&
    typeof args[0] === "object" &&
    args[0] !== null &&
    "id" in args[0]
  ) {
    return args;
  }

  return [];
}

// Main paint function
function paint() {
  const width = box.rect[2] - box.rect[0];
  const height = box.rect[3] - box.rect[1];

  // Clear background
  setColor(COLORS.background);
  mgraphics.rectangle(0, 0, width, height);
  mgraphics.fill();

  // Draw clients first
  drawClients(width, height);

  // Draw scrollbar
  drawScrollbar(width, height);

  // Draw header on top to prevent overlap
  drawHeader(width);
}

// Draw header with client count
function drawHeader(width) {
  // Header background
  setColor(COLORS.header);
  mgraphics.rectangle(0, 0, width, HEADER_HEIGHT);
  mgraphics.fill();

  // Title
  setColor(COLORS.text);
  mgraphics.select_font_face("Arial Bold");
  mgraphics.set_font_size(18);
  mgraphics.move_to(PADDING, 25);
  mgraphics.show_text("Connected Clients: " + clientCount);
}

// Draw all client cards
function drawClients(width, height) {
  if (!Array.isArray(clients) || clients.length === 0) {
    // No clients message
    setColor(COLORS.textDim);
    mgraphics.select_font_face("Arial");
    mgraphics.set_font_size(14);
    mgraphics.move_to(PADDING, HEADER_HEIGHT + 40);
    mgraphics.show_text("No clients connected");
    return;
  }

  // Calculate total content height
  const totalContentHeight =
    clients.length * (CLIENT_CARD_HEIGHT + CLIENT_CARD_MARGIN);
  const maxScroll = Math.max(
    0,
    totalContentHeight - (height - HEADER_HEIGHT - PADDING),
  );

  // Clamp scroll offset
  scrollOffset = Math.max(0, Math.min(scrollOffset, maxScroll));

  let yPos = HEADER_HEIGHT + PADDING - scrollOffset;

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];

    // Check if card is visible in viewport (accounting for scroll)
    if (yPos + CLIENT_CARD_HEIGHT > HEADER_HEIGHT && yPos < height) {
      drawClientCard(client, PADDING, yPos, width - PADDING * 2);
    }

    yPos += CLIENT_CARD_HEIGHT + CLIENT_CARD_MARGIN;
  }
}

// Draw scrollbar
function drawScrollbar(width, height) {
  if (!Array.isArray(clients) || clients.length === 0) return;

  const totalContentHeight =
    clients.length * (CLIENT_CARD_HEIGHT + CLIENT_CARD_MARGIN);
  const viewportHeight = height - HEADER_HEIGHT - PADDING;

  // Only show scrollbar if content is larger than viewport
  if (totalContentHeight <= viewportHeight) return;

  const maxScroll = totalContentHeight - viewportHeight;
  const scrollbarHeight = Math.max(
    30,
    (viewportHeight / totalContentHeight) * viewportHeight,
  );
  const scrollbarY =
    HEADER_HEIGHT +
    (scrollOffset / maxScroll) * (viewportHeight - scrollbarHeight);
  const scrollbarX = width - SCROLLBAR_WIDTH - SCROLLBAR_MARGIN;

  // Scrollbar background track
  setColor(COLORS.scrollbarBg);
  mgraphics.rectangle(
    scrollbarX,
    HEADER_HEIGHT,
    SCROLLBAR_WIDTH,
    viewportHeight,
  );
  mgraphics.fill();

  // Scrollbar thumb
  setColor(COLORS.scrollbar);
  mgraphics.rectangle(scrollbarX, scrollbarY, SCROLLBAR_WIDTH, scrollbarHeight);
  mgraphics.fill();
}

// Draw individual client card
function drawClientCard(client, x, y, width) {
  const isActive = Boolean(client.active);
  const isConnected = Boolean(client.connected); // Convert 0/1 to boolean

  // Card background - different colors for connected/active states
  let cardColor = COLORS.card;
  if (!isConnected) {
    cardColor = COLORS.cardDisconnected;
  } else if (isActive) {
    cardColor = COLORS.cardActive;
  }

  setColor(cardColor);
  mgraphics.rectangle(x, y, width, CLIENT_CARD_HEIGHT);
  mgraphics.fill();

  // Status indicator (dot in top-right corner)
  if (!isConnected) {
    setColor(COLORS.disconnectedIndicator);
    mgraphics.ellipse(x + width - 15, y + 10, 8, 8);
    mgraphics.fill();
  } else if (isActive) {
    setColor(COLORS.activeIndicator);
    mgraphics.ellipse(x + width - 15, y + 10, 8, 8);
    mgraphics.fill();
  }

  // Client index - prominently displayed
  const textColor = isConnected ? COLORS.text : COLORS.textDisconnected;
  setColor(textColor);
  mgraphics.select_font_face("Arial Bold");
  mgraphics.set_font_size(14);
  mgraphics.move_to(x + 10, y + 20);
  const displayIndex = client.index !== undefined ? "#" + client.index : "?";
  const statusText = !isConnected ? " (disconnected)" : "";
  mgraphics.show_text(displayIndex + statusText);

  // Frequency
  const freqY = y + 40;
  drawParameter(
    x + 10,
    freqY,
    width - 20,
    "Frequency",
    client.frequency || 0,
    0,
    20000,
    "Hz",
  );

  // Amplitude
  const ampY = y + 65;
  drawParameter(
    x + 10,
    ampY,
    width - 20,
    "Amplitude",
    client.amplitude || 0,
    0,
    1,
    "",
  );

  // Waveform and ADS status
  const statusY = y + 90;
  setColor(COLORS.textDim);
  mgraphics.select_font_face("Arial");
  mgraphics.set_font_size(10);
  mgraphics.move_to(x + 10, statusY);
  const waveform = client.waveform || "sine";
  const adsStatus = client.adsOn ? "ON" : "OFF";
  const adsMode = client.adsTriggerMode || "manual";
  mgraphics.show_text(
    "Wave: " + waveform + " | ADS: " + adsStatus + " (" + adsMode + ")",
  );

  // Envelope info
  const envY = y + 105;
  mgraphics.move_to(x + 10, envY);
  const attack = (client.attackTime || 0).toFixed(0);
  const decay = (client.decayTime || 0).toFixed(0);
  const sustain = (client.sustainLevel || 0).toFixed(2);
  mgraphics.show_text("Env: A=" + attack + "ms D=" + decay + "ms S=" + sustain);
}

// Draw parameter with bar visualization
function drawParameter(x, y, width, label, value, min, max, unit) {
  // Label
  setColor(COLORS.textDim);
  mgraphics.select_font_face("Arial");
  mgraphics.set_font_size(10);
  mgraphics.move_to(x, y);
  mgraphics.show_text(label + ":");

  // Value text
  const valueText = value.toFixed(2) + (unit ? " " + unit : "");
  const textWidth = 100; // Approximate width for value
  mgraphics.move_to(x + width - textWidth, y);
  setColor(COLORS.text);
  mgraphics.show_text(valueText);

  // Bar background
  const barX = x + 80;
  const barWidth = width - textWidth - 90;
  const barHeight = 8;
  const barY = y - 8;

  setColor(COLORS.meterBg);
  mgraphics.rectangle(barX, barY, barWidth, barHeight);
  mgraphics.fill();

  // Bar fill
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const fillWidth = barWidth * normalized;

  setColor(COLORS.meter);
  mgraphics.rectangle(barX, barY, fillWidth, barHeight);
  mgraphics.fill();

  // Bar outline
  setColor(COLORS.accent);
  mgraphics.set_line_width(1);
  mgraphics.rectangle(barX, barY, barWidth, barHeight);
  mgraphics.stroke();
}

// Utility: Set color from array
function setColor(colorArray) {
  mgraphics.set_source_rgba(
    colorArray[0],
    colorArray[1],
    colorArray[2],
    colorArray[3],
  );
}

// Handle resize
function onresize(w, h) {
  mgraphics.redraw();
}

// Handle mouse wheel scrolling
function onwheel(x, y, delta_x, delta_y, modifiers) {
  // Reverse scroll direction: scroll down = content moves up (natural scrolling)
  scrollOffset -= delta_y * SCROLL_SPEED;
  mgraphics.redraw();
}

// Check if mouse is over scrollbar
function isOverScrollbar(x, y) {
  const width = box.rect[2] - box.rect[0];
  const height = box.rect[3] - box.rect[1];

  if (!Array.isArray(clients) || clients.length === 0) return false;

  const totalContentHeight =
    clients.length * (CLIENT_CARD_HEIGHT + CLIENT_CARD_MARGIN);
  const viewportHeight = height - HEADER_HEIGHT - PADDING;

  if (totalContentHeight <= viewportHeight) return false;

  const scrollbarX = width - SCROLLBAR_WIDTH - SCROLLBAR_MARGIN;

  return (
    x >= scrollbarX && x <= scrollbarX + SCROLLBAR_WIDTH && y >= HEADER_HEIGHT
  );
}

// Handle mouse down (start drag)
function onclick(x, y, button, cmd, shift, capslock, option, ctrl) {
  if (isOverScrollbar(x, y)) {
    isDraggingScrollbar = true;
    dragStartY = y;
    dragStartScrollOffset = scrollOffset;
  }
}

// Handle drag scrolling
function ondrag(x, y, dx, dy, button) {
  if (isDraggingScrollbar) {
    const height = box.rect[3] - box.rect[1];
    const totalContentHeight =
      clients.length * (CLIENT_CARD_HEIGHT + CLIENT_CARD_MARGIN);
    const viewportHeight = height - HEADER_HEIGHT - PADDING;
    const maxScroll = totalContentHeight - viewportHeight;

    // Calculate scroll based on drag distance
    // Scale drag distance by content-to-viewport ratio
    const dragDistance = y - dragStartY;
    const scrollRatio = totalContentHeight / viewportHeight;
    scrollOffset = dragStartScrollOffset + dragDistance * scrollRatio;

    // Clamp
    scrollOffset = Math.max(0, Math.min(scrollOffset, maxScroll));

    mgraphics.redraw();
  }
}

// Handle mouse up (end drag)
function onidle(x, y, button, cmd, shift, capslock, option, ctrl) {
  if (isDraggingScrollbar && button === 0) {
    isDraggingScrollbar = false;
  }
}
