var repl = require('repl');
var baseDebugger = require('_debugger');
var CommandRepl = require('../modes/commandRepl');

/**
 * BETA BETA BETA
 * Custom explorer to test protractor commands.
 *
 * @constructor
 */
var WdRepl = function() {
  this.client = new baseDebugger.Client();
};

/**
 * Initiate debugger client.
 * @private
 */
WdRepl.prototype.initClient_ = function() {
  var client = this.client;

  client.once('ready', function() {

    client.setBreakpoint({
      type: 'scriptRegExp',
      target: '.*executors\.js', //jshint ignore:line
      line: 37
    }, function() {});
  });

  var host = 'localhost';
  var port = process.argv[2] || 5858;
  client.connect(port, host); // TODO - might want to add retries here.
};

/**
 * Instantiate a server to handle IO.
 * @param {number} port The port to start the server.
 * @private
 */
WdRepl.prototype.initServer_ = function(port) {
  var net = require('net');
  var self = this;
  var cmdRepl = new CommandRepl(this.client);

  var received = '';
  net.createServer(function(sock) {
    sock.on('data', function(data) {
      received += data.toString();
      var eolIndex = received.indexOf('\r\n');
      if (eolIndex === 0) {
        return;
      }
      var input = received.substring(0, eolIndex);
      received = received.substring(eolIndex + 2);
      if (data[0] === 0x1D) {
        // '^]': term command
        self.client.req({command: 'disconnect'}, function() {
          // Intentionally blank.
        });
        sock.end();
      } else if (input[input.length - 1] === '\t') {
        // If the last character is the TAB key, this is an autocomplete
        // request. We use everything before the TAB as the init data to feed
        // into autocomplete.
        input = input.substring(0, input.length - 1);
        cmdRepl.complete(input, function(err, res) {
          if (err) {
            sock.write('ERROR: ' + err + '\r\n');
          } else {
            sock.write(JSON.stringify(res) + '\r\n');
          }
        });
      } else {
        // Normal input
        input = input.trim();
        cmdRepl.stepEval(input, function(err, res) {
          if (err) {
            sock.write('ERROR: ' + err + '\r\n');
            return;
          }
          if (res === undefined) {
            res = '';
          }
          sock.write(res + '\r\n');
        });
      }
    });
  }).listen(port);

  console.log('Server listening on 127.0.0.1:' + port);
};

/**
 * Instantiate a repl to handle IO.
 * @private
 */
WdRepl.prototype.initRepl_ = function() {
  var self = this;
  var cmdRepl = new CommandRepl(this.client);

  // Eval function for processing a single step in repl.
  var stepEval = function(cmd, context, filename, callback) {
    // The command that eval feeds is of the form '(CMD\n)', so we trim the
    // double quotes and new line. 
    cmd = cmd.slice(1, cmd.length - 2);
    cmdRepl.stepEval(cmd, function(err, res) {
      // Result is a string representation of the evaluation.
      if (res !== undefined) {
        console.log(res);
      }
      callback(err, undefined);
    });
  };

  var replServer = repl.start({
    prompt: cmdRepl.prompt,
    input: process.stdin,
    output: process.stdout,
    eval: stepEval,
    useGlobal: false,
    ignoreUndefined: true
  });

  replServer.complete = cmdRepl.complete.bind(cmdRepl);

  replServer.on('exit', function() {
    console.log('Exiting...');
    self.client.req({command: 'disconnect'}, function() {
      // Intentionally blank.
    });
  });
};

/**
 * Instantiate a repl or a server.
 * @private
 */
WdRepl.prototype.initReplOrServer_ = function() {
  // Note instead of starting either repl or server, another approach is to 
  // feed the server socket into the repl as the input/output streams. The 
  // advantage is that the process becomes much more realistic because now we're
  // using the normal repl. However, it was not possible to test autocomplete 
  // this way since we cannot immitate the TAB key over the wire. 
  var debuggerServerPort = process.argv[3];
  if (debuggerServerPort) {
    this.initServer_(debuggerServerPort);
  } else {
    this.initRepl_();
  }
};

/**
 * Initiate the debugger.
 * @public
 */
WdRepl.prototype.init = function() {
  console.log('Type <tab> to see a list of locator strategies.');
  console.log('Use the `list` helper function to find elements by strategy:');
  console.log('  e.g., list(by.binding(\'\')) gets all bindings.');

  this.initClient_();
  this.initReplOrServer_();
};

var wdRepl = new WdRepl();
wdRepl.init();
