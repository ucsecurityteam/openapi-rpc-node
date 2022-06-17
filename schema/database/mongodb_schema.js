const mongoose = require('mongoose');
require('mongoose-schema-jsonschema')(mongoose);
const RPC_CONSTANTS = require('../../constants');
const Singleton = require('../../singleton').getSingleton();
const _ = require('lodash');


const MongoSchema = {
  getAllMongoDBSchemas : () => {
    const dependencyConfig = require(RPC_CONSTANTS.REPO_DIR_PATH + RPC_CONSTANTS.DEPENDENCY.CONFIG_PATH)
    const modelSchemas = {};
    const modelsAvailable = {};
    const mongoDbDependencies = _.get(dependencyConfig, 'Config.service.mongodb', []);
    mongoDbDependencies.map((mongoDbDependency) => {
      const mongoSingletonId = mongoDbDependency.id;
      const modelObjects = Singleton[mongoSingletonId].models;
      const modelNames = Object.keys(modelObjects);
      modelsAvailable[mongoSingletonId] = [];
      modelSchemas[mongoSingletonId] = {};
      modelNames.map((modelName) => {
        const collectionName=modelObjects[modelName].collection.collectionName;
        const modelObject = modelObjects[modelName].schema;
        modelSchemas[mongoSingletonId][collectionName] = modelObject.jsonSchema();
        modelsAvailable[mongoSingletonId].push(collectionName);
      })
    })
    return { modelSchemas, modelsAvailable};
  },
  fetchMongoDBSchema: (requiredDb, requiredSchema) => {
    return _.get(MongoSchema.getAllMongoDBSchemas().modelSchemas, `${requiredDb}.${requiredSchema}`, {});
  },
  listAllMongoDBSchemas: () => {
    return MongoSchema.getAllMongoDBSchemas().modelsAvailable;
  }
}

module.exports = MongoSchema;
