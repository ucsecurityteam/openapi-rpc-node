const _ = require('lodash');

const getMongoDBDetails = (req)=> {
    const MongoSchema = require('./mongodb_schema');
    const action = _.get(req.body, 'action', '');
    const requiredDb = _.get(req.body, 'db_name', '');
    const requiredSchema = _.get(req.body, 'schema_name', '');
    const resultKey = (action !== 'list') ? 'JsonSchema' : 'SchemasAvailable';
    const resultValue = (action === 'list') ? MongoSchema.listAllMongoDBSchemas() : MongoSchema.fetchMongoDBSchema(requiredDb, requiredSchema);
    return {resultKey,resultValue};
}
module.exports = {getMongoDBDetails};

