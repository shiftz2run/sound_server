# Test Suite Documentation

This document provides comprehensive guidance on using the test suite for the sound server's parameter setting functionality.

## Overview

The test suite covers the centralized parameter setting function with three main test categories:
- **Unit Tests**: Core functionality and validation
- **Integration Tests**: Socket.io and Max API interactions
- **Performance Tests**: Load testing and timing benchmarks

## Quick Start

### Prerequisites
- Node.js installed
- Jest test framework (installed via `npm install`)

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (reruns on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test parameterSetting.test.js

# Run specific test suite
npm test -- --testNamePattern="Core Functionality"
```

## Test Structure

```
tests/
├── setup.js                           # Global test setup and mocks
├── parameterSetting.test.js           # Unit tests
├── parameterSetting.integration.test.js # Integration tests
└── parameterSetting.performance.test.js # Performance tests
```

## Test Categories

### 1. Unit Tests (`parameterSetting.test.js`)

Tests the core `setParametersForClients` function in isolation.

**Test Suites:**
- **Core Functionality**: Basic parameter setting operations
- **Parameter Preservation**: Ensuring unchanged parameters remain intact
- **All Clients Broadcasting**: Testing broadcast to all clients
- **Validation**: Input validation and error handling
- **Error Handling**: Graceful handling of edge cases
- **Custom Waveform**: Custom waveform data handling
- **Return Values**: Comprehensive result object validation
- **Dashboard Updates**: Max API integration for dashboard updates

**Key Features Tested:**
- Setting single/multiple parameters
- Client-specific vs broadcast updates
- Parameter validation (waveform types, numeric values)
- Error handling for non-existent clients
- Custom waveform support
- Return value structure

**Example Usage:**
```bash
# Run only unit tests
npm test parameterSetting.test.js

# Run specific test suite
npm test -- --testNamePattern="Core Functionality"
```

### 2. Integration Tests (`parameterSetting.integration.test.js`)

Tests the interaction between parameter setting and external systems (Socket.io, Max API).

**Test Suites:**
- **Socket.io Integration**: Client communication via websockets
- **Max API Integration**: Dashboard and outlet updates
- **State Synchronization**: Keeping users and oscUsers in sync
- **Real-time Updates**: Concurrent and rapid update handling

**Key Features Tested:**
- Socket emission to specific clients
- Broadcasting to all clients
- Max API outlet calls
- State consistency between user stores
- Concurrent update handling

**Example Usage:**
```bash
# Run only integration tests
npm test parameterSetting.integration.test.js

# Run specific integration suite
npm test -- --testNamePattern="Socket.io Integration"
```

### 3. Performance Tests (`parameterSetting.performance.test.js`)

Tests system performance under various load conditions.

**Test Scenarios:**
- **Bulk Updates**: 100 clients updated simultaneously
- **Rapid Sequential Updates**: 50 consecutive parameter changes
- **Complex Parameter Updates**: Multiple parameter types at once

**Performance Benchmarks:**
- Bulk updates: < 100ms for 100 clients
- Sequential updates: < 50ms for 50 updates
- Complex updates: < 20ms for 6 parameters across 50 clients

**Example Usage:**
```bash
# Run only performance tests
npm test parameterSetting.performance.test.js

# Run with detailed timing output
npm test parameterSetting.performance.test.js -- --verbose
```

## Mock System

The test suite uses comprehensive mocks defined in `tests/setup.js`:

### Global Mocks Available

```javascript
// Socket.io mocks
global.mockSocket    // Individual socket mock
global.mockIo        // Socket.io server mock

// Max API mocks
global.mockMaxApi    // Max/MSP API mock

// Global state (reset before each test)
global.users         // Regular client store
global.oscUsers      // OSC client store
global.userSessions  // Session management
global.defaultParams // Default parameter values
```

### Mock Capabilities

**Socket.io Mock (`mockIo`):**
- `emit()` - Broadcast to all clients
- `to(clientId).emit()` - Send to specific client
- Automatically tracks all emissions for verification

**Max API Mock (`mockMaxApi`):**
- `outlet(key, value)` - Send data to Max outlets
- `addHandler()` - Add message handlers
- Tracks all outlet calls for testing

**State Management:**
- Automatic reset before each test
- Pre-configured default parameters
- Separate stores for regular and OSC clients

## Writing New Tests

### Test File Template

```javascript
/**
 * Description of test file purpose
 */

describe('Test Suite Name', () => {
  beforeEach(() => {
    // Additional setup if needed
    // Global mocks are already available
  });

  test('should do something specific', () => {
    // Arrange
    global.users = {
      'client-1': { frequency: 440 }
    };

    // Act
    const result = setParametersForClients({ frequency: 880 }, ['client-1']);

    // Assert
    expect(result.success).toBe(true);
    expect(global.users['client-1'].frequency).toBe(880);
  });
});
```

### Best Practices

1. **Use Descriptive Test Names**
   ```javascript
   test('should set frequency for specific client', () => {
     // Test implementation
   });
   ```

2. **Follow AAA Pattern**
   - **Arrange**: Set up test data
   - **Act**: Execute the function
   - **Assert**: Verify results

3. **Test Edge Cases**
   - Invalid parameters
   - Non-existent clients
   - Empty parameter objects
   - Concurrent operations

4. **Verify Mock Interactions**
   ```javascript
   expect(global.mockIo.emit).toHaveBeenCalledWith('frequency', 880);
   expect(global.mockMaxApi.outlet).toHaveBeenCalledWith('clientCount', 1);
   ```

## Test Data and Constants

### Available Test Constants

From `testUtils/constants.js`:
```javascript
const { WAVEFORM_TYPES } = require("../testUtils/constants");
```

**Supported Waveform Types:**
- `sine`
- `square`
- `sawtooth`
- `triangle`
- `custom`

### Common Test Scenarios

**Basic Parameter Update:**
```javascript
const params = { frequency: 880, amplitude: 0.8 };
const result = setParametersForClients(params, ['client-1']);
```

**Broadcast to All Clients:**
```javascript
const params = { frequency: 880 };
const result = setParametersForClients(params, null);
```

**Custom Waveform:**
```javascript
const params = {
  waveform: 'custom',
  customWaveform: [1, 0.5, 0.25, 0.125]
};
```

## Debugging Tests

### Common Issues and Solutions

1. **Mock Not Being Called**
   ```javascript
   // Check if mock was reset
   expect(global.mockIo.emit).toHaveBeenCalled();

   // Check call arguments
   expect(global.mockIo.emit).toHaveBeenCalledWith('frequency', 880);
   ```

2. **State Not Updating**
   ```javascript
   // Verify client exists before update
   expect(global.users['client-1']).toBeDefined();

   // Check if client was added to results
   expect(result.updatedClients).toContain('client-1');
   ```

3. **Async Test Issues**
   ```javascript
   // Use async/await for timing-dependent tests
   test('should handle rapid updates', async () => {
     await new Promise(resolve => setTimeout(resolve, 10));
     expect(updateCount).toBe(expectedCount);
   });
   ```

### Viewing Test Output

```bash
# Verbose output with test names and timing
npm test -- --verbose

# Show coverage details
npm run test:coverage

# Watch mode with clear output
npm run test:watch -- --verbose
```

## Coverage Reports

The test suite generates coverage reports in the `coverage/` directory:

```bash
npm run test:coverage
```

**Coverage Targets:**
- **Statements**: > 90%
- **Branches**: > 85%
- **Functions**: > 90%
- **Lines**: > 90%

View detailed coverage:
```bash
# Open coverage report in browser
open coverage/lcov-report/index.html
```

## CI/CD Integration

The tests are configured for continuous integration:

```bash
# Run in CI environment
CI=true npm test

# Generate coverage for CI
CI=true npm run test:coverage
```

## Troubleshooting

### Common Test Failures

1. **Mock Import Issues**
   - Ensure `tests/setup.js` is properly configured
   - Check that global mocks are available

2. **State Persistence Between Tests**
   - Verify `beforeEach` is resetting global state
   - Check for manual state modifications

3. **Timing Issues in Performance Tests**
   - Adjust timeout thresholds if running on slower hardware
   - Consider using `jest.setTimeout()` for longer tests

### Getting Help

1. Run tests with maximum verbosity: `npm test -- --verbose --no-cache`
2. Check Jest configuration in `jest.config.js`
3. Review mock setup in `tests/setup.js`
4. Examine individual test files for specific test logic

---

## Summary

This test suite provides comprehensive coverage of the parameter setting functionality with:
- **24+ unit tests** covering core functionality
- **12+ integration tests** for external system interactions
- **3+ performance tests** with timing benchmarks
- **Complete mock system** for isolated testing
- **Coverage reporting** and CI/CD ready configuration

Use `npm test` to get started, and refer to the specific sections above for detailed usage of each test category.
