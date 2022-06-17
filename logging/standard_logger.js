'use strict';

/**
 * Standard Logger should be used when
 * 1. We are logging at the time of server startup (no transaction context present).
 * 2. We do not want to log the transaction id i.e. in case of health check
 *    or in case of js file initialisation.
 *
 * Note: For cases(which should be all the cases except above two points) where logs
 *       are printed in the context of any request, we should use Singleton.Logger function
 *       for logging as it also logs the transaction id.
 */

var _ = require('lodash');
var loggerInstance = require('@uc/logging-repo').initLogger(process.env.LOG_INDEX_NAME);
const logFilter = require('./filter');
const LOG_CONSTANTS = require('./log_constants');
const LOG_TYPE = require('./log_type');
const Error = require('../error');
const LOG_SCHEMA_VALIDATION = 'log_schema_validation';
const STANDARD_LOGGING_STATUS = 'standard_logging_status';
const PASSED = 'passed';
const FAILED = 'failed';
const LoggingMetricUtil = require('./logging_metric_util');
const RELEASE_VERSION = process.env.RELEASE_VERSION;

function createApiLog(response, extra, error) {
  var request = response.req;
  if (!request) {
    return null;
  }
  if (!_.isEmpty(request.headers)) {
    extra.device = request.headers['x-device-os'] || 'none';
    extra.device_id = request.headers['x-device-id'] || 'none';
  }
  let data = {};
  data[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVER_RESPONSE;
  return _.extend(data, getApiRequestData(request), getApiResponseData(extra),
    error ? getApiErrorData(error) : {});
}

function getApiRequestData (request) {
  let data = {};
  if (!_.isUndefined(request._startTime)) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.API_TIME] = Number(new Date() - request._startTime);
  }

  if (!_.isUndefined(request.originalUrl)) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.API_NAME] = request.originalUrl;
  }

  if(!_.isUndefined(request.trxn_id)) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.TRANSACTION_ID] = request.trxn_id;
  }

  if (!_.isEmpty(request.headers)) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.USER_AGENT] = request.headers['user-agent'];
    data[LOG_CONSTANTS.SYSTEM_LOGS.VERSION_NAME] = request.headers['x-version-name'];
    data[LOG_CONSTANTS.SYSTEM_LOGS.VERSION_CODE] = request.headers['x-version-code'];
    data[LOG_CONSTANTS.SYSTEM_LOGS.DEVICE_ID] = request.headers['x-device-id'];
  }

  if (!_.isUndefined(request.baseUrl) && !_.isUndefined(_.get(request, 'route.path'))) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.API_PATH] = request.baseUrl + request.route.path;
  }

  if (!_.isUndefined(request.method)) {
    data[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = request.method;
  }
  return data;
}

function getApiResponseData(extra) {
  let data = {};

  if (!extra) {
    return data;
  }

  if (!_.isUndefined(extra.statusCode)) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.STATUS] = extra.statusCode;
  }

  if (!_.isUndefined(extra.logType)) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = extra.logType;
  }

  if (!_.isUndefined(extra.device)) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.DEVICE_NAME] = extra.device;
    data[LOG_CONSTANTS.SYSTEM_LOGS.DEVICE_ID] = extra.device_id;
  }

  return data;
}

