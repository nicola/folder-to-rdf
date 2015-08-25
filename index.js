var fs = require('fs');
var async = require('async');
var string = require('string');
var path = require('path');
var rdf = require('rdf-ext')();
var mimetype = require('mimetype');
var minimatch = require('minimatch');

function list (options) {
  var folder = new ListFolder(options);
  return folder.list.bind(folder);
}

function ListFolder (options) {
  var self = this;
  self.suffixMeta = options.suffixMeta;
  self.skipFiles = options.skipFiles || [];
  if (self.suffixMeta) {
    self.skipFiles.push(self.suffixMeta);
    self.skipFiles.push('*' + self.suffixMeta);
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
  console.log(this)
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
      console.log(skipFiles)
      if (skipFiles.length) {
        files = files
          .filter(function (file) {
            return !skipFiles
              .some(function (pattern) {
                console.log(file, pattern, !minimatch(path.join(folder, file), pattern))
                return minimatch(file, pattern, {matchBas: true});
              });
          });
      }
      console.log(files)

      async.map(
        files,
        function (file, next) {
                console.log(file)
          var mime = mimetype.lookup(file) || self.defaultParser;
          console.log(mime, self.defaultParser)
          var parser = self.parsers[mime];
          self.fileGraph(parser, folder + '/' + file, next, options);
        },
        function (err, fileGraphs) {
          console.log('done2', err)
          if (err) return callback(err);
          console.log('done2', fileGraphs.length)
          fileGraphs.forEach(function (fileGraph) {
            graph.addAll(fileGraph);
          });
          console.log('done', graph.length)
          callback(null, graph);
        });
    });
  });
};

function getFileGraph (parser, iri, file, callback) {
  fs.readFile(file, 'utf8', function (err, data) {
    if (err) return callback(err);

    parser(data.toString(), function (graph, err) {
      console.log('pasrese', err)
      if (err) return callback(err);
      callback(err, graph);
    }, iri);
  });
}

ListFolder.prototype.fileGraph = function (parser, filePath, callback, options) {
console.log(filePath)
  options = options || {};
  var self = this;
  var file = path.basename(filePath);
  var graph = rdf.createGraph();

  // Get file stats
  fs.stat(filePath, function (err, stats) {
    // File does not exist, skip
    if (err) return callback(err);

    file += (stats.isDirectory() ? '/' : '');
    console.log('bebe', file)
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

    // Set up a meta path
    var metadataFile =
      (string(file).endsWith('.ttl') ? '' : (options.suffixMeta || self.suffixMeta));

    // This is the case in which the file is a folder and suffixMeta is null
    // then, keep going

    if (metadataFile[metadataFile.length - 1] === '/') {
      return callback(null, graph);
    }

    getFileGraph(parser, file, filePath + metadataFile, function (err, metadata) {
      console.log('ha', err)
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
      console.log(metadata.toArray())
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
                typeStatement.object.uri !== 'http://www.w3.org/ns/ldp#BasicContainer' &&
                typeStatement.object.uri !== 'http://www.w3.org/ns/ldp#Container'
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
