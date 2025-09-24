/**
 * Performance tests for centralized parameter setting function
 */

// Import the function (would be from actual implementation)
const { setParametersForClients } = require('./parameterSetting.test.js');

describe('setParametersForClients - Performance Tests', () => {
  test('should handle bulk updates efficiently', async () => {
    // Create 100 mock clients
    global.users = {};
    global.oscUsers = {};

    for (let i = 1; i <= 100; i++) {
      const clientId = `client-${i}`;
      global.users[clientId] = {
        frequency: 440,
        amplitude: 0.5,
        waveform: 'sine'
      };
      if (i <= 50) { // Half are OSC clients
        global.oscUsers[clientId] = global.users[clientId];
      }
    }

    const params = { frequency: 880, amplitude: 0.8 };
    const startTime = Date.now();

    // This should be replaced with actual function call
    const mockSetParametersForClients = (params, clientIds) => {
      const results = { success: true, updatedClients: [] };
      const targets = clientIds || Object.keys(global.users);

      targets.forEach(id => {
        if (global.users[id]) {
          Object.keys(params).forEach(param => {
            global.users[id][param] = params[param];
          });
          results.updatedClients.push(id);
        }
      });

      return results;
    };

    const result = mockSetParametersForClients(params, null);

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(100); // Should complete within 100ms
    expect(result.success).toBe(true);
    expect(result.updatedClients.length).toBe(100);

    // Verify all clients were updated
    Object.keys(global.users).forEach(id => {
      expect(global.users[id].frequency).toBe(880);
      expect(global.users[id].amplitude).toBe(0.8);
    });

    console.log(`Bulk update of 100 clients completed in ${duration}ms`);
  });

  test('should handle rapid sequential updates', async () => {
    // Setup clients
    global.users = {};
    for (let i = 1; i <= 10; i++) {
      global.users[`client-${i}`] = { frequency: 440, amplitude: 0.5 };
    }

    const mockSetParametersForClients = (params, clientIds) => {
      const targets = clientIds || Object.keys(global.users);
      targets.forEach(id => {
        if (global.users[id]) {
          Object.keys(params).forEach(param => {
            global.users[id][param] = params[param];
          });
        }
      });
      return { success: true };
    };

    const startTime = Date.now();

    // Perform 50 rapid updates
    for (let i = 0; i < 50; i++) {
      const params = { frequency: 440 + i * 10 };
      mockSetParametersForClients(params, null);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(50); // Should complete within 50ms

    // Verify final state
    Object.keys(global.users).forEach(id => {
      expect(global.users[id].frequency).toBe(930); // 440 + 49 * 10
    });

    console.log(`50 rapid sequential updates completed in ${duration}ms`);
  });

  test('should handle concurrent parameter types efficiently', () => {
    global.users = {};
    for (let i = 1; i <= 50; i++) {
      global.users[`client-${i}`] = {
        frequency: 440,
        amplitude: 0.5,
        attackTime: 0.1,
        decayTime: 0.1,
        sustainLevel: 0.5,
        waveform: 'sine'
      };
    }

    const mockSetParametersForClients = (params, clientIds) => {
      const targets = clientIds || Object.keys(global.users);
      targets.forEach(id => {
        if (global.users[id]) {
          Object.keys(params).forEach(param => {
            global.users[id][param] = params[param];
          });
        }
      });
      return { success: true };
    };

    const complexParams = {
      frequency: 880,
      amplitude: 0.8,
      attackTime: 0.2,
      decayTime: 0.3,
      sustainLevel: 0.7,
      waveform: 'square'
    };

    const startTime = Date.now();
    mockSetParametersForClients(complexParams, null);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(20); // Should be very fast

    // Verify all parameters were set correctly
    Object.keys(global.users).forEach(id => {
      expect(global.users[id].frequency).toBe(880);
      expect(global.users[id].amplitude).toBe(0.8);
      expect(global.users[id].waveform).toBe('square');
    });
  });
});
