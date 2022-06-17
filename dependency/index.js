'use strict';

let service = require('./microservice');
let mongodb = require('./mongodb');
let mysql = require('./mysql');
let events = require('./events');
let cache = require('./cache');
let redshift = require('./redshift');
let snowflake = require('./snowflake');
let elasticsearch = require('./elasticsearch');
let externalService = require('./external_service');
let distributedLock = require('./distributed_lock');
let authService = require('./auth_service');
let mediaUtils = require('./media_utils');
let localization = require('./localization')
let auditContext = require('./audit_context');
let featureConfigManager = require('./feature_config_manager');
let mycroftMonitoring = require('./mycroft_monitoring');
let coachmarks = require('./coachmarks');
const rateLimit = require('./rate_limit');
const autoUpdateCache = require('./auto_update_cache');
const securitas = require('./securitas');
const xpLib = require('./xp_lib');

const DEPENDENCY_TYPE = require('../constants').DEPENDENCY.TYPE;

module.exports = {
  [DEPENDENCY_TYPE.INTERNAL_SERVICE]: service.initMicroserviceClient,
  [DEPENDENCY_TYPE.MONGODB]: mongodb.initMongodbClient,
  [DEPENDENCY_TYPE.MYSQL]: mysql.initMysqlClient,
  [DEPENDENCY_TYPE.EVENT_PRODUCER]: events.initEventProducer,
  [DEPENDENCY_TYPE.EVENT_CONSUMER]: events.initEventConsumer,
  [DEPENDENCY_TYPE.CACHE]: cache.initCacheClient,
  [DEPENDENCY_TYPE.AUTH_SERVICE]: authService.initAuthService,
  [DEPENDENCY_TYPE.MEDIA_UTILS]: mediaUtils.initMediaUtils,
  [DEPENDENCY_TYPE.REDSHIFT]: redshift.initRedshiftClient,
  [DEPENDENCY_TYPE.SNOWFLAKE]: snowflake.initSnowflakeClient,
  [DEPENDENCY_TYPE.ELASTICSEARCH]: elasticsearch.initElasticSearchClient,
  [DEPENDENCY_TYPE.EXTERNAL_SERVICE]: externalService.initExternalServiceClient,
  [DEPENDENCY_TYPE.DISTRIBUTED_LOCK_MANAGER]: distributedLock.initDistributedLockManager,
  [DEPENDENCY_TYPE.LOCALIZATION]: localization.initLocalizationClient,
  [DEPENDENCY_TYPE.AUDIT_CONTEXT]: auditContext.initAuditContext,
  [DEPENDENCY_TYPE.FEATURE_CONFIG_MANAGER]: featureConfigManager.initFeatureConfigManager,
  [DEPENDENCY_TYPE.COACHMARKS]: coachmarks.initCoachmarks,
  [DEPENDENCY_TYPE.APPLICATION_METRICS]: mycroftMonitoring.initApplicationMonitoringClient,
  [DEPENDENCY_TYPE.RATE_LIMIT]: rateLimit.initRateLimit,
  [DEPENDENCY_TYPE.SECURITAS]: securitas.initSecuritasClient,
  [DEPENDENCY_TYPE.XP_LIB]: xpLib.initXp,
  [DEPENDENCY_TYPE.AUTO_UPDATE_CACHE]: autoUpdateCache.initiate,
}
