'use strict';

const _ = require('lodash');
const loggerInstance = require('@uc/logging-repo').initLogger(process.env.LOG_INDEX_NAME);
const logFilter = require('./logging/filter');
const Error = require('./error');

// Helper functions //

function createApiLog(response, extra, error) {
  var request = response.req;
  if (!request) {
    return null;
  }
  if (!_.isEmpty(request.headers)) {
    extra.device = request.headers['x-device-os'] || 'none';
    extra.device_id = request.headers['x-device-id'] || 'none';
  }
  return _.extend({}, getApiRequestData(request), getApiResponseData(extra),
    error ? getApiErrorData(error) : {});
}

function getApiRequestData (request) {
  let Config = require('./config');
  let data = {};
  if (!_.isUndefined(request._startTime)) {
    data.api_time = Number(new Date() - request._startTime);
  }

  if (!_.isUndefined(request.originalUrl)) {
    data.api_name = request.originalUrl;
  }

  if(!_.isUndefined(request.trxn_id)) {
    data.transaction_id = request.trxn_id;
  }

  if(request.authorization && request.authorization.id) {
    data.auth_id = String(request.authorization.id);
  }

  if(request.user && request.user.email) {
    data.auth_id = String(request.user.email);
  }

  if (!_.isEmpty(request.headers)) {
    data.user_agent = request.headers['user-agent'];
    data.version_name = request.headers['x-version-name'];
    data.version_code = request.headers['x-version-code'];
  }

  if (!_.isUndefined(request.baseUrl) && !_.isUndefined(_.get(request, 'route.path'))) {
    data.api_path_route = request.baseUrl + request.route.path;
  }

  if (!_.isUndefined(request.method)) {
    data.method = request.method;
  }
  data.container_id =  Config.getContainerId();
  data.task_id = Config.getTaskId();
  data.container_ip = Config.getContainerIp();
  data.build_version = Config.getBuildVersion();
  data.container_port = Config.getContainerPort();
  data.service_port = Config.getServicePort();
  return data;
}

function getApiResponseData(extra) {
  let data = {};

  if (!extra) {
    return data;
  }

  if (!_.isUndefined(extra.statusCode)) {
    data.status_code = extra.statusCode;
  }

  if (!_.isUndefined(extra.apiDeprecate)) {
    data.api_deprecate = extra.apiDeprecate;
  }

  if (!_.isUndefined(extra.logType)) {
    data.log_type = extra.log_type;
  }

  if (!_.isUndefined(extra.device)) {
    data.device = extra.device;
    data.device_id = extra.device_id;
  }

  return data;
}

function getApiErrorData(error) {
  let data = {};

  if (_.isEmpty(error)) {
    return data;
  }

  if (!_.isUndefined(error.message)) {
    data.err_message = error.message;
  }

  if (!_.isUndefined(error.stack)) {
    data.err_stack = error.stack;
  }

  return data;
}

var Logger = {};

const LOG_TYPE = 'openapi_rpc_service';
const LOG_GENRE = {
  CONSOLE: 'console',
  INFO: 'info',
  DEBUG: 'debug',
  ERROR: 'error',
  SYSTEM: 'system',
  APP_INFO: 'app_info',
  APP_ERROR: 'app_error',
  API_SUCCESS: 'api_success',
  API_ERROR: 'api_error'
};

Logger.system = function(port, message) {
  loggerInstance.info({
    log_type: LOG_TYPE,
    log_genre: LOG_GENRE.SYSTEM,
    port: port,
    message: message
  });
};

function appInfoObj(log_genre, client_id, trxn_id, user_agent, method_id, res_time_ms) {
  let Config = require('./config');
  return {
    log_type: LOG_TYPE,
    log_genre: log_genre,
    client_id: client_id,    
    endpoint_name: method_id,
    response_time_ms: res_time_ms,
    trxn_id: trxn_id,    
    user_agent: user_agent,
    container_id:  Config.getContainerId(),
    container_ip: Config.getContainerIp(),
    build_version: Config.getBuildVersion(),
    task_id: Config.getTaskId(),
    container_port: Config.getContainerPort(),
    service_port: Config.getServicePort()
  }
}

Logger.appInfo = function(client_id, trxn_id, user_agent, method_id, res_time_ms) {
  loggerInstance.info(appInfoObj(LOG_GENRE.APP_INFO, client_id, trxn_id, user_agent, method_id, res_time_ms));
};

Logger.appError = function(client_id, trxn_id, user_agent, method_id, res_time_ms, err_type, err_message) {
  loggerInstance.error(_.assign({
    err_type: err_type,
    err_message: err_message
  }, appInfoObj(LOG_GENRE.APP_ERROR, client_id, trxn_id, user_agent, method_id, res_time_ms)));
};

Logger.info = function(data) {
  let Config = require('./config');
  if (typeof data === 'string' || typeof data === 'number') data = {message: data};
  validateSchema(data);
  loggerInstance.info(_.assign({ 
    log_type: LOG_TYPE, 
    log_genre: LOG_GENRE.INFO,
    container_id:  Config.getContainerId(),
    container_ip: Config.getContainerIp(),
    build_version: Config.getBuildVersion(),
    task_id: Config.getTaskId(),
    container_port: Config.getContainerPort(),
    service_port: Config.getServicePort()
  }, data));  
};

Logger.error = function(data) {
  let Config = require('./config');
  if (typeof data === 'string' || typeof data === 'number') data = {message: data};
  validateSchema(data);
  if(!data['error_type']) {
    data['error_type'] = Error.SERVICE_INTERNAL_ERROR;
  }
  loggerInstance.error(_.assign({ 
    log_type: LOG_TYPE, 
    log_genre: LOG_GENRE.ERROR,
    container_id:  Config.getContainerId(),
    container_ip: Config.getContainerIp(),
    build_version: Config.getBuildVersion(),
    task_id: Config.getTaskId(),
    container_port: Config.getContainerPort(),
    service_port: Config.getServicePort()
  }, data));
};

Logger.debug = function(options, data) {
  let Config = require('./config');
  if (typeof data === 'string' || typeof data === 'number') data = {message: data};
  validateSchema(data);
  loggerInstance.debug(options, _.assign({
    log_type: LOG_TYPE, 
    log_genre: LOG_GENRE.DEBUG,
    container_id:  Config.getContainerId(),
    container_ip: Config.getContainerIp(),
    build_version: Config.getBuildVersion(),
    task_id: Config.getTaskId(),
    container_port: Config.getContainerPort(),
    service_port: Config.getServicePort()
  }, data))    
};

Logger.api_success = function (response, extra) {
  let data = createApiLog(response, extra);
  validateSchema(data);
  loggerInstance.info(data);
};

Logger.api_error = function (response, extra, error) {
  let data = createApiLog(response, extra, error);
  validateSchema(data);
  loggerInstance.error(data);
};

Logger.exitAfterFlush =function(){
  loggerInstance.exitAfterFlush();  
};

function validateSchema(data) {
  if(!data || typeof data === 'string' || typeof data === 'number') {
    return;
  }

  try {
    if(logFilter.isSchemaValid(data).valid) {
      _.assign(data, {standard_logging_status: 'passed'})
    } else {
      _.assign(data, {standard_logging_status: 'failed'})
    }
  } catch (error) {
    _.assign(data, {standard_logging_status: 'failed'})
  }
}

module.exports = Logger;
