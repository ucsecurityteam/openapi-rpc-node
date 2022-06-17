# Openapi-rpc-node

```Openapi-rpc-node``` is a NodeJs library aimed at providing you a complete microservices framework solution. It comes integrated with out of the box solutions to solve for every problem. At urbancompany we have built our entire microservices ecosystem within this library.

Some of the most notable capabilities:

* Rpc clients
* Schema validation
* Event handling
* Database and Cache support
* Rate limiting
* Circuit breaker
* Async api call (using kafka)
* Standardised error handling
* Vault support for credentials
* Slack notifications
* Monitoring (using prometheus)
* Scheduled scripts/ workflow support
* Load shedding
* CPU and Memory Profiling
* Language localisation
* Api authentication
* Standard logger

 
## Installation
```
$ npm install @uc-engg/openapi-rpc-node
```

## Usage
If you are ready to explore this library & want to play around with it, checkout the sample-service from: https://github.com/urbanclap-engg/sample-service. We have written a bare bones service to get a glimpse of what this framework can do for you.

### Configuration
* ```global.config.json```

- This global config is used as discovery for service endpoints, database endpoints, slack tokens etc. You can put downstream service details here. Example, if you want to call sample-service-B from sample-service-A, you would need to put following block in configs/global.config.json

```Javascript
{
  'sample-service-B': {
    deployment: {
      auth_service_ids: [
        'sample-service-A'
      ]
    },
    discovery: {
      port: 1199,
      uri: localhost
    },
    type: 'service'
  }
}
```

- Configure dependency schema source for your service here. There are couple of options:
    - Create a file dependency_schemas.json with all your downstream services' schema doc and place it at service's node_modules/ location.
    - If you host your service repositories on Gitlab, you can configure gitlab settings in configs/global.config.json and schema will be fetched from Gitlab. (compatible with Gitlab api v14)

    ```Javascript
    "serviceDependencySchema" : {
    "type": "gitlab",
    "properties": {
      "generatedSchemaFilePath": "node_modules/dependency_schemas.json",
      "gitUri": "http://my.gitlab.location.com/",
      "gitToken": <gitToken>,
      "gitGroupName": <groupName-optional>"
    }
  }
    ```


- Database naming convention
    Each db has a unique id, this would be present in global config and you would refer it with this ID in your codebase too. It would be of this format: <db_type>_<db_name>. Example, if you are connecting to `my_test_database` database in mongodb, then the global config should have this key `mongodb_my_test_database`.

```Javascript
"mongodb_my_test_database": {
  "type": "database",
  "db_type": "mongodb",
  "db_cluster_name": "dev-databases",
  "db_name": "my_test_database"
}
```

* ```server.js``` 
We have removed the boilerplate code from server.js. This includes initializing logger, slack, config, service_id, UCError and initServer).

This initializes the Singleton with the following objects:

    - Logger

    - Slack

    - UCError

    - Config

All the dependency id mentioned in dependency.config.json (more in below sections)

Along with the above objects, it does initCredentials (to fetch service credentials from CMS for db connections) and initServer (initializes service using schema repo and runs it). If we dont have CMS (credential management system, we can follow <RITIK to add>)

You need to add the below code in your server.js. Here initService returns a promise, and if you have any custom initialization specific to your service, you can do it by adding a .then() after initService().

Example:
```Javascript
'use strict';
let RPCFramework = require('@uc-engg/openapi-rpc-node').initService()

```


* ```package.json```
Configure your package json with below information, as openapi-rpc will pick details from package.json.

```Javascript
"name": "<service-id>",
"main": "index",
"service_type": "<javascript or typescript>"
```

`name`: It should contain the SERVICE_ID which we used to write in server.js. It will now be picked from this key.

`main`: This should contain the controller file path. Here controller file is the file exporting a list of api name mapped to its corresponding handlers. Refer here. Example: If the path for controller file is src/service/index.js, then 'main' should contain- "service/index".

`service_type`: The `service_type` field is used to specify if the service is javascript or typescript, based on that we decide from where to pick the controller file (i.e. dist or src).


* ```dependency.config.js```
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

`Dependency types` : Give the type of dependency that the service/script requires. Given below is the list of all dependency types

    MONGODB

    MYSQL

    INTERNAL_SERVICE


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

#### How to run a sample service

Checkout sample-service given in sample-service from here: https://github.com/urbanclap-engg/sample-service

- Initialisation code in `server.ts`

```Javascript
'use strict';

const RPCFramework = require('@uc-engg/openapi-rpc-node');

RPCFramework.initService();
```

- Test api in `service/index.ts`
```Javascript
const testApi = async () => ({ success: 'ok' });

const MyTestApis = {
  testApi,
};

export = {
  ...MyTestApis,
}
```

- `configs` has configuration files that service needs to start.
        -   dependency.config.js
        -   platform.config.json
        -   sample-rpc-microservice.config.json
        -   global.config.json

- `schema` has swagger json for service's schema
