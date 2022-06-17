const RpcFramework = require('../../../../index');
jest.spyOn(RpcFramework, 'createClient').mockImplementation(() => {
  return {};
});

jest.spyOn(RpcFramework, 'getSingleton').mockImplementation(() => {
  return {
    Config: { getServiceConf: function getServiceConf(serviceId) { return { uri: "", port: "" } } }
  }
});

const OpenApiSchema = require('../../../../schema/services/fetch_schema_object');
jest.spyOn(OpenApiSchema, 'getOpenApiObj').mockImplementation(() => {
  return { schema: {} };
});

