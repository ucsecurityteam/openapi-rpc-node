'use strict';

let _ = require('lodash');
let dependencyLoader = require('./dependency_loader')
const RPC_CONSTANTS = require('../constants');
const SERVICE_PACKAGE_JSON = require(RPC_CONSTANTS.REPO_DIR_PATH + '/package.json')
const LOG_TYPE = require('../logging/log_type');
const LOG_CONSTANTS = require('../logging/log_constants');
var Promise = require('bluebird');
let PrometheusMonitoring = require('../dependency/prometheus_monitoring');
const MycroftMonitoring = require('../dependency/mycroft_monitoring');
const LoadShed = require('../dependency/load_shed');
const IS_PROMETHEUS_MONITORING_ENABLED = process.env.PROMETHEUS_MONITORING_ENABLED == 'true' ? true : false;
const IS_LOAD_SHEDDING_INITIALIZED = process.env.IS_LOAD_SHEDDING_INITIALIZED == 'true' ? true : false;
const IS_CONTINUOUS_PROFILER_ENABLED = process.env.CONTINUOUS_PROFILER_ENABLED == 'true' ? true : false;

const OpenApiSchema = require('../schema/services/fetch_schema_object');
const Logger = require('../logger');
const Profiler = require('../profiler');
const PROFILER_CONSTANTS = require('../profiler/constants');

class Service {
  constructor(rpc_framework) {
    this.SERVICE_ID = SERVICE_PACKAGE_JSON.name;
    this.rpcFramework = rpc_framework;

    let options = {
      source_type : RPC_CONSTANTS.SOURCE_TYPE.SERVICE
    }
    this.config = this.rpcFramework.initConfig(this.SERVICE_ID, options);


    this.rpcFramework.initSlack(this.SERVICE_ID);
    this.rpcFramework.initUCError();
    this.rpcFramework.initGlobalHttpAgent(_.get(this.config, 'PLATFORM_CONF.globalHttpAgentOptions'));
    this.Logger = this.rpcFramework.initLogger({ debug_mode: _.get(this.config.CUSTOM, 'logging_options.debug_mode'), service_id: this.SERVICE_ID });
    const ucServiceType = _.get(SERVICE_PACKAGE_JSON, 'urbanclap.service_type', null);
    this.SERVICE_TYPE = (ucServiceType === null) ? _.get(SERVICE_PACKAGE_JSON, 'service_type', 'javascript') : ucServiceType;

    this.rpcFramework.SERVICE_TYPE = this.SERVICE_TYPE;

    this.API_SOURCE_PATH = SERVICE_PACKAGE_JSON.main;
    this.ISOTOPE = SERVICE_PACKAGE_JSON.isotope;
    this.DEPENDENCY_CONFIG_PATH = RPC_CONSTANTS.REPO_DIR_PATH + RPC_CONSTANTS.DEPENDENCY.CONFIG_PATH;
    this.GATEWAY_CONFIG_PATH = RPC_CONSTANTS.REPO_DIR_PATH + RPC_CONSTANTS.GATEWAY.CONFIG_PATH;
    this.PORT = this.config.PORT;
    this.AUTH_SERVICE_IDS = this.config.AUTH_SERVICE_IDS;
  }

  initDependency() {
    let self = this;
    let DEPENDENCY_CONFIG = require(this.DEPENDENCY_CONFIG_PATH).Config.service;
    let logData = {}
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'server_type';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = 'service';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2] = 'status';
    logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2_VALUE] = 'loading';
    logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
    this.Logger.info(logData);

    OpenApiSchema.init(this.SERVICE_ID);
    if(IS_PROMETHEUS_MONITORING_ENABLED) {
      PrometheusMonitoring.initPrometheusMonitoringClient({}, self.rpcFramework);
    }
    MycroftMonitoring.initMonitoringClient(this.SERVICE_ID, self.rpcFramework);
    return this.rpcFramework.initCredentials(this.SERVICE_ID)
    .then(async function(updatedConfig){
      if (updatedConfig) self.config = updatedConfig;
      if (_.has(DEPENDENCY_CONFIG, RPC_CONSTANTS.DEPENDENCY.TYPE.EVENT_CONSUMER)){
        self.rpcFramework.eventConsumerDependency = _.pick(DEPENDENCY_CONFIG, [RPC_CONSTANTS.DEPENDENCY.TYPE.EVENT_CONSUMER])
        DEPENDENCY_CONFIG = _.omit(DEPENDENCY_CONFIG, RPC_CONSTANTS.DEPENDENCY.TYPE.EVENT_CONSUMER)
      }
      await dependencyLoader.init(self.rpcFramework, DEPENDENCY_CONFIG);
    })
    .then(async () => {
      if (IS_LOAD_SHEDDING_INITIALIZED) {
        await LoadShed.initLoadShedding({}, self.rpcFramework);
      }
    })
    .then(() => {
      if (IS_CONTINUOUS_PROFILER_ENABLED) Profiler.triggerProfiler(PROFILER_CONSTANTS.STRATEGY.CONTINUOUS, PROFILER_CONSTANTS.TYPE.CPU);
    });
  }
  
  initServer(serviceController) {
    let self = this;
    let Isotope = self.ISOTOPE === true ? require( RPC_CONSTANTS.REPO_DIR_PATH + '/isotope_init') : undefined;
    return Promise.resolve()
      .then(() => {
        if(Isotope) {
          Isotope.init();
        }
      })
      .then(async function() {
        let schemaObj, gatewayConfig = null;
        let logData = {}
        try { gatewayConfig = getGatewayConfig(self) }
        catch(err) {}
        self.rpcFramework.addToSingleton('GATEWAY_CONFIG', gatewayConfig);
        if(gatewayConfig) self.rpcFramework.initTransactionContext()

        let Service = serviceController ? serviceController : 
            require(RPC_CONSTANTS.REPO_DIR_PATH + RPC_CONSTANTS.SRC_PATH[self.SERVICE_TYPE] + self.API_SOURCE_PATH);
        
        await initializeEventConsumer(self, Service);
        Logger.info({key_1: 'schema_fetch', key_1_value: `fetching from platform-config-service: ${self.SERVICE_ID}`});
        schemaObj = OpenApiSchema.getOpenApiObj(self.SERVICE_ID, 0).schema;

        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1] = 'server_type';
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE] = 'service';
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2] = 'status';
        logData[LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_2_VALUE] = 'ready';
        logData[LOG_CONSTANTS.SYSTEM_LOGS.LOG_TYPE] = LOG_TYPE.RPC_SYSTEM;
        self.Logger.info(logData); 

        self.rpcFramework.createServer(self.SERVICE_ID, self.AUTH_SERVICE_IDS, schemaObj, Service, self.PORT);
        
        console.log("Service running on port: " + self.PORT);
      })
  }
}

function getGatewayConfig(self) {
  let gatewayConfig = require(self.GATEWAY_CONFIG_PATH).Config;
  let config = {
    [RPC_CONSTANTS.GATEWAY.API]: {}
  };
  Object.keys(gatewayConfig).forEach((serviceKey) => {
    config[RPC_CONSTANTS.GATEWAY.API] = _.extend(config[RPC_CONSTANTS.GATEWAY.API], gatewayConfig[serviceKey]);
  })
  return config;
}

async function initializeEventConsumer(self, service){
  if (self.rpcFramework.eventConsumerDependency){
    self.rpcFramework.service = service
    await dependencyLoader.init(self.rpcFramework, self.rpcFramework.eventConsumerDependency)
  }
}

module.exports = Service;
