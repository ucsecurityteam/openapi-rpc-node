'use strict';

var _ = require('lodash');
var JsonFile = require('jsonfile');
var path = require('path');
var credentialManagementService = require('./credential-management/cms');
var Logger = require('./logging/standard_logger');
const LOG_CONSTANTS = require('./logging/log_constants');
const LOG_TYPE = require('./logging/log_type');
const RPC_CONSTANTS = require('./constants');
const GLOBAL_EVENT_CONFIG = RPC_CONSTANTS.GLOBAL_EVENT_CONFIG;
const { DEVELOPMENT } = RPC_CONSTANTS.ENVIRONMENT;
const REPO_DIR_PATH = RPC_CONSTANTS.REPO_DIR_PATH;
const ErrorTypes = require('./error');
const UCError = ErrorTypes.UCError;
const fs = require('fs');
const CONSTANTS = require('./scripts/constants');
const ConfigUtils = require('./common/config_utils');

var config = undefined;

var Config = {};
var ECSMetadata = null;
var source_type = RPC_CONSTANTS.SOURCE_TYPE.SERVICE;

/*****************************
DEFAULT SCHEMAS for GLOBAL CONFIG

  // external
  <id> : {
    "type": "external",

    "discovery": {
      "uri": ,
      "port": ,                // optional
      "token": ,               // optional. global-3rd-party auth token / password
      "user_id": ,             // optional. global-3rd-party auth id / username
      "resource_key": ,        // optional. global-3rd-party db key
    }
  }

  // service
  <id> : {
    "type": "service",

    "discovery": {
      "uri": ,
      "port": ,
    }

    "deployment": {
      "repo": ,
      "ecs_repo": ,            // ecs else optional
      "ecs_memory": ,          // ecs else optional
      "ecs_cpu": ,             // ecs else optional
      "ecs_taskname": ,        // ecs else optional
      "auth_service_ids": ,    // optional. [] intra-service authentication

      // For NewRelic – set the following in ENV –
      //   NEW_RELIC_ENABLED = true
      //   NEW_RELIC_NO_CONFIG_FILE = true
      //   NEW_RELIC_LICENSE_KEY
      //   NEW_RELIC_APP_NAME     []
      //   NEW_RELIC_LOG_LEVEL = 'info'
      //   NEW_RELIC_CAPTURE_PARAMS = true
    }
  }

  // s3
  <id> : {
    "type": "s3",

    "discovery": {
      "key": ,
      "secret": ,
      "bucket": ,
      "region": ,
    }
  }  
*****************************/


/** initConfig(service_id)
 *
 * @param service_id
 *
 * @return 
      {
        SERVICE_ID, APP_PATH, ENV, 
        PORT, URI, AUTH_SERVICE_IDS,
        CUSTOM, 
        getExternalConf(),
        getServiceConf(),
        getS3Conf()
      } 
 */

