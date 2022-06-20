'use strict';

var _ = require('lodash');
var Promise = require('bluebird');
var Crypto = require("crypto");
var RequestPromise = require('request-promise');
var ChangeCase = require('change-case');
var Logger = require('./logging/standard_logger');
let externalServiceRequestSchema = require('./schema/external_services').getRequestSchema();
const jsonValidator = require('jsonschema').Validator;
let schemaValidator = new jsonValidator();
let http = require('http')
const Response = require('./server/response');
const PrometheusExporter = require('./monitoring/prometheus_exporter');
const ENV = process.env.NODE_ENV ? process.env.NODE_ENV : 'development';
const MycroftCapture = require('./monitoring/mycroft_capture');
const TransactionContext = require('./transaction-context');
const AuditContext = require('./audit-context');
const AuditConstants = require('./audit-context/constants');
const ErrorTypes = require('./error');
const RPC_Constants = require('./constants');
const LOG_CONSTANTS = require('./logging/log_constants');
const LOG_TYPE = require('./logging/log_type');
const Armor = require('@uc-engg/armor');
const expandSchemaRef = require('expand-swagger-refs').expanded;
const Ajv = require("ajv")
const retryablePromiseWrapper = require('./retryable_promise');
// const Error = require('./error');
const Singleton = require('./singleton').getSingleton();
const Monitoring = require('./monitoring');
const loadShed = require('./load_shed/index');
const { decorateWithCircuitBreakerOptions, persistCircuitBreakerConfig } = require('./circuit_breaker');
const CIRCUIT_BREAKER_CONSTANTS = require('./circuit_breaker/constants');
var RpcClient = {};

// Default timeout.
const TIMEOUT_MSEC = 10 * 10000;

let TRANSIENT_ERROR_CODES = new Set([
  502, // Bad Gateway
  503 // Service Unavailable
]);

/**
 * Function to capitalize circuite breaker options
 * TODO move this to armor
 */
function transformCircuitBreakerOptions(obj) {
  if (!obj) {
    return;
  }

  const newObj = {};
  _.keys(obj).forEach(key => {
    newObj[key.toUpperCase()] = obj[key];
  });

  return newObj;
}

function getApiConfig(clientOptions) {
  if (!clientOptions) {
    return {};
  }
  /**
   * to maintain backward compatibility with existing configs in SM
   * TODO remove when SM APIs are also modified to new structure
   */
  if (clientOptions.api_config) {
    return clientOptions.api_config;
  }

  /**
   * We are capitilazing this config because armor understand
   * all caps config as of now.
   * Ideally, armor should be taking in configs in small letters
   * TODO move this to armor
   */
  const api_config = {};
  if (clientOptions.api_configs) {
    _.each(clientOptions.api_configs, apiConfig => {
      api_config[apiConfig.api_name] = {
        CIRCUIT_BREAKER_OPTIONS: transformCircuitBreakerOptions(
          apiConfig.circuit_breaker_options)
      }
    })
  }
  return api_config;
}


/**
 * Create the rpc client.
 * Description in index.js file.
 */
