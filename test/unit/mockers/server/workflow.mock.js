jest.mock('../../../../server/dependency_loader');

const Constants = require('../../../../constants');
jest.doMock('../../../../constants', () => {
  Constants.DEPENDENCY.CONFIG_PATH =
    '/test/unit/resources/dependency.config.test.data.js';
  return Constants;
});

jest.mock('../../../../package.json', () => {
  return {
    name: 'logging-service'
  };
});
jest.mock('../../../../dependency/mycroft_monitoring');
jest.mock('../../../../schema/services/service_self_schema_object');
const RpcFramework = require('../../../../index');
jest.spyOn(RpcFramework, 'initCredentials').mockImplementation(() => {
  return new Promise(resolve => {
    resolve();
  });
});
jest.spyOn(RpcFramework, 'createServer').mockImplementation(() => {});
jest.spyOn(RpcFramework, 'initConfig').mockImplementation(() => {
  const RPCClientTestConstants = require('../../resources/constants')
    .RPC_CLIENT;
  return {
    PORT: RPCClientTestConstants.INTERNAL.TEST_CALLED_SERVICE_PORT,
    AUTH_SERVICE_IDS:
      RPCClientTestConstants.INTERNAL.TEST_CALLED_SERVICE_AUTH_IDS
  };
});

const Logger = {
  info: jest.fn(),
  error: jest.fn()
};
jest.spyOn(RpcFramework, 'initLogger').mockImplementation(() => {
  return Logger;
});

process.argv = ['node', './src/workflow', 'deactivate_users', '{}', new Date(), '1 * * * *', '1']
