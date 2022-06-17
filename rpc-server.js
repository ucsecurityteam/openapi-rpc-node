'use strict';

if (process.env.NEW_RELIC_ENABLED === 'true') require('newrelic');

const _ = require('lodash');
const Promise = require('bluebird');

let TransactionContext = require('./transaction-context');

const express = require('express');
const bodyParser = require('body-parser');
const validator = require('swagger-express-validator');
const expandSchemaRef = require('expand-swagger-refs').expanded;
const uuidv4 = require('uuid/v4');
const requestStats = require('request-stats');
const Profiler =  require('./profiler');

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
const Logger = require('./logging/standard_logger');
const Error = require('./error');
const UCError = Error.UCError;
const Slack = require('./slack');
const LOG_CONSTANTS = require('./logging/log_constants');
const RPC_CONSTANTS =  require('./constants');
const LOG_TYPE = require('./logging/log_type');
const AuditContext = require('./audit-context')
const Response = require('./server/response');
const Singleton = require('./singleton').getSingleton();
const PrometheusExporter = require('./monitoring/prometheus_exporter');
const Monitoring = require('./monitoring');
const RPC_METRICS = Monitoring.CONSTANTS.RPC_METRICS;
const APPLICATION_METRICS = Monitoring.CONSTANTS.APPLICATION_METRICS;
const APMTransactionTracker = require('./monitoring/background-transaction-tracker');
const RpcServer = {};
const PROFILER_CONSTANTS = require('./profiler/constants');
const swaggerValidation = require('@uc/openapi-validator-middleware');
const { getMethodImplementation } = require('./dependency/utils')

/**
 * Create the proto server.
 * Description in index.js file.
 */
