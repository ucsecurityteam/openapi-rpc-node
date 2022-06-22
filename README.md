```Openapi-rpc-node``` is NodeJS microservice framework built on top of express that helps create standardized microservice applications.

Some of the most notable capabilities are:

* Rpc clients
* Schema validation
* Config management (service, DB discovery etc)
* Database and Cache support
* Pub-Sub events model
* Rate limiting
* Circuit breaker
* Async Rpc call
* Standardised error handling
* Vault support for credentials
* Slack notifications
* Monitoring (using Prometheus)
* Scheduled scripts/ workflow support
* Load shedding
* CPU and Memory Profiling
* Language localisation
* Api authentication & authorization
* Standard logging

 
## Installation
```
$ npm install @uc-engg/openapi-rpc-node
```

## Quick Start

Checkout [sample-service](https://github.com/urbanclap-engg/sample-service)  

Clone this sample NodeJS application built using openapi-rpc
```sh
git clone https://github.com/urbanclap-engg/sample-service.git
cd sample-service
```
Install Dependencies:
```sh
npm install
```
Start the Server:
```sh
npm start
```

## Understanding Openapi-rpc-node Components 

Your Microservice application requires certain standard config files that openapi-rpc reads for fucntionalities like - service and database dependency, enabling vault or credentials.json file as a secret store. Let's go over these config files in detail.

#### ```global.config.json```

Global config as the name suggests has configs that are shared across microservices. Example - service, databases, resource discovery blocks etc. List of config blocks present:

- **Service discovery**:
Lets say there are two services sample-service-A & sample-service-B in your ecosystem then you need to define them like this:
```Javascript
{
  'sample-service-A': {
    discovery: {
      port: 1001,
      uri: localhost
    },
    type: 'service'
  },
  'sample-service-B': {
    discovery: {
      port: 1002,
      uri: localhost
    },
    type: 'service'
  }
}
```
This will enable service discovery when the service starts.

- **Databse cluster discovery**: 
    ```json
    {
      "database-uri": {
        "mongodb": {
          "<db-cluster-name>": {
            "uri": "mongodb://__username__:__password__@<mongo-replica-set-url>:<port>/__db_name__?replicaSet=<replica-set-name>"
          }
        },
        "mysql": {
          "<db-cluster-name>": {
            "uri": "mysql://__username__:__password__@<mysql-db-url>:<port>/__db_name__"
            }
        }
      }
    }
  ```

- **Database to cluster mapping**:
    Each DB has a unique ID and you would refer to it with this `ID` in your codebase too. It would be of this format: <db_type>_<db_name>. For example, if you are connecting to `my_test_database` database in MongoDB, then the global config should have this key `mongodb_my_test_database`.

    ```json
    {
      "mongodb_my_test_database": {
        "type": "database",
        "db_type": "mongodb",
        "db_cluster_name": "dev-databases",
        "db_name": "my_test_database"
      }
    }
    ```

#### ```platform.config.json```

This is a service specific config which defines the service initialization strategy. Eg -
1. Credential Management (Vault vs local)
2. Service Authorization (services allowed to call)
3. Client service's schema management (how to get service's client swagger docs)

- Whitelist client services like this:
```json
{
  "authServiceIds": [
    "sample-service"
  ]
}
```

- `.credentials.json` Set credentialStore property here to configure the source to fetch credentials, this is only required if you keep credentials with your repository, more details in below sections.
```json
{
  "credentialStore": "credentials_json"
}
```

- `dependency_schemas.json` This file contains swagger docs of both the service and its downstream microservice clients. This file could be built in couple of ways as mentioned below:

    - [**Default**] Write a custom logic to create this file and configure its location to be picked by the library. By default, dependency_schemas.json is kept at the service's root directory i.e. <service-name>/dependency_schemas.json
    If you are going with custom logic, then configure it in platform.config.js file as shown below.

    ```json
    {
      "serviceDependencySchema" : {
      "type": "custom",
      "properties": {
        "generatedSchemaFilePath": "dependency_schemas.json",
        }
      }
    }
  ```

    - [**Gitlab**] If you host your microservice repositories on Gitlab, then this flow is automated by setting the below configuration in platform.config.js file:

      ```json
      {
        "serviceDependencySchema" : {
        "type": "gitlab",
        "properties": {
          "generatedSchemaFilePath": "dependency_schemas.json",
          "gitUri": "http://my.gitlab.location.com/",
          "gitToken": "<gitToken>",
          "gitGroupName": "<groupName-optional>"
          }
        }
      }
    ```

