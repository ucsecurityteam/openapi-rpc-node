const _ = require('lodash');
const MongoDb = require('./mongodb')
const DEPENDENCY_TYPE = require('../../constants').DEPENDENCY.TYPE
const Singleton = require('../../singleton').getSingleton();
const Logger = require('../../logging/standard_logger')
const Error = require('../../error');
const UCError = Error.UCError;
const DatabaseMap = { 
  [DEPENDENCY_TYPE.MONGODB]:MongoDb.getMongoDBDetails
}
const getDBDetails = (req,res) => {

  if (Singleton.GATEWAY_CONFIG) {
    Logger.error({error_message: `Gateway services are not authorized to use getDBDetails API ` }); 
    res.status(500).json({ err_type: Error.RPC_AUTH_ERROR, err_message: 'Not Authorised' }); 
    return;
  }
  const action = _.get(req.body, 'action', '');
  if(action !== 'list'  && action !== 'getSchema') {
    Logger.error({ error_message: `Invalid Action. Use 'list' or 'getSchema' `});
    res.status(500).json({err_type: Error.RPC_REQUEST_INVALID_ERROR, err_message:" Invalid Action. Use 'list' or 'getSchema' "}); 
    return;
  }
  const dbType = _.get(req.body, 'db_type', 'mongodb');
  if(dbType !== 'mongodb') {
    Logger.error({ error_message: `Invalid DB Type`});
    res.status(500).json({err_type: Error.RPC_REQUEST_INVALID_ERROR, err_message:" Invalid DB Type "}); 
    return;
  }
  const {resultKey,resultValue} =DatabaseMap[dbType](req);
  return {[resultKey]:resultValue};
}
module.exports = {getDBDetails} ;