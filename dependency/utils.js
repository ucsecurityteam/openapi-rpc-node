var Error = require('../error');
const CONSTANTS = require('../constants');
const _ = require('lodash');

let Utils = {};

Utils.validateVariableType = (variable, variableName, variableType) => {
    if (typeof variable !== variableType){
      Utils.logAndRaiseError(`${variableName} should be of type ${variableType} but found ${typeof variable}`)
    }
}

Utils.logAndRaiseError = (errorMessage) => {
  const Logger = require('../logging/standard_logger');
  const LOG_CONSTANTS = require('../logging/log_constants');
  let logData = {};
  logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = Error.RPC_NO_EVENT_HANDLER_ERROR;
  logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = 'Event Handler not implemented';
  Logger.error(logData);
  throw new UCError({err_type: Error.RPC_INTERNAL_SERVER_ERROR, err_message: errorMessage})
}

Utils.getAbsolutePathFromRelativePath = (SERVICE_TYPE, path) => {
  // remove extra '/' form beginning of path
  let fullPath = (path.substring(0,1) == "/") ? path.substring(1) : path;

  // Check if dist or src is present in path. If not, then add it 
  if(fullPath.split("/")[0] != CONSTANTS.SRC_PATH[SERVICE_TYPE].split("/")[1]) {
    fullPath = CONSTANTS.SRC_PATH[SERVICE_TYPE] + fullPath;
  } else {
    fullPath = "/" + fullPath;
  }
  
  // return full path of the file
  return CONSTANTS.REPO_DIR_PATH + fullPath
}

/*******
 * @objective: takes method path and service, returns the function mapped to path.
 * Also binds the enclosing function obj to its `this`.
 *
 * @param methodPath: any of {'initiateTxn', 'tag/create', 'tag/get/all', 'tag/get/new'}
 * @param service: api mapping of api name to function
 * @returns {*}
 */
Utils.getMethodImplementation = (methodPath, service) => {
  const nestedMethodArray = methodPath.split('/');
  const apiInitialPath = _.initial(nestedMethodArray).join('.');
  const apiMethod = _.last(nestedMethodArray);
  let apiPathObj = _.isEmpty(apiInitialPath) ? service : _.get(service, apiInitialPath);
  return apiPathObj[apiMethod].bind(apiPathObj);
}

module.exports = Utils;