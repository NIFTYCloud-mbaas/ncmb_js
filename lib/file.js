"use strict";

var Errors = require("./errors");
var Query  = require("./query");

/**
* ファイルストアへの入出力を扱うクラスです。
*
* このクラスはすべてクラスメソッドで構成されており、インスタンスを生成せずに利用します。
* Queryではファイルの付加情報（ファイル名、更新日時など）のみを検索・取得し、ファイルのバイナリデータそのものは取得しません。
* バイナリデータを取得したい場合はdownloadメソッドを利用してください。
* 
* @class NCMB.File
*/
var File = module.exports = function(ncmb){
  var className = File.className = "/files";

  Object.keys(Query.prototype).forEach(function(attr){
    if(typeof Query.prototype[attr] === "function"){
      File[attr] = function(){
        var query = new Query(ncmb, className);
        return query[attr].apply(query, [].slice.apply(arguments));
      };
    }
  });

  /**
  * ファイルストアにファイルを保存します。
  *
  * @method NCMB.File#upload
  * @param {String} fileName 取得するバイナリデータのファイル名
  * @param {} fileData 保存するファイルデータ
  * @param {NCMB.Acl|function} [acl] ファイルに対するアクセス権減
  * @param {function} [callback]
  * @return {Promise<any>} APIレスポンス
  */
  File.upload = function(fileName, fileData, acl, callback){
    if (typeof acl === "function" ){
      callback = acl;
      acl = undefined;
    }

    if(!fileName){
      return (callback || Promise.reject.bind(Promise))(new Errors.NoFileNameError());
    };
    if(!fileData){
      return (callback || Promise.reject.bind(Promise))(new Errors.NoFileDataError());
    };

    return ncmb.request({
      path: "/" + ncmb.version + this.className + "/" + fileName,
      method: "POST",
      file: { fileName: fileName, fileData: fileData, acl: acl },
      timeout: 120000,
      contentType: "multipart/form-data"
    })
    .then(function(data){
      var obj = null;
      try{
        obj = JSON.parse(data);
      }catch(err){
        throw err;
      }
      if(callback) return callback(null, obj);
      return obj;
    }.bind(this)).catch(function(err){
      if (callback) return callback(err, null);
      throw err;
    });
  };

  /**
  * 指定したファイルのバイナリデータを取得します。
  *
  * @method NCMB.File#download
  * @param {String} fileName 取得するバイナリデータのファイル名
  * @param {String} [responseType] レスポンスバイナリのデータ形式 arraybuffer/blob (ブラウザ/Monaca利用時のみ必要)
  * @param {Function} [callback] コールバック関数
  * @return {Promise<any>} ファイルのバイナリデータ（付加情報は取得しません）
  */

  File.download = function(fileName, responseType, callback){
    if(typeof responseType == "function"){
      callback = responseType;
      responseType = null;
    }

    if(typeof fileName !== "string"){
      return (callback || Promise.reject.bind(Promise))(new Errors.InvalidArgumentError("File name must be string."));
    };
    if(responseType && typeof responseType !== "string"){
      return (callback || Promise.reject.bind(Promise))(new Errors.InvalidArgumentError("Response type must be string."));
    };

    return ncmb.request({
      path: "/" + ncmb.version + className + "/" + fileName,
      method: "GET",
      timeout: 120000,
      responseType: responseType
    }).then(function(data){
      if(callback) return callback(null, data);
      return data;
    }.bind(this)).catch(function(err){
      if (callback) return callback(err, null);
      throw err;
    });
  };

  /**
  * 指定したファイルのACL情報を更新します。
  *
  * @method NCMB.File#updateACL
  * @param {String} fileName 更新するファイル名
  * @param {NCMB.Acl} acl 更新後のacl情報を設定したncmb.ACLインスタンス
  * @param {Function} [callback] コールバック関数
  * @return {Promise<any>} APIレスポンス
  */
  File.updateACL = function(fileName, acl, callback){
    if(typeof fileName !== "string"){
      return (callback || Promise.reject.bind(Promise))(new Errors.InvalidArgumentError("File name must be string."));
    };
    if(!acl){
      return (callback || Promise.reject.bind(Promise))(new Errors.NoACLError("Acl is required."));
    };
    return ncmb.request({
      path: "/" + ncmb.version + className + "/" + fileName,
      method: "PUT",
      data: {acl:acl}
    }).then(function(data){
      var obj = null;
      try{
        obj = JSON.parse(data);
      }catch(err){
        throw err;
      }

      if(callback) return callback(null, obj);
      return obj;
    }.bind(this)).catch(function(err){
      if (callback) return callback(err, null);
      throw err;
    });
  };

  /**
  * 指定したファイルを削除します。
  *
  * @method NCMB.File#delete
  * @param {String} fileName 削除するファイル名
  * @param {Function} [callback] コールバック関数
  * @return {Promise<void>}
  */
  File.delete = function(fileName, callback){
    if(typeof fileName !== "string"){
      return (callback || Promise.reject.bind(Promise))(new Errors.InvalidArgumentError("File name must be string."));
    };
    return ncmb.request({
      path: "/" + ncmb.version + className + "/" + fileName,
      method: "DEL"
    }).then(function(){
      if(callback) return callback(null);
      return;
    }).catch(function(err){
      if (callback) return callback(err);
      throw err;
    });
  };

  ncmb.collections[className] = File;
  return File;
};
