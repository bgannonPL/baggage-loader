'use strict';

// to make a require optional, prefix the variable in the baggage loader with (or set it to) '[flag]#',
// where [flag] is a term to search for in the file. If the file contains @[flag], no require will be 
// inserted 

var path = require('path');
var fs = require('fs');
var loaderUtils = require('loader-utils');
var SourceMap = require('source-map');
var util = require('./lib/util');
var optionalFlag = '#';
var optionalAddFlag = '*';
var optionalFlagFormat = '@[flag]';
var reqPrefix = null; // optional param to support custom require syntaxes

module.exports = function(source, sourceMap) {
    var query = loaderUtils.parseQuery(this.query);

    // /foo/bar/file.js
    var srcFilepath = this.resourcePath;
    // /foo/bar/file.js -> file
    var srcFilename = path.basename(srcFilepath, path.extname(srcFilepath));
    // /foo/bar/file.js -> /foo/bar
    var srcDirpath = path.dirname(srcFilepath);
    // /foo/bar -> bar
    var srcDirname = srcDirpath.split(path.sep).pop();

    if (this.cacheable) {
        this.cacheable();
    }

    if (Object.keys(query).length) {
        var inject = '\n/* injects from baggage-loader */\n';

        if (query.reqPrefix) {
            reqPrefix = query.reqPrefix;
            delete query.reqPrefix;
        }

        Object.keys(query).forEach(function(baggageFile) {
            var baggageVar = query[baggageFile], ignoreFlag = null, ignoreArr, addFlag = null, addArr, prefix;

            prefix = reqPrefix || '';

            // TODO: not so quick and dirty validation
            if (typeof baggageVar === 'string' || baggageVar === true) {
                // apply filename placeholders
                baggageFile = util.applyPlaceholders(baggageFile, srcDirname, srcFilename);

                // check for flags indicating this inclusion is optional
                if (baggageVar.length) {
                  // optional variable that can be ignored
                  if (baggageVar.indexOf(optionalFlag) !== -1) {
                    ignoreArr = baggageVar.split(optionalFlag);
                    // term before the optional flag is the term that indicates, when present in a file, 
                    // that the require should be ignored for that file
                    if (ignoreArr[0]) {
                        ignoreFlag = ignoreArr[0];
                    }
                    baggageVar = ignoreArr[1];
                  }
                  
                  // optional variable that can be added if requested
                  if (baggageVar.indexOf(optionalAddFlag) !== -1) {
                    addArr = baggageVar.split(optionalAddFlag);
                    if (addArr[0]) {
                      addFlag = addArr[0];
                    }
                    baggageVar = addArr[1];
                  }
                }
                
                // Check wether or not we should add the require, based on optional params
                var includeRequire = true;
                if ( addFlag && source.indexOf( optionalFlagFormat.replace('[flag]', addFlag) ) === -1 ) {
                  // optional 'add' case, only add if flag is found in file, else noop
                  includeRequire = false;
                } else if ( ignoreFlag && source.indexOf( optionalFlagFormat.replace( '[flag]', ignoreFlag ) ) !== -1 ) {
                  // no op, the ignore flag tells us not to include the require here
                  includeRequire = false;
                }

                if (includeRequire) {
                  // apply filename placeholders
                  if (baggageVar.length) {
                    baggageVar = util.applyPlaceholders(baggageVar, srcDirname, srcFilename);
                    inject += 'var ' + baggageVar + ' = ';
                  }

                    // and require
                    inject += 'require(\'' + prefix + baggageFile + '\');\n';
                }
                
            }
        });

        inject += '\n';

        // support existing SourceMap
        // https://github.com/mozilla/source-map#sourcenode
        // https://github.com/webpack/imports-loader/blob/master/index.js#L34-L44
        // https://webpack.github.io/docs/loaders.html#writing-a-loader
        if (sourceMap) {
            var currentRequest = loaderUtils.getCurrentRequest(this);
            var SourceNode = SourceMap.SourceNode;
            var SourceMapConsumer = SourceMap.SourceMapConsumer;
            var sourceMapConsumer = new SourceMapConsumer(sourceMap);
            var node = SourceNode.fromStringWithSourceMap(source, sourceMapConsumer);

            node.prepend(inject);

            var result = node.toStringWithSourceMap({
                file: currentRequest
            });

            this.callback(null, result.code, result.map.toJSON());

            return;
        }

        // prepend collected inject at the top of file
        return inject + source;
    }

    // return the original source and sourceMap
    if (sourceMap) {
        this.callback(null, source, sourceMap);
        return;
    }

    // return the original source
    return source;
};
