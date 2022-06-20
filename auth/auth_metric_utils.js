const Mycroft = require('@uc-engg/mycroft');
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
const Logger = require('../logging/standard_logger');
const AuthConstants = require('./auth_constants');
const AuthMetricConstants = AuthConstants.AUTH_METRICS;
const Singleton = require('../singleton').getSingleton();
const _ = require('lodash');
const LOG_CONSTANTS = require('../logging/log_constants');
const LOG_TYPE = require('../logging/log_type');
const IS_AUTH_MONITORING_ENABLED = (process.env.AUTH_MONITORING_ENABLED === 'true');
const MycroftInitUtil = require('../monitoring/mycroft_init_util');
const ServiceMetaDataUtil = require('../common/service_metadata_util');

const initCommonConfig = () => {
  const serviceId = ServiceMetaDataUtil.getServiceId();
  const DefaultLabels = {
    [AuthMetricConstants.LABEL.SERVICE]: _.get(Singleton, 'Config.SUB_SERVICE_ID', serviceId)
  }
  MycroftInitUtil.storeInitialisation(AuthConstants.AUTH_METRICS.AUTH_METRIC_STORE, DefaultLabels);
}

const registerMetric = () => {
  Mycroft.registerMetric.counter(AuthConstants.AUTH_METRICS.AUTH_METRIC_STORE, {
    name: AuthMetricConstants.REQ_ERROR_COUNT_METRIC,
    help: 'Error Count of request encountered',
    labelNames: [AuthConstants.AUTH_METRICS.LABEL.DEVICE_OS,
      AuthConstants.AUTH_METRICS.LABEL.TYPE,
      AuthConstants.AUTH_METRICS.LABEL.ERROR_TYPE,
      AuthConstants.AUTH_METRICS.LABEL.ROUTE]
  });
  Mycroft.registerMetric.histogram(AuthConstants.AUTH_METRICS.AUTH_METRIC_STORE, {
    name: AuthMetricConstants.REQ_TIME_METRIC,
    help: 'Duration of auth requests',
    labelNames: [AuthConstants.AUTH_METRICS.LABEL.DEVICE_OS,
      AuthConstants.AUTH_METRICS.LABEL.TYPE,
      AuthConstants.AUTH_METRICS.LABEL.ROUTE,
      AuthConstants.AUTH_METRICS.LABEL.GUEST_ROLE_ALLOWED
    ],
    // buckets for response time from 10ms to 60000ms
    buckets: AuthConstants.AUTH_METRICS.BUCKET_RANGE
  });
}

const AuthMetricUtility = {};

AuthMetricUtility.initAuthMetric = () => {
  if (!IS_AUTH_MONITORING_ENABLED) {
    return;
  }
  try {
    initCommonConfig();
    registerMetric();
  } catch (err) {
    Logger.error({
      [LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE]: AuthMetricConstants.ERROR.INIT_METRIC_ERROR,
      [LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE]: err.message || JSON.stringify(err),
      [LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK]: err.stack,
      [LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE]: LOG_TYPE.RPC_SYSTEM
    });
    throw err;
  }
}

AuthMetricUtility.captureCounterMetric = async (storeName, metricName, monitoringParams) => {
  if (!IS_AUTH_MONITORING_ENABLED) {
    return;
  }
  try {
    Mycroft.incMetric(storeName,
      metricName, monitoringParams);
  } catch (err) {
    Singleton.Logger.error({
      error_type: AuthConstants.AUTH_METRICS.ERROR.CAPTURE_METRIC_ERROR,
      error_message: err.message || JSON.stringify(err),
      error_stack: err.stack
    });
  }
};

AuthMetricUtility.captureResponseTimeMetric = async (storeName, metricName, monitoringParams, timeToLog) => {
  if (!IS_AUTH_MONITORING_ENABLED) {
    return;
  }
  try {
    Mycroft.setMetric(storeName, metricName, monitoringParams, timeToLog);
  } catch (err) {
    Singleton.Logger.error({
      error_type: AuthConstants.AUTH_METRICS.ERROR.CAPTURE_METRIC_ERROR,
      error_message: err.message || JSON.stringify(err),
      error_stack: err.stack
    });
  }
}

module.exports = AuthMetricUtility;