Config.initConfig = function (service_id, options) {

  const sub_service_id = process.env.SUB_SERVICE_ID ? process.env.SUB_SERVICE_ID : service_id;

  if (config) {
    return config;
  }

  source_type = _.get(options, 'source_type', RPC_CONSTANTS.SOURCE_TYPE.SERVICE);

  var custom_conf = JsonFile.readFileSync(path.join(ConfigUtils.getGlobalConfigsDir(), service_id + '.config.json'));
  const global_conf = ConfigUtils.getGlobalConfig();
  const platform_conf = getPlatformConfig();

  /* 
    Get global.config.json file.
    For local and development environment's custom branches, we override global.config.json
    from S3 with one present in repo.  
  */

  function getEnvConfigFileName(fileName) {
    let env = process.env.NODE_ENV ? process.env.NODE_ENV : DEVELOPMENT;
    return env === DEVELOPMENT ? '.'.concat(fileName) : fileName;
  }

  function getAbsoluteFilePath(relativeRepoFilePath) {
    return path.join(REPO_DIR_PATH, relativeRepoFilePath);
  }
  
  function getEventConfig() {
    let platformEventConfigFilePath = getAbsoluteFilePath(getEnvConfigFileName(GLOBAL_EVENT_CONFIG.PLATFORM_FILE_NAME));
    let dataEventConfigFilePath = getAbsoluteFilePath(getEnvConfigFileName(GLOBAL_EVENT_CONFIG.DATA_FILE_NAME));

    return {
      platform: fs.existsSync(platformEventConfigFilePath) ? JsonFile.readFileSync(platformEventConfigFilePath) : undefined,
      data: fs.existsSync(dataEventConfigFilePath) ? JsonFile.readFileSync(dataEventConfigFilePath) : undefined
    }
  }

  function getInfraConfig() {
    if (fs.existsSync('infra.config.json')){
      return JsonFile.readFileSync('infra.config.json')
    }
  }

  function getDbUri(global_conf, path, db_name) {
    return _.get(global_conf, path).replace(new RegExp(RPC_CONSTANTS.CMS.DB_NAME_PLACEHOLDER), db_name);
  }

  function getDWHConfig(db_type, db_cluster_name, db_name, Slack) {
    let redshift_config = _.get(global_conf, `database-uri.${db_type}.${db_cluster_name}`);
    redshift_config['database'] = db_name;
    if (config.ENV === 'development' || config.ENV === 'test') {
      return redshift_config;
    }
    let username = _.get(custom_conf, `credentials.${db_type}.${db_cluster_name}.${db_name}.readwrite.username`);
    let password = _.get(custom_conf, `credentials.${db_type}.${db_cluster_name}.${db_name}.readwrite.password`);

    if (username && password) {
      redshift_config['user'] = username;
      redshift_config['password'] = password;
      return redshift_config;
    } else {
      let logData = {};
      logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'cms_status';
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = "failed";
      logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = ErrorTypes.RPC_CMS_ERROR;
      let error_message = `Credentials not found for this path: credentials.${db_type}.${db_cluster_name}.${db_name}`;
      logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = error_message;
      Logger.error(logData);
      let err_service_id;
      if (this) {
        err_service_id = this.SERVICE_ID;
      }
      let slack_error_message = "Environment : " + config.ENV + ", " + error_message;
      Slack.sendSlackMessage(err_service_id, slack_error_message, RPC_CONSTANTS.CMS.SLACK_ALERT_CHANNEL);
      throw new UCError({ err_type: ErrorTypes.RPC_CMS_ERROR, err_message: error_message });
    }
  }

  // TODO: remove fallback of fetching auth_service_ids from global.config.json
  function getAuthIds() {
    if (CONSTANTS.DEFAULT_DEPENDENCY.includes(sub_service_id)){
      return _.union(_.keys(RPC_CONSTANTS.DEPENDENCY.ID.INTERNAL_SERVICE), platform_conf.authServiceIds)
    }
    if (!_.isNil(platform_conf.authServiceIds)) {
      Logger.info({ key_1: 'get_auth_service_ids', key_1_value: 'fetched the auth_service_ids from platform.config.json' });
      return platform_conf.authServiceIds;
    }
    return global_conf[sub_service_id].deployment.auth_service_ids;
  }

  function getPlatformConfig() {
    const PLATFORM_CONFIG_PATH = RPC_CONSTANTS.REPO_DIR_PATH + RPC_CONSTANTS.SERVICE_PLATFORM_CONFIG.CONFIG_PATH;
    if (fs.existsSync(PLATFORM_CONFIG_PATH)) {
      return JsonFile.readFileSync(PLATFORM_CONFIG_PATH);
    }
    return {};
  }

  try {

    let logData = {};
      logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SERVICE;
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'service_id';
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = service_id;
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'sub_service_id';
      logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = sub_service_id;
      Logger.info(logData);

    config = {
      SERVICE_ID: service_id,
      SUB_SERVICE_ID: sub_service_id,
      APP_PATH: __dirname,
      ENV: process.env.NODE_ENV ? process.env.NODE_ENV : 'development',

      PORT: global_conf[sub_service_id].discovery.port,
      URI: global_conf[sub_service_id].discovery.uri,
      AUTH_SERVICE_IDS: getAuthIds(),

      CUSTOM: custom_conf,
      GLOBAL_CONF: global_conf,
      EVENT_CONF: getEventConfig(),
      INFRA_CONF: getInfraConfig(),
      SOURCE_TYPE: source_type,
      PLATFORM_CONF: platform_conf,

      getExternalConf: function (id) {
        return global_conf[id].discovery;
      },
      getServiceConf: function (id) {
        return global_conf[id].discovery;
      },
      getS3Conf: function (id) {
        return global_conf[id].discovery;
      },
      getCustomServiceConf: function (id) {
        return _.get(custom_conf, `internal_service_config.${id}`, {});
      },
      getDBConf: function (config_id) {
        const Slack = require('./slack');
        let db_type = _.get(global_conf, `${config_id}.db_type`);
        let db_cluster_name = _.get(global_conf, `${config_id}.db_cluster_name`);
        let db_name = _.get(global_conf, `${config_id}.db_name`);

        if (db_type === "redshift" || db_type === "snowflake") {
          return getDWHConfig(db_type, db_cluster_name, db_name, Slack);
        }

        // One URI is stored for each cluster name in global config, with these placeholders- __db_name__, __username__ and __password__
        let db_uri = getDbUri(global_conf, `database-uri.${db_type}.${db_cluster_name}.uri`, db_name);

        // credentials were pre-fetched from CMS
        let username = _.get(custom_conf, `credentials.${db_type}.${db_cluster_name}.${db_name}.readwrite.username`);
        let password = _.get(custom_conf, `credentials.${db_type}.${db_cluster_name}.${db_name}.readwrite.password`);

        if (username && password) {
          db_uri = db_uri.replace(new RegExp(RPC_CONSTANTS.CMS.USERNAME_PLACEHOLDER), username)
            .replace(new RegExp(RPC_CONSTANTS.CMS.PASSWORD_PLACEHOLDER), password);
          return { uri: db_uri };
        } else {
          let logData = {};
          logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
          logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'cms_status';
          logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = "failed";
          logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = ErrorTypes.RPC_CMS_ERROR;
          let error_message = `Credentials not found for this path: credentials.${db_type}.${db_cluster_name}.${db_name}`;
          logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = error_message;
          Logger.error(logData);
          if (this.ENV === 'development') {
            return { uri: db_uri };
          }
          let slack_error_message = "Environment : " + config.ENV + ", " + error_message;
          let err_service_id = this.SERVICE_ID;
          Slack.sendSlackMessage(err_service_id, slack_error_message, RPC_CONSTANTS.CMS.SLACK_ALERT_CHANNEL);
          throw new UCError({ err_type: ErrorTypes.RPC_CMS_ERROR, err_message: error_message });
        }
      }
    };
    return config;
  } catch (err) {
    let logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'message';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = "Unable to create config for the service";
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = err;
    Logger.error(logData);
    console.log("Unable to create config for the service: ", service_id, err);
    throw err;
  }
};