RpcClient.createClient = function(service_id, called_service_id, schema, server_host, server_port, clientOptions) {

  let retry_options = _.get(clientOptions,"retry", {});
  let retries = retry_options.retries;
  let retryAfterMs = retry_options.retry_after_ms;
  let exponentialBackOffMultiplier = retry_options.backoff_multiplier;
  const apiConfig = getApiConfig(clientOptions);
  let EventConf = _.get(Singleton, 'Config.EVENT_CONF.platform', {});
  var client = {};
  let expandedSchema = expandSchemaRef(schema);
  let schemaValidator = {};
  const ajv = new Ajv({
    allErrors: true,
    unknownFormats: ['int32', 'int64']
  })

  function getSchemaValidator(methodName){
    try {
      const methodSchema = _.get(expandedSchema.paths, `/${methodName}.post.parameters.0.schema`, {})
      return ajv.compile(methodSchema)
    } catch (error) {
      Logger.error({
        key_1: 'schema_compilation_failed',
        key_1_value: `failed to compile the schema object using ajv for method: ${methodName}`,
        error: JSON.stringify(error)
      });
    }
  }

  function validateSchema(methodName, payload) {
    const validator = _.get(schemaValidator, methodName)
    const valid = validator(payload)
    return { valid: valid, errors: validator.errors }
  }

  function onError(options, err, extraLogs = {}) {
    const potentialError = new Error();
    const errType = _.get(err, 'error.err_type') ||  _.get(err, 'body.err_type') || ErrorTypes.RPC_EXTERNAL_SERVER_ERROR;
    const errMessage = _.get(err, 'error.err_message', err.message || '');
    const logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_CLIENT;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.CLIENT_ID] = _.get(Singleton, 'Config.SUB_SERVICE_ID' , service_id);;
    logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = _.get(options, 'uri', '');
    logData[LOG_CONSTANTS.SYSTEM_LOGS.TRANSACTION_ID] = _.get(options, 'qs.trxn_id', '');
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = errMessage;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = errType;
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_PAYLOAD] = getSanitizedPayloadForClient(err);
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = potentialError.stack;

    Logger.error({
      ...logData,
      ...extraLogs
    });
    if (errType === ErrorTypes.REQUEST_LOAD_SHEDED && !_.isEmpty(errMessage)) {
      const errMsg = JSON.parse(errMessage);
      loadShed.updateDownstreamServiceMap(errMsg.service, errMsg.api, errMsg.client, errMsg.priority);
    }
    let errObj = {
      err_type: errType,
      err_message: errMessage,
      err_stack: potentialError.stack
    };
    if (errType === ErrorTypes.REQUEST_LOAD_SHEDED) {
      errObj.code = RPC_Constants.HTTP_RESPONSE_CODE_TOO_MANY_REQUESTS;
    }
    throw new ErrorTypes.UCError(errObj);    
  }

  function circuitBreakerFallback(err, fallbackParams) {
    const options = fallbackParams[0];
    const logs = {
      [LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_PAYLOAD]: err.message,
      [LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1]: 'circuit_breaker',
      [LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE]: 'true'
    };
    _.set(err, 'error.err_type', _.get(err, 'error.err_type', ErrorTypes.CIRCUIT_BREAKER_ERROR));
    onError(options, err, logs);
  }

  /**
   * fetches the circuitBreakerOptions from config/constants.
   */
  function getCircuitBreakerOptions(apiConfig, method_name, called_service_id) {
    let circuitBreakerOptions = _.get(apiConfig, `${method_name}.CIRCUIT_BREAKER_OPTIONS`, null);

    if(!circuitBreakerOptions || !circuitBreakerOptions.ENABLE) {
      circuitBreakerOptions = CIRCUIT_BREAKER_CONSTANTS.DEFAULT_CIRCUIT_BREAKER_OPTIONS[called_service_id]; // to enforce circuit breaker options if the external service wants so.
    }
    return circuitBreakerOptions;
  }

  function getError(type, msg) {
    return { 'error': { 'err_type': type, 'err_message': msg } };
  }

  function callInAsync(method_name, req) {
    let eventName = ChangeCase.lowerCase(called_service_id.split('-').join('') + '_' + method_name.split('/').join('_'));
    if (_.get(EventConf, `topicsToPublish.${service_id}`, []).includes(eventName)) {
      /* Handling old async flow. */
      if (!_.isNil(req[RPC_Constants.EVENT_PRIORITY_KEY])) {
        if (!_.includes(RPC_Constants.EVENT_PRIORITY_LEVELS, req[RPC_Constants.EVENT_PRIORITY_KEY])) {
          onError({}, getError(ErrorTypes.RPC_INTERNAL_SERVER_ERROR,
              `${req[RPC_Constants.EVENT_PRIORITY_KEY]} is not a valid ${RPC_Constants.EVENT_PRIORITY_KEY}`));
        }
        eventName = eventName + '_' + req[RPC_Constants.EVENT_PRIORITY_KEY];
      }
    } else {
      eventName = ChangeCase.lowerCase(called_service_id + '_' + method_name.split('/').join('_'));
      req.metadata = {
        methodName: method_name,
        isAsyncApi: true,
        schemaValidationDetails: validateSchema(method_name, req)
      }
    }

    if (!(RPC_Constants.DEPENDENCY.ID.event_producer in Singleton)) {
      onError({}, getError(ErrorTypes.RPC_INTERNAL_SERVER_ERROR,
        `${RPC_Constants.DEPENDENCY.ID.event_producer} is not initialised.`));
    }

    return Singleton[RPC_Constants.DEPENDENCY.ID.event_producer].sendEvent(eventName, req, service_id);
  }

  _.forEach(schema.paths, function(data, path) {
    var method_name = path.substring(1);
    const nestedPath = method_name.split('/').join('.');

    /* Compiling schema & storing schema validator for async api call.*/
    _.set(schemaValidator, method_name, getSchemaValidator(method_name))

    const methodImplementation = function (req, callingType = RPC_Constants.CALL_TYPE_SYNC) {
      const debugMode = _.get(Singleton, 'Config.CUSTOM.logging_options.debug_mode');

      if (callingType === RPC_Constants.CALL_TYPE_ASYNC) {
        return callInAsync(method_name, req);
      }

      var trxn_id = TransactionContext.getTrxnId() || "A-" + RpcClient.createTrxnId();
      const language = TransactionContext.getTrxnLanguage()
      const priority = TransactionContext.getPriority();
      const basicQuery = {
        trxn_id: trxn_id,
        client_id: service_id,
        priority,
        language 
      };

      // SessionContext.run(function() {
      var options = {
        method: 'POST',
        uri: 'http://' + server_host + ':' + server_port + '/' + called_service_id + '/' + method_name,
        qs: getQSWithAuditContextVariables(basicQuery),
        body: req,
        json: true,
        timeout: TIMEOUT_MSEC,
        headers: {},
        resolveWithFullResponse: true
      };

      if (debugMode) { options['time'] = true; }

      if(!_.has(options, 'headers')){
        options['headers'] = {};
      }

      const source = _.get(Singleton, 'Config.SOURCE_TYPE' , RPC_Constants.SOURCE_TYPE.SERVICE);
      const clientId = _.get(Singleton, 'Config.SUB_SERVICE_ID' ,options.qs.client_id);
      options.headers['client_id'] = source === RPC_Constants.SOURCE_TYPE.WORKFLOW ? `${clientId}-${RPC_Constants.SOURCE_TYPE.WORKFLOW}` : clientId;
      options.headers['external_service_id'] = called_service_id;
      options.headers['method_name'] = method_name;
      options.headers['start_time_ms'] = Date.now();
      options.headers['connection'] = 'keep-alive';
      options.agent = _.get(Singleton, 'globalHttpAgent');

      let logData = {};
      logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_CLIENT;
      logData[LOG_CONSTANTS.SYSTEM_LOGS.CLIENT_ID] = _.get(Singleton, 'Config.SUB_SERVICE_ID' , service_id);
      logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = options.uri;
      Singleton.Logger.debug(logData);
  
      let circuitBreakerOptions = getCircuitBreakerOptions(apiConfig, method_name, called_service_id);

      if(circuitBreakerOptions) {
        _.set(circuitBreakerOptions, 'key', `${service_id}#${nestedPath.split('.').join('#')}`);
      }
      var retryableRequestPromiseFn = retryablePromiseWrapper(getRequestPromise, retries, retryAfterMs,
          exponentialBackOffMultiplier, shouldRetryOnError);
      
      return Monitoring.promiseWrapper(decorateWithCircuitBreakerOptions(retryableRequestPromiseFn), true)(options, circuitBreakerOptions, circuitBreakerFallback, onError);
    };
    _.set(client, nestedPath, methodImplementation);
  });

  persistCircuitBreakerConfig(service_id, called_service_id, apiConfig);

  return client;
};

