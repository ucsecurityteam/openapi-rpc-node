require('./rpc-config.mock.js');
jest.doMock('../../../logging/standard_logger');
jest.doMock('@uc/armor');
let executeMock = jest.fn(() => Promise.resolve({ data: {} }));
require('@uc/armor').initCircuitBreaker.mockImplementationOnce(() => ({
  execute: executeMock
}));

module.exports = {
  executeMock
}