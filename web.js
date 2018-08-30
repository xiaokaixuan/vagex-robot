'use strict';

var _ = require('lodash');
var util = require('util');
var http = require('http');

var logList = [];

exports.start = () => http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  var content = util.format('<html><head><meta charset="utf-8"><title>%s</title></head><body>', new Date().toLocaleString());
  content += _.join(logList, '<br>');
  content += '</body></html>';
  return res.end(content);
}).listen(process.env.PORT || 8080);

exports.replaceLog = function (logger) {
  var functions = {
    'error': 'red', 'warn': 'green', 'info': 'black', 'debug': 'black'
  };
  _.forEach(functions, (clr, func) => {
    var log = logger[func];
    logger[func] = function () {
      var logstr = util.format.apply(util, arguments);
      var time = new Date().toLocaleString();
      if (logList.length >= 50) logList.shift();
      logstr = util.format('<font color="%s">%s</font>', clr, time + ' ' + logstr);
      logList.push(logstr);
      return log.apply(logger, arguments);
    };
  });
};

