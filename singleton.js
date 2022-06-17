'use strict';

var _ = require('lodash');

var data = {};

function addToSingleton(key, value) {
  data[key] = value;
  return value;
}

function getSingleton() {
  return data;
}

function addObjToSingleton(obj) {
  data = _.assign(data, obj);
  return data;
}

module.exports = {
  addToSingleton: addToSingleton,
  getSingleton: getSingleton,
  addObjToSingleton: addObjToSingleton
};