"use strict";

require("babel/polyfill");
var Url     = require("url");
var qs      = require("qs");
var request = require("superagent");
var _       = require("lodash");

module.exports = function(opts, callback){
  if(typeof opts.path != "string"){
    return callback(new Error("Path is required."), null);
  }

  var path = opts.path;
  var timestamp = opts.timestamp || new Date().toISOString();
  var method = (opts.method || "GET").toUpperCase();
  if(method === "DELETE") method = "DEL";

  var parsedUrl = Url.parse(path);
  parsedUrl.hostname = opts.scriptFqdn || this.scriptFqdn;
  parsedUrl.port     = opts.port || this.port;
  parsedUrl.protocol = opts.protocol || this.protocol;
  var url     = parsedUrl.format();
  var header  = opts.header;
  var data    = opts.data;
  var query   = opts.query;
  var proxy   = null;
  var file    = opts.file;

  var queryString = method === "GET" ? query : {}
  var sig = (this.createSignature || require("./signature").create)(
    parsedUrl.format(), method, queryString || "", timestamp,
    opts.signatureMethod || this.signatureMethod,
    opts.signatureVersion || this.signatureVersion,
    opts.scriptFqdn || this.scriptFqdn,
    opts.apikey || this.apikey, opts.clientkey || this.clientkey
  );
  var acceptContents = ["text/plain"]

  var defaultHeaders = {
    "host":                   opts.scriptFqdn || this.scriptFqdn,
    "accept":                 acceptContents,
    "X-NCMB-Application-Key": opts.apikey || this.apikey,
    "X-NCMB-Signature":       sig,
    "X-NCMB-Timestamp":       timestamp,
    "Content-Type":           opts.contentType || "application/json",
    "X-NCMB-SDK-Version":     "javascript-2.0.2"
  };

  if(this.sessionToken) defaultHeaders["X-NCMB-Apps-Session-Token"] = this.sessionToken;

  if(parsedUrl.protocol === "https:") var secureProtocol = "TLSv1_method";
  if(typeof (opts.proxy || this.proxy) === "undefined"){
    proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
  }

  return new Promise(function(resolve, reject){
    var _callback = function(err, res){
      if(err) return (callback && callback(err, null)) || reject(err);
      if(res.statusCode >= 400 || res.status >= 400) return reject(res.error || new Error(res.text));
      return (callback && callback(null, res.text)) || resolve(res.text, res);
    };
    var r = request[method.toLowerCase()](url);
    if(header) r.set(header);
    if(data) r.send(data);
    if(query) r.query(query);
    r.set(defaultHeaders);

    r.end(_callback);
  }.bind(this));
};