RpcServer.createServer = function(service_id, auth_service_ids, schema, service, port) {

  const Middleware = require('./middleware');
  const ecs_service_id = _.get(Singleton, 'Config.SUB_SERVICE_ID', service_id);
  console.log('ecs service-id: ',ecs_service_id);
  /* Log all uncaught exceptions properly and exit gracefully */
  process.on("uncaughtException", function (err) {
    console.log('------------Uncaught exception caught--------------');
    let logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = Error.RPC_UNCAUGHT_SERVER_EXCEPTION;
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = err ? err.message : "NA";
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = err ? err.stack : "NA";
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR] = err;
    Singleton.Logger.error(logData);
    Slack.serverRestartAlert(service_id, err ? err.message : "NA")
      .then(function () {
        Singleton.Logger.exit_after_flush();
      })    
  });

  /* Log all uncaught rejection properly and exit gracefully */
  process.on("unhandledRejection", function (reason, p) {
    console.log('------------Unhandled rejection caught--------------');
    let logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = Error.RPC_UNHANDLED_SERVER_REJECTION;
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = reason ? (reason.err_message || reason.message) : "NA";
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = reason ? (reason.err_stack || reason.stack) : "NA";
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR] = JSON.stringify(reason);
    Singleton.Logger.error(logData);
  });

  var app = express();
  swaggerValidation.init(expandSchemaRef(schema), { errorFormatter: requestValidationFn });
  app.use(setStartTimeToRequest);
  app.use(bodyParser.json({ limit: '20mb'}));
  app.use(bodyParser.urlencoded({ limit: '20mb', extended: false }));
  app.use(TransactionContext.getExpressMiddleware());
  app.use(AuditContext.getExpressMiddleware());
  app.use(Middleware.logRequest);
  if(PrometheusExporter.isMonitoringEnabled()) {
    // expose metrics at the default URL for Prometheus
    app.get('/metrics', function(req, res, next) {
      sendMonitoredMetricsPayload(req, res, PrometheusExporter.exportMetrics);
    });
  }

  //Endpoint for exposing openapi-rpc metrics
  app.get(RPC_METRICS.ENDPOINT, function (req, res) {
    sendMonitoredMetricsPayload(req, res, Monitoring.exporter.RPCMetrics);
  });

  //Endpoint for exposing application metrics
  app.get(APPLICATION_METRICS.ENDPOINT, function (req, res) {
    sendMonitoredMetricsPayload(req, res, Monitoring.exporter.ApplicationMetrics);
  });

  // TODO validate schema
  // ....
  var expected_paths = _.keys(schema.paths);

  expected_paths.forEach(function (path) {

    let method_name = path.substring(1)
    let method_url = '/' + service_id + path

    if (!isMethodPathValid(method_name)) {
      throw new UCError({err_type: Error.RPC_METHOD_PATH_INVALID_ERROR, err_message: method_url});
    }
    if (!isMethodImplemented(method_name, service)) {
      throw new UCError({err_type: Error.RPC_METHOD_NOT_IMPLEMENTED_ERROR, err_message: method_url});
    }

    initServiceEndpoints(method_name, method_url, path)
  });

  Middleware.monitorMiddlewares(app);
  
  function initServiceEndpoints(method_name, method_url, path) {

    Middleware.initPreRunMiddlewares(app, method_url, path, {service_id: service_id, auth_service_ids: auth_service_ids, schema: schema})

    app[getUrlOperationType(schema, path)](method_url, swaggerValidation.validate, function(req, res, next) {
      TransactionContext.setTrxnHeaders(req.headers)
      if(getUrlOperationType(schema, path) === RPC_CONSTANTS.URL_OPERATION.GET) {
        req.body['query_params'] = req.query
        req.body['path_params'] = req.params
      }
      req.method_name = method_name;
      getMethodImplementation(method_name, service)(req.body)
        .then(function(result) {
          req.result = result;
          next();
        })
        .catch(function (err) {
          next(err);
        });
    });
    
    Middleware.initPostRunMiddlewares(app, method_url, path, {})
    
    // success
    app.use(method_url, function(req, res, next) {
      APMTransactionTracker.setTransactionName(req.method + ' ' + method_url)
      res.status(200).json(req.result);
      _.forEach(req.middlewareLatencies, function(middleware) {
        Monitoring.capture.middlewareMetrics(getMiddlewareMonitoringParams(method_url, middleware));
      });
    });

    // failure
    app.use(method_url, function(err, req, res, next) {
      APMTransactionTracker.setTransactionName(req.method + ' ' + method_url)
      let error = createError(req, sanitizedPayloadForServer(req), err);
      let response = Response.getErrorResponse(error)
      res.status(response.code).json(response.body);
      let monitoringParams = getMonitoringParameters(service_id, req.query.client_id, method_url, RPC_CONSTANTS.HTTP_RESPONSE_CODE_ERROR, error[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE], Singleton.Config.ENV ,req.start_time_ms, req.headers, path, req.body);
      PrometheusExporter.captureServerRequestDurationMetric(monitoringParams);
      Monitoring.capture.serverRequestMetric(monitoringParams);
      _.forEach(req.middlewareLatencies, function(middleware) {
        Monitoring.capture.middlewareMetrics(getMiddlewareMonitoringParams(method_url, middleware));
      });
    });
  }

  app.get('/healthcheck', function(req, res, next) {
    let logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVER_RESPONSE;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.CLIENT_ID] = RPC_CONSTANTS.LOAD_BALANCER;
    logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = RPC_CONSTANTS.HEALTH_CHECK;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.USER_AGENT] = req.headers['user-agent'];
    logData[LOG_CONSTANTS.SYSTEM_LOGS.API_TIME] = Date.now() - req.start_time_ms;
    Logger.info(logData);
    let monitoringParams = getMonitoringParameters(service_id, 'ALB', '/healthcheck', RPC_CONSTANTS.HTTP_RESPONSE_CODE_OK, RPC_CONSTANTS.EMPTY, Singleton.Config.ENV, req.start_time_ms, req.headers, '/healthcheck', req.body);
    PrometheusExporter.captureServerRequestDurationMetric(monitoringParams);
    Monitoring.capture.serverRequestMetric(monitoringParams);
    res.status(200).json({ message: 'health check passed!!!' });
  });


  const ecs_service_healthcheck_url = `/${ecs_service_id}/healthcheck`;
  app.get(ecs_service_healthcheck_url, function(req, res, next) {
    let logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVER_RESPONSE;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.CLIENT_ID] = RPC_CONSTANTS.LOAD_BALANCER;
    logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = ecs_service_healthcheck_url;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.USER_AGENT] = req.headers['user-agent'];
    logData[LOG_CONSTANTS.SYSTEM_LOGS.API_TIME] = Date.now() - req.start_time_ms;
    Logger.info(logData);
    let monitoringParams = getMonitoringParameters(service_id, 'ALB', ecs_service_healthcheck_url, RPC_CONSTANTS.HTTP_RESPONSE_CODE_OK, RPC_CONSTANTS.EMPTY, Singleton.Config.ENV, req.start_time_ms, req.headers, ecs_service_healthcheck_url, req.body);
    PrometheusExporter.captureServerRequestDurationMetric(monitoringParams);
    Monitoring.capture.serverRequestMetric(monitoringParams);
    res.status(200).json({ message: 'service health check passed!!!' });
  });
  /* @Objective : Returns various details about DB events 
     @param : Req --> { action (list or getSchema), db_type, db_name,schema_name } 
     @param : Res --> Returns the JSON Schema of the event or list of all Schemas according to the action chosen.
  */   
  app.post('/getDBDetails', async function (req, res, next) {
    const DBDetails =require('./schema/database/');
    const response = DBDetails.getDBDetails(req,res);
    if (typeof response !== "undefined") {
      res.status(200).json(DBDetails.getDBDetails(req,res));
    }
  });
  
  /**
  * Returns 200 if service_id is Authenticated to call another micro service, else 500.
  * @param service_id
  * @return success : "{ message: 'Authenticated!!!' }", failure : "{"err_type":"rpc_auth_error","err_message":""}"
  */
  app.get('/isInternalServiceAuthenticated', function(req, res, next) {
    let logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVER_RESPONSE;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.CLIENT_ID] = req.headers.client_id || req.query.client_id;
    logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = RPC_CONSTANTS.IS_INTERNAL_SERVICE_AUTHENTICATED;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.USER_AGENT] = req.user_agent;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.API_TIME] = Date.now() - req.start_time_ms;
    if (_.isArray(auth_service_ids) && auth_service_ids.length > 0 && !_.includes(auth_service_ids, req.query.client_id)) {
        throw new UCError({ err_type: Error.RPC_AUTH_ERROR, err_message: `Internal service authentication failure, Client id: ${req.query.client_id} `});
      } else {
        Singleton.Logger.info(logData);
        let monitoringParams = getMonitoringParameters(service_id, req.query.client_id, '/isInternalServiceAuthenticated', RPC_CONSTANTS.HTTP_RESPONSE_CODE_OK, RPC_CONSTANTS.EMPTY, Singleton.Config.ENV, req.start_time_ms, req.headers, '/isInternalServiceAuthenticated', req.body);
        PrometheusExporter.captureServerRequestDurationMetric(monitoringParams);
        Monitoring.capture.serverRequestMetric(monitoringParams);
        res.status(200).json({ message: 'Authenticated!!!' });
      }
  });

  app.get('/getEventDataConfig', function(req, res, next) {
    var uuid = uuidv4();
    var serverTime = (new Date()).getTime(); // timestamp in milliseconds
    let logData = {};
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'uuid';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = String(uuid);
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2] = 'server_time';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2_VALUE] = String(serverTime);
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVER_RESPONSE;
    logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = RPC_CONSTANTS.GET_SESSION;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.USER_AGENT] = req.headers['user-agent'];
    logData[LOG_CONSTANTS.SYSTEM_LOGS.API_TIME] = Date.now() - req.start_time_ms;
    Singleton.Logger.info(logData);
    let monitoringParams = getMonitoringParameters(service_id, req.query.client_id, '/getEventDataConfig', RPC_CONSTANTS.HTTP_RESPONSE_CODE_OK, RPC_CONSTANTS.EMPTY, Singleton.Config.ENV, req.start_time_ms, req.headers, '/getEventDataConfig', req.body);
    PrometheusExporter.captureServerRequestDurationMetric(monitoringParams);
    Monitoring.capture.serverRequestMetric(monitoringParams);
    res.status(200).json({ "uuid": String(uuid), "server_time": serverTime });
  });

  app.post('/triggerProfiler', async function(req, res, next) {
    const profileType = _.get(req.body, 'profileType');
    const duration = _.get(req.body, 'duration');
    const url = Profiler.triggerProfiler(PROFILER_CONSTANTS.STRATEGY.ON_DEMAND, profileType, duration); 
    res.status(200).json({ message: `Download the profile from ${url}` });
  });

  // undefined route -
  app.use(function(req, res, next) {
    let error = createError(req, undefined, { err_type: Error.RPC_METHOD_NOT_FOUND_ERROR, 
      err_message:"Some issue with service schema or API controller. Use this doc for reference: https://urbanclap.atlassian.net/wiki/spaces/ENGG/pages/1192132689/How+to+write+a+service+in+nodejs#Howtowriteaserviceinnodejs-RPC_METHOD_NOT_FOUNDError"});
    let route = _.get(req._parsedUrl, 'pathname', req.base_url);
    let monitoringParams = getMonitoringParameters(service_id, req.query.client_id, route, RPC_CONSTANTS.HTTP_RESPONSE_CODE_ERROR, error[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE], Singleton.Config.ENV, req.start_time_ms, req.headers, '', req.body);
    PrometheusExporter.captureServerRequestDurationMetric(monitoringParams);
    Monitoring.capture.serverRequestMetric(monitoringParams);
    res.status(500).json({ err_type: error[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE], err_message: error[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] });
  });

  // other errors -
  app.use(function(err, req, res, next) {
    var error = createError(req, undefined, err);
    Slack.serverExceptionAlert(service_id, err);
    let route = _.get(req._parsedUrl, 'pathname', req.base_url);
    let monitoringParams = getMonitoringParameters(service_id, req.query.client_id, route, RPC_CONSTANTS.HTTP_RESPONSE_CODE_ERROR, error[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE], Singleton.Config.ENV, req.start_time_ms, req.headers, '', req.body);
    PrometheusExporter.captureServerRequestDurationMetric(monitoringParams);
    Monitoring.capture.serverRequestMetric(monitoringParams);
    res.status(500).json({ err_type: error[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE],
      err_message: error[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] });
  });

  var server = app.listen(port, function() {
    Logger.system(port, 'started');
  });
  server.keepAliveTimeout = 0;
  requestStats(server, function (stats) {
    // this function will be called every time a request to the server completes.
    if(stats.res.status === RPC_CONSTANTS.HTTP_RESPONSE_CODE_OK) {
      let logData = getEndpointResponseLog(stats.req.raw);
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.NUMKEY_1] = 'request_size_bytes';
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.NUMKEY_1_VALUE] = stats.req.bytes;
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.NUMKEY_2] = 'response_size_bytes';
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.NUMKEY_2_VALUE] = stats.res.bytes;
      logData[LOG_CONSTANTS.SYSTEM_LOGS.STATUS] = _.get(stats, 'res.status', RPC_CONSTANTS.HTTP_RESPONSE_CODE_OK).toString();
      Singleton.Logger.info(logData);
      const method_url = stats.req.raw.baseUrl || _.get(stats.req.raw._parsedUrl, 'pathname');
      const path = '/' + _.split(method_url, '/')[2];
      let monitoringParams = getMonitoringParameters(service_id, stats.req.raw.query.client_id, method_url, RPC_CONSTANTS.HTTP_RESPONSE_CODE_OK, RPC_CONSTANTS.EMPTY, Singleton.Config.ENV, stats.req.raw.start_time_ms, stats.req.raw.headers, path, stats.req.raw.body);
      if(!_.includes(['/healthcheck', ecs_service_healthcheck_url, RPC_METRICS.ENDPOINT], monitoringParams.route)) {
        Monitoring.capture.serverRequestMetric(monitoringParams);
      }
    }
    Monitoring.capture.monitorPayloadSizeValue(getPayloadMonitoringParams(stats));
  });
}

