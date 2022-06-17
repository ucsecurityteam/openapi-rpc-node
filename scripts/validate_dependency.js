'use strict'

/**
 * Validates Upstream Red dependencies for the current service
 */
const _ = require('lodash');
const Utils = require('./utils');
const RequestPromise = require('request-promise');
const CONSTANTS = require('./constants');
const bluebird = require('bluebird');

const PARENT_SERVICE_PLATFORM_CONFIG = Utils.getServicePlatformConfig();
const SERVICE_NAME = Utils.getServiceName();

async function validateRedDependency() {
  const authorizedServiceIds = _.get(PARENT_SERVICE_PLATFORM_CONFIG, 'authServiceIds', []);

  const redDependencies = await bluebird.filter(authorizedServiceIds, async (serviceId) => {
    const response = await callPlatformConfigService('isNewDependencyAllowed', {
      service: serviceId,
      downstreamService: SERVICE_NAME
    });

    return !_.get(response, 'success.data', true);
  }, { concurrency: 10 });

  if (_.isEmpty(redDependencies)) {
    console.log(`No red dependencies found for ${SERVICE_NAME}`);
    
    process.exit(0);
  } else {
    console.log('Red dependencies found');
    console.log(`Given services should not be allowed to call ${SERVICE_NAME}: ${redDependencies}`);
    console.log('Red Dependency Classification Rules: ', 'https://urbanclap.atlassian.net/wiki/spaces/ENGG/pages/3295838369/Dependency+Classification#Red')
    
    process.exit(1);
  }
}

function callPlatformConfigService(methodName, params) {
  const endpoint = CONSTANTS.PCS_ENDPOINT_PROD;
  const clientId = SERVICE_NAME;

  const options = {
    method: 'POST',
    uri: `http://${endpoint}/${CONSTANTS.PLATFORM_CONFIG_SERVICE}/${methodName}?client_id=${clientId}`,
    json: true,
    headers: { 'Content-Type': 'application/json' },
    body: params
  };

  return RequestPromise(options).promise().catch(err => console.log('Issue while calling platform config service', err));
}

validateRedDependency();