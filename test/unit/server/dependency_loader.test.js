'use strict';

// Project specific mocks start
const testSetup = require('../test-loader')();
// Project specific mocks end

// Module imports start
const Logger = require('../../../logging/standard_logger');
const JsonValidator = require('jsonschema').Validator;
const MongoDBInitializer = require('../../../dependency/mongodb');
const EventsConsumerInitializer = require('../../../dependency/events');
const ErrorTypes = require('../../../error');
// Module imports end

describe('test dependency loader', () => {
  let dependencyConfig;
  let DependencyLoader;
  let RpcFramework;
  let JsonValidatorSpy;
  const VALIDATION_ERROR_MESSAGE = {
    message: 'Dependency validation failed. Exiting..'
  };

  beforeAll(() => {
    // Arrange - arrange test data and expected result
    dependencyConfig = require('../resources/dependency.config.test.data')
      .Config.service;
    DependencyLoader = require('../../../server/dependency_loader');
    RpcFramework = require('../../../index');
    JsonValidatorSpy = jest.spyOn(JsonValidator.prototype, 'validate');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initialize single dependency', async () => {
    // Act - call function to be tested and receive result
    await DependencyLoader.init(RpcFramework, dependencyConfig);

    // Assert - validate received result with expected result using `expect` matchers
    expect(JsonValidatorSpy).toBeCalledTimes(2);
    expect(EventsConsumerInitializer.initEventConsumer).toBeCalled();
  });

  test('initialize array of dependencies', async () => {
    // Act - call function to be tested and receive result
    await DependencyLoader.init(RpcFramework, dependencyConfig);

    // Assert - validate received result with expected result using `expect` matchers
    expect(JsonValidatorSpy).toBeCalledTimes(2);
    expect(MongoDBInitializer.initMongodbClient).toBeCalledTimes(1);
  });

  test('throw error while initializing a dependency with invalid schema', async () => {
    // Arrange - arrange test data and expected result
    JsonValidatorSpy.mockReturnValue(() => {
      return (validatorResult = {
        valid: false
      });
    });

    // Act - call function to be tested and receive result
    try {
      received = await DependencyLoader.init(RpcFramework, dependencyConfig);
    } catch (error) {
      // Assert - validate received result with expected result using `expect` matchers
      expect(JsonValidatorSpy).toBeCalledTimes(1);
      expect(error).toBeInstanceOf(ErrorTypes.UCError)
    }
  });
});
