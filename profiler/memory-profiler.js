const ProfilerUtils = require('./utils')
const PROFILER_CONSTANTS = require('./constants');
const fs = require('fs');

async function takeSnapshot(fileName) {
  const heapdump = require('heapdump');
  const filePath = './' + fileName;
  const res = heapdump.writeSnapshot(filePath);
  if (res) {
    const fileStream = fs.createReadStream(filePath);
    const s3Path = `${PROFILER_CONSTANTS.TYPE.MEMORY}/${fileName}`;
    ProfilerUtils.uploadDataToS3(fileStream, s3Path);
  }
}

module.exports = {
  takeSnapshot
}