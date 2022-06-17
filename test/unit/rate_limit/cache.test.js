require('../mockers/rate_limit/rate-limit.mock')
const RateLimitCache = require('../../../rate_limit/cache');
const Logger = require('../../../logging/standard_logger');

describe('rate limit cache', () => {
  
  test('isTokenAvailable function(positive)', function() {
    expect(RateLimitCache.isTokenAvailable('success')).toBe(true);
  })

  test('isTokenAvailable function(negative) when tokenCount is zero', function() {
    expect(RateLimitCache.isTokenAvailable('zeroTokenCount')).toBe(false);
  })

  test('decrementTokens function when tokenBucket exist', async function() {
    expect(await RateLimitCache.decrementTokens('success', 10)).toBe(undefined);
  })

  test('decrementTokens function when bucket doesnt exist', async function() {
    expect(await RateLimitCache.decrementTokens('failure', 10)).toBe(undefined);
    expect(Logger.info).toBeCalled();
  })
})