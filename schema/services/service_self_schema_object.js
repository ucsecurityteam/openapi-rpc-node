'use strict';

const _ = require('lodash');
let ChangeCase = require('change-case');
const RPC_CONSTANTS = require('../../constants');
const SERVICE_PARENT_DIR = _.split(RPC_CONSTANTS.REPO_DIR_PATH, 'node_modules')[0]

function initServiceClient(serviceName, Repo) {
  let serviceSchema = require(SERVICE_PARENT_DIR + '/schema/service_schema.json');
  if (serviceSchema.swagger != "2.0" ||
      serviceSchema.basePath != '/' + serviceName ||
      serviceSchema.info.title != ChangeCase.pascalCase(serviceName)) {
    throw { err_type: "schema_validation_failed" };
  }
  Repo.openapi[serviceName] = {};
  Repo.openapi[serviceName][serviceSchema.info.version] = {
    version: serviceSchema.info.version,
    service_name: ChangeCase.pascalCase(serviceName),
    schema: serviceSchema
  }
}

module.exports = {
  initServiceClient
}