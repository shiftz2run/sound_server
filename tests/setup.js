// Mock socket.io
const mockSocket = {
  emit: jest.fn(),
  to: jest.fn().mockReturnThis(),
  handshake: {
    headers: {
      referer: "http://localhost:8000/osc.html",
      cookie: "oscSession=test-session-id",
    },
  },
  id: "test-socket-id",
};

const mockIo = {
  emit: jest.fn(),
  to: jest.fn().mockReturnThis(),
};

// Mock max-api
const mockMaxApi = {
  outlet: jest.fn(),
  addHandler: jest.fn(),
};

// Global mocks
global.mockSocket = mockSocket;
global.mockIo = mockIo;
global.mockMaxApi = mockMaxApi;

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();

  // Reset global state
  global.users = {};
  global.oscUsers = {};
  global.userSessions = {};
  global.debugMode = false;
  global.defaultParams = {
    frequencySmoothing: 0,
    amplitudeSmoothing: 0,
    attackTime: 0,
    decayTime: 0,
    sustainLevel: 0.5,
    adsOn: false,
    frequency: 440,
    amplitude: 0.5,
    waveform: "sine",
  };
});
