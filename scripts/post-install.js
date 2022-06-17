'use strict'

/*******
 * Utility to convert swagger schemas to type declaration files
 */
const TypeGenerator = require('./type-generator');
const _ = require('lodash');
const path = require('path');
const Utils = require('./utils');
const ConfigUtils = require('../common/config_utils');
const PARENT_SERVICE_PACKAGE_JSON = require(ConfigUtils.getParentWorkingDir() + '/package.json');
const DEPENDENCY_CONFIG_PATH = ConfigUtils.getParentWorkingDir() + '/configs/dependency.config.js';
const ServiceSchemaDtl = require('./dependency_schema_provider');
const CONSTANTS = require('./constants');
const GLOBAL_CONFIG = CONSTANTS.GLOBAL_CONFIG;
const MONOLITH_SERVICES = require('./constants').MONOLITH_SERVICES;
const CURRENT_SERVICE_NAME = PARENT_SERVICE_PACKAGE_JSON.name;

let dependencyParser = require('./parse_config').dependencyParser;
let globalConfigParser = require('./parse_config').globalConfigParser;


async function executeScripts() {
  await fetchSchemas();
  if (isSwaggerToTsEnabled(PARENT_SERVICE_PACKAGE_JSON)){
    await TypeGenerator.createDtsFilesForServiceSchemas(CURRENT_SERVICE_NAME);
  }
}

function isSwaggerToTsEnabled(jsonConfig) {
  return _.get(jsonConfig, 'urbanclap.generate_swagger_ts', '') === 'enabled';
}

async function fetchSchemasForMicroservices() {

  let dependentServices;
  let functionSequence = [
    {
      function: dependencyParser.requireDependencyConfig,
      arguments: [DEPENDENCY_CONFIG_PATH]
    },
    {
      function: dependencyParser.parseDependencyConfig,
      arguments: [DEPENDENCY_CONFIG_PATH]
    },
    {
      function: dependencyParser.grepDependencyConfig,
      arguments: [DEPENDENCY_CONFIG_PATH]
    },
  ]
  let failureMessage = `Unable to parse the dependency config for ${CURRENT_SERVICE_NAME}`;
  try {
    dependentServices = await tryInSequence(functionSequence);
  } catch(err) {
    console.log(failureMessage);
    console.log(err);
  }
  await fetchAndStoreSchemas(dependentServices);
}

async function fetchSchemasForMonoliths() {
  let dependentServices;
  let globalConfigPath = path.join(ConfigUtils.getParentWorkingDir(), GLOBAL_CONFIG.RELATIVE_PATH_FROM_ROOT);
  try {
    dependentServices = await globalConfigParser.parseGlobalConfig(globalConfigPath);
  } catch (err) {
    let errMsg = `Unable to parse the global config: ${JSON.stringify(err)}`;
    console.log(errMsg);
  }
  await fetchAndStoreSchemas(dependentServices);
}

async function fetchSchemasForOarpc() {

  let dependentServices = require(ConfigUtils.getParentWorkingDir() + '/test/configs/dependency.config.js').Config.service.internal_service;
  await fetchAndStoreSchemas(dependentServices);
}

async function fetchSchemas() {

  console.log(`fetching service schemas...`);
  if (CURRENT_SERVICE_NAME === CONSTANTS.OARPC_SERVICE_NAME) {
    await fetchSchemasForOarpc();
  }
  else if (MONOLITH_SERVICES.includes(CURRENT_SERVICE_NAME)) {
    await fetchSchemasForMonoliths();
  } else {
    await fetchSchemasForMicroservices();
  }
}

async function fetchAndStoreSchemas(dependentServices) {
  let report = {};
  dependentServices = Utils.addOtherDependencies(dependentServices, CURRENT_SERVICE_NAME);

  if (!dependentServices || _.isEmpty(dependentServices)) {
    let msg = `No dependent services found using the schema-decentralisation flow`;
    console.log(msg);
  }
  try {
    await ServiceSchemaDtl.fetchServiceSchemas(dependentServices, report);
  } catch (error) {
    console.log(`error while fetching the schemas: ${JSON.stringify(error)}\n`);
  }
  report.successRatio = report.schemasFetched/report.totalSchemasQueried;

  report.message = `Schemas queried: ${report.totalSchemasQueried}, schemas fetched: ${report.schemasFetched}, success ratio: ${report.successRatio}`; 
  console.log(report.message);

  if (MONOLITH_SERVICES.includes(CURRENT_SERVICE_NAME)) {
    if (report.successRatio < CONSTANTS.MONOLITH_SCHEMA_FETCH_SUCCESS_RATIO) {
      report.message = `Schema fetch ratio (${report.successRatio}) is less than the desired ratio: ${CONSTANTS.MONOLITH_SCHEMA_FETCH_SUCCESS_RATIO}`; 
      console.log(report.message);
      throw Error(`Unable to fetch all the schemas`);

    }
  }
  else {
    if (report.successRatio < CONSTANTS.MICROSERVICE_SCHEMA_FETCH_SUCCESS_RATIO) {
      report.message = `Schema fetch ratio (${report.successRatio}) is less than the desired ratio: ${CONSTANTS.MICROSERVICE_SCHEMA_FETCH_SUCCESS_RATIO}`;
      console.log(report.message);
      throw Error(`Unable to fetch all the schemas`);
    }
  }
}

async function tryInSequence(functions) {

  let isPassed = false;
  let errThrown;
  let returnValue;

  for (let i in functions) {
    if (isPassed) break;
    let functionJson = functions[i];
    try {
      returnValue = await functionJson.function(...functionJson.arguments);
      isPassed = true;
    } catch (err) {
      errThrown = err;
    }
  }
  if (!isPassed) {
    throw Error(errThrown);
  }
  return returnValue;
}

executeScripts();