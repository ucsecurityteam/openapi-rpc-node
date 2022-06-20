'use strict';
require('cls-hooked');
let retryablePromiseWrapper = require('./retryable_promise');
const BackgroundTransactionTracker = require('./monitoring/background-transaction-tracker');
// Add newrelic instrumentation
if (process.env.NEW_RELIC_ENABLED === 'true') require('newrelic');

const TransactionContext = require('./transaction-context');

var RpcClient = require('./rpc-client');
var RpcServer = require('./rpc-server');

var _ = require('lodash');
var Promise = require('bluebird');

var LoggerHelper = require('./logger');
let StandardLogger = require('./logging/standard_logger');
var ConfigHelper = require('./config');
var Singleton = require('./singleton');
var Error = require('./error');
var Slack = require('./slack');
const LOG_CONSTANTS = require('./logging/log_constants');
const RPC_CONSTANTS =  require('./constants');
const STANDARD_LOGGING_DISABLED = require('./logging/service_whitelist').STANDARD_LOGGING_DISABLED;
const ApmTransactionTracker = require('./apm-transaction-tracker');
var Server = require('./server');
var Localisation = require('./localisation');
const UCError = Error.UCError;
const IS_PROMETHEUS_MONITORING_ENABLED = process.env.PROMETHEUS_MONITORING_ENABLED == 'true' ? true : false;
const PrometheusMonitoring = require('./dependency/prometheus_monitoring');
const MycroftMonitoring = require('./dependency/mycroft_monitoring');
const PrometheusExporter = require('./monitoring/prometheus_exporter');
const Monitoring = require('./monitoring');
const openApiObj = require('./schema/services/fetch_schema_object');
const Agent = require('agentkeepalive');
var RpcFramework = {};

/**
 * @param service_id
 *
 * @return <config>
 */
RpcFramework.initConfig = function(service_id, options) {
  var config = ConfigHelper.initConfig(service_id, options);
  this.addToSingleton('Config', config);
  return config;
};

RpcFramework.initAuditContext = function (params) {
  params = params || {};

  const AuditContext = require('./audit-context');
  const AuditContextConstants = require('./audit-context/constants');
  AuditContext.patchBluebird(params.bluebird);
  this.addToSingleton('AuditContext', AuditContext);
  this.addToSingleton('AuditContextConstants', AuditContextConstants);
  return AuditContext;
};
/**
 * @param service_id
 *
 * @return <Promise of config>
 */
RpcFramework.initCredentials = function(service_id) {
      return ConfigHelper.initCredentials(service_id);    
};

function isStandardLoggingDisabled(service_id) {
  return STANDARD_LOGGING_DISABLED.includes(service_id);
}

/**
 * Returns a logger for the service.
 * It uses efk logs and exposes info, error.
 * @param service_id
 * @return Logger { info(data), error(data) }
 */
RpcFramework.initLogger = function(options) {
  let service_id = (_.isObject(options) && options.service_id) ? options.service_id : options;
  let logger = {};
  if(!isStandardLoggingDisabled(service_id)) {
    logger = {
      info: function(data) { TransactionContext.addTransactionDataToLog(data); StandardLogger.info(data); },
      debug: function(data) { TransactionContext.addTransactionDataToLog(data); StandardLogger.debug(options, data); },
      error: function(data) { TransactionContext.addTransactionDataToLog(data); StandardLogger.error(data); },
      api_success: function(response, extra) { StandardLogger.api_success(response, extra); },
      api_error: function (response, extra, error) { StandardLogger.api_error(response, extra, error); },
      exit_after_flush: function () { StandardLogger.exitAfterFlush(); }
    };
  }
  else {
    logger = {
      info: function(data) { TransactionContext.addTransactionDataToLog(data); LoggerHelper.info(data); },
      debug: function(data) { TransactionContext.addTransactionDataToLog(data); LoggerHelper.debug(options, data); },
      error: function(data) { TransactionContext.addTransactionDataToLog(data); LoggerHelper.error(data); },
      api_success: function(response, extra) { LoggerHelper.api_success(response, extra); },
      api_error: function (response, extra, error) { LoggerHelper.api_error(response, extra, error); },
      exit_after_flush: function () { LoggerHelper.exitAfterFlush(); }
    };
  }
  this.addToSingleton('LOG_CONSTANTS', LOG_CONSTANTS)
  this.addToSingleton('Logger', logger);
  return logger;
};

