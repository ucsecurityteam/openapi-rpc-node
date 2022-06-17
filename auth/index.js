'use strict';

let Authentication = require('./authentication');
let Authorisation = require('./authorisation');
const RPC_CONSTANTS = require('../constants');
const AuthMetricUtils = require('./auth_metric_utils');
AuthMetricUtils.initAuthMetric();

module.exports = {
  [RPC_CONSTANTS.GATEWAY.MIDDLEWARE.AUTH_METHOD.CAPTCHA_AUTHENTICATION]: Authentication.isCaptchaAuthenticated,
  [RPC_CONSTANTS.GATEWAY.MIDDLEWARE.AUTH_METHOD.CLIENT_AUTHENTICATION]: Authentication.isClientAuthenticatedAndAuthorized,
  [RPC_CONSTANTS.GATEWAY.MIDDLEWARE.AUTH_METHOD.CLIENT_AUTHORISATION]: Authorisation.isAuthorised,
  [RPC_CONSTANTS.GATEWAY.MIDDLEWARE.AUTH_METHOD.GOOGLE_AUTHENTICATION]: Authentication.isGoogleAuthenticated
}