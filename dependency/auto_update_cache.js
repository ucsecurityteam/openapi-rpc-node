'use strict';

const LOG_CONSTANTS = require('../logging/log_constants');
const Logger = require('../logger');
const _ = require('lodash');

const AutoUpdateCache = {};

AutoUpdateCache.initiate = async (params, RPCFramework) => {
    try {
        const autoUpdateCache = require('@uc-engg/auto-update-cache');
        const Singleton = RPCFramework.getSingleton();
        const initialiseResult = await autoUpdateCache.initialise({
            singleton: {
                ...Singleton,
                serviceId: Singleton.Config.SERVICE_ID,
            },
            useCase: params,
        });
        _.map(initialiseResult, (value, key) => {
            RPCFramework.addToSingleton(key, value);
        });
    } catch (err) {
        const logData = {};
        logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR] = err;
        logData[LOG_CONSTANTS.COMMON_PARAMS.METHOD_NAME] = 'AutoUpdateCache.initiate';
        logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_MESSAGE] = err.err_message || 'AutoUpdateCache Initialization Failed';
        logData[LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR_STACK] = err.err_stack || "NA";
        Logger.error(logData);
        process.exit(1);
    }
};

module.exports = AutoUpdateCache;