RpcFramework.initSlack = function (service_id) {
  var slackObject = {
    "sendCustomMessage": function(message) { Slack.sendCustomMessage(service_id, message) },
    "sendCustomMessageOnChannel":   // This method will be deprecated soon as this requires the channel to be present in service-config file. Please use sendSlackMessage().
      function (message, channel) {
        Slack.sendCustomMessageOnChannel(service_id, message, channel)
      },
    sendSlackMessage: Slack.sendSlackMessage,
    sendSlackBlockMessage: Slack.sendSlackBlockMessage,
    lookupUserByEmail: Slack.lookupUserByEmail
  };
  this.addToSingleton('Slack', slackObject);
  return slackObject;
};

/**
 * Add UCError class to Singleton and global object.
 */
RpcFramework.initUCError = function() {
  global.UCError = Error.UCError;
  this.addToSingleton('UCError', Error.UCError);
  return Error.UCError;
}
/**
 * This is to generate a transaction id which is passed in an api call. This is exposed for monoliths. For microservices, its inbuilt.
 */
RpcFramework.initTransactionContext = function (params) {
  params = params || {};
  TransactionContext.patchBluebird(params.bluebird);
  this.addToSingleton('TransactionContext', TransactionContext);
  return TransactionContext;
}

/**
 * This provides functionality to have a detailed tracing of a transaction in your service.
 * Use this in cases where apm monitoring is unable to provide detailed analysis of an api call.
 * For Example: If a service api returns a response . There is a service call to chanakya api, chanakya received the call,
 * triggers a worker and provides a respones with status as 'processing'. In this case apm will not track what is happening
 * in the background in worker. to track the worker we need this functionality.
 * Usage example: https://sourcegraph.urbanclap.com/gitlab.urbanclap.com/urbanclap/chanakya/-/blob/main/core/dataHooks/eventProcessor.js#L1338
 */
RpcFramework.initBackgroundTransactionTracker = function(){
  this.addToSingleton('ApmTransactionTracker', ApmTransactionTracker);
  this.addToSingleton('BackgroundTransactionTracker', BackgroundTransactionTracker);
  return ApmTransactionTracker;
}

/** createClient(client_id, auth_token, method_names, t_interface, server_host, server_port)
 *
 * @param service_id – Service ID of the 'caller' service
 * @param called_service_id – Service ID of the 'called' service\
 * @param schema – service's openapi schema.
 * @param server_host – IP of the host service
 * @param server_port – Port of the host service
 * @param client_options - additional options for creating this client, includes:
 *            retry : retry options:
 *                retries
 *                retryAfterMs
 *                backOffFactor
 *                errorHandler
 *                timeoutInMs
 *            keep_alive: object with options for http connection keep-alive. Properties:
 *                enabled: set it to true if you want to use keep-alive
 *                maxSockets: max number of open sockets connected to server
 *            api_config: object containing API-level configuration like circuit_breaker_options,
 *             eg:  "getCartItems": {
 *                    "CIRCUIT_BREAKER_OPTIONS": {
 *                        "ENABLE": true, // Circuit breaker will be bypassed if this is set to false
 *                        "TIMEOUT": 2000, // in milliseconds. There will be an error thrown if timeout occurs
 *                        "CIRCUIT_BREAKER_FORCE_CLOSED": true  // if set to true, the circuit will never break, only the timeout will occur
 *                    }
 *                }
 *
 * @return client { method1: function(..) , method2: function(..) , ....... }
 *
 * eg.
 *     var client = createClient(...);
 *     var header = createHeader(...); // read from the docs
 *     client.method( header, arg1, arg2, ... )
 */
RpcFramework.createClient = function(service_id, called_service_id, schema, server_host, server_port, client_options) {
  return RpcClient.createClient(service_id, called_service_id, schema, server_host, server_port, client_options);
};

/**
 * Create a client for an external service. You can add functionalities like circuit breaker and timeout through configuration.
 * @param service_id
 * @param external_service_id
 * @param config With this you can configure circuit breaker and timeout for your calls. Given below is a sample example.
 *  "CIRCUIT_BREAKER_OPTIONS": {
 *    "ENABLE": true, // Circuit breaker will be bypassed if this is set to false
 *    "TIMEOUT": 2000, // in milliseconds. There will be an error thrown if timeout occurs
 *    "CIRCUIT_BREAKER_FORCE_CLOSED": true  // if set to true, the circuit will never break, only the timeout will occur
 *  }
 *  There are other default parameters which can be overridden. To view the complete list of options, view this page:
 *  https://gitlab.urbanclap.com/urbanclap/armor/blob/master/configs/circuit_breaker.js
 *
 *  Code Example: https://gitlab.urbanclap.com/urbanclap/communication-service/commit/d3d238f43b4dcfcfeefe5758e7f42b63b84ef286
 *
 *  Functionalities:
 *  client.requestPromise(body) : This is to make a http call to external service through 'request-promise' npm library.
 *    It takes the body parameter same as the request-promise library will take.
 *  client.execute(params, runFunction) : This functionality is to call an external service through a library funcation call.
 *    Its first parameter takes library function arguments and second parameter is the library function itself.
 */
