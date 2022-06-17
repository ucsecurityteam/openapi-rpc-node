'use strict';

const { UCError } = require('../error');
const Logger = require('../logger');
const _ = require("lodash")

let Microservice = {};

function initClientFromPlatformService(params) {
  let OpenApiSchema = require('../schema/services/fetch_schema_object');
  const proto_obj = OpenApiSchema.getOpenApiObj(params.id, params.version);
  if (!proto_obj) throw UCError({err_message: `Empty proto object returned for ${params.id}`});
  Logger.info({key_1: 'schema_fetch_success', key_1_value: `successfully fetched the schema from platform-config-service for ${params.id}`});
  return proto_obj.schema;
}

function createServiceClient(serviceId, serviceSchema, params, RPCFramework) {
  const Config = RPCFramework.getSingleton().Config;
  const discoveryConfig = Config.getServiceConf(serviceId);
  let client = RPCFramework.createClient(Config.SERVICE_ID, serviceId, serviceSchema, discoveryConfig.uri, discoveryConfig.port, params)
  return client;
}

function getServiceClients(params, serviceSchema, RPCFramework) {
  if(!_.isEmpty(params.sub_service_ids)) {
    let subServiceClients = {};
    _.forEach(params.sub_service_ids, function(sub_service_id) {
      subServiceClients[sub_service_id] = createServiceClient(sub_service_id, serviceSchema, params, RPCFramework);
    });
    return subServiceClients;
  }
  return createServiceClient(params.id, serviceSchema, params, RPCFramework);
}

Microservice.initMicroserviceClient = (params, RPCFramework) => {

  let serviceSchema;
  serviceSchema = initClientFromPlatformService(params);
  const serviceClients = getServiceClients(params, serviceSchema, RPCFramework);
  RPCFramework.addToSingleton(params.singleton_id || params.id, serviceClients);
}

module.exports = Microservice;
