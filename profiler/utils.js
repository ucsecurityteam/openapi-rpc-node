const Singleton = require('../singleton').getSingleton();
const aws = require('aws-sdk');
const PROFILER_CONSTANTS = require('./constants');
const LOG_CONSTANTS = require('../logging/log_constants');
const LOG_TYPE = require('../logging/log_type');

const s3 = new aws.S3({ region: PROFILER_CONSTANTS.AWS_REGION });

const uploadDataToS3 = async(data, path) => {
  s3.putObject({
    Body: data,
    Bucket: PROFILER_CONSTANTS.S3_PROFILE_BUCKET,
    Key: path
  }, function (err, data) {
    if (err) {
      logError(PROFILER_CONSTANTS.S3_UPLOAD_FAILED_ERROR, `Error while writting file: ${path} to S3, ${JSON.stringify(err)}`);
    }
    else {
      logInfo(`Successfully uploaded file: ${path} to S3, ${JSON.stringify(data)}`);
    }
  });
}

function logError(errType, message) {
  Singleton.Logger.error({
    [LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE]: LOG_TYPE.RPC_PROFILER,
    [LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE]: errType,
    [LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE]: message
  });;
}

function logInfo(message) {
  Singleton.Logger.info({
    [LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE]: LOG_TYPE.RPC_PROFILER,
    [LOG_CONSTANTS.STRINGIFY_OBJECTS.MESSAGE]: message
  });;
}

module.exports = {
  uploadDataToS3,
  logError,
  logInfo
}


