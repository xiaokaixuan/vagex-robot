'use strict';

var mod_url = require('url'), https = require('https');
var FormData = require('form-data');

var httpsPost = function (urlString, formData, callback) {
  var options = mod_url.parse(urlString);
  options.method = 'POST';
  options.headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:61.0) Gecko/20100101 Firefox/61.0"
  };
  options.headers['Content-Type'] = formData.getHeaders()['content-type'];
  options.headers['Content-Length'] = formData.getLengthSync();
  var req = https.request(options, res => {
    res.setEncoding('utf8');
    var data = '';
    res.on('data', d => data += d);
    res.on('end', () => callback(null, data));
  });
  req.on('error', err => callback(err));
  req.setTimeout(60000, () => callback(new Error('timeout')));
  formData.pipe(req);
};

(function () {
  var userid = process.argv[2];
  var passwd = process.argv[3];
  if (!userid || !passwd) {
    return console.log('\nUsage: node secid.js <userid> <passwd>.\n');
  }
  var FD = new FormData();
  FD.append('userid', userid);
  FD.append('passwd', passwd);
  return httpsPost('https://vagex.com/alogin.php', FD, function (error, data) {
    if (error) return console.error('Login Error:\n', error);
    console.log('Login data:\n', data);
  });
})();

