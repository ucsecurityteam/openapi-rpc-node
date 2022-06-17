'use strict';

// Project specific mocks start
const testSetup = require('../test-loader')();
// Project specific mocks end

// Module imports start
const Logger = require('../../../logging/standard_logger');
const RpcFramework = require('../../../index');
const Workflow = require('../../../server/workflow');
const DependencyLoader = require('../../../server/dependency_loader');
require('../../../package.json');
// Module imports end

describe('test workflow', () => {
  let workflow;

  beforeAll(() => {
    // Arrange - arrange test data and expected result
    workflow = new Workflow(RpcFramework);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initialize dependencies of a workflow', async () => {
    // Act - call function to be tested and receive result
    await workflow.initDependency();

    // Assert - validate received result with expected result using `expect` matchers
    expect(RpcFramework.initCredentials).toBeCalled();
    expect(DependencyLoader.init).toBeCalled();
  });

  // test('run workflow task and throw exception', async () => {
  //   // Act - call function to be tested and receive result

  //   jest.spyOn(workflowUtils, 'getMonitoredTaskRunFunc').mockReturnValue(() =>{console.log("helllllo,"); return Promise.reject() });
  //   //jest.spyOn(process, 'exit').mockImplementation(() => 'success');
  //   await workflow.initServer({
  //     run: () => {
  //       return Promise.reject();
  //     }
  //   });

  //   // Assert - validate received result with expected result using `expect` matchers
  //   expect(Logger.error).toBeCalled();
  // });

  // test('run workflow task and complete job successfully', async () => {
  //   // Act - call function to be tested and receive result
  //   //jest.spyOn(workflowUtils, 'getMonitoredTaskRunFunc').mockReturnValue(() => Promise.resolve());
  //   //jest.spyOn(process, 'exit').mockImplementation(() => 'success');
  //   await workflow.initServer({
  //     run: () => {
  //       return Promise.resolve();
  //     }
  //   });

  //   // Assert - validate received result with expected result using `expect` matchers
  //   expect(RpcFramework.initLogger().info).toBeCalled();
  // });
});
