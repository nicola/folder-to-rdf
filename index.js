var fs = require('fs');
var async = require('async');
var string = require('string');
var path = require('path');
var rdf = require('rdf-ext')();
var mime = require('mime');
mime.default_type = null;
var debug = require('debug')('folder-to-rdf');
var skipFilesFilter = require('./lib/skip-files-filter');

function list (options) {
  var folder = new ListFolder(options);
  return folder.list.bind(folder);
}

function ListFolder (options) {
  var self = this;
  options = options || {};
  self.suffixMeta = options.suffixMeta;
  self.suffixAcl = options.suffixAcl;
  self.skipFiles = options.skipFiles || [];

  // Skip ACL and Meta files
  if (self.suffixMeta) {
    self.skipFiles.push(self.suffixMeta);
    self.skipFiles.push('*' + self.suffixMeta);
  }
  if (self.suffixAcl) {
    self.skipFiles.push(self.suffixAcl);
    self.skipFiles.push('*' + self.suffixAcl);
  }

  // TODO this shall become rdf.parse
  self.defaultParser = options.defaultParser || 'text/turtle';
  self.defaultParsers = {
    'application/ld+json': rdf.parseJsonLd,
    'application/n-triples': rdf.parseTurtle,
    'text/turtle': rdf.parseTurtle
  };

  self.parsers = options.parsers || self.defaultParsers;
}

ListFolder.prototype.list = function (folder, callback, options) {
  var self = this;

  if (folder[folder.length - 1] !== '/') {
    folder += '/';
  }

  options = options || {};
  var skipFiles = options.skipFiles || self.skipFiles || [];
  var graph = rdf.createGraph();

  fs.stat(folder, function (err, stats) {
    if (err) return callback(err);
    if (!stats.isDirectory()) return callback(new Error('Not a directory'));

    graph.add(rdf.Triple(
      rdf.NamedNode(''),
      rdf.NamedNode('http://www.w3.org/ns/posix/stat#mtime'),
      rdf.Literal(stats.mtime.getTime() / 1000)));

    graph.add(rdf.Triple(
      rdf.NamedNode(''),
      rdf.NamedNode('http://www.w3.org/ns/posix/stat#size'),
      rdf.Literal(stats.size)));

    graph.add(rdf.Triple(
        rdf.NamedNode(''),
        rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        rdf.NamedNode('http://www.w3.org/ns/ldp#BasicContainer')));

    graph.add(rdf.Triple(
      rdf.NamedNode(''),
      rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      rdf.NamedNode('http://www.w3.org/ns/ldp#Container')));

    graph.add(rdf.Triple(
      rdf.NamedNode(''),
      rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      rdf.NamedNode('http://www.w3.org/ns/posix/stat#Directory')));

    fs.readdir(folder, function (err, files) {
      if (err) callback(err);
      files = skipFilesFilter(skipFiles, files);

      debug('Files found: ', files);

      async.map(
        files,
        function (file, next) {
          self.fileGraph(path.join(folder, file), next, options);
        },
        function (err, fileGraphs) {
          if (err) return callback(err);

          fileGraphs.forEach(function (fileGraph) {
            graph.addAll(fileGraph);
          });

          callback(null, graph);
        });
    });
  });
};

function getFileGraph (parser, iri, file, callback) {
  fs.readFile(file, 'utf8', function (err, data) {
    if (err) return callback(err);

    parser(data.toString(), function (graph, err) {
      if (err) return callback(err);
      callback(err, graph);
    }, iri);
  });
}

ListFolder.prototype.fileGraph = function (filePath, callback, options) {
  options = options || {};
  var self = this;
  var graph = rdf.createGraph();

  // Get file stats
  fs.stat(filePath, function (err, stats) {
    // File does not exist, skip
    if (err) return callback(err);

    filePath += (stats.isDirectory() ? '/' : '');
    var file = path.basename(filePath);

    graph.add(rdf.Triple(
      rdf.NamedNode(file),
      rdf.NamedNode('http://www.w3.org/ns/posix/stat#mtime'),
      rdf.Literal(stats.mtime.getTime() / 1000)));

    graph.add(rdf.Triple(
      rdf.NamedNode(file),
      rdf.NamedNode('http://www.w3.org/ns/posix/stat#size'),
      rdf.Literal(stats.size)));

    // Add to `contains` list
    graph.add(rdf.Triple(
      rdf.NamedNode(''),
      rdf.NamedNode('http://www.w3.org/ns/ldp#contains'),
      rdf.NamedNode(file)));

    // Set up a metaPath
    var metadataPath = filePath
    var fileMIME = mime.lookup(file)
    if (!(fileMIME && fileMIME in self.defaultParsers)) {
      metadataPath += options.suffixMeta || self.suffixMeta || ''
    }

    // This is the case in which the file is a folder and suffixMeta is null
    // then, keep going
    if (metadataPath[metadataPath.length - 1] === '/') {
      return callback(null, graph);
    }

    // Get MIME and select according parser
    var mimetype = mime.lookup(metadataPath) || self.defaultParser;
    var parser = self.parsers[mimetype];

    getFileGraph(parser, file, metadataPath, function (err, metadata) {
      if (err || !metadata) metadata = rdf.createGraph();

      // Add File, Container or BasicContainer
      if (stats.isDirectory()) {
        graph.add(rdf.Triple(
          rdf.NamedNode(file),
          rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          rdf.NamedNode('http://www.w3.org/ns/ldp#BasicContainer')));

        graph.add(rdf.Triple(
          rdf.NamedNode(file),
          rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          rdf.NamedNode('http://www.w3.org/ns/ldp#Container')));

        graph.add(rdf.Triple(
          rdf.NamedNode(file),
          rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          rdf.NamedNode('http://www.w3.org/ns/posix/stat#Directory')));
      } else {
        graph.add(rdf.Triple(
          rdf.NamedNode(file),
          rdf.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          rdf.NamedNode('http://www.w3.org/ns/posix/stat#File')));
      }

      // Infer type

      metadata
        .match(
          file,
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
          undefined)
        .forEach(function (typeStatement) {
          // If the current is a file and its type is BasicContainer,
          // This is not possible, so do not infer its type!
          if (
              (
                typeStatement.object.valueOf() !== 'http://www.w3.org/ns/ldp#BasicContainer' &&
                typeStatement.object.valueOf() !== 'http://www.w3.org/ns/ldp#Container'
              ) ||
              !stats.isFile()
          ) {
            graph.add(rdf.Triple(
              rdf.NamedNode(file),
              typeStatement.predicate,
              typeStatement.object));
          }
        });

      return callback(null, graph);
    });
  });
};

module.exports = list;
module.exports.ListFolder = ListFolder;
