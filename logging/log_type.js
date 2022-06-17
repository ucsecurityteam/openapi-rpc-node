'use strict';

const LOG_TYPE = {
  RPC_SERVICE: 'rpc_service',
  RPC_SERVER_RESPONSE: 'rpc_server_response',
  RPC_CLIENT: 'rpc_client',
  RPC_SYSTEM: 'rpc_system',
  RPC_RATE_LIMIT: 'rpc_rate_limit',
  RPC_LOAD_SHED: 'rpc_load_shed',
  RPC_PROFILER: 'rpc_profiler'
};

module.exports = LOG_TYPE;
