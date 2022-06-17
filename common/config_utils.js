var _ = require('lodash');
var JsonFile = require('jsonfile');
var path = require('path');
const fs = require('fs');

const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production'
}

const GLOBAL_CONFIG = {
  FILE_NAME: 'global.config.json',
  RELATIVE_PATH_FROM_ROOT: 'configs/global.config.json'
}
const OARPC_SERVICE_NAME = '@uc/openapi-rpc-node'

const mergeWithArrayAsLiteral = (destOject, srcObject) => {
  return _.mergeWith(destOject, srcObject, (objValue, srcValue) => {  if(Array.isArray(objValue) || Array.isArray(srcValue)) return srcValue });
}

const ConfigUtils = {};

ConfigUtils.getCurrentEnv = () => {
  if(process.env.NODE_ENV == ENVIRONMENT.PRODUCTION) return ENVIRONMENT.PRODUCTION;
  if(process.env.NODE_ENV == ENVIRONMENT.STAGING) return ENVIRONMENT.STAGING;
  return ENVIRONMENT.DEVELOPMENT;
}

ConfigUtils.getParentWorkingDir = () => _.split(process.cwd(), '/node_modules')[0];

ConfigUtils.getGlobalConfigsDir = () => {
  const REPO_DIR_PATH = ConfigUtils.getParentWorkingDir();
  const CURRENT_SERVICE_NAME = require(REPO_DIR_PATH + '/package.json').name;
  if(CURRENT_SERVICE_NAME == OARPC_SERVICE_NAME) {
    return path.join(REPO_DIR_PATH, '/test/configs/');
  }
  return (process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'production' ? 
          path.join(REPO_DIR_PATH, '/') : path.join(REPO_DIR_PATH, '/configs/'));
}

ConfigUtils.getEnvConfigFileName = (fileName) => (ConfigUtils.getCurrentEnv() === ENVIRONMENT.DEVELOPMENT) ? '.'.concat(fileName) : fileName;

ConfigUtils.getGlobalConfig = () => {
  const REPO_DIR_PATH = ConfigUtils.getParentWorkingDir();
  let config_dir = ConfigUtils.getGlobalConfigsDir();
  let globalConf = JsonFile.readFileSync(path.join(config_dir, GLOBAL_CONFIG.FILE_NAME));
  if(ConfigUtils.getCurrentEnv() === ENVIRONMENT.DEVELOPMENT &&
     fs.existsSync(path.join(REPO_DIR_PATH, ConfigUtils.getEnvConfigFileName(GLOBAL_CONFIG.FILE_NAME)))) {
    let baseGlobalConf = JsonFile.readFileSync(path.join(REPO_DIR_PATH, ConfigUtils.getEnvConfigFileName(GLOBAL_CONFIG.FILE_NAME)));
    return mergeWithArrayAsLiteral(baseGlobalConf, globalConf);
  }
  return globalConf;
}

module.exports = ConfigUtils