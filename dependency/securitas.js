'use strict';
const vaultClientFetcher = require('../credential-management/vault/connection')
const CONSTANTS = require('../constants');
const LOG_CONSTANTS = require("../logging/log_constants.json");
const Logger = require("../logger");

let Securitas = {};

Securitas.initSecuritasClient = async (params, RPCFramework) => {
    const Singleton = RPCFramework.getSingleton()
    const Config = Singleton.Config;
    let global_conf = Config['GLOBAL_CONF'];
    let full_metadata_url = CONSTANTS.CMS.AWS_METADATA_URL + process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'];
    const securitas = require('securitas');
    let serviceId = Singleton.Config.SERVICE_ID
    try {
        let vaultClient = await vaultClientFetcher.fetchClient({
            vault_address: global_conf['cms_server'],
            full_metadata_url: full_metadata_url,
            service_id: serviceId
        })
        await securitas.init(
            {
                vaultClient: vaultClient,
                UCError: Singleton.UCError,
                serviceID: serviceId,
                Logger: Singleton.Logger
            }
        )
        const securitasModule = await securitas.getModule()
        RPCFramework.addToSingleton(params.singleton_id || 'securitas', securitasModule);
    }
    catch (error) {
        const logData = {};
        logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = error.err_message || 'Securitas Initialization Failed';
        logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = error.err_stack || "NA";
        Logger.error(logData);
        process.exit(1);
    }
  }

module.exports = Securitas;