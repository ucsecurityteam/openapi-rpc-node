const LoggingMetricConstants = require('./logging_metric_constants');
const LOG_CONSTANTS = require('./log_constants');
const Mycroft = require('@uc-engg/mycroft');
const RPC_METRICS = require('../monitoring/monitoring_constants').RPC_METRICS;
const Singleton = require('../singleton').getSingleton();
const LoggingMetricUtility = {};

/**
 * This method will persist part of error log into prometheus
 *
 * @param errorLogData
 */
LoggingMetricUtility.persistErrorData = async (errorLogData) => {
  const errorDataToPersist = {
    [LoggingMetricConstants.LABEL.STATUS_CODE]: errorLogData[LOG_CONSTANTS.SYSTEM_LOGS.STATUS] || LoggingMetricConstants.DEFAULT_STATUS_CODE,
    [LoggingMetricConstants.LABEL.ERROR_TYPE]: errorLogData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] || LoggingMetricConstants.DEFAULT_ERROR_TYPE,
    [LoggingMetricConstants.LABEL.LOG_TYPE]: errorLogData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] || LoggingMetricConstants.DEFAULT_LOG_TYPE
  };
  LoggingMetricUtility.captureCounterMetric(RPC_METRICS.STORE,
    RPC_METRICS.LOGGING_ERROR_COUNT_METRIC, errorDataToPersist);
};

LoggingMetricUtility.captureCounterMetric = (storeName, metricName, monitoringParams) => {
  try {
    Mycroft.incMetric(storeName,
      metricName, monitoringParams);
  } catch (err) {
    // Singleton.Logger.error({
    //   error_type: LoggingMetricConstants.ERROR.CAPTURE_METRIC_ERROR,
    //   error_message: err.message || JSON.stringify(err),
    //   error_stack: err.stack
    // });
  }
};

module.exports = LoggingMetricUtility;