RpcFramework.createExternalClient = function(service_id, external_service_id, config) {
  return RpcClient.createExternalClient(service_id, external_service_id, config);
};

/**
 * Create the RPC (openapi) service.
 *
 * @param service_id
 * @param auth_service_ids – [] Service's that are allowed to query. Undefined means no auth.
 * @param schema – service's openapi schema.
 * @param service – Implementation – { <method_name> : function(..) {..} }
 * @param port
 *
 * @return server { end: function() }
 */
 RpcFramework.createServer = function(service_id, auth_service_ids, schema, service, port) {
  return RpcServer.createServer(service_id, auth_service_ids, schema, service, port);
};

/**
 * Creates a 16-char string as trxn-id.
 */
RpcFramework.createTrxnId = function() {
  return RpcClient.createTrxnId();
}

/**
 * This allows you to store global objects.
 * This is partiularly useful for storing initialised DB connections, config, logger, etc.
 * How to use –
 *   Singleton = require('@uc-engg/openapi-rpc-node').getSingleton();
 *   Logger = Singleton.Logger;
 *   Config = Singleton.Config;
 *   MongoMainStore = Singleton.mongoMainStore;
 *   MongoMainStore.getUser(...);
 *   Config.SERVICE_ID;
 *   Logger.SERVICE_ID;
 */
RpcFramework.getSingleton = function() {
  return Singleton.getSingleton();
}

/**
 * Add to the singleton.
 * Config (default)
 * Logger (default)
 *
 * eg –
 * DBs / Stores – eg. RedisMainStore, MongoMainStore, MysqlMainStore, MysqlMonetisationStore, etc
 */
RpcFramework.addToSingleton = function(key, value) {
  return Singleton.addToSingleton(key, value);
}
/** adds multiple key,value pairs */
RpcFramework.addObjToSingleton = function(obj) {
  return Singleton.addObjToSingleton(obj);
}

RpcFramework.getDependencyConfig = function() {
  return RPC_CONSTANTS.DEPENDENCY;
}

RpcFramework.getGatewayConstants = function() {
  return RPC_CONSTANTS.GATEWAY
}

/**
 * Run workflow tasks. src/workflow/index changes example:
 * require('@uc-engg/openapi-rpc-node').initWorkflow();
 *
 * For more details, refer below document:
 * https://urbanclap.atlassian.net/wiki/spaces/ENGG/pages/1191051293/How+to+write+a+script+in+nodejs
 */
RpcFramework.initWorkflow = function() {
  return Server.initWorkflow(RpcFramework);
}

/**
 * Run service. server.js file changes example:
 * let RPCFramework = require('@uc-engg/openapi-rpc-node').initService()
 *
 * For more details, refer below document:
 * https://urbanclap.atlassian.net/wiki/spaces/ENGG/pages/1192132689/How+to+write+a+service+in+nodejs
 */
RpcFramework.initService = function() {
  return Server.initService(RpcFramework);
}

/**
 * Run the service using using the Service object. server.js file changes example:
 *
 *  let Service = require('@uc-engg/openapi-rpc-node').getService();
 *
 *  Service.initDependency()
 *  .then(function () {
 *    let controller = require('./src/index');
 *    Service.initServer(controller);
 *   })
 *
 * For more details, refer below document:
 * https://urbanclap.atlassian.net/wiki/spaces/ENGG/pages/1192132689/How+to+write+a+service+in+nodejs
 */
RpcFramework.getService = function() {
  return new Server.service(RpcFramework);
}

/**
 * Run workflow task using using the Workflow object. src/workflow/index file changes example:
 *
 *  let workflow = require('@uc-engg/openapi-rpc-node').getWorkflow();
 *
 *  workflow.initDependency()
 *  .then(function () {
 *    let taskController = require("./src/workflow/" + workflow.TASK_NAME)
 *    workflow.initServer(taskController);
 *  })
 *
 * For more details, refer below document:
 * https://urbanclap.atlassian.net/wiki/spaces/ENGG/pages/1191051293/How+to+write+a+script+in+nodejs
 */