#### ```.credentials.json```

Openapi-rpc-node is integrated with [vault](https://www.vaultproject.io/) to protect secret tokens & sensitive data. In place of vault you can also use .credentials.json to keep service specific secretes like database credentials, slack tokens etc.

If you chose to use vault to manage secrets then you should replace username & password in `global.config.json'` from actual values to placeholders: __username__, __password__ in connection string. Otherwise simply add this block to your .credentials.json
Example:
  ```json
  {
    "<db type>": {
      "<db-cluster-name>": {
        "<db-name>": {
          "readwrite": {
            "password": "my_password",
            "username": "my_username"
          }
        }
      }
    }
  }
  ```

All credentials stored in this file can be accessed like this: 
  ```javascript
  require('@uc-engg/openapi-rpc-node').getSingleton().CUSTOM;
  ```


### ```service_schema.json```
This is a JSON file that contains a detailed description your service APIs (like api path, request and response structure) that adheres to OpenAPI Specification.
This file is present in /schema/service_schema.json. [Sample](https://github.com/urbanclap-engg/sample-service/blob/main/schema/service_schema.json).

#### ```package.json```
As openapi-rpc picks service details from Configure your service package json with the below information, as openapi-rpc will pick details from package.json.

  ```json
  {
    "name": "<service-id>",
    "main": "index",
    "service_type": "<javascript or typescript>"
  }
  ```

`name`: It should contain the SERVICE_ID which we used to write in server.js. It will now be picked from this key.

`main`: This should contain the controller file path. Here controller file is the file exporting a list of API names mapped to its corresponding handlers. Refer here. Example: If the path for controller file is src/service/index.js, then 'main' should contain- "service/index".

`service_type`: The `service_type` field is used to specify if the service is javascript or typescript, based on that we decide from where to pick the controller file (i.e. dist or src).

#### ```dependency.config.js```

`Dependency types`: Give the type of dependency that the service/script requires. Given below is the list of all dependency types

  - MONGODB
  - MYSQL
  - INTERNAL_SERVICE


List of dependency types can be accessed in dependency.config.js file through 
  ```Javascript
  require('@uc-engg/openapi-rpc-node').getDependencyConfig().TYPE
  ```

You have to create a new config file in this path: configs/dependency.config.js in the service repo like this: 

  ```Javascript
  {
    service: {
      <dependency_type>: [{
        id: <dependency_id>,
        <options based on schema>
      }]
    }
  }
  ```


  Example of a dependency.config.js file
  ```Javascript

  'use strict';

  const Sequelize = require('sequelize');
  const DEPENDENCY = require('@uc-engg/openapi-rpc-node').getDependencyConfig();

  let Config = {
    service: {
      [DEPENDENCY.TYPE.MONGODB]: [
        {
          id: DEPENDENCY.ID.MONGODB.mongodb_my_test_database,
          mongoose_options: {
            autoIndex: false,
            reconnectTries: Number.MAX_VALUE,
            reconnectInterval: 500,
            poolSize: 10,
            bufferMaxEntries: 0
          }
        }
      ],
      [DEPENDENCY.TYPE.MYSQL]: [
        {
          id: DEPENDENCY.ID.MYSQL.mysql_main_db,
          sequelize_options: {
            pool: { min: 2, max: 4, idle: 60000 },
            isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_UNCOMMITTED,
            omitNull: true
          },
          sync: true
        }
      ],
      [DEPENDENCY.TYPE.INTERNAL_SERVICE]: [
        {
          id: DEPENDENCY.ID.INTERNAL_SERVICE["sample-service"],
          version: 0
        }
      ]
  }

  module.exports = {
    Config: Config
  };
  ```

### `Singleton` ###
Singleton is an object that is used to access all the dependencies initialised by openapi-rpc. Example, you can call a service as an rpc client or access any database mentioned in dependency.cofig.js.

- Make rpc call to downstream service:

  ```Javascript
  const Singleton = require('@uc-engg/openapi-rpc-node').getSingleton();
  const myTestService = Singleton["test-microservice"];

  const sampleServiceApi = async () => {
    return await myTestService.apiName();
  };
  ```

- Access database:

  ```Javascript
  let mongooseConnection = Singleton["mongodb_my_test_database"];
  ```