function getCredentialsFromFile() {
  const CREDENTIALS_FILE_PATH = path.join(RPC_CONSTANTS.REPO_DIR_PATH, RPC_CONSTANTS.CREDENTIALS_FILE_PATH);
  if (!fs.existsSync(CREDENTIALS_FILE_PATH)) {
    throw new UCError({ err_type: ErrorTypes.RPC_CMS_ERROR, err_message: `${RPC_CONSTANTS.CREDENTIALS_FILE_PATH} file not found` });
  }
  return JsonFile.readFileSync(CREDENTIALS_FILE_PATH);
}

async function getCredentialsFromVault(serviceId, vaultAddress) {
  let env = process.env.NODE_ENV ? process.env.NODE_ENV : 'development';
  let CMS = await credentialManagementService.init(env, serviceId, vaultAddress);
  return await CMS.getCredentialsFromVault();
}

/**
 * Initializes connection with cms and loads the service credentials json in custom_conf under the key 'credentials'.
 * This service credentials json structure will exactly same as stored in cms server.
 * @param service_id
 * @returns {Promise.<TResult>} This promise will return the Config object with credentials
 */
Config.initCredentials = async function (service_id) {

  const Singleton_OARPC = require('./singleton').getSingleton();
  const Config = Singleton_OARPC.Config;
  const Slack = require('./slack');
  
  try {
    const CREDENTIALS_STORE_TYPE = RPC_CONSTANTS.CREDENTIALS_STORE;
    let credentialStore = _.get(Config['PLATFORM_CONF'], 'credentialStore') || CREDENTIALS_STORE_TYPE.VAULT;
    let credentials;
    switch (credentialStore) {
      case CREDENTIALS_STORE_TYPE.CREDENTIALS_JSON:
        credentials = {
          [RPC_CONSTANTS.CMS.SERVICE_CREDENTIALS_PATH]: getCredentialsFromFile()
        };
        break;
      case CREDENTIALS_STORE_TYPE.VAULT:
        credentials = await getCredentialsFromVault(service_id, Config['GLOBAL_CONF']['cms_server']);
        break;
      default: 
        throw new UCError({ err_type: ErrorTypes.RPC_CMS_ERROR, err_message: `Invalid credentialStore input ${credentialStore} in platform.config.json` });
    }
    _.assign(Config['CUSTOM'], credentials);
    Logger.info({
      [LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] : LOG_TYPE.RPC_SERVICE,
      [LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] : 'credentials_fetch',
      [LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] : 'successful',
      [LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2] : 'credential_store',
      [LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2_VALUE] : credentialStore
    });
  } catch(err) {
    let logData = {};
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'credentials_fetch';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = "failed";
    logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = ErrorTypes.RPC_CMS_ERROR;
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = "Failed to fetch and load credentials "
      + (err ? (err.message || err.err_message) : 'NA');
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = err ? (err.stack || err.err_stack) : "NA";
    logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR] = err;
    Logger.error(logData);
    Slack.sendSlackMessage(service_id, "Failed to fetch and load credentials", RPC_CONSTANTS.CMS.SLACK_ALERT_CHANNEL);
  };

  return Config;
};

