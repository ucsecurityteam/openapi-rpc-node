/// <reference path="types/clients.d.ts" />

declare module '@uc-engg/openapi-rpc-node' {
  export type singletonMapInterface = ClientMap & {Logger: LoggerInterface};
  export type auditContextInterface = {
    getKeys: Function;
    get: Function;
    getExpressMiddleware: Function;
    patchBluebird: Function;
  };

  export type localisationInterface = {
    service_id: string,
    singleton_id? : string
  }

  export type apmTransactionTrackerInterface = {
    startBackgroundTransaction: Function
  }

  export type transactionContextInterface = {
    addTransactionDataToLog: Function,
    patchBluebird: Function,
    getExpressMiddleware: Function,
    getTrxnId: Function
  }

  export type initUCErrorInterface = {
    err_message: string,
    err_stack: object | string,
    err_type: string
  }

  export function initService (): void;
  export function getService (): any;
  export function addToSingleton (key: string, value: any): singletonMapInterface;
  export function getSingleton (): singletonMapInterface;
  export function initWorkflow (): any;
  export function getWorkflow (): any;
  export function getDependencyConfig (): object;
  export function createClient (service_id: string, called_service_id: string, schema: object, server_host: string, server_port: number, client_options: any): object;
  export function createServer (service_id: string, auth_service_ids: object, schema: object, service: object, port: number): void;
  export function createExternalClient(service_id: string, external_service_id: string, config: object): object;
  export function initConfig (service_id: string, options?: object): any;
  export function initAuditContext (params: any): auditContextInterface;
  export function initCredentials (service_id: string): any;
  export function isStandardLoggingDisabled (service_id: string): boolean;
  export function initLogger (options: object | string): object;
  export function initSlack (service_id: string): object;
  export function initLocalisation (options: object): localisationInterface;
  export function getRetryablePromise (runFunction: Function, retryOptions: object): Function;
  export function addObjToSingleton (obj: object): any;
  export function createTrxnId (): string;
  export function initBackgroundTransactions (): apmTransactionTrackerInterface;
  export function initTransactionContext (params: any): transactionContextInterface;
  export function initUCError (): initUCErrorInterface

  type LoggerInterface = {
    info: (log: LoggingObject) => void;
    error: (log: LoggingObject) => void;
    debug: (log: LoggingObject) => void;
  }

  type LoggingObject = Partial<{
    //SERVICE_LEVEL_PARAMS
    key_1: string;
    key_1_value: string;
    key_2: string;
    key_2_value: string;
    key_3: string;
    key_3_value: string;
    numkey_1: string;
    numkey_1_value: number;
    numkey_2: string;
    numkey_2_value: number;
    numkey_3: string;
    numkey_3_value: number;

    //COMMON_PARAMS
    customer_request_id: string;
    provider_id: string;
    customer_id: string;
    lead_id: string;
    method_name: string;

    //STRINGIFY_OBJECTS
    message: string;
    error_stack: string;
    error_payload: string;
    error: {err_type: string, err_message: string};
    error_message: string;
    error_type: string;
  }> | Record<string, any>

}