function getPayloadMonitoringParams(stats) {
  let monitoringParams = {};
  monitoringParams['route'] = stats.req.raw.baseUrl || _.get(stats.req.raw._parsedUrl, 'pathname');
  monitoringParams['request_payload_size'] = stats.req.bytes,
  monitoringParams['response_payload_size'] = stats.res.bytes,
  monitoringParams['client'] = _.get(stats.req.raw.headers, 'client_id', stats.req.raw.query.client_id || stats.req.raw.client_id);
  monitoringParams['code'] = stats.res.status;
  return monitoringParams;
}

function getMonitoringParameters(service_id, client_id, method_url, http_code, error_type, env, start_time, headers, path, body) {
  let monitoringParams = {};
  monitoringParams['headers'] = headers;
  monitoringParams['service_id'] = _.get(Singleton, 'Config.SUB_SERVICE_ID', service_id);
  monitoringParams['client_id'] = _.get(headers, 'client_id', client_id);
  monitoringParams['route'] = method_url;
  monitoringParams['http_code'] = http_code;
  monitoringParams['error_type'] = error_type;
  monitoringParams['env'] = env;
  monitoringParams['start_time'] = start_time;
  monitoringParams['path'] = path;
  monitoringParams['body'] = body;
  return monitoringParams;
}

