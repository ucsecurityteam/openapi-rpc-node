const Authentication = require('../auth');
const _ = require('lodash');
const RPC_CONSTANTS = require('../constants');
const Error = require('../error');
const UCError = Error.UCError;
const Logger = require('../logging/standard_logger');
const Slack = require('../slack');
const compose = require('composable-middleware');
const LOG_CONSTANTS = require('../logging/log_constants');
const LOG_TYPE = require('../logging/log_type');
const Singleton = require('../singleton').getSingleton();
const multipart = require('connect-multiparty');
const getLocalizedResponse = require('../localisation/middleware').getLocalizedResponse;
const rateLimiter = require('../rate_limit').serverRateLimiter;
const loadSheding = require('../load_shed').loadShedManager;
const validator = require('swagger-express-validator');
const expandSchemaRef = require('expand-swagger-refs').expanded;
const AuditContext = require('../audit-context')

Middleware = {};

function multipartHandler() {
  return function multipartHandlerMiddleware(req, res, next) {
      let fileData = _.get(req, 'files.file') || null;
      _.set(req.body, 'multipart.file', fileData);
      next();
  }
}

function initAuthMiddlewares(app, method_url, method_path) {

  let authMiddlewares = _.get(Singleton.GATEWAY_CONFIG, `api.${method_path}.${RPC_CONSTANTS.GATEWAY.MIDDLEWARE.TYPE.AUTH}`);

    // Convert to an array, if not already.
    authMiddlewares = (Array.isArray(authMiddlewares)) ? authMiddlewares : [authMiddlewares]

    _.forEach(authMiddlewares, (applyAuthMiddleware) => {
      applyAuthFunctions(app, method_url, applyAuthMiddleware);
    })
}

function applyAuthFunctions(app, method_url, api_auth_config) {

  if(api_auth_config) {
    let authFunction = Authentication[api_auth_config.method];
    if (!authFunction)
      throw new UCError({ err_type: Error.RPC_AUTH_ERROR, 
        err_message: `Wrong method passed in gateway.config.js, for auth` });
    app.use(method_url, authFunction(api_auth_config.options || {}));
    // TODO @pranavsid: Move audit context as a pre run middleware.
    if (api_auth_config.method === RPC_CONSTANTS.GATEWAY.MIDDLEWARE.AUTH_METHOD.GOOGLE_AUTHENTICATION) {
      app.use(method_url, AuditContext.getExpressMiddleware());
    }
  }
}

function verifyAuthId(service_id, auth_service_ids) {
  return function verifyAuthIdMiddleware(req, res, next) {
      passed_client_id = req.query.client_id;
      user_agent = req.headers['user-agent'];
      if (_.isArray(auth_service_ids) && !_.includes(auth_service_ids, passed_client_id) && !_.includes(auth_service_ids, RPC_CONSTANTS.DEFAULT_AUTH)) {
        let logData = {};
        logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
        logData[LOG_CONSTANTS.SYSTEM_LOGS.CLIENT_ID] = passed_client_id;
        logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = req.method_name;
        logData[LOG_CONSTANTS.SYSTEM_LOGS.API_TIME] = Date.now() - req.start_time_ms;
        logData[LOG_CONSTANTS.SYSTEM_LOGS.TRANSACTION_ID] = req.trxn_id;
        logData[LOG_CONSTANTS.SYSTEM_LOGS.USER_AGENT] = user_agent;
        logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = Error.RPC_AUTH_ERROR;
        logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = "client not authorized to query the service";
        Logger.error(logData);
        Slack.serverExceptionAlert(service_id, { method_name: req.method_name, trxn_id: req.trxn_id, error_type: Error.RPC_AUTH_ERROR })
        throw new UCError({ err_type: Error.RPC_AUTH_ERROR, err_message: `Invalid client id: ${passed_client_id}`});
      }
      next();
    };
}

function validateServiceAuthId(app, method_url, service_id, auth_service_ids) {
  app.use(method_url, verifyAuthId(service_id, auth_service_ids));
}

function initMultipartMiddleware(app, method_url, method_path) {
  if (_.get(Singleton.GATEWAY_CONFIG, `api.${method_path}.${RPC_CONSTANTS.GATEWAY.MIDDLEWARE.TYPE.MULTIPART}`)) {
    app.use(method_url, multipart(), multipartHandler());
  }
}

function initLocalisationMiddleware(app, method_url, method_path) {
  try {

      let localisationOptions = _.get(Singleton.GATEWAY_CONFIG, `api.${method_path}.${RPC_CONSTANTS.GATEWAY.MIDDLEWARE.TYPE.LOCALISATION}`);
      
      if (localisationOptions && (typeof localisationOptions === "boolean" || (typeof localisationOptions === "object" && localisationOptions.isAllowed))) {
        
        // localise the success response.
        app.use(method_url, function localisationMiddleware(req, res, next) {
          req.headers["localisation-options"] = localisationOptions;
          getLocalizedResponse(null, req, res, next)
        });
        
        // localise the error response
        app.use(method_url, function localisationMiddleware(err, req, res, next) {
          req.headers["localisation-options"] = localisationOptions;
          getLocalizedResponse(err, req, res, next)
        });
        
      }
  } catch (error) {
      let logData = {};
      logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'initLocalisationMiddlewareError';
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] =  JSON.stringify(error);
      Logger.info(logData);
      throw error;
  }
  
}

