'use strict';

const _ = require('lodash');
const OpenApiSchema = require('../schema/services/fetch_schema_object');
const Constants = require('../constants');
const fs = require('fs');
const DIR = '../openapi-rpc-node/types/';
const TypeSwagger = require('@uc/type-swagger');
const RPCServices = Constants.DEPENDENCY.ID.INTERNAL_SERVICE;

const TypeGenerator = {};

/*********
 * this method creates type declaration files from internal service swagger schemas
 * files gets written inside ${DIR}
 */
TypeGenerator.createDtsFilesForServiceSchemas = async (currentServiceName) => {
  //build input for dts generator
  const dtsInput = createDtsInput(currentServiceName);
  const dtsDetailsArr = await TypeSwagger.bulkDtsGenerator(dtsInput);
  await Promise.all(_.map(dtsDetailsArr, async dtsDetails => {
    if (!dtsDetails.error) {
      writeToFile(dtsDetails.filename, dtsDetails.fileContent);
    }
  }));
}

/*******
 * utility function to create input for dts generator
 * @returns {
 * [{
 *  key: string,
 *  contents: [object]
 * }]
 * }
 */
function createDtsInput(currentServiceName) {
  const dtsInput = [];
  OpenApiSchema.init(currentServiceName);
  _.forEach(RPCServices, serviceId => {
    const schema = getSchemaObject(serviceId);
    if (schema){
      dtsInput.push({
        key: serviceId,
        contents: [schema]
      })
    }
  })
  return dtsInput;
}

/*******
 * utility function to return swagger schema for serviceId
 * @param serviceId
 * @returns {schema/void}
 */
function getSchemaObject(serviceId) {
  try {
    return OpenApiSchema.getOpenApiObj(serviceId, 0).schema;
  } catch (e) {
    //openapi_obj_not_found error can be thrown from the above call
    //catching it will ignore dts creation for given serviceId
  }
}

/******
 * utility function to write data to files inside ${DIR}
 * @param filename
 * @param fileContent
 */
const writeToFile = (filename, fileContent) => {
  if (!fs.existsSync(DIR))
    fs.mkdirSync(DIR);
  fs.writeFile(`${DIR}${filename}`, fileContent, (error) => {
    if (error) throw error;
  });
};

module.exports = TypeGenerator;