/**
 * adds audit context to query string
 */
function getQSWithAuditContextVariables(jsondata) {
  const key = AuditConstants.CLIENT_USER_ID;
  const val = AuditContext.get(key);
  if (val) jsondata[key] = val;
  return jsondata;
}


function getRequestPromise(options){
  //handling for downstream
  const service = _.get(options, 'headers.external_service_id');
  const uri = _.get(options, 'uri');
  const api =  _.split(uri, service)[1];
  let isAPIAllowed = true;
  const reqPriority = _.get(options, 'qs.priority');
  if (service && api) isAPIAllowed = loadShed.isDownStreamAPIAllowed(service, api, reqPriority);
  if (isAPIAllowed) return RequestPromise(options).promise();
  else return new Promise((resolve, reject) => {
    const errObj = new ErrorTypes.UCError({
      err_type: ErrorTypes.REQUEST_LOAD_SHEDED,
      code: RPC_Constants.HTTP_RESPONSE_CODE_TOO_MANY_REQUESTS,
    })
    var sanitised_err = ErrorTypes.sanitiseError(errObj);
    const errResp = Response.getErrorResponse(sanitised_err)
    reject(errResp);
  });
}


function shouldRetryOnError(err){
  return TRANSIENT_ERROR_CODES.has(err.statusCode);
}


/**
 * Create external service client with circuit breaker options.
 * Circuit breaker config structure:
 * {CIRCUIT_BREAKER_OPTIONS: {ENABLE: true, TIMEOUT: 5000, CIRCUIT_BREAKER_FORCE_CLOSED: true}}
 * Other default values and field descriptions is present in armor repo at path /configs/circuit_breaker.js
 *
 * @param {string} service_id
 * @param {string} external_service_id
 * @param {json} config to contain CIRCUIT_BREAKER_OPTIONS
 * @returns {object} client object containing a function - requestPromise to make external call
 */
