'use strict';
const { get } = require('lodash');

const ElasticSearch = {};

ElasticSearch.initElasticSearchClient = (params, RPCFramework) => {
  const { Client } = require('@elastic/elasticsearch');
  const Config = RPCFramework.getSingleton().Config;
  const ESNode = Config.getExternalConf(params.id);
  const requestTimeoutMS = get(params, 'options.requestTimeoutMS', 10000);

  const ESClient = new Client({
    node: ESNode.uri,
    requestTimeout: requestTimeoutMS
  });

  RPCFramework.addToSingleton(params.id, ESClient);
};

module.exports = ElasticSearch;
