'use strict';

const _ = require('lodash');
const Utils = require('./utils');

let Mysql = {}
const TYPEORM_DB_TYPE = "mysql"

let initSequelizeClient = function (params, RPCFramework) {
  const Sequelize = require('sequelize');
  let Config = RPCFramework.getSingleton().Config;
  const mysqlDb = new Sequelize(Config.getDBConf(params.id).uri, params.sequelize_options);
  if(params.sync) mysqlDb.sync();
  if(params.is_cls) {
    var cls = require('continuation-local-storage');
    var namespace = cls.createNamespace('sequalise-namespace');
    Sequelize.useCLS(namespace);
  }
  if(params.models){
    Utils.logAndRaiseError('models allowed only in params for sequelize-typescript. Please correct dependency.config.json.')
  }
  RPCFramework.addToSingleton(params.singleton_id || params.id, mysqlDb);
};

let initSequelizeTypescriptClient = function (params, RPCFramework) {
  const Sequelize = require('sequelize-typescript').Sequelize
  let Config = RPCFramework.getSingleton().Config;
  const mysqlDb = new Sequelize(Config.getDBConf(params.id).uri, params.sequelize_options);
  if(params.models) mysqlDb.addModels(params.models);
  if(params.sync) mysqlDb.sync();
  RPCFramework.addToSingleton(params.singleton_id || params.id, mysqlDb);
};

let initTypeormClient = async function (params, RPCFramework) {
  let TypeormTransactionalClsHooked = require('typeorm-transactional-cls-hooked');
  TypeormTransactionalClsHooked.initializeTransactionalContext();
  let Typeorm = require('typeorm');
  let Config = RPCFramework.getSingleton().Config;
  let dbURI = Config.getDBConf(params.id).uri;
  let dbName = _.get(Config.GLOBAL_CONF, `${params.id}.db_name`);
  let typeormConfig = {
    "type": TYPEORM_DB_TYPE,
    "url": dbURI,
    "database": dbName
  }

  _.forEach(params.typeorm_options.entities, function(entity, i) {
    params.typeorm_options.entities[i] = Utils.getAbsolutePathFromRelativePath(RPCFramework.SERVICE_TYPE, entity);
  });
  params.typeorm_options = _.defaultsDeep(params.typeorm_options || {}, typeormConfig);
  const connection = await Typeorm.createConnection(params.typeorm_options)
  RPCFramework.addToSingleton(params.singleton_id || params.id, connection);
}

let mysqlClient = {
  "typeorm": initTypeormClient,
  "sequelize": initSequelizeClient,
  "sequelize-typescript": initSequelizeTypescriptClient
}

Mysql.initMysqlClient = async (params, RPCFramework) => {
  params.client_type = params.client_type ? params.client_type : "sequelize";
  await mysqlClient[params.client_type](params, RPCFramework)
};

module.exports = Mysql;