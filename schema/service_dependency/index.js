'use strict';

const _ = require('lodash');
const ChangeCase = require('change-case');
const fs = require('fs');
const path = require('path');
const Logger = require('../../logging/standard_logger');

const SCHEMA_DIR_PATH = __dirname;
const SCHEMA_FILE_FORMAT = '.json';

const ServiceDependencySchemaLoader = function () {
  let schemas = {};
  return {
    getServiceDependencySchemas: function () {
    
      if (_.isEmpty(schemas)) {
      
        const dependencySchemaFileNames = fs.readdirSync(SCHEMA_DIR_PATH);
        _.forEach(dependencySchemaFileNames, function (dependencySchemaFileName) {
          const fileExt = path.extname(dependencySchemaFileName);
          const dependencySchemaName = dependencySchemaFileName.replace(fileExt, '');
      
          if(fileExt !== SCHEMA_FILE_FORMAT) {
            Logger.info({ key_1: 'schema_name', key_1_value: dependencySchemaName, error_message: 'fetched the auth_service_ids from platform.config.json' });
            return;
          }
      
          if(dependencySchemaName !== ChangeCase.snakeCase(dependencySchemaName)) {
            Logger.info({ key_1: 'schema_name', key_1_value: dependencySchemaName, error_message: 'schema name must be in snakecase' });
            return;
          }
      
          const filePath = path.join(SCHEMA_DIR_PATH, dependencySchemaFileName);
          if(fs.existsSync(filePath)) {
            schemas[dependencySchemaName] = require(filePath);
          }
          else {
            Logger.info({ key_1: 'schema_name', key_1_value: dependencySchemaName, error_message: 'schema doesn\'t exist' });
          }
        });
      }
      return schemas;
    }
  } 
}();



module.exports = ServiceDependencySchemaLoader;