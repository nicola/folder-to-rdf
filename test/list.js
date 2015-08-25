var fs = require('fs');
var rdf = require('rdf-ext')();
var assert = require('chai').assert;

describe('listContainer', function () {
  var listFolder = require('../')({
    suffixMeta: '.meta',
    skipFiles: ['.acl', '*.acl']
  });

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

    listFolder(__dirname + '/resources', function (err, graph) {
      if (err) return done(err);

      console.log(graph.length)

      var statements = graph
        .match(
          'magicType.ttl',
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
          undefined)
        .toArray();

      console.log(statements)

      assert.equal(statements.length, 2);
      assert.equal(statements[1].object.toString(), 'http://www.w3.org/ns/ldp#MagicType');
      assert.equal(statements[0].object.toString(), 'http://www.w3.org/ns/posix/stat#File');

      rm('magicType.ttl');
      done();
    });
  });

  it('should not inherit type of BasicContainer/Container if type is File', function(done) {
    write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
          '@prefix o: <http://example.org/ontology>.' +
          '<> a <http://www.w3.org/ns/ldp#Container> ;' +
          '   dcterms:title "This is a container" ;' +
          '   o:limit 500000.00 .', 'sampleContainer/containerFile.ttl');

    write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
          '@prefix o: <http://example.org/ontology>.' +
          '<> a <http://www.w3.org/ns/ldp#BasicContainer> ;' +
          '   dcterms:title "This is a container" ;' +
          '   o:limit 500000.00 .', 'sampleContainer/basicContainerFile.ttl');

    listFolder(__dirname + '/resources/sampleContainer/', 'https://server.tld', '', function (err, data) {
      var graph = $rdf.graph();
      $rdf.parse(
        data,
        graph,
        'https://server.tld/sampleContainer',
        'text/turtle');

      var basicContainerStatements = graph.each(
        $rdf.sym('https://server.tld/basicContainerFile.ttl'),
        ns.rdf('type'),
        undefined);

      assert.equal(basicContainerStatements.length, 1);

      var containerStatements = graph.each(
        $rdf.sym('https://server.tld/containerFile.ttl'),
        ns.rdf('type'),
        undefined);

      assert.equal(containerStatements.length, 1);

      basicContainerStatements.forEach(function(statement) {
        assert.equal(statement.uri, ns.stat('File').uri);
      });

      containerStatements.forEach(function(statement) {
        assert.equal(statement.uri, ns.stat('File').uri);
      });

      rm('sampleContainer/containerFile.ttl');
      rm('sampleContainer/basicContainerFile.ttl');
      done();
    });
  });

  it('should ldp:contains the same amount of files in dir', function(done) {
    listFolder(__dirname + '/resources/sampleContainer/', 'https://server.tld', '', function (err, data) {
      fs.readdir(__dirname + '/resources/sampleContainer/', function(err, files) {
        var graph = $rdf.graph();
        $rdf.parse(
          data,
          graph,
          'https://server.tld/sampleContainer',
          'text/turtle');

        var statements = graph.each(
          undefined,
          ns.ldp('contains'),
          undefined);

        assert.notEqual(graph.statements.length, 0);
        assert.equal(statements.length, files.length);
        assert.notOk(err);
        done();
      });
    });
  });
});