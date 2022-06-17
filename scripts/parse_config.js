'use strict'

const Esprima = require('esprima');
const fs = require('fs');
const _ = require('lodash');
const DEFAULT_FALLBACK_BRANCH = require('./constants').DEFAULT_FALLBACK_BRANCH;
const readline = require('readline');
const { toInteger } = require('lodash');

const INTERNAL_SERVICE_IDENTIFIER = 'ID.INTERNAL_SERVICE[';

function createServiceInfoJson(serviceProperty, serviceInfos) {
  let serviceName, schemaVersion = 0, branch = 'master';
  let serviceAlreadyPresent = false;

  for (let i in serviceProperty) {
    if (serviceProperty[i].key.name === 'id') {
      serviceName = serviceProperty[i].value.property.value;
    }
    if (serviceProperty[i].key.name === 'version') {
      schemaVersion = serviceProperty[i].value.value
    }
    if (serviceProperty[i].key.name === 'branch') {
      branch = serviceProperty[i].value.value;
    }
  }

  for (let s in serviceInfos) {
    if (serviceName === serviceInfos[s].id) serviceAlreadyPresent = true;
  }
  if (!serviceAlreadyPresent) {
    serviceInfos.push({
      id: serviceName,
      branch: branch,
      version: schemaVersion,
    });
  }
}


function parseServiceInfoFromProperties(dependencyConfigProperties) {
  let serviceInfos = [];
  for (let i in dependencyConfigProperties) {
    if (dependencyConfigProperties[i].key.name === 'service') {
      for (let j in dependencyConfigProperties[i].value.properties) {
        if (dependencyConfigProperties[i].value.properties[j].key.property.name === 'INTERNAL_SERVICE') {
          for (let k in dependencyConfigProperties[i].value.properties[j].value.elements) {
            createServiceInfoJson(dependencyConfigProperties[i].value.properties[j].value.elements[k].properties, serviceInfos);
          }
        }
      }
    }
    if (dependencyConfigProperties[i].key.name === 'workflow') {
      for (let j in dependencyConfigProperties[i].value.properties) {
        for (let k in dependencyConfigProperties[i].value.properties[j].value.properties) {
          if (dependencyConfigProperties[i].value.properties[j].value.properties[k].key.property.name === 'INTERNAL_SERVICE') {
            for (let s in dependencyConfigProperties[i].value.properties[j].value.properties[k].value.elements) {
              createServiceInfoJson(dependencyConfigProperties[i].value.properties[j].value.properties[k].value.elements[s].properties, serviceInfos);
            }
          }
        }
      }
    }
  }
  return serviceInfos
}

async function grepDependencyConfigFile(fileString, termsToFind, defaultValues) {

  let dependentServices = [];
  let fileLines = fileString.split('\n');
  let unwantedChars = new RegExp(/,|'|"|\[|\]|\ |:|=/g);    // regex to remove unwanted characters
  let serviceAlreadyPresent = false;

  for (let line in fileLines) {
    if (fileLines[line].includes(INTERNAL_SERVICE_IDENTIFIER)) {
      let serviceJson = {};
      let currentLine = toInteger(line);

      serviceJson.id = (fileLines[currentLine].split(INTERNAL_SERVICE_IDENTIFIER)[1]).replace(unwantedChars, '');
      currentLine++;
      while (!fileLines[currentLine].includes('}')) {
        termsToFind.forEach((toFind) => {
          if (fileLines[currentLine].includes(toFind)) {
            serviceJson[toFind] = fileLines[currentLine].split(toFind)[1].replace(unwantedChars, '');
          }
        });
        currentLine++;
      }
      termsToFind.forEach((toFind) => {
        //  If the line containing '}' has a property as well
        if (fileLines[currentLine].includes(toFind)) {
          serviceJson[toFind] = fileLines[currentLine].split(toFind)[1].replace(unwantedChars, '');
        }
        serviceJson[toFind] = serviceJson[toFind] || defaultValues[toFind];
      });

      serviceAlreadyPresent = false;
      for (let s in dependentServices) {
        if (serviceJson.id === dependentServices[s].id) serviceAlreadyPresent = true;
      }
      if (!serviceAlreadyPresent) dependentServices.push(serviceJson);
    }  
  }
  return dependentServices;
}


let dependencyParser = {

  requireDependencyConfig: async (dependencyConfigPath) => {
    let dependencyConfig = require(dependencyConfigPath);
    let dependentServices = dependencyConfig.Config.service.internal_service;
    let dependentSerivceIds = [];

    for (let s in dependentServices) {
      dependentSerivceIds.push(dependentServices[s].id);
    }

    if (dependencyConfig.Config.workflow) {
      Object.keys(dependencyConfig.Config.workflow).forEach((workflowScript) => {
        if (dependencyConfig.Config.workflow[workflowScript].internal_service) {
          for (let s in dependencyConfig.Config.workflow[workflowScript].internal_service) {
            if (!dependentSerivceIds.includes(dependencyConfig.Config.workflow[workflowScript].internal_service[s].id)) {
              dependentServices.push(dependencyConfig.Config.workflow[workflowScript].internal_service[s]);
              dependentSerivceIds.push(dependencyConfig.Config.workflow[workflowScript].internal_service[s].id)
            }
          }
        }
      })
    }
    return dependentServices;
  },

  parseDependencyConfig: async (dependencyConfigPath) => {
    let fileData;
    try {
    fileData = await fs.readFileSync(dependencyConfigPath, {encoding: 'utf-8'});
    } catch (err) {
      throw Error(err);
    }
    let body = await Esprima.parse(fileData).body
    let dependentServices;
    for(let i = 0; i < body.length; i++) {
      if (body[i].type === 'VariableDeclaration'){
        for (let j = 0; j < body[i].declarations.length; j++) {
          if (body[i].declarations[j].id.name === 'Config') {
            dependentServices = parseServiceInfoFromProperties(body[i].declarations[j].init.properties);
          }
        }
      }
    }
    return dependentServices;
  },

  grepDependencyConfig: async (dependencyConfigPath) => {
    const fileStream = fs.readFileSync(dependencyConfigPath).toString();
    let termsToFind = ['branch', 'version'];
    let defaultValues = {branch: DEFAULT_FALLBACK_BRANCH, version: '0'};
    return await grepDependencyConfigFile(fileStream, termsToFind, defaultValues);
  }
}

let globalConfigParser = {
  parseGlobalConfig: async (globalConfigPath) => {
    let dependentServices = [];
    let globalConfig = require(globalConfigPath);

    Object.keys(globalConfig).forEach(service => {
      if (_.get(globalConfig[service], 'type', null) !== 'service') return;

      let branch = _.get(globalConfig[service], 'branch', DEFAULT_FALLBACK_BRANCH);
      let schemaVersion = _.get(globalConfig[service], 'schema_version', 0);
      dependentServices.push({
        id: service,
        branch: branch,
        version: schemaVersion
      });
    });
    return dependentServices;
  }
}


module.exports = {dependencyParser, globalConfigParser};