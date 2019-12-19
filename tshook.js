const ts = require("typescript");

const formatHost = {
  getCanonicalFileName: path => path,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => ts.sys.newLine
};

function reportDiagnostic(diagnostic) {
  console.error(
    diagnostic.file.fileName,
    ": Error",
    diagnostic.code,
    ":",
    ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      formatHost.getNewLine()
    )
  );
}

function reportWatchStatusChanged(diagnostic) {
  console.info(ts.formatDiagnostic(diagnostic, formatHost).trim());
}

function createWatcher(root) {
  const configPath = ts.findConfigFile(
    /*searchPath*/ "./ui",
    ts.sys.fileExists,
    "tsconfig.json"
  );
  if (!configPath) {
    throw new Error("Could not find a valid 'tsconfig.json'.");
  }

  const createProgram = ts.createEmitAndSemanticDiagnosticsBuilderProgram;
  const host = ts.createWatchCompilerHost(
    configPath,
    {},
    ts.sys,
    createProgram,
    reportDiagnostic,
    reportWatchStatusChanged
  );

  return ts.createWatchProgram(host);
}

function watch(root) {
  const watch = createWatcher(root);
  function typescriptHook(req, res, next) {
    if (req.originalUrl.endsWith(".js")) {
      watch.getProgram(); // Sync, make sure we're recompiled on script load.
    }
    next();
  }
  return typescriptHook;
}

module.exports = { watch };
