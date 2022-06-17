const { UCError } = require('../../../error');
const RateLimitResources = require('../resources/rate-limit.test.data');
require('../mockers/rate_limit/rate-limit.mock')
let rateLimitMiddleware = require('./../../../rate_limit/index');
let Singleton = require('../../../singleton').getSingleton();
describe('rate limit util', () => {

  const mockNextFunc = jest.fn().mockImplementation((params) => {
    if(params) {
      return 'failure';
    } else {
      return 'success'
    }
  });

  test('serverRateLimiter function request allowed', async function() {
    expect(await rateLimitMiddleware.serverRateLimiter(RateLimitResources.testRequestObject, {}, mockNextFunc)).toBe('success');
    expect(mockNextFunc).toBeCalled();
  })

  test('serverRateLimiter function request not allowed', async function() {
    expect(await rateLimitMiddleware.serverRateLimiter(RateLimitResources.testRequestObjectNotAllowed, {}, mockNextFunc)).toBe('failure');
    expect(mockNextFunc).toBeCalled();
  })
})