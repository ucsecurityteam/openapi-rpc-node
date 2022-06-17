/**
 * This util file can be used to add util function related to get meta data related to the microservice.
 * e.g. service name, service version etc.
 */

const Singleton = require('../singleton').getSingleton();
const _ = require('lodash');

const ServiceMetaDataUtil = {};

ServiceMetaDataUtil.getServiceId = () => {
  let serviceId;
  if (Singleton.Config) {
    serviceId = Singleton.Config.SERVICE_ID;
  } else {
    const RPC_CONSTANTS = require('../constants');
    const SERVICE_PACKAGE_JSON = require(RPC_CONSTANTS.REPO_DIR_PATH + '/package.json')
    serviceId = SERVICE_PACKAGE_JSON.name;
  }
  return serviceId;
}

ServiceMetaDataUtil.getNodeVersion = () => {
  return _.get(process, 'versions.node', '8').split('.')[0]
}

module.exports = ServiceMetaDataUtil;