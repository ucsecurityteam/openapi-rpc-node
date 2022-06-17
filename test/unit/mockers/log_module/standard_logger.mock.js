const LoggingRepo = require('@uc/logging-repo');
const Logger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  exitAfterFlush: jest.fn()
};
jest.spyOn(LoggingRepo, 'initLogger').mockImplementation(() => {
  return Logger;
});

jest.mock('../../../../package.json', () => {
  return {
    name: 'logging-service'
  };
});
