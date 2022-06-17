'use strict';

// Imports start
const _ = require('lodash');
const Singleton = require('../singleton').getSingleton();
const PrometheusServiceUtil = require('../monitoring/prometheus-service-util');
// Imports end

// Initialization start
const ENV = process.env.NODE_ENV ? process.env.NODE_ENV : 'development';
const ECSClusterMap = {
  'development': 'dev-cluster',
  'staging': 'stage-cluster-private',
  'production': 'prod-cluster-private'
};
const InfraUtil = {};
// Initialization end

InfraUtil.getContainerCount = async (serviceId) => {
  serviceId = serviceId || Singleton.Config['SERVICE_ID']
  let ecsLabels = {
    service: serviceId + '-' + ENV,
    cluster: _.get(Singleton.Config.INFRA_CONF, `${serviceId}.deployment.ecs_cluster`) || ECSClusterMap[ENV]
  }
  const result = await PrometheusServiceUtil.getQueryResult('ecs_service_desired_tasks', ecsLabels);
  return (_.size(result) > 0 ? Number(_.get(result[0], 'value[1]')) : undefined);
};

module.exports = InfraUtil;
