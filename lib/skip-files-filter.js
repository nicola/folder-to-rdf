var minimatch = require('minimatch');

module.exports = function (skipFiles, files) {
  if (!skipFiles.length) return files;

  return files.filter(function (file) {
    return !skipFiles.some(function (pattern) {
      return minimatch(file, pattern);
    });
  });
};
