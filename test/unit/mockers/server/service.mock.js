const callingServiceSchema = {
  "swagger": "2.0",
  "basePath": "/a-service",
  "info": {
    "description": "test schema",
    "version": "0",
    "title": "test schema"
  },
  "paths": {
    "/xyz": {
      "post": {
        "summary": "test api",
        "consumes": [
          "application/json"
        ],
        "parameters": [
          {
            "in": "body",
            "name": "body",
            "description": "Request body for test method.",
            "required": true,
            "schema": {
              "$ref": "#/definitions/request"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Response body for pushLogs",
            "schema": {
              "$ref": "#/definitions/response"
            }
          }
        }
      }
    }
  },
  "definitions": {
    "response": {
      "type": "object"
    },
    "request": {
      "type": "object"
    }
  }
};

jest.mock('../../../../server/dependency_loader');

const Constants = require('../../../../constants');
jest.doMock('../../../../constants', () => {
  Constants.DEPENDENCY.CONFIG_PATH = '/test/unit/resources/dependency.config.test.data.js';
  return Constants;
});

jest.mock('../../../../package.json', () => {
  return {
    name: 'logging-service'
  };
});

const RpcFramework = require('../../../../index');
jest.spyOn(RpcFramework, 'initCredentials').mockImplementation(() => {
  return new Promise((resolve) => {
    resolve();
  });
});
jest.mock('../../../../dependency/mycroft_monitoring');
jest.mock('../../../../schema/services/service_self_schema_object');
jest.spyOn(RpcFramework, 'createServer').mockImplementation(() => {});
jest.spyOn(RpcFramework, 'initConfig').mockImplementation(() => {
  const RPCClientTestConstants = require('../../resources/constants').RPC_CLIENT;
  return {
    PORT: RPCClientTestConstants.INTERNAL.TEST_CALLED_SERVICE_PORT,
    AUTH_SERVICE_IDS:
      RPCClientTestConstants.INTERNAL.TEST_CALLED_SERVICE_AUTH_IDS
  };
});
jest.spyOn(RpcFramework, 'initLogger').mockImplementation(() => {
  return {
    info: jest.fn()
  };
});