RpcFramework.getWorkflow = function() {
  return new Server.workflow(RpcFramework);
}

/**
 * A request Promise wrapper that can wrap a function with retry and timeout functionalities.
 * @param runFunction The function that you want to wrap and call.
 * @param retryOptions Given below are the fields it accepts:
 * retries - The maximum number of times you want to retry the function call in case of a failure.
 * retryAfterMs - The number of milliseconds you want to wait before retrying. The actual back off time is calculated as: retryAfterMs X backOffFactor.
 * backOffFactor - Used in calculation of the next back off time in case of a failure (current back off time X backOffFactor).
 * errorHandler - A function that is called every time there's a failure (before retying). This function takes the error that caused the failure as a param. The function should return true if you want to retry, else false (in which case there will be no retries).
 * timeoutInMs - The max milliseconds you want to wait before the function should throw a timeout error. A value of 0 means the function will use its default timeout.

 * Mandatory keys:
 * -runFunction
 *
 * retryOptions default values:
 * retries -> 2
 * retryAfterMs -> 100
 * backOffFactor -> 1
 * timeoutInMs -> 0
 *
 * Example:
 * let retryablePromise = require('@uc-engg/openapi-rpc-node').getRetryablePromise;
 * let retryOptions = {
 *  retries: 3,
 *  timeoutInMs: 2000,
 *  errorHandler: function(err) {return true;}
 * };
 * let runFuncRetryable = retryablePromise(runFunction, retryOptions);
 * runFuncRetryable(<args>)
 * .then(() => {
 *  <on success>
 * })
 * .catch(() => {
 * <on failure>
 * })
 */
RpcFramework.getRetryablePromise = function(runFunction, retryOptions) {

  if(!runFunction || typeof runFunction !== 'function')
    throw new UCError({err_type: Error.INVALID_PARAMS_ERROR, err_message: "runFunction is mandatory"});

  return retryablePromiseWrapper(runFunction, retryOptions.retries,
    retryOptions.retryAfterMs, retryOptions.backOffFactor, retryOptions.errorHandler,
    retryOptions.timeoutInMs);
}

/**
 * Returns a Localisation for the service.
 * @param {service_id : "service id" , singleton_id : "singleton_id" }
 * service_id : Mandatory param
 * singleton_id : Optional param // This will be used to add it to singleton
 * @return  { }
 */

RpcFramework.initLocalisation = function(options){
  let localisation, singletonId;
  try {
    let serviceId = options.service_id;
    singletonId = options.singleton_id ? options.singleton_id : "localization"
    localisation = new Localisation.initLocalisationService(serviceId, RpcFramework)
    this.addToSingleton(singletonId, localisation);
  } catch (error) {
    throw new UCError({err_type: Error.SERVICE_INIT_ERROR, err_message: error});
  }
  
}

/**
 * Adds prometheus exporter to singleton which can be used to
 * capture application metrics.
 * @param {singleton_id : "singleton_id" }
 * singleton_id : Optional param // This will be used to add it to singleton
 * @return  { }
 */

RpcFramework.initPrometheusMonitoring = function(options){
  let serviceId = options ? options.SERVICE_ID : undefined;
  if(IS_PROMETHEUS_MONITORING_ENABLED) {
    PrometheusMonitoring.initPrometheusMonitoringClient({SERVICE_ID: serviceId}, RpcFramework);
  }
  this.addToSingleton('PrometheusExporter', PrometheusExporter);
}

/**
 * Adds mycroft exporter to singleton which can be used to capture application metrics
 */
RpcFramework.initMycroftMonitoring = function (options) {
  let serviceId = options ? options.SERVICE_ID : '';
  MycroftMonitoring.initMonitoringClient(serviceId, RpcFramework);

  this.addToSingleton('MycroftExporter', {
    captureServerRequestMetric: Monitoring.capture.serverRequestMetric,
    captureClientRequestMetric: Monitoring.capture.clientRequestMetric,
    exportMetrics: Monitoring.exporter.RPCMetrics
  });
}

RpcFramework.initGlobalHttpAgent = function (options = {}) {
  const agentOptions = _.assign({}, RPC_CONSTANTS.CLIENT.HTTP_AGENT_DEFAULT_OPTIONS, options);
  this.addToSingleton('globalHttpAgent', new Agent(agentOptions));
}

module.exports =  RpcFramework;

