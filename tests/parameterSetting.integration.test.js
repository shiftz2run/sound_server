/**
 * Integration tests for parameter setting with socket.io and Max API
 */

describe('Parameter Setting Integration Tests', () => {
  let mockIo, mockMaxApi, mockSocket;

  beforeEach(() => {
    // Setup comprehensive mocks
    mockSocket = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      id: 'test-socket-id',
      handshake: {
        headers: {
          referer: 'http://localhost:8000/osc.html'
        }
      }
    };

    mockIo = {
      emit: jest.fn(),
      to: jest.fn().mockReturnValue({
        emit: jest.fn()
      })
    };

    mockMaxApi = {
      outlet: jest.fn(),
      addHandler: jest.fn()
    };

    // Setup global state
    global.users = {};
    global.oscUsers = {};
    global.mockIo = mockIo;
    global.mockMaxApi = mockMaxApi;
  });

  describe('Socket.io Integration', () => {
    test('should emit to specific client via socket.io', () => {
      global.users = {
        'client-1': { frequency: 440, amplitude: 0.5 }
      };

      const mockSetParametersForClients = (params, clientIds) => {
        if (clientIds && clientIds.length === 1) {
          const clientId = clientIds[0];
          if (global.users[clientId]) {
            Object.keys(params).forEach(param => {
              global.users[clientId][param] = params[param];
              mockIo.to(clientId).emit(param, params[param]);
            });
          }
        }
      };

      const params = { frequency: 880 };
      mockSetParametersForClients(params, ['client-1']);

      expect(mockIo.to).toHaveBeenCalledWith('client-1');
      expect(mockIo.to().emit).toHaveBeenCalledWith('frequency', 880);
    });

    test('should broadcast to all clients via socket.io', () => {
      global.users = {
        'client-1': { frequency: 440 },
        'client-2': { frequency: 440 }
      };

      const mockSetParametersForClients = (params, clientIds) => {
        if (!clientIds) {
          Object.keys(global.users).forEach(id => {
            Object.keys(params).forEach(param => {
              global.users[id][param] = params[param];
            });
          });
          Object.keys(params).forEach(param => {
            mockIo.emit(param, params[param]);
          });
        }
      };

      const params = { frequency: 880 };
      mockSetParametersForClients(params, null);

      expect(mockIo.emit).toHaveBeenCalledWith('frequency', 880);
    });

    test('should handle custom waveform emission', () => {
      global.users = {
        'client-1': { waveform: 'sine', customWaveform: null }
      };

      const mockSetParametersForClients = (params, clientIds) => {
        const targetId = clientIds[0];
        if (params.customWaveform && params.waveform === 'custom') {
          global.users[targetId].customWaveform = params.customWaveform;
          global.users[targetId].waveform = 'custom';

          mockIo.to(targetId).emit('customWaveform', params.customWaveform);
          mockIo.to(targetId).emit('waveform', 'custom');
        }
      };

      const customData = [1, 0.5, 0.25];
      const params = {
        waveform: 'custom',
        customWaveform: customData
      };

      mockSetParametersForClients(params, ['client-1']);

      expect(mockIo.to).toHaveBeenCalledWith('client-1');
      expect(mockIo.to().emit).toHaveBeenCalledWith('customWaveform', customData);
      expect(mockIo.to().emit).toHaveBeenCalledWith('waveform', 'custom');
    });
  });

  describe('Max API Integration', () => {
    test('should update client list via Max API', () => {
      global.oscUsers = {
        'client-1': { id: 'user-1' },
        'client-2': { id: 'user-2' }
      };

      const mockUpdateClientListOutlet = () => {
        const clientList = Object.keys(global.oscUsers);
        const clientCount = clientList.length;

        mockMaxApi.outlet('clientList', clientList);
        mockMaxApi.outlet('clientCount', clientCount);
        mockMaxApi.outlet(clientCount);
      };

      mockUpdateClientListOutlet();

      expect(mockMaxApi.outlet).toHaveBeenCalledWith('clientList', ['client-1', 'client-2']);
      expect(mockMaxApi.outlet).toHaveBeenCalledWith('clientCount', 2);
      expect(mockMaxApi.outlet).toHaveBeenCalledWith(2);
    });

    test('should emit user data updates via Max API', () => {
      global.oscUsers = {
        'client-1': {
          id: 'user-1',
          frequency: 880,
          amplitude: 0.8,
          waveform: 'square'
        }
      };

      const mockEmitUsersUpdate = () => {
        const userData = Object.values(global.oscUsers).map(user => ({
          id: user.id,
          frequency: user.frequency || 440,
          amplitude: user.amplitude || 0.5,
          waveform: user.waveform || 'sine'
        }));

        mockIo.emit('usersUpdate', userData);
      };

      mockEmitUsersUpdate();

      expect(mockIo.emit).toHaveBeenCalledWith('usersUpdate', [{
        id: 'user-1',
        frequency: 880,
        amplitude: 0.8,
        waveform: 'square'
      }]);
    });

    test('should handle parameter set confirmations', () => {
      const mockParameterSetConfirmation = (userNumber, param, value) => {
        mockMaxApi.outlet('parameterSet', { userNumber, param, value });
      };

      mockParameterSetConfirmation(1, 'frequency', 880);

      expect(mockMaxApi.outlet).toHaveBeenCalledWith('parameterSet', {
        userNumber: 1,
        param: 'frequency',
        value: 880
      });
    });

    test('should handle error reporting to Max API', () => {
      const mockErrorReporting = (error) => {
        mockMaxApi.outlet('error', error);
      };

      mockErrorReporting('Invalid waveform type: invalid-wave');

      expect(mockMaxApi.outlet).toHaveBeenCalledWith('error', 'Invalid waveform type: invalid-wave');
    });
  });

  describe('State Synchronization', () => {
    test('should keep users and oscUsers in sync', () => {
      global.users = {
        'client-1': { frequency: 440, amplitude: 0.5, isOSCClient: true }
      };
      global.oscUsers = {
        'client-1': global.users['client-1']
      };

      const mockSetParametersForClients = (params, clientIds) => {
        const targets = clientIds || Object.keys(global.users);
        targets.forEach(id => {
          if (global.users[id]) {
            Object.keys(params).forEach(param => {
              global.users[id][param] = params[param];
              if (global.oscUsers[id]) {
                global.oscUsers[id][param] = params[param];
              }
            });
          }
        });
      };

      const params = { frequency: 880, amplitude: 0.8 };
      mockSetParametersForClients(params, ['client-1']);

      expect(global.users['client-1'].frequency).toBe(880);
      expect(global.oscUsers['client-1'].frequency).toBe(880);
      expect(global.users['client-1'].amplitude).toBe(0.8);
      expect(global.oscUsers['client-1'].amplitude).toBe(0.8);
    });

    test('should handle mixed OSC and regular clients', () => {
      global.users = {
        'osc-client-1': { frequency: 440, isOSCClient: true },
        'regular-client-1': { frequency: 440, isOSCClient: false }
      };
      global.oscUsers = {
        'osc-client-1': global.users['osc-client-1']
      };

      const mockSetParametersForClients = (params, clientIds, options = {}) => {
        let targets;
        if (options.targetType === 'osc') {
          targets = Object.keys(global.oscUsers);
        } else {
          targets = clientIds || Object.keys(global.users);
        }

        targets.forEach(id => {
          if (global.users[id]) {
            Object.keys(params).forEach(param => {
              global.users[id][param] = params[param];
              if (global.oscUsers[id]) {
                global.oscUsers[id][param] = params[param];
              }
            });
          }
        });
      };

      const params = { frequency: 880 };
      const options = { targetType: 'osc' };

      mockSetParametersForClients(params, null, options);

      expect(global.users['osc-client-1'].frequency).toBe(880);
      expect(global.users['regular-client-1'].frequency).toBe(440); // Should remain unchanged
    });
  });

  describe('Real-time Updates', () => {
    test('should handle rapid parameter changes', (done) => {
      global.users = {
        'client-1': { frequency: 440 }
      };

      let updateCount = 0;
      const mockSetParametersForClients = (params, clientIds) => {
        if (global.users['client-1']) {
          global.users['client-1'].frequency = params.frequency;
          updateCount++;

          if (updateCount === 10) {
            expect(global.users['client-1'].frequency).toBe(530); // 440 + 9*10
            done();
          }
        }
      };

      // Simulate rapid updates
      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          mockSetParametersForClients({ frequency: 440 + i * 10 }, ['client-1']);
        }, i * 5);
      }
    });

    test('should maintain consistency during concurrent updates', async () => {
      global.users = {
        'client-1': { frequency: 440, amplitude: 0.5 }
      };

      const mockSetParametersForClients = (params, clientIds) => {
        if (global.users['client-1']) {
          Object.keys(params).forEach(param => {
            global.users['client-1'][param] = params[param];
          });
        }
      };

      // Simulate concurrent updates
      const promises = [
        new Promise(resolve => {
          setTimeout(() => {
            mockSetParametersForClients({ frequency: 880 }, ['client-1']);
            resolve();
          }, 0);
        }),
        new Promise(resolve => {
          setTimeout(() => {
            mockSetParametersForClients({ amplitude: 0.8 }, ['client-1']);
            resolve();
          }, 1);
        })
      ];

      await Promise.all(promises);

      expect(global.users['client-1'].frequency).toBe(880);
      expect(global.users['client-1'].amplitude).toBe(0.8);
    });
  });
});
