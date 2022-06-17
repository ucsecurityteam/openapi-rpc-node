'use strict';

const Constants = {
  RateLimitAttribute : {
    API: 'api',
    CLIENT: 'client',
    HEADER_SOURCE: 'source'
  },
  TimeWindowUnit : {
    MINUTE: 'minute',
    HOUR: 'hour'
  },
  CACHE_BUCKET_NAME: 'rate-limit',
  RateLimitHierarchy : ['api', 'client', 'source']
};

module.exports = Constants;
