'use strict';

var mod_url = require('url'), https = require('https');
var _ = require('lodash');
var log4js = require('log4js'), logger = log4js.getLogger();
var cheerio = require('cheerio'), FormData = require('form-data');

var firstTabCreated = false;                  // was the tab created at least once?
var createdTabId;                             // tabid created for the plugin
var url;                                      // 11 digits sent from the origin
var length = 0;                               // number of secs to watch the video
var interval;
var DELAY = 0.1;
var isRunning = true;                         // is the pluggin runnin?
var servCount = 0;                            // amount of videos requested
var credCount = 0;                            // credits earnt for videos watched
var credits = parseFloat(0);                  // amount of credits worth for the video requested
var currentVideoCredits = parseFloat(0);      // amount of credits of current video
var autostart = false;                        // will the plugin start on launch?
var secid = 0;                                // secid comes when the user logs in
var logged_userid;                            // userid of the user logged
var logged_passwd;                            // passwd of the user logged
var logged_secid;                             // secid of the user logged
var version = '2.4.3';                        // chrome.runtime.getManifest().version;
var adjust = 0;                               // Es el tag que usa para eliminar creditos por algun motivo
var adjustmsg;                                // Es el motivo por el cual los creditos fueron eliminados
var ads;                                      // Pide el codigo fuente de la pagina
var youTubeSourceCode = '<html><head></head><body></body></html>';
var connectivitySpeedTabId = 0;
var connectivitySpeed = 0;
var model = 'Firefox';
var sid;                                      // sid comes in the request
var wsubs;                                    // 0 - auto sub disabled, 1 - auto sub enabled
var wlikes;                                   // 0 - auto like disabled, 1 - auto like enabled
var wcomms;                                   // auto comment
var videoWatchedCounter = 0;
var time;
var youTubeDetailsTabId;
var youTubeUserId = "";
var youTubeChannelId = "";
var youTubeVideoDuration = 0;
var youTubeCid;
var subed = false;

/*
 * Si la velocidad es 0, necesito obtenerla. Tambien la informacion de YouTube.
 * Lo desactivo porque si verifico al inicio, FireFox no lo aprueba por abrir la ventana.
if(connectivitySpeed == 0) {
  openConnectivitySpeedTab();
}

if(youTubeUserId == "") {
  openYouTubeDetailsTab();
}
*/

/*
 * Https POST Request
*/
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
  req.setTimeout(60000, () => {
    req.abort();
    return callback(new Error('timeout'));
  });
  formData.pipe(req);
};

/*
 * Https GET Request
*/
var httpsGet = function (urlString, needText, callback) {
  if (!callback && needText) {
    callback = needText;
    needText = void 0;
  }
  var id = httpsGet.tid || 1;
  httpsGet.tid = id + 1;
  var options = mod_url.parse(urlString);
  options.headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:61.0) Gecko/20100101 Firefox/61.0"
  };
  if (needText) var text = '';
  var req = https.get(options, (res) => {
    res.on('data', d => needText && (text += d));
    res.on('end', () => callback({ id, text }));
  });
  req.on('error', () => callback({ id, text }));
  req.setTimeout(30000, () => {
    req.abort();
    return callback({ id, text });
  });
};

/*
 * Base64
*/
var btoa = str => new Buffer(str).toString('base64');

/*
 * Funcion principal. Es donde hago los pedidos de videos
*/
function sendData() {
  try {
    var dataToSend = "userid=" + logged_userid
      + "&version=" + version
      + "&videoid=" + url
      + "&model=" + model
      + "&sid=" + sid
      + "&secid=" + logged_secid
      + "&speed=" + connectivitySpeed
      + "&youtubeUserId=" + youTubeUserId
      + "&youtubeChannelId=" + youTubeChannelId
      + "&youTubeVideoDuration=" + youTubeVideoDuration
      + "&cid=" + youTubeCid
      + "&subed=" + subed;

    var encryptedData = btoa(dataToSend);
    var FD = new FormData();
    FD.append('userid', logged_userid);
    FD.append('data', encryptedData);

    var completeFun = function (error, data) {
      if (error) {
        logger.warn('sendData Error:', error);
        return createAlarm(0);
      }
      var $ = cheerio.load(data);
      url = $('url').text() || void 0;
      length = $('length').text() || 0;
      credits = $('credits').text();
      currentVideoCredits = length / 30;
      sid = $('sid').text() || void 0;
      wsubs = $('wsubs').text();
      wlikes = $('wlikes').text();
      adjust = $('adjust').text() || 0;
      adjustmsg = $('adjustmsg').text();
      ads = $('ads').text();
      if (!url || !sid) logger.warn('Tip: Error resp data:\n', data);
      var error = $('error').text();
      if (error) {
        logger.warn('Tip: Error detected:', error);
      } else {
        logger.info('Tip: Everything is working as expected.');
      }
      logger.info('Video:', url, 'wsubs:', wsubs, 'currentVideoCredits:', currentVideoCredits, 'creditsAdjust:', adjustmsg);

      // Every 20 video requests I try to update the connectivity speed again.
      videoWatchedCounter++;
      if (videoWatchedCounter == 1 || videoWatchedCounter % 20 == 0) {
        openConnectivitySpeedTab();
      }
      if (videoWatchedCounter == 1) {
        openYouTubeDetailsTab();
      }

      // Verifico que la tab exista para saber si debo crear una nueva o actualizar una existente
      checkIfTabExistsCallback(url, length);
      // Al crear o actualizar, se incrementa la cantidad de pedidos exitosos
      servCount++;
      // Tambien debo sumar los creditos obtenidos
      if (credits != 0) { // caso contrario anida 0 a la izquierda
        credCount += parseFloat(credits);
      }
      // Elimino creditos segun sea necesario
      credCount -= parseFloat(adjust);
      if (ads == 1) {
        sendSourceCode();
      }
      logger.info('watchCount:', videoWatchedCounter, 'credCount:', credCount);
      // Las alarmas se encargan de hacer nuevos pedidos
      createAlarm(length);
    }
    httpsPost('https://vagex.com/fupdater2.php', FD, completeFun);
  } catch (e) {
    logger.error('sendData Exception:', e);
  }
}

