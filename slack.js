'use strict';

const _ = require('lodash');
const Logger = require('./logging/standard_logger');
const Config = require('./config');
const LOG_CONSTANTS = require('./logging/log_constants');
const RequestPromise = require('request-promise');
const Singleton = require('./singleton');
const CONSTANTS = require('./constants');

let Slack = {};
const LOOKUP_USER_BY_EMAIL = 'https://slack.com/api/users.lookupUserByEmail';

function sendSlackMsg(senderName, msg, channelName, iconEmoji = ':incoming-webhook:') {
  if (process.env.NODE_ENV !== CONSTANTS.ENVIRONMENT.PRODUCTION) return Promise.resolve();

  return sendSlackRequest(CONSTANTS.SLACK.API.WEB_HOOK, {
    channel: channelName,
    username: senderName,
    icon_emoji: iconEmoji,
    text: (((typeof msg) === 'string') ? msg : JSON.stringify(msg)),
  });
};

function sendSlackBlockMsg(senderName, blocks, channelName, iconEmoji = ':bulb:') {
  return sendSlackRequest(CONSTANTS.SLACK.API.POST_MESSAGE, {
    channel: channelName,
    username: senderName,
    icon_emoji: iconEmoji,
    blocks,
  });
}

Slack.serverRestartAlert = function (serviceId, err) {
  const config = Config.initConfig(serviceId);
  const channelName = _.get(config, 'CUSTOM.slack_channel_exception') || '#engg-exceptions-sm';
  return sendSlackMsg(serviceId, err, channelName);
};

Slack.serverExceptionAlert = function (serviceId, err) {
  const config = Config.initConfig(serviceId);
  const channelName = _.get(config, 'CUSTOM.slack_channel_exception') || '#engg-exceptions-sm';
  return sendSlackMsg(serviceId, err, channelName);
};

Slack.sendCustomMessage = function (serviceId, message) {
  const config = Config.initConfig(serviceId);
  const channelName = _.get(config, 'CUSTOM.slack_channel_exception') || '#engg-exceptions-sm';
  return sendSlackMsg(serviceId, message, channelName);
};

// Reason as custom message is also sending alert on CUSTOM.slack_channel_exception 
Slack.sendCustomMessageOnChannel = function (serviceId, message, configKey) {
  const config = Config.initConfig(serviceId);
  const channelName = _.get(config, 'CUSTOM.'+ configKey);
  if(channelName)
    return sendSlackMsg(serviceId, message, channelName);
};

// Helper Functions

function sendSlackRequest(uri, body) {
  const token = _.get(Singleton.getSingleton(), `Config.CUSTOM.${CONSTANTS.CMS.GLOBAL_CREDENTIALS_PATH}.slackToken`);
  const options = {
    method: 'POST',
    uri,
    headers: { Authorization: `Bearer ${token}` },
    json: true,
    body
  };

  return RequestPromise(options)
    .promise()
    .then(response => _.get(response, 'data'))
    .catch(err => logSlackError(body.username, err));
}

function logSlackError(senderName, err) { 
  Logger.error({
    [LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1]: 'senderName',
    [LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE]: senderName,
    [LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR]: err
  });
}

function createOptions(method, url, token) {
  return {
    method,
    url,
    headers: {
      Authorization: `Bearer ${token}`
    },
    json: true
  };
}

const lookupUserByEmail = async (emailId) => {
  const url = `${LOOKUP_USER_BY_EMAIL}?email=${emailId}`;
  const Securitas = Singleton.getSingleton()['securitas'];
  const token = await Securitas.fetchCredentialsFromVault('common/SLACK_TOKEN', 'value');
  const options = createOptions('GET', url, token);
  return RequestPromise(options)
    .promise()
    .then(response => _.get(response, 'user.name'))
    .catch(err => Logger.error({
      [LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1]: 'senderName',
      [LOG_CONSTANTS.SERVICE_LEVEL_PARAMS.KEY_1_VALUE]: 'lookupUserByEmail',
      [LOG_CONSTANTS.STRINGIFY_OBJECTS.ERROR]: err
    }));
}

module.exports = {
  ...Slack,
  sendSlackMessage: sendSlackMsg,
  sendSlackBlockMessage: sendSlackBlockMsg,
  lookupUserByEmail: lookupUserByEmail
};

