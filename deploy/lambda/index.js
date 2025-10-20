// AWS Lambda entry point
const { lambdaHandler } = require('../../dist/api/handler');

exports.handler = lambdaHandler;