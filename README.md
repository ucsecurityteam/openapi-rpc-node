```Openapi-rpc-node``` is an opinionated, declarative NodeJS framework built on top of express that helps create standardized microservice applications.

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

## Understanding Declarative Components 
Openapi-rpc is declarative in nature which helps in bringing standardisations across microservices applications. Application repo contains config files that Openapi-rpc reads for functionalities like - service and database dependency, enabling vault or credentials.json file as a secret store.

Let's go over these config files in detail.

#### ```global.config.json```

Global config as the name suggests has configs that are shared across the services. Example - service, databases, resource discovery blocks. List of configs blocks present:

- This global config is used as a discovery for service endpoints(including the service's own discovery), database endpoints, slack tokens etc. For example, if you want to call service B from service A, then Service A's global config file looks like
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

- Configure the dependency schema source for your service here, we need this compiled json of all swagger docs of this service along with its dependent services (ones given in dependency.config.js as 'INTERNAL_SERVICE'). 
There are couple of options to configure:
    - [Default] Write a custom logic to create this file and configure its location to be picked by the library. By default, dependency_schemas.json is kept at the service's root directory ie <service-name>/dependency_schemas.json
    Example in platform.config.js put below configuration. In this case, dependency_schemas.json is kept in the service's root directory.

     ```Javascript
    "serviceDependencySchema" : {
    "type": "custom",
    "properties": {
      "generatedSchemaFilePath": "dependency_schemas.json",
    }
  }
  ```

- If you host your service repositories on Gitlab, you can configure GitLab settings in configs/global.config.json and schema will be fetched from Gitlab.

    ```Javascript
    "serviceDependencySchema" : {
    "type": "gitlab",
    "properties": {
      "generatedSchemaFilePath": "dependency_schemas.json",
      "gitUri": "http://my.gitlab.location.com/",
      "gitToken": <gitToken>,
      "gitGroupName": <groupName-optional>"
    }
  }
    ```

  - You can assign the responsibility of getting schema jsons to an internal-service. In that case, you can skip this configuration & create a service (in UC's context it is platform-config-service) and add this service as a dependency in global.config.json. This service can have an API to pull and combine all schema jsons for your service.

- Databse cluster discovery
    ```Javascript
    "database-uri": {
        "mongodb": {
            "<db_name>": {
                "uri": "mongodb://__username__:__password__@<mongo-replica-set-url>:<port>/__db_name__?replicaSet=<replica-set-name>"
            }
        },
        "mysql": {
            "<db_name>": {
                "uri": "mysql://__username__:__password__@<mysql-db-url>:<port>/__db_name__"
            }
        }
    }
  ```
- Database, database cluster mapping
    Each DB has a unique ID, this would be present in the global config and you would refer to it with this `ID` in your codebase too. It would be of this format: <db_type>_<db_name>. For example, if you are connecting to `my_test_database` database in MongoDB, then the global config should have this key `mongodb_my_test_database`.

    ```Javascript
    "mongodb_my_test_database": {
      "type": "database",
      "db_type": "mongodb",
      "db_cluster_name": "dev-databases",
      "db_name": "my_test_database"
    }
    ```
#### ```dependency.config.js```
We have standardized the way we write dependency config and server.js. You have to create a new config file in this path: configs/dependency.config.js in the service repo. Here, 'dependency' signifies all the connections or clients the service needs to run itself.

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

`Dependency types`: Give the type of dependency that the service/script requires. Given below is the list of all dependency types

  - MONGODB
  - MYSQL
  - INTERNAL_SERVICE


List of dependency types can be accessed in dependency.config.js file through 
  ```Javascript
  require('@uc-engg/openapi-rpc-node').getDependencyConfig().TYPE
  ```

  Example of a dependency.config.js file
  ```Javascript

  'use strict';

  const Sequelize = require('sequelize');
  const DEPENDENCY = require('@uc-engg/openapi-rpc-node').getDependencyConfig();
  const CONFIG = require('@uc-engg/openapi-rpc-node').getSingleton().Config;

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

#### ```platform.config.json```
This config file contains whitelisted service ids which are allowed to make an API call to this service. Also, the credentialStore property is set here to configure the source of fetching credentials, options are - vault and credentials_json.
```javascript
{
    "credentialStore": "credentials_json",
    "authServiceIds": [
        "sample-service"
      ]
}
```

#### ```.credentials.json```

This files store credentials that are accessed via 
  ```javascript
  require('@uc-engg/openapi-rpc-node').getSingleton().CUSTOM;
  ```
It provides a standard way to access secrets. 

Database cluster URI discovery credentials placeholders - __username__, __password__ is populated from here. Format to keep database access credentials is 
```json
{
  "mongodb": {
    "dev-mongo": {
      "core_provider": {
        "readwrite": {
          "password": "my_password",
          "username": "my_username"
        }
      }
    }
  }
}
```

#### ```package.json```
Configure your package json with the below information, as openapi-rpc will pick details from package.json.

  ```Javascript
  "name": "<service-id>",
  "main": "index",
  "service_type": "<javascript or typescript>"
  ```

`name`: It should contain the SERVICE_ID which we used to write in server.js. It will now be picked from this key.

`main`: This should contain the controller file path. Here controller file is the file exporting a list of API names mapped to its corresponding handlers. Refer here. Example: If the path for controller file is src/service/index.js, then 'main' should contain- "service/index".

`service_type`: The `service_type` field is used to specify if the service is javascript or typescript, based on that we decide from where to pick the controller file (i.e. dist or src).
