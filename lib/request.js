"use strict";

require('idempotent-babel-polyfill');

var Url     = require("url");
var qs      = require("qs");
var request = require("superagent");
var requestProxy = require('superagent-proxy');

var toPointer = function(obj, ncmb){
  var className = null;
  if(obj instanceof ncmb.User){
    className = "user";
  }else if(obj instanceof ncmb.Role){
    className = "role";
  }else if(obj instanceof ncmb.Installation){
    className = "installation";
  }else if(obj.className.indexOf("/classes/") !== -1){
    className = obj.className.slice(9);
  }else if(obj.className.indexOf("/") !== -1){
    className = obj.className.slice(1);
  }else{
    className = obj.className;
  }
  return {__type: "Pointer", className: className, objectId: obj.objectId};
};

var presavePointerObjects = function(data, ncmb){
  //remove the object relation of data
  for (var element in data){
    if(data[element]!=null && data[element].__type && data[element].__type === "Relation"){
          delete data[element]
    }
  }
  return Promise.all(Object.keys(data).map(function(key){
    var obj = data[key];

    if(obj === null) return null;
    if(obj instanceof Date) {
      return [key, {__type: "Date", iso: obj.toJSON()}];
    }
    if(obj instanceof ncmb.GeoPoint) {
      return [key, obj.toJSON()];
    }
    if(obj instanceof ncmb.Relation) {
      return Promise.all(obj.objects.map(function(elem){
        if(elem.objectId) return toPointer(elem, ncmb);
        return elem.save().then(function(res){
          return toPointer(elem, ncmb);
        });
      }))
      .then(function(objs){
        obj.objects = objs;
        delete obj.relatingClass;
        return [key, obj];
      });
    }
    if(typeof obj !== "object" || !obj.className || obj.className === "/files" ){
      return null;
    }
    if(obj.objectId) return [key, toPointer(obj, ncmb)];

    return obj.save().then(function(res){
      return [key, toPointer(obj, ncmb)];
    });
  })).then(function(presavedPointerObjects){
    for(var i = 0, l = presavedPointerObjects.length; i < l; i++){
      if(presavedPointerObjects[i]){
        data[presavedPointerObjects[i][0]] = presavedPointerObjects[i][1];
      }
    }
    return data;
  });
};

