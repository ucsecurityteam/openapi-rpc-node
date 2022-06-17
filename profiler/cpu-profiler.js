'use strict';

const Singleton = require('../singleton').getSingleton();
const ERROR = require('../error');
const _ = require('lodash');
const ProfilerUtils = require('./utils')
const pprof = require('pprof');
const PROFILER_CONSTANTS = require('./constants');
const CONSTANTS = require('../constants');

async function triggerCpuOnDemandProfiler(duration, fileName) {
  const profile = await pprof.time.profile({
    durationMillis: duration || PROFILER_CONSTANTS.DEFAULT_CPU_PROFILE_TIME,    // time in milliseconds for which to collect profile.
  });
  const buf = await pprof.encode(profile);
  const s3Path = `${PROFILER_CONSTANTS.TYPE.CPU}/${fileName}`;
  ProfilerUtils.uploadDataToS3(buf, s3Path);
}

function triggerCpuContinuousProfiler() {
  const profilerCredentials = getContinuousProfilerCredentials();

  if (!validateCredentials(profilerCredentials)) {
    return ProfilerUtils.logError(ERROR.DEPENDENCY_INITIALIZATION_ERROR, 'Cpu continuous profiler credentials are invalid');
  }

  startContinuousProfiler(profilerCredentials);
}

function getContinuousProfilerCredentials() {
  return _.get(Singleton.Config, `CUSTOM.${CONSTANTS.CMS.GLOBAL_CREDENTIALS_PATH}.continuousProfiler`, {});
}

function validateCredentials(credentials) {
  return _.has(credentials, 'projectId')
    && _.has(credentials, 'email')
    && _.has(credentials, 'key');
}

function startContinuousProfiler(credentials) {
  require('@google-cloud/profiler').start({
    serviceContext: {
      service: process.env.CONTINUOUS_PROFILER_SERVICE_NAME
    },
    projectId: credentials.projectId,
    credentials: {
      client_email: credentials.email,
      private_key: credentials.key
    },
    disableHeap: true
  });
}

module.exports = {
  triggerCpuOnDemandProfiler,
  triggerCpuContinuousProfiler
}