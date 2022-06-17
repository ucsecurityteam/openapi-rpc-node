'use strict';

const PrometheusMonitoring = {};
const PrometheusExporter = require('../monitoring/prometheus_exporter');
const PrometheusClient = require('prom-client');
const Logger = require('../logging/standard_logger');
const LOG_CONSTANTS = require('../logging/log_constants');
const LOG_TYPE = require('../logging/log_type');
const _ = require('lodash');
const MONITORING_CONSTANTS = require('../monitoring/monitoring_constants');

PrometheusMonitoring.initPrometheusMonitoringClient = (params, RPCFramework) => {
  const _ = require('lodash');
  const Config = RPCFramework.getSingleton().Config;
  const serviceId = _.get(params, 'SERVICE_ID') || Config['SERVICE_ID'];
  const defaultLabels = { 'service': serviceId };

  try {
    PrometheusClient.register.setDefaultLabels(defaultLabels);
    const collectDefaultMetrics = PrometheusClient.collectDefaultMetrics;
    collectDefaultMetrics();

    // define all custom prometheus metrics here and add to singleton
    let httpServerRequestDurationMetric = new PrometheusClient.Histogram({
      name: MONITORING_CONSTANTS.PROMETHEUS.HTTP_SERVER_REQUEST_DURATION_METRIC,
      help: 'Duration of HTTP requests in ms',
      labelNames: ['service', 'client', 'route', 'code', 'env'],
      // buckets for response time from 10ms to 60000ms
      buckets: [50, 100, 200, 400, 600, 1000, 5000, 10000, 30000, 60000]
    });

    let httpServerRequestErrorMetric = new PrometheusClient.Counter({
      name: MONITORING_CONSTANTS.PROMETHEUS.HTTP_SERVER_REQUEST_ERROR_METRIC,
      help: 'Count of errors',
      labelNames: ['service', 'client', 'route', 'code', 'error_type'],
    });

    RPCFramework.addToSingleton(MONITORING_CONSTANTS.PROMETHEUS.HTTP_SERVER_REQUEST_DURATION_METRIC,
      httpServerRequestDurationMetric);

    RPCFramework.addToSingleton(MONITORING_CONSTANTS.PROMETHEUS.HTTP_SERVER_REQUEST_ERROR_METRIC,
      httpServerRequestErrorMetric);

    // metric for external service call duration
    let httpClientRequestDurationMetric = new PrometheusClient.Histogram({
      name: MONITORING_CONSTANTS.PROMETHEUS.HTTP_CLIENT_REQUEST_DURATION_METRIC,
      help: 'Duration of external HTTP requests in ms',
      labelNames: ['external_service', 'route', 'code', 'env'],
      // buckets for response time from 10ms to 60000ms
      buckets: [50, 100, 200, 400, 600, 1000, 5000, 10000, 30000, 60000]
    });

    let httpClientRequestErrorMetric = new PrometheusClient.Counter({
      name: MONITORING_CONSTANTS.PROMETHEUS.HTTP_CLIENT_REQUEST_ERROR_METRIC,
      help: 'Count of errors',
      labelNames: ['external_service', 'route', 'code', 'error_type'],
    });


    RPCFramework.addToSingleton(MONITORING_CONSTANTS.PROMETHEUS.HTTP_CLIENT_REQUEST_DURATION_METRIC,
      httpClientRequestDurationMetric);

    RPCFramework.addToSingleton(MONITORING_CONSTANTS.PROMETHEUS.HTTP_CLIENT_REQUEST_ERROR_METRIC,
      httpClientRequestErrorMetric);

    RPCFramework.addToSingleton(MONITORING_CONSTANTS.PROMETHEUS.CLIENT, PrometheusClient);
    RPCFramework.addToSingleton(MONITORING_CONSTANTS.PROMETHEUS.PROMETHEUS_EXPORTER_SINGLETON, PrometheusExporter);
  } catch (err) {
    let logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
    logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = Error.DEPENDENCY_INITIALIZATION_ERROR;
    Logger.error(logData)
  }

};

module.exports = PrometheusMonitoring;
