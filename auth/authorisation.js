'use strict';

const compose = require('composable-middleware');
const Singleton = require('../singleton').getSingleton();
const Error = require('../error');
const UCError = Error.UCError;
const _ = require('lodash');
const AuthMetricUtils = require('./auth_metric_utils');
const AUTH_CONSTANTS = require('./auth_constants').AUTH_METRICS;
const AUTH_ACCESS_CONTROL_TYPE = AUTH_CONSTANTS.ACCESS_CONTROL.TYPE;
const DEVICE_OS_LABEL = AUTH_CONSTANTS.LABEL.DEVICE_OS;
const TYPE_LABEL = AUTH_CONSTANTS.LABEL.TYPE;
const ERROR_TYPE_LABEL = AUTH_CONSTANTS.LABEL.ERROR_TYPE;
const ROUTE_NAME_LABEL = AUTH_CONSTANTS.LABEL.ROUTE;
const GUEST_ROLE_ALLOWED_LABEL = AUTH_CONSTANTS.LABEL.GUEST_ROLE_ALLOWED;
const CommonUtils = require('../common/request_headers_util');

let clientAuthorisation = {};

const ERROR_CODES = {
  UNAUTHORISED: 401
};

const ENTITIES = {
  customer_request: 'customer',
  provider_lead: 'provider'
};

clientAuthorisation.isAuthorised = (options) => {

  let rpcAuthorisation = Singleton['access-control-service'];
  let resource = options.resource;
  let entity = ENTITIES[resource];
  let resourceIdPath = options.resource_id_path;
  let allowedRoles = options.roles;
  
  if (!resource || !entity || !resourceIdPath) {
    let error = {err_message: "Invalid options for authorisation in gateway config", err_type: Error.INVALID_PARAMS_ERROR};
    throw new UCError(error);
  }
  return compose().use(async function(req, res, next) {
    const StartTime = Date.now();
    const DeviceOS = CommonUtils.getDeviceType(req.headers);
    let requestId = _.get(req.body, resourceIdPath, null)

    if(!requestId) {
      let error = {err_message: "Resource ID not found in the body", err_type: Error.INVALID_PARAMS_ERROR};
      return next(new UCError(error));
    }
    let payload = {
      request_id: requestId,
      resource: resource,
      entity: entity,
      auth_id: req.body.headers.auth.id || null
    };

    try {
      let response = await rpcAuthorisation.clientAuth.isClientAuthorised(payload);
      let newKey = Object.keys(response.data)[0].split('resource_')[1];
      _.set(req.body, `headers.auth.resource.${newKey}`, response.data[Object.keys(response.data)[0]]);
      _.set(req, `headers.auth.resource.${newKey}`, response.data[Object.keys(response.data)[0]]);
      return next();
    }
    catch(err) {
      AuthMetricUtils.captureCounterMetric(AUTH_CONSTANTS.AUTH_METRIC_STORE,
        AUTH_CONSTANTS.REQ_ERROR_COUNT_METRIC, {
          [DEVICE_OS_LABEL]: DeviceOS,
          [TYPE_LABEL]: AUTH_ACCESS_CONTROL_TYPE,
          [ROUTE_NAME_LABEL]: _.get(req, 'originalUrl'),
          [ERROR_TYPE_LABEL]: AUTH_CONSTANTS.ERROR.UNHANDLED_TYPE
        });
      let uc_error = {
        name: 'authFailure',
        message: err.err_message,
        code: ERROR_CODES.UNAUTHORISED,
        err_type: Error.RPC_AUTH_ERROR
      }
      return next(new UCError(uc_error));
    }
    finally{
      AuthMetricUtils.captureResponseTimeMetric(AUTH_CONSTANTS.AUTH_METRIC_STORE,
        AUTH_CONSTANTS.REQ_TIME_METRIC, {
          [DEVICE_OS_LABEL]: DeviceOS,
          [TYPE_LABEL]: AUTH_ACCESS_CONTROL_TYPE,
          [ROUTE_NAME_LABEL]: _.get(req, 'originalUrl'),
          [GUEST_ROLE_ALLOWED_LABEL]: _.includes(allowedRoles, 'guest')
        }, Date.now() - StartTime);
    }
  });
}

module.exports = clientAuthorisation;