function responseValidationFn(req, data, errors) {
  req.method_name = req.method_name || req.baseUrl;
  let logData = {};
  logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.CLIENT_ID] = req.headers.client_id || req.query.client_id;
  logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.MESSAGE] = data;
  logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = req.method_name;
  if (_.get(req, 'start_time_ms')) logData[LOG_CONSTANTS.SYSTEM_LOGS.API_TIME] = Date.now() - req.start_time_ms;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.TRANSACTION_ID] = req.query.trxn_id;
  logData[LOG_CONSTANTS.SYSTEM_LOGS.USER_AGENT] = req.headers['user-agent'];
  logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = Error.RPC_RESPONSE_INVALID_ERROR;
  logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = errors.map(function(e) {return e.message}).join(",");
  Singleton.Logger.error(logData);
  throw new UCError({ err_type: Error.RPC_RESPONSE_INVALID_ERROR, err_message: errors.map(function(e) {return `${e.dataPath} ${e.message}`}).join(",") });
}

function initRateLimitMiddleware (app, method_url, method_path) {
  app.use(method_url, rateLimiter);
}

function initLoadShedMiddleware (app, method_url, method_path) {
  app.use(method_url, loadSheding)
}

function initResponseValidatorMiddleware(app, method_url, schema) {
  app.use(method_url, validator({
    schema: expandSchemaRef(schema),
    validateRequest: false,
    validateResponse: true,
    responseValidationFn: responseValidationFn
  }));
}

Middleware.initPreRunMiddlewares = function (app, method_url, method_path, options) {
  initRateLimitMiddleware(app, method_url, method_path);
  initLoadShedMiddleware(app, method_url, method_path);
  if (Singleton.GATEWAY_CONFIG) {
    initResponseValidatorMiddleware(app, method_url, options.schema);
    initAuthMiddlewares(app, method_url, method_path);
    initMultipartMiddleware(app, method_url, method_path);
  }
  else {
    validateServiceAuthId(app, method_url, options.service_id, options.auth_service_ids);
  }
}

Middleware.initPostRunMiddlewares = function (app, method_url, method_path, options) {
  
  if (Singleton.GATEWAY_CONFIG) {
    initLocalisationMiddleware(app, method_url, method_path);
  }
}

Middleware.logRequest = function logRequest(req, res, next) {
  const debug_mode = _.get(Singleton, 'Config.CUSTOM.logging_options.debug_mode');
  if(debug_mode) {
    let logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.CLIENT_ID] = req.headers.client_id || req.client_id || req.query.client_id;
    logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = req.baseUrl || _.get(req._parsedUrl, 'pathname');
    logData[LOG_CONSTANTS.SYSTEM_LOGS.TRANSACTION_ID] = req.trxn_id;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.USER_AGENT] = req.user_agent;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.DEVICE_NAME] = _.get(req, 'headers.x-device-os')
    logData[LOG_CONSTANTS.SYSTEM_LOGS.VERSION_NAME] = _.get(req, 'headers.x-version-name')
    logData[LOG_CONSTANTS.SYSTEM_LOGS.VERSION_CODE] = _.get(req, 'headers.x-version-code')
    logData[LOG_CONSTANTS.SYSTEM_LOGS.DEVICE_ID] = _.get(req, 'headers.x-device-id')
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'request_payload';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = JSON.stringify(req.body);
    Singleton.Logger.debug(logData);
  }
  next();
}

Middleware.monitorMiddlewares = function (app) {
  const monitoredMiddleware = function (handle, name) {
    if (handle.length === 3){
      return function (req, res, next) {
        req.middlewareLatencies = req.middlewareLatencies || [];
        const start = Date.now();
        handle(req, res, function(err) { // overriding the next method
          const duration = Date.now() - start;
          req.middlewareLatencies.push({name: name, duration: duration});
          next(err);
        });
      }
    } else {
      return function (error, req, res, next) {
        req.middlewareLatencies = req.middlewareLatencies || [];
        const start = Date.now();
        handle(error, req, res, function(err) { // overriding the next method
          const duration = Date.now() - start;
          req.middlewareLatencies.push({name: name, duration: duration});
          next(err);
        });
      }
    }
    
  };
  // iterate through all installed layers(midllewares) and proxy them through monitoredMiddleware.
  _.forEach(app._router.stack, (layer) => {
    layer.handle = monitoredMiddleware(layer.handle, layer.name);
  });
}

module.exports = Middleware;
