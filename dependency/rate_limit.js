'use strict';

// Imports start
const _ = require('lodash');
const Microservice = require('./microservice');
const ExternalService = require('./external_service');
const ScriptConstants = require('../scripts/constants');
const LOG_TYPE = require('../logging/log_type');
const MonitoringConstants = require('../monitoring/monitoring_constants')
// Imports end

// Initialization start
const RateLimit = {};
const RATE_LIMIT_POLICY_SYNC_TIME_SECONDS = 60;
// Initialization end

const getRateLimitPolicy = async (RPCFramework) => {
  const PlatformConfigServiceClient = RPCFramework.getSingleton()[ScriptConstants.PLATFORM_CONFIG_SERVICE];
  const RPC_CONFIG = RPCFramework.getSingleton().Config;
  const response = await PlatformConfigServiceClient.getRateLimit({"serviceType": "microservice", "serviceId": RPC_CONFIG.SERVICE_ID});
  return _.get(response, 'success.data');
};

RateLimit.initRateLimit = async (params, RPCFramework) => {
  const rateLimitServiceParams = {
    "id": ScriptConstants.PLATFORM_CONFIG_SERVICE,
    "version": 0
  };
  const prometheusServiceParams = {
    "id": MonitoringConstants.PROMETHEUS_SERVICE_ID,
    "options": {
      "CIRCUIT_BREAKER_OPTIONS": {
        "ENABLE": true,
        "TIMEOUT": 1000,
        "CIRCUIT_BREAKER_FORCE_CLOSED": false
      }
    },
    "version": 0
  };
  if (!RPCFramework.getSingleton()[ScriptConstants.PLATFORM_CONFIG_SERVICE]) {
    // Initialize platform-config-service client if dependency is not
    // already initialized via dependency.config.js
    Microservice.initMicroserviceClient(rateLimitServiceParams, RPCFramework);
  }
  ExternalService.initExternalServiceClient(prometheusServiceParams, RPCFramework);
  const rateLimitPolicy = await getRateLimitPolicy(RPCFramework);
  if (!rateLimitPolicy) {
    throw new UCError({
      err_type: Error.DEPENDENCY_INITIALIZATION_ERROR,
      err_message: "RateLimitPolicy does not exist",
      log_type: LOG_TYPE.RPC_RATE_LIMIT
    });
  }

  if (_.get(rateLimitPolicy, 'isEnabled')) RPCFramework.addToSingleton('RateLimitPolicy', rateLimitPolicy);
  setInterval(async () => {
    const rateLimitPolicy = await getRateLimitPolicy(RPCFramework);
    if (_.get(rateLimitPolicy, 'isEnabled')) RPCFramework.addToSingleton('RateLimitPolicy', rateLimitPolicy);
    else RPCFramework.addToSingleton('RateLimitPolicy', undefined);
  }, RATE_LIMIT_POLICY_SYNC_TIME_SECONDS * 1000);
};

module.exports = RateLimit;
