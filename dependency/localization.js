'use strict';

let LocalizationService = {};

LocalizationService.initLocalizationClient = (params, RPCFramework) => {

  let Config = RPCFramework.getSingleton().Config;
  RPCFramework.initLocalisation({ service_id:Config.SERVICE_ID, singleton_id: params.id });
}

module.exports = LocalizationService;