/*
 * Funcion de login para obtener el secid, necesario para pedir videos para el usuario
 * junto al userid y su passwd
*/
function doLogin(userid, passwd, sendResponse) {
  try {
    var FD = new FormData();
    FD.append('userid', userid);
    FD.append('passwd', passwd);

    var completeFun = function (error, data) {
      if (error) {
        return logger.warn('doLogin Error:', error);
      }
      var $ = cheerio.load(data);
      secid = $('secid').text();
      if (!secid) {
        return logger.warn('doLogin Faild:', data);
      }
      logged_userid = userid;
      logged_passwd = passwd;
      logged_secid = secid;
      logger.info('doLogin Success!');
      process.nextTick(sendData);
    }
    httpsPost('https://vagex.com/alogin.php', FD, completeFun);
  } catch (e) {
    logger.error('doLogin Exception:', e);
  }
}

/*
 * Verifico si existe la pestaña para saber si debo actualizar una existente
 * para no abrir multiples pestañas, o bien crear una nueva
*/
function checkIfTabExistsCallback(url, length) {
  if (!firstTabCreated) {
    openNewBackgroundTab(url, length);
  } else {
    updateBackgroundTab(url, length);
  }
}

/*
 * Found Channel Id in youtube page source
*/
function foundChannelIdInSource(source) {
  if (source) {
    var regexp = /"\/channel\/(\S+?)"/;
    var result = source.match(regexp);
    if (result) return result[1];
  }
  return void 0;
}

/*
 * Abro una pestaña nueva cuando no existe una del plugin
*/
function openNewBackgroundTab(url, length) {
  youTubeCid = void 0, subed = false;
  httpsGet('https://www.youtube.com/watch?v=' + url, wsubs == 1, function (tab) {
    firstTabCreated = true;
    createdTabId = tab.id;
    if (wsubs == 1) {
      youTubeCid = foundChannelIdInSource(tab.text);
      subed = youTubeCid ? true : false;
    }
    logger.debug('openNewBackgroundTab length:', length, 'tabId:', createdTabId, 'subed:', subed);
  });
}

/*
 * Actualizo una pestaña existente para no abrir multiples pestañas
*/
function updateBackgroundTab(url, length) {
  openNewBackgroundTab(url, length);
}

/*
 * Abro una pestaña para conocer la velocidad de la conexion
*/
function openConnectivitySpeedTab() {
  var downloadSize = 206037, urlString = 'https://vagex.com/myimage.jpg?n=' + Math.random();
  var startTime = Date.now();
  httpsGet(urlString, function (tab) {
    var endTime = Date.now();
    var duration = Math.round((endTime - startTime) / 1000);
    if (duration == 0) duration = 1;
    var bitsLoaded = downloadSize * 8;
    var speedBps = Math.round(bitsLoaded / duration);
    var speedKbps = (speedBps / 1024).toFixed(2);
    if (speedKbps < 50) speedKbps = '50.00'; // Limit min speed 50Kbps ?
    connectivitySpeed = speedKbps;
    connectivitySpeedTabId = tab.id;
    logger.debug('openConnectivitySpeedTab speed:', speedKbps, 'tabId:', tab.id);
  });
}

/*
 * Abro una pestaña para obtener el usuario de YouTube y el canal
*/
function openYouTubeDetailsTab() {
  httpsGet('https://www.youtube.com/account_advanced', function (tab) {
    youTubeDetailsTabId = tab.id;
    logger.debug('openYouTubeDetailsTab tabId:', youTubeDetailsTabId);
  });
}

/*
 * Crea una alarma para pedir el proximo video. La alarma sera creada en base
 * a la cantidad de segundos que se necesita ver el video, mas un numero random
 * entre 5 y 10 segundos (por pedido)
*/
function createAlarm(length) {
  var random = Math.floor(Math.random() * (10 - 5 + 1)) + 5;
  length = parseFloat(length) + parseFloat(random);
  var timer = setTimeout(() => {
    clearTimeout(timer); sendData();
  }, length * 1000);
}

function sendSourceCode() {
  try { // Envio el sourcecode
    var FD = new FormData();
    FD.append('userid', logged_userid);
    FD.append('ads', youTubeSourceCode);
    httpsPost('https://vagex.com/ffads.php', FD, () => void 0);
  } catch (e) {
    logger.error('sendSourceCode Exception:', e);
  }
}

/*
 * Global main function
 */
(function () {
  var web = require('./web');
  web.replaceLog(logger);
  web.start();
  var userid = process.env.USERID;
  var secid = process.env.SECID;
  if (!userid || !secid) {
    return logger.error('No setting userid or secid !');
  }
  logged_userid = userid;
  logged_secid = secid;
  var youtube_uid = process.env.YOUTUBE_UID;
  if (youtube_uid) youTubeUserId = youtube_uid;
  return process.nextTick(sendData);
})();