/**
 * Error Object = { err_type, err_message }
 */
function createError(req, payload, err) {
  let logData = getEndpointResponseLog(req);
  var sanitised_err = Error.sanitiseError(err);
  logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_PAYLOAD] = payload;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = sanitised_err[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE];
  logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = sanitised_err[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE];
  logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = sanitised_err[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK];
  logData[LOG_CONSTANTS.SYSTEM_LOGS.STATUS] = (sanitised_err[LOG_CONSTANTS.SYSTEM_LOGS.STATUS] || 500).toString();
  Singleton.Logger.error(logData);

  if (_.isUndefined(sanitised_err[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE]) ||
      sanitised_err[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] == Error.RPC_INTERNAL_SERVER_ERROR) {
    sanitised_err[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = null;
  }
  return sanitised_err;
}

function addCommonRequestFieldsToLog(key, value, logData) {
  key = key == 'request_id' ? LOG_CONSTANTS.COMMON_PARAMS.CUSTOMER_REQUEST_ID : key;
  if(_.includes(Object.values(LOG_CONSTANTS.COMMON_PARAMS), key)) {
    logData[key] = typeof value === "string" ? value : undefined
  }
}

function logApiRequestFields(req, logData) {
  Object.keys(req.body).forEach(function(key) { addCommonRequestFieldsToLog(_.snakeCase(key), req.body[key], logData) })
  if(_.has(req, 'headers.auth')) {
    addCommonRequestFieldsToLog(_.get(req, 'headers.auth.id_type'), _.get(req, 'headers.auth.id'), logData)
  }
}

