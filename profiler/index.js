const PROFILER_CONSTANTS = require('./constants');
const CpuProfiler = require('./cpu-profiler');
const MemoryProfiler = require('./memory-profiler');
const SERVICE_ID = require(process.cwd() + '/package.json').name;

const Profiler = {};

Profiler.triggerProfiler = (stage, profileType, duration) => {
  switch (stage) {
    case PROFILER_CONSTANTS.STRATEGY.ON_DEMAND:
      return triggerOnDemandProfiler(profileType, duration)
    case PROFILER_CONSTANTS.STRATEGY.CONTINUOUS:
      return triggerContinuousProfiler(profileType)
  }
}

const triggerOnDemandProfiler = (profileType, duration) => {
  const fileName = getFileName(profileType);
  const s3Url = PROFILER_CONSTANTS.S3_PROFILE_BUCKET_URL + profileType + `/${fileName}`;

  switch (profileType) {
    case PROFILER_CONSTANTS.TYPE.MEMORY: {
      MemoryProfiler.takeSnapshot(fileName);
      break;
    }
    case PROFILER_CONSTANTS.TYPE.CPU: {
      CpuProfiler.triggerCpuOnDemandProfiler(duration, fileName);
      break;
    }
  }

  return s3Url;
}

const triggerContinuousProfiler = (profileType) => {
  switch (profileType) {
    case PROFILER_CONSTANTS.TYPE.CPU:
      return CpuProfiler.triggerCpuContinuousProfiler();
  }
}

const getFileName = (profileType) => {
  const profilerTypeKey = profileType.toUpperCase();
  return `${SERVICE_ID}-${Date.now() + PROFILER_CONSTANTS.EXTENSION[profilerTypeKey]}`;
}

module.exports = Profiler;
