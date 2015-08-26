var fs = require('fs');
var rdf = require('rdf-ext')();
var assert = require('chai').assert;

describe('listContainer', function () {
  // Import Skip Files util
  var skipFilesFilter = require('../lib/skip-files-filter');

  // Import library and command
  var opts = {
    suffixAcl: '.acl',
    suffixMeta: '.meta'
  }

  var ListFolder = require('../').ListFolder

  var listFolderFunction = require('../')(opts);
  var listFolderObject = new ListFolder(opts);

  var rm = function (file) {
    return fs.unlinkSync(__dirname + '/resources/' + file);
  };

  var write = function (text, file) {
    return fs.writeFileSync(__dirname + '/resources/' + file, text);
  };

  it('should inherit type if file is .ttl', function (done) {
    write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
          '@prefix o: <http://example.org/ontology>.' +
          '<> a <http://www.w3.org/ns/ldp#MagicType> ;' +
          '   dcterms:title "This is a magic type" ;' +
          '   o:limit 500000.00 .', 'magicType.ttl');

    listFolderFunction(__dirname + '/resources', function (err, graph) {
      if (err) return done(err);

      var statements = graph
        .match(
          'magicType.ttl',
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
          undefined)
        .toArray();

      assert.equal(statements.length, 2);
      assert.equal(statements[1].object.toString(), 'http://www.w3.org/ns/ldp#MagicType');
      assert.equal(statements[0].object.toString(), 'http://www.w3.org/ns/posix/stat#File');

      rm('magicType.ttl');
      done();
    });
  });

  it('should not open documents it can\'t parse', function (done) {
    write('test', 'magicType.css');

    listFolderFunction(__dirname + '/resources', function (err, graph) {
      if (err) return done(err);

      var statements = graph
        .match(
          'magicType.css',
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
          undefined)
        .toArray();

      assert.equal(statements.length, 1);
      assert.equal(statements[0].object.toString(), 'http://www.w3.org/ns/posix/stat#File');

      rm('magicType.css');
      done();
    });
  });

  it('should not inherit type of BasicContainer/Container if type is File', function(done) {
    write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
          '@prefix o: <http://example.org/ontology>.' +
          '<> a <http://www.w3.org/ns/ldp#Container> ;' +
          '   dcterms:title "This is a container" ;' +
          '   o:limit 500000.00 .', 'containerFile.ttl');

    write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
          '@prefix o: <http://example.org/ontology>.' +
          '<> a <http://www.w3.org/ns/ldp#BasicContainer> ;' +
          '   dcterms:title "This is a container" ;' +
          '   o:limit 500000.00 .', 'basicContainerFile.ttl');

    listFolderFunction(__dirname + '/resources', function (err, graph) {
      if (err) return done(err);

      var basicContainerStatements = graph
        .match(
          'basicContainerFile.ttl',
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
          undefined)
        .toArray();

      assert.equal(basicContainerStatements.length, 1);

      var containerStatements = graph
        .match(
          'containerFile.ttl',
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
          undefined)
        .toArray();

      assert.equal(containerStatements.length, 1);

      basicContainerStatements
        .forEach(function (statement) {
          assert.equal(
            statement.object.valueOf(),
            'http://www.w3.org/ns/posix/stat#File');
        });

      containerStatements
        .forEach(function (statement) {
          assert.equal(
            statement.object.valueOf(),
            'http://www.w3.org/ns/posix/stat#File');
        });

      rm('containerFile.ttl');
      rm('basicContainerFile.ttl');
      done();
    });
  });

  it('should ldp:contains the same amount of files in dir', function (done) {
    listFolderObject.list(__dirname + '/resources', function (err, graph) {
      if (err) return done(err);
      fs.readdir(__dirname + '/resources', function (err, files) {

        files = skipFilesFilter(listFolderObject.skipFiles, files)

        var statements = graph
          .match(
            undefined,
            'http://www.w3.org/ns/ldp#contains',
            undefined)
          .toArray();

        assert.equal(statements.length, files.length);
        assert.notOk(err);
        done();
      });
    });
  });

  it('should work with ending `/`', function (done) {
    listFolderObject.list(__dirname + '/resources/', function (err, graph) {
      if (err) return done(err);
      fs.readdir(__dirname + '/resources', function (err, files) {

        files = skipFilesFilter(listFolderObject.skipFiles, files)

        var statements = graph
          .match(
            undefined,
            'http://www.w3.org/ns/ldp#contains',
            undefined)
          .toArray();

        assert.equal(statements.length, files.length);
        assert.notOk(err);
        done();
      });
    });
  });

  it('should not skip any file no skipFiles or suffices are passed', function (done) {
    var listFolderObjectNoSkip = new ListFolder();
    listFolderObjectNoSkip.list(__dirname + '/resources/', function (err, graph) {
      if (err) return done(err);
      fs.readdir(__dirname + '/resources', function (err, files) {

        var statements = graph
          .match(
            undefined,
            'http://www.w3.org/ns/ldp#contains',
            undefined)
          .toArray();

        assert.equal(statements.length, files.length);
        assert.notOk(err);
        done();
      });
    });
  });


});