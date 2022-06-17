'use strict';

let ExternalService = {};

ExternalService.initExternalServiceClient = (params, RPCFramework) => {
  let Config = RPCFramework.getSingleton().Config;
  let client = RPCFramework.createExternalClient(Config.SERVICE_ID, params.id, params.options);
  if(params.isotope) {
    params.isotope.bottom({client});
  }
  RPCFramework.addToSingleton(params.singleton_id || params.id, client);
}

module.exports = ExternalService;


