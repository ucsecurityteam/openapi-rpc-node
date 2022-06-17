const Microservice = require('./microservice');
const ExternalService = require('./external_service');
const DEPENDENCY = require('../constants').DEPENDENCY

const xpServiceParams = {
  id: DEPENDENCY.ID.INTERNAL_SERVICE["xp-service"],
  version: '0'
}

const dataEventServiceParams = {
  id: DEPENDENCY.ID.INTERNAL_SERVICE["data-event-service"],
  version: '0'
}


const monitoredFunction = (fn, monitoringWrapper) => {
  return function(params) {
    return monitoringWrapper.execute(params, fn);
  }
}

const XpLib = {};

XpLib.initXp = async (params, RPCFramework) => {

  Microservice.initMicroserviceClient(xpServiceParams, RPCFramework);
  Microservice.initMicroserviceClient(dataEventServiceParams, RPCFramework);
  ExternalService.initExternalServiceClient(params, RPCFramework);

  const Singleton = RPCFramework.getSingleton();

  const xpLibClientWrapper =  Singleton[DEPENDENCY.ID.xp_lib];

  const xp = require('@uc-engg/xp-lib');
  await xp.init({
    serviceId: Singleton.Config.SERVICE_ID,
    'xp-service': Singleton['xp-service'],
    'data-event-service':  Singleton['data-event-service'],
    Logger: Singleton.Logger
  });

  const module = await xp.getModule();
  const monitoredModule = {};
  Object.keys(module).forEach((fn) => {
    monitoredModule[fn] = monitoredFunction(module[fn], xpLibClientWrapper);
  })

  RPCFramework.addToSingleton(params.id, monitoredModule);
};

module.exports = XpLib;