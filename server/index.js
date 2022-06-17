'use strict';
let Workflow = require('./workflow');
let Service = require('./service');
const Promise  = require('bluebird');

function initService(rpc_framework) {
  let service = new Service(rpc_framework);
  return Promise.resolve().then(function() {
    return service.initDependency()
    .then(function() {
      service.initServer();
    })
  })
}

function initWorkflow(rpc_framework) {
  let workflow = new Workflow(rpc_framework);
  return workflow.initDependency()
  .then(function() {
    workflow.initServer();
  })
}

module.exports = {
    initWorkflow: initWorkflow,
    initService: initService,
    service: Service,
    workflow: Workflow
}
