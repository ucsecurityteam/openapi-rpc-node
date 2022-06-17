'use strict';

let _ = require('lodash');
const LOG_CONSTANTS = require('./log_constants');
const jsonValidator = require('jsonschema').Validator;
const logSchema = require('../schema/logging').getLogSchema();

let schemaValidator = new jsonValidator();

const ALL_WHITELISTED_KEYS = _.values(LOG_CONSTANTS.SERVICE_LEVEL_PARAMS).concat(
  _.values(LOG_CONSTANTS.COMMON_PARAMS),
  _.values(LOG_CONSTANTS.STRINGIFY_OBJECTS),
  _.values(LOG_CONSTANTS.SYSTEM_LOGS));

function removeExtraKeys(object, keyArray) {
  return _.pick(object, keyArray);
}

function stringifyDataEntries(data, keysToStringify) {
  _.values(keysToStringify).forEach(function (key) {
    if(data[key] && typeof data[key] !== "string") {
      data[key] = JSON.stringify(data[key]);
    }
  });
  return data;
}

let Filter = {};

Filter.isSchemaValid = function (data) {
  return schemaValidator.validate(data, logSchema);
};

Filter.filterKeys = function (object) {
  // TODO: uncomment after standard logging migration is complete
  //let data = removeExtraKeys(object, ALL_WHITELISTED_KEYS);
  return stringifyDataEntries(object, _.values(LOG_CONSTANTS.STRINGIFY_OBJECTS));
};

module.exports = Filter;

