'use strict';

let _ = require('lodash');
let dependencyLoader = require('./dependency_loader')
const RPC_CONSTANTS = require('../constants');
const SERVICE_PACKAGE_JSON = require(RPC_CONSTANTS.REPO_DIR_PATH + '/package.json')
const LOG_TYPE = require('../logging/log_type');
let Promise = require('bluebird');
let cronParser = require('cron-parser');
var Error = require('../error');
const UCError = Error.UCError;
const ERROR_TYPES = RPC_CONSTANTS.WORKFLOW.ERROR_TYPES;
let Logger = require('../logging/standard_logger');
const Slack = require('../slack');
const LOG_CONSTANTS = require('../logging/log_constants');
let TASK_NAME;
let SERVICE_ID;
let alertChannel = RPC_CONSTANTS.WORKFLOW.DEFAULT_ALERT_CHANNEL;
const BackgroundTransactionTracker = require('../monitoring/background-transaction-tracker').startTransaction;
const WORKFLOW = 'workflow';
const IS_CONTINUOUS_PROFILER_ENABLED = process.env.CONTINUOUS_PROFILER_ENABLED == 'true' ? true : false;
const Profiler = require('../profiler');
const PROFILER_CONSTANTS = require('../profiler/constants');
const MycroftMonitoring = require('../dependency/mycroft_monitoring');
const OpenApiSchema = require('../schema/services/fetch_schema_object');
class Workflow {
  constructor(rpc_framework) {
    SERVICE_ID = this.SERVICE_ID = SERVICE_PACKAGE_JSON.name;
    this.rpcFramework = rpc_framework;
    let options = {
      source_type : RPC_CONSTANTS.SOURCE_TYPE.WORKFLOW
    }
    this.config = this.rpcFramework.initConfig(this.SERVICE_ID, options);
    
    this.rpcFramework.initSlack(this.SERVICE_ID);
    this.rpcFramework.initUCError();
    this.Logger = this.rpcFramework.initLogger(this.SERVICE_ID);
    const ucServiceType = _.get(SERVICE_PACKAGE_JSON, 'urbanclap.service_type', null);
    this.SERVICE_TYPE = (ucServiceType === null) ? _.get(SERVICE_PACKAGE_JSON, 'service_type', 'javascript') : ucServiceType;
    this.rpcFramework.SERVICE_TYPE = this.SERVICE_TYPE;
    this.startTime = new Date();
    TASK_NAME = this.TASK_NAME = process.argv[2];
    this.TASK_PARAMS = process.argv[3] ? JSON.parse(process.argv[3]) : undefined;

    this.DEPENDENCY_CONFIG_PATH = RPC_CONSTANTS.REPO_DIR_PATH + RPC_CONSTANTS.DEPENDENCY.CONFIG_PATH;
    this.TASK_EXECUTION_TIME = process.argv[4];
    this.TASK_CRON_TIME = process.argv[5];
    // process.argv[6] is task try count. Also, TASK_EXECUTION_TIME remains same for all retries
    this.TASK_TRY_COUNT = process.argv[6];
    this.rpcFramework.addToSingleton('task_params', this.TASK_PARAMS);

    /* Log all uncaught exceptions properly and exit gracefully */
    process.on("uncaughtException", function (err) {
      logExitInfo(err, ERROR_TYPES.UNCAUGHT_EXCEPTION)
      exitWorkflow(1);
    });
  
    /* Log all uncaught rejection properly and exit gracefully */
    process.on("unhandledRejection", function (reason, p) {
      logExitInfo(reason, ERROR_TYPES.UNCAUGHT_REJECTION)
      exitWorkflow(1);
    });
  }

  initDependency() {
    let self = this;
    const DEPENDENCY_CONFIG = _.get(require(this.DEPENDENCY_CONFIG_PATH), `Config.workflow.${this.TASK_NAME}`)
    if(!DEPENDENCY_CONFIG) {
      throw new UCError({err_type: Error.RPC_REQUEST_INVALID_ERROR, err_message: 
        `Aborting. dependency.config.json is wrongly configured. Cannot find this path: Config.workflow.${this.TASK_NAME}`});
    }
    alertChannel = _.get(DEPENDENCY_CONFIG, `${RPC_CONSTANTS.DEPENDENCY.TYPE.OPTIONS}.alert_channel`, RPC_CONSTANTS.WORKFLOW.DEFAULT_ALERT_CHANNEL)
    validateTaskExecutionTime(this.TASK_EXECUTION_TIME, this.TASK_CRON_TIME);
    
    let logData = {}
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'server_type';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = WORKFLOW;
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2] = 'task_name';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2_VALUE] = this.TASK_NAME;
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_3] = 'status';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_3_VALUE] = 'loading';
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
    this.Logger.info(logData)

    OpenApiSchema.init(this.SERVICE_ID);

    return this.rpcFramework.initCredentials(this.SERVICE_ID)
    .then(async function(updatedConfig){
      if (updatedConfig) self.config = updatedConfig;
      await dependencyLoader.init(self.rpcFramework, DEPENDENCY_CONFIG);
    })
    .then(() => {
      if (IS_CONTINUOUS_PROFILER_ENABLED) Profiler.triggerProfiler(PROFILER_CONSTANTS.STRATEGY.CONTINUOUS, PROFILER_CONSTANTS.TYPE.CPU);
    })
    .then(() => {
      MycroftMonitoring.initMonitoringClient(this.SERVICE_ID, self.rpcFramework);
    })
    .catch(function(err) {
      logExitInfo(err, ERROR_TYPES.WORKFLOW_DEPENDENCY_ERROR, self);
      exitWorkflow(1);
    })
  }
  
  initServer(taskController) {
    let self = this;
    return Promise.resolve()
      .then(function() {
        let task = taskController? taskController: require(getWorkflowPath(self.SERVICE_TYPE) + self.TASK_NAME);
        let runFunc = task.run.bind(task); // This is done to preserve 'this' context in run function
        let runTaskMonitored = getMonitoredTaskRunFunc(runFunc, self.TASK_NAME, WORKFLOW);
        return runTaskMonitored(self.rpcFramework.getSingleton());
      })
      .then(function (result) {
        let logData = {}
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'server_type';
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = WORKFLOW;
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2] = 'task_name';
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2_VALUE] = self.TASK_NAME;
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_3] = 'status';
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_3_VALUE] = 'success';
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.NUMKEY_1] = 'time_in_ms';
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.NUMKEY_1_VALUE] = new Date() - self.startTime;
        logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
        self.Logger.info(logData)

        exitWorkflow(0);
      })
      .catch(function(err) {
        logExitInfo(err, ERROR_TYPES.WORKFLOW_SERVER_ERROR, self);
        exitWorkflow(1);
      })
  }
}

