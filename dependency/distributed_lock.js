'use strict';

let DistributedLock = {};
const RPC_CONSTANTS = require('../constants');

DistributedLock.initDistributedLockManager = (params, RPCFramework) => {
    let distributedLockManager = require('distributed-lock-manager');
    let Config = RPCFramework.getSingleton().Config;
    const auditContextNamespace = require('../audit-context/index').getNamespace();
    const transactionContextNamespace = require('../transaction-context').getNamespace();
    distributedLockManager.Initialization().setNamespaces([auditContextNamespace, transactionContextNamespace]);
    distributedLockManager.Initialization().getInstance(Config.getDBConf(params.database_id).uri, params.sequelize_options);
    distributedLockManager.CheckAndCreateDbs();
}

module.exports = DistributedLock;