/**
 * Example ECS Metadata Object
 * {
	"Cluster": "uc-prod-cluster-new-relic",
	"ContainerInstanceARN": "arn:aws:ecs:ap-southeast-1:642435225585:container-instance/3d74b82f-b48e-4585-b4cc-a3934647f3e4",
	"TaskARN": "arn:aws:ecs:ap-southeast-1:642435225585:task/2c5bf969-55d4-4e2e-b32c-8a1572fe41a0",
	"TaskDefinitionFamily": "service-market-production",
	"TaskDefinitionRevision": "2031",
	"ContainerID": "2eefeac9d73a3c5f33ccec23aa05e2cff90b24606d85a862d54e6314b3e182b0",
	"ContainerName": "service-market-production",
	"DockerContainerName": "/ecs-service-market-production-2031-service-market-production-909fefe798adadbf8f01",
	"ImageID": "sha256:b746661315b7625bd09cfd5eb2ae0918359ab1842fbb40cd5d2f9ed135ffd8ba",
	"ImageName": "642435225585.dkr.ecr.ap-southeast-1.amazonaws.com/service-market-production:release-1568748277",
	"PortMappings": [
		{
			"ContainerPort": 9000,
			"HostPort": 1026,
			"BindIp": "0.0.0.0",
			"Protocol": "tcp"
		}
	],
	"Networks": [
		{
			"NetworkMode": "bridge",
			"IPv4Addresses": [
				"172.17.0.4"
			]
		}
	],
	"MetadataFileStatus": "READY",
	"AvailabilityZone": "ap-southeast-1a",
	"HostPrivateIPv4Address": "172.32.13.80"
   }
 * @return <ECSMetadata>
 */
function getECSMetaData() {
  if (!ECSMetadata) {
    if (process.env.ECS_CONTAINER_METADATA_FILE && fs.existsSync(process.env.ECS_CONTAINER_METADATA_FILE)) {
      try {
        ECSMetadata = JsonFile.readFileSync(process.env.ECS_CONTAINER_METADATA_FILE);
      } catch (err) {
        let logData = {};
        logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'ecs_metadata_status';
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = "failed";
        logData[LOG_CONSTANTS.SYSTEM_LOGS.ERROR_TYPE] = ErrorTypes.RPC_FILE_LOAD_ERROR;
        logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = "Failed to fetch and load ECS Metadata. "
          + (err ? (err.message || err.err_message) : 'NA');
        logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = err ? (err.stack || err.err_stack) : "NA";
        logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR] = err;
        Logger.error(logData);
      }
      
    } else {
      ECSMetadata = {};
    }
  }
  return ECSMetadata;
}

Config.getTaskId = function() {
  let taskArn = getECSMetaData().TaskARN;
  return taskArn && _.isString(taskArn) && taskArn.split('/')[1] ? taskArn.split('/')[1] : 'unknown';
};

Config.getContainerId = function() {
  let containerID = getECSMetaData().ContainerID;
  return containerID && _.isString(containerID) ? containerID.substr(0, 12) : 'unknown';
};

Config.getContainerIp = function() {
  return getECSMetaData().HostPrivateIPv4Address;
};

Config.getBuildVersion = function() {
  return getECSMetaData().TaskDefinitionRevision;
};

Config.getContainerPort = function() {
  let portMappings = getECSMetaData().PortMappings;
  if (portMappings && _.isArray(portMappings)) {
    let mapping = portMappings[0];
    return mapping && mapping.HostPort ? mapping.HostPort : 'unknown';
  }
};

Config.getServicePort = function() {
  let portMappings = getECSMetaData().PortMappings;
  if (portMappings && _.isArray(portMappings)) {
    let mapping = portMappings[0];
    return mapping && mapping.ContainerPort ? mapping.ContainerPort : 'unknown';
  }
};

Config.getSourceType = function() {
  return source_type;
}

module.exports = Config;