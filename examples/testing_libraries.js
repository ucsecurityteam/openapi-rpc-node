'use strict';

var express = require('express');
var schema = require('./swagger.json'); // This assumes you're in the root of the swagger-tools
const app = express();

// $ref not working properly. easy to read.
const bodyParser = require('body-parser');
const validator = require('swagger-express-validator');
const expandSchemaRef = require('expand-swagger-refs').expanded;

app.use(bodyParser.json());
app.use(validator({
  schema: expandSchemaRef(schema),
  validateRequest: true,
  validateResponse: true,
  requestValidationFn: (req, data, errors) => {
    errors.typeeee = "request"
    throw errors;
  },
  responseValidationFn: (req, data, errors) => {
    errors.typeeee = "response"
    throw errors;
  },
}));


app.use('/users', (req, res) => {
  console.log('[1] successul /users');

  res.status(200).json({
  })
});



// error handling
app.use(function(err, req, res, next) {
    console.log(schema.definitions, '[4] Error -', err);

    res.status(555);
    res.json({ 
      err_type: "swagger_error", 
      err_message: "swagger error"
    });
});



app.listen(3000, function() {
    console.log('Go to http://localhost:3000');
});



/*
// works. callback is clunky


var initializeSwagger = require('swagger-tools').initializeMiddleware;
// Initialize the Swagger Middleware
initializeSwagger(schema, function (middleware) {
  // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
  app.use(middleware.swaggerMetadata());


  // Validate Swagger requests
  app.use(middleware.swaggerValidator({
    validateResponse: true
  }));
});

app.use('/users', (req, res) => {
  console.log('[1] successul /users', req.body);
  console.log('[1] -->', req.swagger.params.body.value);
  console.log('[1] -->', req.swagger.params.body.originalValue);

  res.status(200).json(req.body)
});

// error handling
app.use(function(err, req, res, next) {
    console.log('[4] Error -', err, err.results);
    res.status(555);
    res.json({ 
      err_type: "swagger_error", 
      err_message: "swagger error"
    });
});

// Start the server
app.listen(3000, function() {
    console.log('Go to http://localhost:3000');
});

*/

/* // response validation doesnt work. callback is clunky

var middleware = require('swagger-express-middleware');

middleware(schema, app, function(err, middleware) {
    app.use(middleware.metadata());
    app.use(middleware.parseRequest());
    app.use(middleware.validateRequest());
    
    app.use('/users', (req, res) => {
      console.log('[1] successul /users', req.body);

      res.status(200).json(req.body)
    });

    // error handling
    app.use(function(err, req, res, next) {
        console.log('[4] Error -', err, err.results);
        res.status(555);
        res.json({ 
          err_type: "swagger_error", 
          err_message: "swagger error"
        });
    });

    // Start the server
    app.listen(3000, function() {
        console.log('Go to http://localhost:3000');
    });
});

*/


/* doesnt work

// works. callback is clunky

const openapi = require('express-openapi');
openapi.initialize({app: app, apiDoc: schema,
  paths:[]});

app.use('/users', (req, res) => {
  console.log('[1] successul /users normal');

  res.status(200).json(req.body)
});

// error handling
app.use(function(err, req, res, next) {
    console.log('[4] Error -', err, err.results);
    res.status(555);
    res.json({ 
      err_type: "swagger_error", 
      err_message: "swagger error"
    });
});

// Start the server
app.listen(3000, function() {
    console.log('Go to http://localhost:3000');
});
*/