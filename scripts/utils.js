const CONSTANTS = require('./constants');
const { DEVELOPMENT } = CONSTANTS.ENVIRONMENT;
const GLOBAL_CONFIG = CONSTANTS.GLOBAL_CONFIG;
const fs = require('fs');
const _ = require('lodash');
const JsonFile = require('jsonfile');
const axios = require('axios');
const ConfigUtils = require('../common/config_utils');
const GATEWAY_CONFIG_PATH = ConfigUtils.getParentWorkingDir() + '/configs/gateway.config.js';
let Utils = {};

const fillServiceDependency = (dependentServices, serviceNamesList) => {
    // fill placeholder with service name
    let mergedDependencies = _.flattenDeep(serviceNamesList.map(serviceName => { return {id: serviceName, version: 0}}));
    return _.union(mergedDependencies, dependentServices);

  }
  
const addDefaultServicesForGateways = (dependentServices, serviceName) => {
    try {
        if(fs.existsSync(GATEWAY_CONFIG_PATH)) {
            //file exists
            return fillServiceDependency(dependentServices, CONSTANTS.DEFAULT_DEPENDENCY_FOR_GATEWAY);
        };
        return [];
    } catch (err) { throw Error(err);}
  };
  
  /* Always adds DEFAULT_DEPENDENCY services to dependentServices*/
const addDefaultServices = (dependentServices, serviceName) => {
    /* Dont want to cut the branch we are sitting on, 
    if platform-config is down fix for it wont be pushed because platform-config is down*/
    if (serviceName === CONSTANTS.PLATFORM_CONFIG_SERVICE) return [];
    return fillServiceDependency(dependentServices, CONSTANTS.DEFAULT_DEPENDENCY);

  }

Utils.addOtherDependencies = (dependentServices, serviceName) => {
    const functionsForDependencies = [addDefaultServicesForGateways, addDefaultServices];
    return _.flattenDeep(functionsForDependencies.map(func => func(dependentServices, serviceName)));
  
}

Utils.getGlobalConfPath = () => {
  let configDir = ConfigUtils.getParentWorkingDir() + '/';
  return configDir + Utils.getEnvConfigFileName(GLOBAL_CONFIG.FILE_NAME);
}

Utils.getEnvConfigFileName = (fileName) => {
  let env = process.env.NODE_ENV ? process.env.NODE_ENV : DEVELOPMENT;
  return env === DEVELOPMENT ? '.'.concat(fileName) : fileName;
}

Utils.getServicePlatformConfig = () => {
  const platformConfigPath = ConfigUtils.getParentWorkingDir() + CONSTANTS.SERVICE_PLATFORM_CONFIG.CONFIG_PATH;
  return JsonFile.readFileSync(platformConfigPath);
}

Utils.getParentServicePackageJson = () => {
  const packageJsonPath = ConfigUtils.getParentWorkingDir() + '/package.json';
  return JsonFile.readFileSync(packageJsonPath);
}

Utils.getServiceName = () => {
  return Utils.getParentServicePackageJson().name;
}

Utils.sendGetRequest = async (url, config={}) => {
   try {
        const resp = await axios.get(url, config);
        return resp.data
    } catch (err) {
        return err.response.data;
    }
}
module.exports = Utils;