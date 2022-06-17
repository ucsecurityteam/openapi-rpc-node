'use strict';

let Redshift = {};

Redshift.initRedshiftClient = (params, RPCFramework) => {
  const nodeRedshift = require('node-redshift');
  let Config = RPCFramework.getSingleton().Config;
  let redshiftConfig = Config.getDBConf(params.id);

  let redshiftClient = new nodeRedshift(redshiftConfig, {
    longStackTraces: false
  });

  RPCFramework.addToSingleton(params.id, redshiftClient);
};

module.exports = Redshift;
