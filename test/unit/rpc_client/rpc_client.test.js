'use strict';

// setup mocks, before requiring src files
const rpcClientMock = require('./mock');
rpcClientMock.setupAllMocks();

// require modules, src files once mocking is in place
const _ = require('lodash');
const rpcClient = require('../../../rpc-client');

describe('test rpc client', () => {

  test('create rpc client for internal test service, with apis of called services exposed as functions', async () => {
    let apiPaths = [];
    _.forEach(Object.keys(rpcClientMock.calledServiceSchema.paths), api =>
      apiPaths.push(api.substring(1))
    );
    let rpcClient = getInternalTestClient();

    expect(Object.keys(rpcClient).sort()).toEqual(apiPaths.sort());
    _.forEach(Object.values(rpcClient), function(value) {
      expect(value).toEqual(expect.any(Function));
    });
  });

  test('create rpc client for internal service with circuit breaker', async () => {
    let apiPaths = [];
    _.forEach(Object.keys(rpcClientMock.calledServiceSchema.paths), api =>
      apiPaths.push(api.substring(1))
    );
    let rpcClientWithCircuitBreaker = getInternalTestClientWithCircuitBreaker();

    expect(Object.keys(rpcClientWithCircuitBreaker).sort()).toEqual(apiPaths.sort());
    _.forEach(Object.values(rpcClientWithCircuitBreaker), function(value) {
      expect(value).toEqual(expect.any(Function));
    });
  });

  test('make a call to an api of called service using rpc client', async () => {
    const rpcClient = getInternalTestClient();
    const response = await rpcClient.abc({});

    expect(response).toEqual({});
  });

  test('create rpc client for external test service and expose functions', async () => {
    let expected = ['requestPromise', 'execute'];
    let rpcClientExternalService = getExternalTestClient();

    expect(Object.keys(rpcClientExternalService).sort()).toEqual(expected.sort());
    _.forEach(Object.values(rpcClientExternalService), function(value) {
      expect(value).toBeInstanceOf(Function);
    });
  });

  test('create client for successful internal test service with async', async () => {
    let rpcClient = getInternalTestClient();
    const response = await rpcClient.abc({}, 'async');

    expect(response).toEqual({
      "status": "ok"
    });
  });
});

function getInternalTestClient() {
  return rpcClient.createClient('a-service', 'b-service', rpcClientMock.calledServiceSchema,
    'http://test.urbancompany.com', 443);
}

function getInternalTestClientWithCircuitBreaker() {
  return rpcClient.createClient('a-service', 'b-service', rpcClientMock.calledServiceSchema,
    'http://test.urbancompany.com', 443, rpcClientMock.apiCircuitBreakerOptions);
}

function getExternalTestClient() {
  return rpcClient.createExternalClient('a-service', 'b-service');
}