// Client-side parameter socket listeners generator
// This mirrors the server-side parameterMaxHandlers.js approach

function registerSocketParameterListeners(socket, oscillator) {
  // Get parameter list from server
  socket.emit("getParameterSchema");

  socket.on("parameterSchema", (parameterSchema) => {
    // Auto-generate all socket listeners based on parameter schema
    Object.keys(parameterSchema).forEach((param) => {
      socket.on(param, (value) => {
        if (oscillator) {
          const setterName = `set${capitalize(param)}`;
          if (typeof oscillator[setterName] === "function") {
            oscillator[setterName](value);
            console.log(`${param} set to:`, value);
          } else {
            console.warn(`No setter method found for parameter: ${param}`);
          }
        }
      });
    });

    // Add bulk parameter update listener
    socket.on("setParameters", (parameters) => {
      if (oscillator && typeof parameters === "object") {
        console.log("Bulk parameter update received:", parameters);

        // Use the optimized updateParameters method if available
        if (typeof oscillator.updateParameters === "function") {
          oscillator.updateParameters(parameters);
        } else {
          // Fallback to individual parameter setting
          Object.entries(parameters).forEach(([param, value]) => {
            const setterName = `set${capitalize(param)}`;
            if (typeof oscillator[setterName] === "function") {
              oscillator[setterName](value);
            } else {
              console.warn(`No setter method found for parameter: ${param}`);
            }
          });
        }

        console.log("Bulk update applied successfully");
      }
    });

    console.log(
      "Auto-generated socket listeners for parameters:",
      Object.keys(parameterSchema),
    );
  });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Register additional non-parameter socket listeners
function registerAdditionalSocketListeners(socket, oscillator) {
  socket.on("setUserId", (id) => {
    userId = id;
    console.log("User ID set to:", userId);
  });

  socket.on("clientType", (type) => {
    console.log("Client type:", type);
  });

  socket.on("noteOn", () => {
    console.log("Note on trigger");
    if (oscillator) {
      oscillator.triggerNote();
    }
  });

  socket.on("connect", () => {
    console.log("Connected to server");
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server");
  });
}