RpcClient.createExternalClient = function(service_id, external_service_id, config) {
  let Client = {};
  let Command = Armor.initCircuitBreaker();
  let externalServiceId = external_service_id;
  let configs = config;
  let serviceId = service_id;

  /**
   * RequestPromise call to external service
   * @param requestOptions {json} request promise options to match the schema present in /external-services/request_promise
   * @returns {promise} RequestPromise call response
   * @throws UCError and ExternalError
   */
  Client.requestPromise = (requestOptions) => {

    if(!_.has(requestOptions, 'headers')){
      requestOptions['headers'] = {};
    }

    let external_url = _.split(_.replace(requestOptions.uri, /(https?:\/\/)?(www.)?/i, ''), '@')
    external_url = _.split(external_url[external_url.length -1], '/')[0]

    requestOptions.headers['start_time_ms'] = Date.now();
    requestOptions.headers['client_id'] = _.get(Singleton, 'Config.SUB_SERVICE_ID' , serviceId);
    requestOptions.headers['external_service_id'] = externalServiceId;
    requestOptions.headers['method_name'] = external_url;

    const circuitBreakerOptions = _.get(configs, 'CIRCUIT_BREAKER_OPTIONS');
    if(circuitBreakerOptions) {
      _.set(circuitBreakerOptions, 'key', externalServiceId);
    }
    
    let schemaValidationResult = schemaValidator.validate(requestOptions, externalServiceRequestSchema);
    if(!schemaValidationResult.valid) {
      throw new ErrorTypes.UCError({
        err_type: ErrorTypes.RPC_INTERNAL_SERVER_ERROR,
        err_message: "External service call request options schema validation failed. " + JSON.stringify(schemaValidationResult.errors)
      });
    }
    return Monitoring.promiseWrapper(decorateWithCircuitBreakerOptions(requestPromiseCall))(requestOptions, circuitBreakerOptions, circuitBreakerFallback, logExternalError);
  };

  /**
   * This function is used to make external calls. The external call should be a library or a non-request-promise call.
   * @param params parameters which will be passed to runFunction
   * @param runFunction A promisified function which will make the external call.
   * @returns {promise} Response from runFunction
   * @throws UCError and ExternalError
   */
  Client.execute = (params, runFunction) => {

    if(!_.has(params, 'headers')){
      params['headers'] = {};
    }
    params.headers['start_time_ms'] = Date.now();
    params.headers['client_id'] = _.get(Singleton, 'Config.SUB_SERVICE_ID' , serviceId);
    params.headers['external_service_id'] = externalServiceId;
    params.headers['method_name'] = runFunction.name || "unknown";

    const circuitBreakerOptions = _.get(configs, 'CIRCUIT_BREAKER_OPTIONS');
    if(circuitBreakerOptions) {
      _.set(circuitBreakerOptions, 'key', externalServiceId);
    }

    return Monitoring.promiseWrapper(decorateWithCircuitBreakerOptions(runFunction))(params, circuitBreakerOptions, circuitBreakerFallback, logExternalError);
  };

  function requestPromiseCall(options) {
    return RequestPromise(options);
  }

  function circuitBreakerFallback(err, params) {
    _.set(err, 'err_type', _.get(err, 'err_type', ErrorTypes.CIRCUIT_BREAKER_ERROR));
    logExternalError(params[Command.constants.RUN_PARAMS_INDEX], err);
  }

  function logExternalError(payload, err) {
    const isCircuitBreakerEnabled = _.get(configs, 'CIRCUIT_BREAKER_OPTIONS.ENABLE', false);
    const errType = isCircuitBreakerEnabled ? ErrorTypes.CIRCUIT_BREAKER_ERROR : ErrorTypes.RPC_EXTERNAL_SERVER_ERROR;
    let logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_CLIENT;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.CLIENT_ID] = _.get(Singleton, 'Config.SUB_SERVICE_ID' , serviceId);;
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = JSON.stringify(err.message);
    logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = errType;
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_PAYLOAD] = JSON.stringify(payload);
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = JSON.stringify(err.stack);
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'circuit_breaker';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = isCircuitBreakerEnabled.toString();
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2] = 'external_service_id';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2_VALUE] = externalServiceId;
    Logger.error(logData);
    throw new ErrorTypes.ExternalError(err);
  }

  return Client;
};

RpcClient.createTrxnId = function() { return Crypto.randomBytes(16).toString("hex"); };

function getSanitizedPayloadForClient(err) {
  if(_.get(err, 'response.request.headers.content-length', 2049) < 2048) {
    return JSON.stringify(_.get(err, 'options.body', ''));
  }
  return undefined;
}

module.exports = RpcClient;