function getEndpointResponseLog(req) {
  let logData = {};
  if(req.start_time_ms) logData[LOG_CONSTANTS.SYSTEM_LOGS.API_TIME] = Date.now() - req.start_time_ms;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVER_RESPONSE;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.CLIENT_ID] = req.headers.client_id || req.client_id || req.query.client_id;
  logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = req.method_name || req.originalUrl;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.TRANSACTION_ID] = req.trxn_id;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.USER_AGENT] = req.user_agent;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.DEVICE_NAME] = _.get(req, 'headers.x-device-os')
  logData[LOG_CONSTANTS.SYSTEM_LOGS.VERSION_NAME] = _.get(req, 'headers.x-version-name')
  logData[LOG_CONSTANTS.SYSTEM_LOGS.VERSION_CODE] = _.get(req, 'headers.x-version-code')
  logData[LOG_CONSTANTS.SYSTEM_LOGS.DEVICE_ID] = _.get(req, 'headers.x-device-id')
  logApiRequestFields(req, logData)
  return logData
}

function getMiddlewareMonitoringParams(method_url, middlewareData) {
  let monitoringParams = {};
  monitoringParams['route'] = method_url;
  monitoringParams['latency'] = middlewareData.duration;
  monitoringParams['name'] = middlewareData.name;
  return monitoringParams;
}

function sanitizedPayloadForServer(req) {
  if(_.get(req, 'headers.content-length', 2049) < 2048) {
    return JSON.stringify(req.body);
  }
  return undefined;
}
function isMethodPathValid(methodPath) {
  return methodPath.split('/').length <= 3;
}

function isMethodImplemented(methodPath, service){
  const path =  methodPath.split('/').join('.');
  const getPathValue = _.get(service, path);
  return !!getPathValue;
}

function getUrlOperationType(schema, path) {
  return _.keys(schema.paths[path])[0] == RPC_CONSTANTS.URL_OPERATION.GET ?
    _.keys(schema.paths[path])[0] : RPC_CONSTANTS.URL_OPERATION.POST
}

async function sendMonitoredMetricsPayload(req, res, exporter) {
  const client = {
    "user-agent": req.headers['user-agent'],
  }

  const metricsData = await exporter(client, req.start_time_ms);

  res.set('Content-Type', metricsData.contentType);
  res.send(metricsData.metrics);
}

function setStartTimeToRequest(req, res, next) {
  req.start_time_ms = Date.now();
  next();
}

function requestValidationFn(errors, options){
  throw new UCError({ err_type: Error.RPC_REQUEST_INVALID_ERROR, err_message: errors.map(function(e) {return `${e.dataPath} ${e.message}`}).join(",") });
}
module.exports = RpcServer;
