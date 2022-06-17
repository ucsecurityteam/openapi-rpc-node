'use strict';
let Cache = {};

Cache.initCacheClient = (params, RPCFramework) => {
    const Flash = require('flash');
    let Config = RPCFramework.getSingleton().Config;
    let cacheConnectionConfig = Config.getExternalConf('cache-main');
    let cache = new Flash();
    cache.connect(cacheConnectionConfig, params.options, Config.SERVICE_ID);
    cache.setCurrentService(Config.SERVICE_ID);
    RPCFramework.addToSingleton(params.singleton_id || params.id, cache);
  }

module.exports = Cache;
