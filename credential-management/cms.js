let _ = require('lodash');
let cmsConnection = require('./vault/connection');
const CONSTANTS = require('../constants');
const ErrorTypes = require('../error');

let CredentialManagementService = {};
CredentialManagementService.init = (env, sid, vault_server_address) => {
  let environment = env;
  let service_id = sid;
  let vault_address = vault_server_address;
  let cms_client = null;
  let full_metadata_url = CONSTANTS.CMS.AWS_METADATA_URL + process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'];

  /**
   * Fetches credentials for given environment and source from the CMS cluster
   * @returns {Promise.<*[]>}
   */
  function getCredentials(source) {
    let path = 'kv/' + environment + '/' + source;
    return cms_client.read(path);
  }

  let CMS = {};

  /**
   * Get service specific credentials +
   * Global credentials that are shared among all services
   */
  CMS.getCredentialsFromVault = () => {
    return Promise.all([getCredentials(service_id), getCredentials(CONSTANTS.CMS.GLOBAL_CREDENTIALS_FOLDER_NAME)])
      .then(function ([serviceCredentials, globalCredentials]) {
        if (!serviceCredentials || !globalCredentials) {
          throw new ErrorTypes.UCError({
            err_type: ErrorTypes.RPC_CMS_ERROR,
            err_message: "Error in retrieving cms keys. Aborting credentials fetch."
          });
        }
        return {
          [CONSTANTS.CMS.SERVICE_CREDENTIALS_PATH]: serviceCredentials.data,
          [CONSTANTS.CMS.GLOBAL_CREDENTIALS_PATH]: globalCredentials.data
        }
      });
  };

  let connectionOptions = {
    vault_address: vault_address,
    full_metadata_url: full_metadata_url,
    service_id: service_id
  };
  return cmsConnection.fetchClient(connectionOptions)
    .then(function(client) {
      cms_client = client;
      return CMS;
    });
};

module.exports = CredentialManagementService;