module.exports = function(opts, callback){
  if(typeof opts.path != "string"){
    return callback(new Error("Path is required."), null);
  }

  var path = opts.path;
  var timestamp = opts.timestamp || new Date().toISOString();
  var method = (opts.method || "GET").toUpperCase();

  var parsedUrl = Url.parse(path);
  parsedUrl.hostname = opts.fqdn || this.fqdn;
  parsedUrl.port     = opts.port || this.port;
  parsedUrl.protocol = opts.protocol || this.protocol;
  var url = parsedUrl.format();
  var query = opts.query;
  var data  = opts.data;
  var file  = opts.file;
  var timeout = opts.timeout;
  var responseType = opts.responseType;
  var param_sig = {
    "url" : parsedUrl.format(),
    "method": method,
    "query" : opts.query || "",
    "timestamp" :timestamp,
    "signatureMethod" : opts.signatureMethod || this.signatureMethod,
    "signatureVersion" :opts.signatureVersion || this.signatureVersion,
    "fqdn" :opts.fqdn || this.fqdn,
    "apikey": opts.apikey || this.apikey,
    "clientkey" : opts.clientkey || this.clientkey
  };
  var sig = (this.createSignature || require("./signature").create)(
    param_sig.url,
    param_sig.method,
    param_sig.query ,
    param_sig.timestamp,
    param_sig.signatureMethod,
    param_sig.signatureVersion,
    param_sig.fqdn,
    param_sig.apikey,
    param_sig.clientkey
  );
  var headers = {
    "X-NCMB-Application-Key":    opts.apikey || this.apikey,
    "X-NCMB-Signature":          sig,
    "X-NCMB-Timestamp":          timestamp,
    "X-NCMB-SDK-Version":        "javascript-3.1.1"
  };

  if(!file)             headers["Content-Type"] = "application/json";
  if(this.sessionToken) headers["X-NCMB-Apps-Session-Token"] = this.sessionToken;

  if(parsedUrl.protocol === "https:") var secureProtocol = "TLSv1_method";
  var that = this;
  return new Promise(function(resolve, reject){
    var _callback = function(err, res){
      if(err && err.response && err.response.error){
        // Use code property, error property when printing response error by alert(JSON.stringify())
        err.response.error.code = err.response.body.code;
        err.response.error.error = err.response.body.error;

        return _callback(err.response.error, res);
      }
      if(err) return (callback && callback(err, null)) || reject(err);
      if(res.statusCode >= 400 || res.status >= 400) return reject(res.error || new Error(res.text));
      checkResponseValidate(err, res);
      var body = (!res.text && res.body) ? res.body : res.text;
      if(!body && res.xhr && res.xhr.response) body = res.xhr.response;
      return (callback && callback(null, body)) || resolve(body);
    };

    var checkResponseValidate = function(err,res) {
        var responseSignature = res.header["x-ncmb-response-signature"];
         if (that.getResponseValidation() && responseSignature != "undefined" && responseSignature != ""  ) {
          var dataResponse = res.text.replace("\\","");
          var newSignature = (require("./signature").create)(
            param_sig.url,
            param_sig.method,
            param_sig.query ,
            param_sig.timestamp,
            param_sig.signatureMethod,
            param_sig.signatureVersion,
            param_sig.fqdn,
            param_sig.apikey,
            param_sig.clientkey,
            dataResponse
          );
          if (newSignature !== responseSignature) {
                var err = {"code":"E100001","Error": "Authentication error by response signature incorrect."}
                return (callback && callback(err, null)) || reject(err);
            }
        }
    };

    var r = request[method.toLowerCase()](url);
    Object.keys(headers).forEach(function(key){
      r.set(key, headers[key]);
    });
    if (timeout) {
      r.timeout(timeout);
    } else {
      r.timeout(10000);
    }

    var proxy = this.proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
    if(requestProxy && proxy){
      requestProxy(request);
      r.proxy(proxy);
      r.set({host: this.fqdn});
    }

    if(typeof file == "object"){
      if(file.acl !== undefined){
        r.field("acl", JSON.stringify(file.acl));
      }
      r.attach("file", file.fileData, file.fileName);
      r.end(_callback);
    }else{
      if(typeof data == "object"){
        presavePointerObjects(data, this)
        .then(function(data){
          r.send(data);
          r.end(_callback);
        })
        .catch(function(err){
          return _callback(err, null);
        });
      }else{
        if(typeof query == "object") {
          Object.keys(query).forEach(function(key){
            //r.query(key + '=' + encodeURIComponent(query[key]).replace(/'/g, '%27'));
            r.query(key + '=' + fixedEncodeURIComponent(query[key]));
          });
        }
        if(responseType && r.responseType) r.responseType(responseType);
        var isNodeEv = new Function("try { return this === global; } catch(e) { return false; }");
        if (isNodeEv() && method === "GET" && path.indexOf("/2013-09-01/files/") != -1) {
          if (r.buffer) {
            r.buffer(true).parse(function(res, callback) {
              res.data = '';
              res.setEncoding('binary');
              res.on('data', function (chunk) {
                res.data += chunk;
              });
              res.on('end', function () {
                callback(null, new Buffer(res.data, 'binary'));
              });
            });
          }
        }
        r.end(_callback);
      }
    }
  }.bind(this));
};

function fixedEncodeURIComponent(str) {
  return encodeURIComponent(str).replace(/'/g, function(c) {
    return '%' + c.charCodeAt(0).toString(16);
  });
}
