'use strict';

const RPC_CONSTANTS = require('../../constants');
const _ = require('lodash');
let ChangeCase = require('change-case');
const Logger = require('../../logger');
const ErrorTypes = require('../../error');
const UCError = ErrorTypes.UCError;
const Utils = require('../../scripts/utils');
let Repo = { proto:{}, openapi:{} };
const SERVICE_PARENT_DIR = _.split(RPC_CONSTANTS.REPO_DIR_PATH, 'node_modules')[0]
let dependencySchemas;
let path = require('path');
const { initServiceClient } = require('./service_self_schema_object');

function initDependencyClients() {

  let platformConfig = Utils.getServicePlatformConfig();
  let serviceDependencyPath = _.get(platformConfig, 'serviceDependencySchema.properties.generatedSchemaFilePath', 'node_modules/dependency_schemas.json');
  dependencySchemas = require(path.join(SERVICE_PARENT_DIR + '/' + serviceDependencyPath));

  Object.keys(dependencySchemas).forEach((serviceId) => {
    let schema = dependencySchemas[serviceId];
    if (schema.swagger != "2.0" ||
    schema.basePath != '/' + serviceId ||
    schema.info.title != ChangeCase.pascalCase(serviceId)) {
    throw { err_type: "schema_validation_failed" };
  }
  Repo.openapi[serviceId] = {};
  Repo.openapi[serviceId][schema.info.version] = {
    version: schema.info.version,
    service_name: ChangeCase.pascalCase(serviceId),
    schema: schema
  }
  })
}

let OpenApiSchema = {

  init(serviceName) {
    try {
      initDependencyClients();
      initServiceClient(serviceName, Repo);
    } catch (error) {
      throw new UCError({ err_type: ErrorTypes.RPC_SCHEMA_FILE_ERROR, err_message: `failed to initialise service dependency schema. ${error.message}` });
    }
    Logger.info({key_1: 'schema_init', key_1_value: `successful`});
  },

  getOpenApiObj(serviceId, version) {
    if (Repo.openapi[serviceId] && Repo.openapi[serviceId][version]) {
      return Repo.openapi[serviceId][version];
    } else {
      throw { err_type: "openapi_obj_not_found" };
    }
  }
}

module.exports = OpenApiSchema;