function getApiErrorData(error) {
  let data = {};

  if (_.isEmpty(error)) {
    return data;
  }

  if (!_.isUndefined(error.message)) {
    data[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = error.message;
  }

  if (!_.isUndefined(error.stack)) {
    data[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = error.stack;
  }

  return data;
}

function standardizeLog(data) {
  let Config = require('../config');
  try {
    data = logFilter.filterKeys(data);
    let schemaValidationResult = logFilter.isSchemaValid(data);
    if(schemaValidationResult.valid) {
      data[STANDARD_LOGGING_STATUS] = PASSED;
      data[LOG_CONSTANTS.SYSTEM_LOGS.CONTAINER_ID] = Config.getContainerId();
      data[LOG_CONSTANTS.SYSTEM_LOGS.CONTAINER_IP] = Config.getContainerIp();
      data[LOG_CONSTANTS.SYSTEM_LOGS.BUILD_VERSION] = Config.getBuildVersion();
      data[LOG_CONSTANTS.SYSTEM_LOGS.TASK_ID] = Config.getTaskId();
      data[LOG_CONSTANTS.SYSTEM_LOGS.CONTAINER_PORT] = Config.getContainerPort();
      data[LOG_CONSTANTS.SYSTEM_LOGS.SERVICE_PORT] = Config.getServicePort();
      data[LOG_CONSTANTS.SYSTEM_LOGS.SOURCE_TYPE] = Config.getSourceType();
      data[LOG_CONSTANTS.SYSTEM_LOGS.RELEASE_VERSION] = RELEASE_VERSION;
      return data;
    } else {
      let updatedData = {};
      updatedData[LOG_CONSTANTS.STRINGIFY_OBJECTS.MESSAGE] = JSON.stringify(data);
      updatedData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = LOG_SCHEMA_VALIDATION;
      updatedData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = FAILED;
      updatedData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = schemaValidationResult.errors[0] ?
        schemaValidationResult.errors[0].property + schemaValidationResult.errors[0].message : "";
      updatedData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVICE;
      updatedData[LOG_CONSTANTS.SYSTEM_LOGS.CONTAINER_ID] = Config.getContainerId();
      updatedData[LOG_CONSTANTS.SYSTEM_LOGS.CONTAINER_IP] = Config.getContainerIp();
      updatedData[LOG_CONSTANTS.SYSTEM_LOGS.BUILD_VERSION] = Config.getBuildVersion();
      updatedData[LOG_CONSTANTS.SYSTEM_LOGS.TASK_ID] = Config.getTaskId();
      updatedData[LOG_CONSTANTS.SYSTEM_LOGS.CONTAINER_PORT] = Config.getContainerPort();
      updatedData[LOG_CONSTANTS.SYSTEM_LOGS.SERVICE_PORT] = Config.getServicePort();
      updatedData[LOG_CONSTANTS.SYSTEM_LOGS.SOURCE_TYPE] = Config.getSourceType();
      updatedData[LOG_CONSTANTS.SYSTEM_LOGS.RELEASE_VERSION] = RELEASE_VERSION;
      updatedData[STANDARD_LOGGING_STATUS] = PASSED;
      loggerInstance.error(updatedData);
      return null;
    }
  } catch (error) {
    let errorData = {};
    errorData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = "Error occurred while standardizing logs. error: " +
      JSON.stringify(error);
    errorData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = JSON.stringify(error.stack);
    errorData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVICE;
    errorData[STANDARD_LOGGING_STATUS] = PASSED;
    loggerInstance.error(errorData);
  }
  return null;
}

var Logger = {};

Logger.system = function(port, message) {
  if(typeof message !== 'object')
    message = { message: message };
  let data = {};
  data[LOG_CONSTANTS.SYSTEM_LOGS.SERVICE_PORT] = port;
  data[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
  data[LOG_CONSTANTS.STRINGIFY_OBJECTS.MESSAGE] = message;
  data = standardizeLog(data);
  if(data) {
    loggerInstance.info(data);
  }
};

Logger.info = function(data) {
  if (typeof data === 'string' || typeof data === 'number') data = {message: data};
  if(!data[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE]) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVICE;
  }
  data = standardizeLog(data);
  if(data) {
    loggerInstance.info(data);
  }
};

Logger.error = function(data) {
  if (typeof data === 'string' || typeof data === 'number') data = {message: data};
  if(!data[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE]) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVICE;
  }
  if(!data[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE]) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = _.get(data, 'error.err_type', Error.SERVICE_INTERNAL_ERROR);
  }

  data = standardizeLog(data);
  if(data) {
    loggerInstance.error(data);
    // Push the data to prometheus
    LoggingMetricUtil.persistErrorData(data);
  }
};

Logger.debug = function(options, data) {
  if (typeof data === 'string' || typeof data === 'number') data = {message: data};
  if(!data[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE]) {
    data[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVICE;
  }
  if (options.debug_mode) {
    data = standardizeLog(data);
    if(data) {
      loggerInstance.debug(options, data);
    }
  }
};

Logger.api_success = function (response, extra) {
  let data = standardizeLog(createApiLog(response, extra));
  if(data) {
    loggerInstance.info(data);
  }
};

Logger.api_error = function (response, extra, error) {
  let data = standardizeLog(createApiLog(response, extra, error));
  if(data) {
    loggerInstance.error(data);
  }
};

Logger.exitAfterFlush =function(){
  loggerInstance.exitAfterFlush();
};

module.exports = Logger;
