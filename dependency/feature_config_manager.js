'use strict';

const FeatureConfigManager = {};

FeatureConfigManager.initFeatureConfigManager = async (params, RPCFramework) => {
  const featureConfigManger = require('feature-config-manager');
  const Singleton = RPCFramework.getSingleton();
  await featureConfigManger.init({
    mongoConn: Singleton[params.database_id],
    serviceId: Singleton.Config.SERVICE_ID,
    UCError: Singleton.UCError,
    Logger: Singleton.Logger,
    'xp-service': Singleton['xp-service']
  });
  const module = await featureConfigManger.getModule();
  RPCFramework.addToSingleton(params.id, module);
};

module.exports = FeatureConfigManager;