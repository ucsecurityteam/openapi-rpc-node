'use strict';

// Imports start
const _ = require('lodash');
const Singleton = require('../singleton').getSingleton();
const RateLimitConstants = require('./constants');
const RpcConstants =  require('../constants');
const Error = require('../error');
const UCError = Error.UCError;
const RateLimitUtil = require('./util');
// Imports end

// Initialization start
const RateLimit = {};
// Initialization end


RateLimit.serverRateLimiter = async function rateLimitMiddleware(req, res, next) {
  try {
    // If rateLimit dependency is not initialized allow the request
    const rateLimitPolicy = Singleton['RateLimitPolicy'];
    if (!rateLimitPolicy) {
      return next();
    }
    // Initialize token cache
    const RateLimitCache = require('./cache');
    /*
      Allow the request if any one of the below condition matches
      1. rateLimit does not exist
      2. rateLimit exists but requestLimit is undefined for the attribute
      3. tokens are available in the cache
      If none of the above conditions meet reject the request with 429
      status code
     */
    const isRequestAllowed = RateLimitConstants.RateLimitHierarchy.every((attribute) => {
      const rateLimit = RateLimitUtil.getRateLimit(req, attribute, rateLimitPolicy);
      if (!_.isUndefined(_.get(rateLimit, 'requestLimit'))) {
        if (rateLimit.requestLimit <= 0 || !RateLimitCache.isTokenAvailable(RateLimitUtil.getTokenBucketKey(req, attribute))) {
          return false;
        }
      }
      return true;
    });

    if (isRequestAllowed) {
      // Decrement token count for each tokenBucketKey against
      // attributes mentioned in RateLimitConstants.RateLimitHierarchy
      for (const attribute of RateLimitConstants.RateLimitHierarchy) {
        const rateLimit = RateLimitUtil.getRateLimit(req, attribute, rateLimitPolicy);
        const requestLimit = _.get(rateLimit, 'requestLimit');
        if (requestLimit) {
          RateLimitCache.decrementTokens(RateLimitUtil.getTokenBucketKey(req, attribute), requestLimit);
        }
      }
    } else  {
      RateLimitUtil.logInfo(req, rateLimitPolicy);
      return next(new UCError({
        err_type: Error.REQUEST_RATE_LIMITED,
        err_message: "Too many requests",
        code: RpcConstants.HTTP_RESPONSE_CODE_TOO_MANY_REQUESTS
      }));
    }
  } catch (error) {
    RateLimitUtil.logError(req, Singleton['RateLimitPolicy'], 'Error::'+JSON.stringify(error));
  }
  return next();
};

module.exports = RateLimit;