function getMonitoredTaskRunFunc(runTask, taskName, taskType){
  return async function decoratedFunction(...args){
      return await BackgroundTransactionTracker(taskType, taskName, runTask, ...args);
  }
}

function getWorkflowPath(SERVICE_TYPE) {
  if (SERVICE_TYPE === 'typescript') {
    return RPC_CONSTANTS.REPO_DIR_PATH + RPC_CONSTANTS.DEPENDENCY.TYPESCRIPT_WORKFLOW_PATH;
  }
  return RPC_CONSTANTS.REPO_DIR_PATH + RPC_CONSTANTS.DEPENDENCY.JAVASCRIPT_WORKFLOW_PATH;
}

function areUTCDateEqual(date1, date2) {
  if(date1.getUTCDate() == date2.getUTCDate() 
    && date1.getUTCMonth() == date2.getUTCMonth() 
    && date1.getUTCFullYear() == date2.getUTCFullYear()) {
    return true;
  }
  return false
}

function validateTaskExecutionTime(execution_time, cron_time) {
  if(!execution_time || !cron_time)
    return;
  
  let taskInterval;
  try {
    taskInterval = cronParser.parseExpression(cron_time, {utc: true});
  } catch(err) {
    let logData = {}
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'cron_parse_failed';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = 
      `cron parser was unable to parse the task cron time : ${cron_time}. This can happen for airflow specific cron time like @once`;
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2] = 'task_name';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2_VALUE] = TASK_NAME;
    Logger.info(logData)
    return;
  }
  
  let lastScheduledExecutionTime = taskInterval.prev();
  let executionTime = new Date(execution_time);
  // validate if the received task was scheduled in the current day only
  if(!areUTCDateEqual(new Date(), executionTime)) {
    throw new UCError({err_type: Error.RPC_REQUEST_INVALID_ERROR, err_message: `Aborting. Task execution time (dateOfMonth = ${executionTime.getUTCDate()}) is not of today`});
  }

  // validate if there is any task scheduled for the current date
  if(!areUTCDateEqual(new Date(), new Date(lastScheduledExecutionTime.toString()))) {
    throw new UCError({err_type: Error.RPC_REQUEST_INVALID_ERROR, err_message: `Aborting. Last scheduled execution time
    (dateOfMonth = ${lastScheduledExecutionTime.getUTCDate()}) is not of today`});
  }

  // validate if the received task was triggered after the last scheduled execution time of the task.
  let executionTimeDiffInMins = (executionTime.getTime() - lastScheduledExecutionTime.getTime()) / 60000;
  if(executionTimeDiffInMins < RPC_CONSTANTS.WORKFLOW.EXECUTION_TIME_DIFF_THRESHOLD) {
    throw new UCError({err_type: Error.RPC_REQUEST_INVALID_ERROR, err_message: `Aborting. Task execution time ${executionTime.toUTCString()} is expired. 
      Execution time should be of current date(UTC) and after the last scheduled execution time: ${lastScheduledExecutionTime.toString()}`});
  }
}

function logExitInfo(err, error_type, self) {
  let runTime;
  if (_.get(self, 'startTime')) 
    runTime = new Date() - self.startTime;

  let logData = {}
  logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'server_type';
  logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = WORKFLOW;
  logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2] = 'task_name';
  logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2_VALUE] = TASK_NAME;
  logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_3] = 'status';
  logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_3_VALUE] = 'failed';
  logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.NUMKEY_1] = 'time_in_ms';
  logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.NUMKEY_1_VALUE] = runTime;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = error_type;
  logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = (err ? (err.message || err.err_message) : 'NA');
  logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = (err ? (err.stack || err.err_stack) : 'NA');
  logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR] = JSON.stringify(err);
  
  Logger.error(logData)
  return logData;
}

function exitWorkflow(status) {
  setInterval((function() {
    process.exit(status);
  }), 2000);
}

module.exports = Workflow;
