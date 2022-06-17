let constants = {
  STRATEGY: {
    ON_DEMAND: 'on-demand',
    CONTINUOUS: 'continuous'
  },
  TYPE: {
    MEMORY: 'memory',
    CPU: 'cpu'
  },
  EXTENSION: {
    MEMORY: '.heapsnapshot',
    CPU: '.pb.gz'
  },
  S3_PROFILE_BUCKET: 'uc-profiling-data',
  AWS_REGION: 'ap-southeast-1',
  DEFAULT_CPU_PROFILE_TIME: 300000,
  S3_PROFILE_BUCKET_URL: 'https://uc-profiling-data.s3.ap-southeast-1.amazonaws.com/',
  S3_UPLOAD_FAILED_ERROR: 's3_upload_failed'
};

module.exports = constants;