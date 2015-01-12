(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Connector;

Connector = (function() {
  function Connector() {
    this.is_synced = false;
    this.compute_when_synced = [];
    this.connections = {};
    this.unsynced_connections = {};
    this.receive_handlers = [];
    this.sync_process_order = [];
    this.when_user_id_set = [];
  }

  Connector.prototype.getUniqueConnectionId = function() {
    return this.id;
  };

  Connector.prototype.whenUserIdSet = function(f) {
    return this.when_user_id_set.push(f);
  };

  Connector.prototype.whenSynced = function(args) {
    if (this.is_synced) {
      return args[0].apply(this, args.slice(1));
    } else {
      return this.compute_when_synced.push(args);
    }
  };

  Connector.prototype.whenReceiving = function(f) {
    return this.receive_handlers.push(f);
  };

  Connector.prototype.multicast = function(peers, message) {
    return this.whenSynced([_send, peers, message]);
  };

  Connector.prototype.unicast = function(peer, message) {
    return this.whenSynced([_send, peer, message]);
  };

  Connector.prototype.broadcast = function(message) {
    return this._broadcast(message);
  };

  Connector.prototype.whenSyncing = function() {
    var i, _i, _ref, _results;
    _results = [];
    for (i = _i = _ref = arguments.length - 1; _ref <= 0 ? _i <= 0 : _i >= 0; i = _ref <= 0 ? ++_i : --_i) {
      _results.push(this.sync_process_order.unshift(arguments[i]));
    }
    return _results;
  };

  return Connector;

})();

module.exports = Connector;



},{}],2:[function(require,module,exports){
var Connector, XMPP, XMPPConnector, encode_message, extract_resource_from_jid, ltx, parse_message,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

XMPP = require("node-xmpp-client");

ltx = require("ltx");

extract_resource_from_jid = function(jid) {
  return jid.split("/")[1];
};

Connector = require('../connector');

parse_message = function(m) {
  var parse_array, parse_object;
  parse_array = function(node) {
    var n, _i, _len, _ref, _results;
    _ref = node.children;
    _results = [];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      n = _ref[_i];
      if (n.getAttribute("isArray") === "true") {
        _results.push(parse_array(n));
      } else {
        _results.push(parse_object(n));
      }
    }
    return _results;
  };
  parse_object = function(node) {
    var int, json, n, name, value, _i, _len, _ref, _ref1;
    json = {};
    _ref = node.attrs;
    for (name in _ref) {
      value = _ref[name];
      int = parseInt(value);
      if (isNaN(int) || ("" + int) !== value) {
        json[name] = value;
      } else {
        json[name] = int;
      }
    }
    _ref1 = node.children;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      n = _ref1[_i];
      name = n.name;
      if (n.getAttribute("isArray") === "true") {
        json[name] = parse_array(n);
      } else {
        json[name] = parse_object(n);
      }
    }
    return json;
  };
  return parse_object(m);
};

encode_message = function(m, json) {
  var encode_array, encode_object;
  encode_object = function(m, json) {
    var name, value;
    for (name in json) {
      value = json[name];
      if (value == null) {

      } else if (value.constructor === Object) {
        encode_object(m.c(name), value);
      } else if (value.constructor === Array) {
        encode_array(m.c(name), value);
      } else {
        m.setAttribute(name, value);
      }
    }
    return m;
  };
  encode_array = function(m, array) {
    var e, _i, _len;
    m.setAttribute("isArray", "true");
    for (_i = 0, _len = array.length; _i < _len; _i++) {
      e = array[_i];
      if (e.constructor === Object) {
        encode_object(m.c("array-element"), e);
      } else {
        encode_array(m.c("array-element"), e);
      }
    }
    return m;
  };
  if (json.constructor === Object) {
    return encode_object(m.c("yatta", {
      xmlns: "http://yatta.ninja/connector-stanza"
    }), json);
  } else if (json.constructor === Array) {
    return encode_array(m.c("yatta", {
      xmlns: "http://yatta.ninja/connector-stanza"
    }), json);
  } else {
    throw new Error("I can't encode this json!");
  }
};

XMPPConnector = (function(_super) {
  __extends(XMPPConnector, _super);

  function XMPPConnector(room) {
    var that;
    XMPPConnector.__super__.constructor.call(this);
    this.xmpp = new XMPP.Client({
      jid: '@yatta.ninja',
      preferred: "ANONYMOUS",
      websocket: {
        url: 'wss:yatta.ninja:5281/xmpp-websocket'
      }
    });
    this._is_server = true;
    this.is_syncing = false;
    this.connections = {};
    that = this;
    this.xmpp.on('online', function() {
      var f, room_subscription, _i, _len, _ref;
      that.room = room + "@conference.yatta.ninja";
      that.room_jid = that.room + "/" + that.xmpp.jid.resource;
      that.id = that.xmpp.jid.resource;
      _ref = that.when_user_id_set;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        f = _ref[_i];
        f(that.id);
      }
      room_subscription = new ltx.Element('presence', {
        to: that.room_jid
      }).c('x', {});
      return that.xmpp.send(room_subscription);
    });
    this.xmpp.on('stanza', function(stanza) {
      var data, f, res, send_again, sender, sender_role, _i, _j, _len, _len1, _ref, _ref1;
      sender = stanza.getAttribute("from");
      if (stanza.is("presence")) {
        sender_role = stanza.getChild("x", "http://jabber.org/protocol/muc#user").getChild("item").getAttribute("role");
        if (sender === that.room_jid) {
          that.role = sender_role;
          if (that.role === "moderator") {
            that.is_synced = true;
          }
        } else if (stanza.getAttribute("type") === "unavailable") {
          delete that.connections[extract_resource_from_jid(sender)];
        } else {
          that.connections[extract_resource_from_jid(sender)] = sender;
          if (!this.is_synced && sender_role === "moderator") {
            that._performSync(sender);
          }
        }
      } else {
        if (sender === that.room_jid) {
          return true;
        }
        res = stanza.getChild("yatta", "http://yatta.ninja/connector-stanza");
        if (that.receive_counter == null) {
          that.receive_counter = 0;
        }
        that.receive_counter++;
        if (res != null) {
          res = parse_message(res);
          if (res.sync_step == null) {
            _ref = that.receive_handlers;
            for (_i = 0, _len = _ref.length; _i < _len; _i++) {
              f = _ref[_i];
              f(sender, res);
            }
          } else {
            data = that.sync_process_order[res.sync_step + 1](res.data);
            if (res.sync_step + 2 < that.sync_process_order.length) {
              that._send(sender, {
                sync_step: res.sync_step + 1,
                data: data
              });
              if (res.send_again != null) {
                send_again = (function(old_data, sync_step) {
                  return function() {
                    data = that.sync_process_order[res.sync_step + 1](data.state_vector);
                    return that._send(sender, {
                      sync_step: sync_step + 1,
                      data: data,
                      sent_again: "true"
                    });
                  };
                })(data, res.sync_step);
                setTimeout(send_again, 3000);
              }
            }
            if ((res.sent_again != null) && !that.is_synced) {
              that.is_synced = true;
              _ref1 = that.compute_when_synced;
              for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
                f = _ref1[_j];
                f();
              }
            }
          }
        }
      }
      return console.log("RECEIVED: " + stanza.toString());
    });
  }

  XMPPConnector.prototype._send = function(user, json, type) {
    var m, message;
    if (this.is_synced || (json.sync_step != null) || this.is_syncing) {
      if (this.send_conter == null) {
        this.send_conter = 0;
      }
      this.send_conter++;
      m = new ltx.Element("message", {
        to: user,
        type: type != null ? type : "chat"
      });
      message = encode_message(m, json);
      console.log("SENDING: " + message.toString());
      return this.xmpp.send(message);
    }
  };

  XMPPConnector.prototype._broadcast = function(json) {
    return this._send(this.room, json, "groupchat");
  };

  XMPPConnector.prototype.invokeSync = function() {};

  XMPPConnector.prototype._performSync = function(user) {
    if (!this.is_syncing) {
      this.is_syncing = true;
      this._send(user, {
        sync_step: this.sync_process_order.length - 3,
        send_again: "true",
        data: []
      });
      return this._broadcast({
        sync_step: this.sync_process_order.length - 2,
        data: this.sync_process_order[this.sync_process_order.length - 2]([])
      });
    }
  };

  return XMPPConnector;

})(Connector);

if (module.exports != null) {
  module.exports = XMPPConnector;
}

if (typeof window !== "undefined" && window !== null) {
  window.XMPPConnector = XMPPConnector;
}



},{"../connector":1,"ltx":25,"node-xmpp-client":29}],3:[function(require,module,exports){

},{}],4:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":22}],5:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":6,"ieee754":7}],6:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],7:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],8:[function(require,module,exports){
var Buffer = require('buffer').Buffer;
var intSize = 4;
var zeroBuffer = new Buffer(intSize); zeroBuffer.fill(0);
var chrsz = 8;

function toArray(buf, bigEndian) {
  if ((buf.length % intSize) !== 0) {
    var len = buf.length + (intSize - (buf.length % intSize));
    buf = Buffer.concat([buf, zeroBuffer], len);
  }

  var arr = [];
  var fn = bigEndian ? buf.readInt32BE : buf.readInt32LE;
  for (var i = 0; i < buf.length; i += intSize) {
    arr.push(fn.call(buf, i));
  }
  return arr;
}

function toBuffer(arr, size, bigEndian) {
  var buf = new Buffer(size);
  var fn = bigEndian ? buf.writeInt32BE : buf.writeInt32LE;
  for (var i = 0; i < arr.length; i++) {
    fn.call(buf, arr[i], i * 4, true);
  }
  return buf;
}

function hash(buf, fn, hashSize, bigEndian) {
  if (!Buffer.isBuffer(buf)) buf = new Buffer(buf);
  var arr = fn(toArray(buf, bigEndian), buf.length * chrsz);
  return toBuffer(arr, hashSize, bigEndian);
}

module.exports = { hash: hash };

},{"buffer":5}],9:[function(require,module,exports){
var Buffer = require('buffer').Buffer
var sha = require('./sha')
var sha256 = require('./sha256')
var rng = require('./rng')
var md5 = require('./md5')

var algorithms = {
  sha1: sha,
  sha256: sha256,
  md5: md5
}

var blocksize = 64
var zeroBuffer = new Buffer(blocksize); zeroBuffer.fill(0)
function hmac(fn, key, data) {
  if(!Buffer.isBuffer(key)) key = new Buffer(key)
  if(!Buffer.isBuffer(data)) data = new Buffer(data)

  if(key.length > blocksize) {
    key = fn(key)
  } else if(key.length < blocksize) {
    key = Buffer.concat([key, zeroBuffer], blocksize)
  }

  var ipad = new Buffer(blocksize), opad = new Buffer(blocksize)
  for(var i = 0; i < blocksize; i++) {
    ipad[i] = key[i] ^ 0x36
    opad[i] = key[i] ^ 0x5C
  }

  var hash = fn(Buffer.concat([ipad, data]))
  return fn(Buffer.concat([opad, hash]))
}

function hash(alg, key) {
  alg = alg || 'sha1'
  var fn = algorithms[alg]
  var bufs = []
  var length = 0
  if(!fn) error('algorithm:', alg, 'is not yet supported')
  return {
    update: function (data) {
      if(!Buffer.isBuffer(data)) data = new Buffer(data)
        
      bufs.push(data)
      length += data.length
      return this
    },
    digest: function (enc) {
      var buf = Buffer.concat(bufs)
      var r = key ? hmac(fn, key, buf) : fn(buf)
      bufs = null
      return enc ? r.toString(enc) : r
    }
  }
}

function error () {
  var m = [].slice.call(arguments).join(' ')
  throw new Error([
    m,
    'we accept pull requests',
    'http://github.com/dominictarr/crypto-browserify'
    ].join('\n'))
}

exports.createHash = function (alg) { return hash(alg) }
exports.createHmac = function (alg, key) { return hash(alg, key) }
exports.randomBytes = function(size, callback) {
  if (callback && callback.call) {
    try {
      callback.call(this, undefined, new Buffer(rng(size)))
    } catch (err) { callback(err) }
  } else {
    return new Buffer(rng(size))
  }
}

function each(a, f) {
  for(var i in a)
    f(a[i], i)
}

// the least I can do is make error messages for the rest of the node.js/crypto api.
each(['createCredentials'
, 'createCipher'
, 'createCipheriv'
, 'createDecipher'
, 'createDecipheriv'
, 'createSign'
, 'createVerify'
, 'createDiffieHellman'
, 'pbkdf2'], function (name) {
  exports[name] = function () {
    error('sorry,', name, 'is not implemented yet')
  }
})

},{"./md5":10,"./rng":11,"./sha":12,"./sha256":13,"buffer":5}],10:[function(require,module,exports){
/*
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.1 Copyright (C) Paul Johnston 1999 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

var helpers = require('./helpers');

/*
 * Perform a simple self-test to see if the VM is working
 */
function md5_vm_test()
{
  return hex_md5("abc") == "900150983cd24fb0d6963f7d28e17f72";
}

/*
 * Calculate the MD5 of an array of little-endian words, and a bit length
 */
function core_md5(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << ((len) % 32);
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;

    a = md5_ff(a, b, c, d, x[i+ 0], 7 , -680876936);
    d = md5_ff(d, a, b, c, x[i+ 1], 12, -389564586);
    c = md5_ff(c, d, a, b, x[i+ 2], 17,  606105819);
    b = md5_ff(b, c, d, a, x[i+ 3], 22, -1044525330);
    a = md5_ff(a, b, c, d, x[i+ 4], 7 , -176418897);
    d = md5_ff(d, a, b, c, x[i+ 5], 12,  1200080426);
    c = md5_ff(c, d, a, b, x[i+ 6], 17, -1473231341);
    b = md5_ff(b, c, d, a, x[i+ 7], 22, -45705983);
    a = md5_ff(a, b, c, d, x[i+ 8], 7 ,  1770035416);
    d = md5_ff(d, a, b, c, x[i+ 9], 12, -1958414417);
    c = md5_ff(c, d, a, b, x[i+10], 17, -42063);
    b = md5_ff(b, c, d, a, x[i+11], 22, -1990404162);
    a = md5_ff(a, b, c, d, x[i+12], 7 ,  1804603682);
    d = md5_ff(d, a, b, c, x[i+13], 12, -40341101);
    c = md5_ff(c, d, a, b, x[i+14], 17, -1502002290);
    b = md5_ff(b, c, d, a, x[i+15], 22,  1236535329);

    a = md5_gg(a, b, c, d, x[i+ 1], 5 , -165796510);
    d = md5_gg(d, a, b, c, x[i+ 6], 9 , -1069501632);
    c = md5_gg(c, d, a, b, x[i+11], 14,  643717713);
    b = md5_gg(b, c, d, a, x[i+ 0], 20, -373897302);
    a = md5_gg(a, b, c, d, x[i+ 5], 5 , -701558691);
    d = md5_gg(d, a, b, c, x[i+10], 9 ,  38016083);
    c = md5_gg(c, d, a, b, x[i+15], 14, -660478335);
    b = md5_gg(b, c, d, a, x[i+ 4], 20, -405537848);
    a = md5_gg(a, b, c, d, x[i+ 9], 5 ,  568446438);
    d = md5_gg(d, a, b, c, x[i+14], 9 , -1019803690);
    c = md5_gg(c, d, a, b, x[i+ 3], 14, -187363961);
    b = md5_gg(b, c, d, a, x[i+ 8], 20,  1163531501);
    a = md5_gg(a, b, c, d, x[i+13], 5 , -1444681467);
    d = md5_gg(d, a, b, c, x[i+ 2], 9 , -51403784);
    c = md5_gg(c, d, a, b, x[i+ 7], 14,  1735328473);
    b = md5_gg(b, c, d, a, x[i+12], 20, -1926607734);

    a = md5_hh(a, b, c, d, x[i+ 5], 4 , -378558);
    d = md5_hh(d, a, b, c, x[i+ 8], 11, -2022574463);
    c = md5_hh(c, d, a, b, x[i+11], 16,  1839030562);
    b = md5_hh(b, c, d, a, x[i+14], 23, -35309556);
    a = md5_hh(a, b, c, d, x[i+ 1], 4 , -1530992060);
    d = md5_hh(d, a, b, c, x[i+ 4], 11,  1272893353);
    c = md5_hh(c, d, a, b, x[i+ 7], 16, -155497632);
    b = md5_hh(b, c, d, a, x[i+10], 23, -1094730640);
    a = md5_hh(a, b, c, d, x[i+13], 4 ,  681279174);
    d = md5_hh(d, a, b, c, x[i+ 0], 11, -358537222);
    c = md5_hh(c, d, a, b, x[i+ 3], 16, -722521979);
    b = md5_hh(b, c, d, a, x[i+ 6], 23,  76029189);
    a = md5_hh(a, b, c, d, x[i+ 9], 4 , -640364487);
    d = md5_hh(d, a, b, c, x[i+12], 11, -421815835);
    c = md5_hh(c, d, a, b, x[i+15], 16,  530742520);
    b = md5_hh(b, c, d, a, x[i+ 2], 23, -995338651);

    a = md5_ii(a, b, c, d, x[i+ 0], 6 , -198630844);
    d = md5_ii(d, a, b, c, x[i+ 7], 10,  1126891415);
    c = md5_ii(c, d, a, b, x[i+14], 15, -1416354905);
    b = md5_ii(b, c, d, a, x[i+ 5], 21, -57434055);
    a = md5_ii(a, b, c, d, x[i+12], 6 ,  1700485571);
    d = md5_ii(d, a, b, c, x[i+ 3], 10, -1894986606);
    c = md5_ii(c, d, a, b, x[i+10], 15, -1051523);
    b = md5_ii(b, c, d, a, x[i+ 1], 21, -2054922799);
    a = md5_ii(a, b, c, d, x[i+ 8], 6 ,  1873313359);
    d = md5_ii(d, a, b, c, x[i+15], 10, -30611744);
    c = md5_ii(c, d, a, b, x[i+ 6], 15, -1560198380);
    b = md5_ii(b, c, d, a, x[i+13], 21,  1309151649);
    a = md5_ii(a, b, c, d, x[i+ 4], 6 , -145523070);
    d = md5_ii(d, a, b, c, x[i+11], 10, -1120210379);
    c = md5_ii(c, d, a, b, x[i+ 2], 15,  718787259);
    b = md5_ii(b, c, d, a, x[i+ 9], 21, -343485551);

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
  }
  return Array(a, b, c, d);

}

/*
 * These functions implement the four basic operations the algorithm uses.
 */
function md5_cmn(q, a, b, x, s, t)
{
  return safe_add(bit_rol(safe_add(safe_add(a, q), safe_add(x, t)), s),b);
}
function md5_ff(a, b, c, d, x, s, t)
{
  return md5_cmn((b & c) | ((~b) & d), a, b, x, s, t);
}
function md5_gg(a, b, c, d, x, s, t)
{
  return md5_cmn((b & d) | (c & (~d)), a, b, x, s, t);
}
function md5_hh(a, b, c, d, x, s, t)
{
  return md5_cmn(b ^ c ^ d, a, b, x, s, t);
}
function md5_ii(a, b, c, d, x, s, t)
{
  return md5_cmn(c ^ (b | (~d)), a, b, x, s, t);
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function bit_rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

module.exports = function md5(buf) {
  return helpers.hash(buf, core_md5, 16);
};

},{"./helpers":8}],11:[function(require,module,exports){
// Original code adapted from Robert Kieffer.
// details at https://github.com/broofa/node-uuid
(function() {
  var _global = this;

  var mathRNG, whatwgRNG;

  // NOTE: Math.random() does not guarantee "cryptographic quality"
  mathRNG = function(size) {
    var bytes = new Array(size);
    var r;

    for (var i = 0, r; i < size; i++) {
      if ((i & 0x03) == 0) r = Math.random() * 0x100000000;
      bytes[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return bytes;
  }

  if (_global.crypto && crypto.getRandomValues) {
    whatwgRNG = function(size) {
      var bytes = new Uint8Array(size);
      crypto.getRandomValues(bytes);
      return bytes;
    }
  }

  module.exports = whatwgRNG || mathRNG;

}())

},{}],12:[function(require,module,exports){
/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

var helpers = require('./helpers');

/*
 * Calculate the SHA-1 of an array of big-endian words, and a bit length
 */
function core_sha1(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;

  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    var olde = e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) w[j] = x[i + j];
      else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
                       safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
    e = safe_add(e, olde);
  }
  return Array(a, b, c, d, e);

}

/*
 * Perform the appropriate triplet combination function for the current
 * iteration
 */
function sha1_ft(t, b, c, d)
{
  if(t < 20) return (b & c) | ((~b) & d);
  if(t < 40) return b ^ c ^ d;
  if(t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

/*
 * Determine the appropriate additive constant for the current iteration
 */
function sha1_kt(t)
{
  return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
         (t < 60) ? -1894007588 : -899497514;
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

module.exports = function sha1(buf) {
  return helpers.hash(buf, core_sha1, 20, true);
};

},{"./helpers":8}],13:[function(require,module,exports){

/**
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-256, as defined
 * in FIPS 180-2
 * Version 2.2-beta Copyright Angel Marin, Paul Johnston 2000 - 2009.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 *
 */

var helpers = require('./helpers');

var safe_add = function(x, y) {
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
};

var S = function(X, n) {
  return (X >>> n) | (X << (32 - n));
};

var R = function(X, n) {
  return (X >>> n);
};

var Ch = function(x, y, z) {
  return ((x & y) ^ ((~x) & z));
};

var Maj = function(x, y, z) {
  return ((x & y) ^ (x & z) ^ (y & z));
};

var Sigma0256 = function(x) {
  return (S(x, 2) ^ S(x, 13) ^ S(x, 22));
};

var Sigma1256 = function(x) {
  return (S(x, 6) ^ S(x, 11) ^ S(x, 25));
};

var Gamma0256 = function(x) {
  return (S(x, 7) ^ S(x, 18) ^ R(x, 3));
};

var Gamma1256 = function(x) {
  return (S(x, 17) ^ S(x, 19) ^ R(x, 10));
};

var core_sha256 = function(m, l) {
  var K = new Array(0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0xFC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x6CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2);
  var HASH = new Array(0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19);
    var W = new Array(64);
    var a, b, c, d, e, f, g, h, i, j;
    var T1, T2;
  /* append padding */
  m[l >> 5] |= 0x80 << (24 - l % 32);
  m[((l + 64 >> 9) << 4) + 15] = l;
  for (var i = 0; i < m.length; i += 16) {
    a = HASH[0]; b = HASH[1]; c = HASH[2]; d = HASH[3]; e = HASH[4]; f = HASH[5]; g = HASH[6]; h = HASH[7];
    for (var j = 0; j < 64; j++) {
      if (j < 16) {
        W[j] = m[j + i];
      } else {
        W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);
      }
      T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
      T2 = safe_add(Sigma0256(a), Maj(a, b, c));
      h = g; g = f; f = e; e = safe_add(d, T1); d = c; c = b; b = a; a = safe_add(T1, T2);
    }
    HASH[0] = safe_add(a, HASH[0]); HASH[1] = safe_add(b, HASH[1]); HASH[2] = safe_add(c, HASH[2]); HASH[3] = safe_add(d, HASH[3]);
    HASH[4] = safe_add(e, HASH[4]); HASH[5] = safe_add(f, HASH[5]); HASH[6] = safe_add(g, HASH[6]); HASH[7] = safe_add(h, HASH[7]);
  }
  return HASH;
};

module.exports = function sha256(buf) {
  return helpers.hash(buf, core_sha256, 32, true);
};

},{"./helpers":8}],14:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],15:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],16:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require("oMfpAn"))
},{"oMfpAn":17}],17:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],18:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],19:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],20:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":18,"./encode":19}],21:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],22:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":21,"inherits":15,"oMfpAn":17}],23:[function(require,module,exports){
'use strict';

var util = require('util')
  , Element = require('./element').Element

function DOMElement(name, attrs) {
    Element.call(this, name, attrs)

    this.nodeType = 1
    this.nodeName = this.localName
}

util.inherits(DOMElement, Element)

DOMElement.prototype._getElement = function(name, attrs) {
    var element = new DOMElement(name, attrs)
    return element
}

Object.defineProperty(DOMElement.prototype, 'localName', {
    get: function () {
        return this.getName()
    }
})

Object.defineProperty(DOMElement.prototype, 'namespaceURI', {
    get: function () {
        return this.getNS()
    }
})

Object.defineProperty(DOMElement.prototype, 'parentNode', {
    get: function () {
        return this.parent
    }
})

Object.defineProperty(DOMElement.prototype, 'childNodes', {
    get: function () {
        return this.children
    }
})

Object.defineProperty(DOMElement.prototype, 'textContent', {
    get: function () {
        return this.getText()
    },
    set: function (value) {
        this.children.push(value)
    }
})

DOMElement.prototype.getElementsByTagName = function (name) {
    return this.getChildren(name)
}

DOMElement.prototype.getAttribute = function (name) {
    return this.getAttr(name)
}

DOMElement.prototype.setAttribute = function (name, value) {
    this.attr(name, value)
}

DOMElement.prototype.getAttributeNS = function (ns, name) {
    if (ns === 'http://www.w3.org/XML/1998/namespace') {
        return this.getAttr(['xml', name].join(':'))
    }
    return this.getAttr(name, ns)
}

DOMElement.prototype.setAttributeNS = function (ns, name, value) {
    var prefix
    if (ns === 'http://www.w3.org/XML/1998/namespace') {
        prefix = 'xml'
    } else {
        var nss = this.getXmlns()
        prefix = nss[ns] || ''
    }
    if (prefix) {
        this.attr([prefix, name].join(':'), value)
    }
}

DOMElement.prototype.removeAttribute = function (name) {
    this.attr(name, null)
}

DOMElement.prototype.removeAttributeNS = function (ns, name) {
    var prefix
    if (ns === 'http://www.w3.org/XML/1998/namespace') {
        prefix = 'xml'
    } else {
        var nss = this.getXmlns()
        prefix = nss[ns] || ''
    }
    if (prefix) {
        this.attr([prefix, name].join(':'), null)
    }
}

DOMElement.prototype.appendChild = function (el) {
    this.cnode(el)
}

DOMElement.prototype.removeChild = function (el) {
    this.remove(el)
}

module.exports = DOMElement

},{"./element":24,"util":22}],24:[function(require,module,exports){
'use strict';

/**
 * This cheap replica of DOM/Builder puts me to shame :-)
 *
 * Attributes are in the element.attrs object. Children is a list of
 * either other Elements or Strings for text content.
 **/
function Element(name, attrs) {
    this.name = name
    this.parent = null
    this.children = []
    this.setAttrs(attrs)
}

/*** Accessors ***/

/**
 * if (element.is('message', 'jabber:client')) ...
 **/
Element.prototype.is = function(name, xmlns) {
    return (this.getName() === name) &&
        (!xmlns || (this.getNS() === xmlns))
}

/* without prefix */
Element.prototype.getName = function() {
    if (this.name.indexOf(':') >= 0)
        return this.name.substr(this.name.indexOf(':') + 1)
    else
        return this.name
}

/**
 * retrieves the namespace of the current element, upwards recursively
 **/
Element.prototype.getNS = function() {
    if (this.name.indexOf(':') >= 0) {
        var prefix = this.name.substr(0, this.name.indexOf(':'))
        return this.findNS(prefix)
    } else {
        return this.findNS()
    }
}

/**
 * find the namespace to the given prefix, upwards recursively
 **/
Element.prototype.findNS = function(prefix) {
    if (!prefix) {
        /* default namespace */
        if (this.attrs.xmlns)
            return this.attrs.xmlns
        else if (this.parent)
            return this.parent.findNS()
    } else {
        /* prefixed namespace */
        var attr = 'xmlns:' + prefix
        if (this.attrs[attr])
            return this.attrs[attr]
        else if (this.parent)
            return this.parent.findNS(prefix)
    }
}

/**
 * Recursiverly gets all xmlns defined, in the form of {url:prefix}
 **/
Element.prototype.getXmlns = function() {
    var namespaces = {}

    if (this.parent)
        namespaces = this.parent.getXmlns()

    for (var attr in this.attrs) {
        var m = attr.match('xmlns:?(.*)')
        if (this.attrs.hasOwnProperty(attr) && m) {
            namespaces[this.attrs[attr]] = m[1]
        }
    }
    return namespaces
}

Element.prototype.setAttrs = function(attrs) {
    this.attrs = {}
    Object.keys(attrs || {}).forEach(function(key) {
        this.attrs[key] = attrs[key]
    }, this)
}

/**
 * xmlns can be null, returns the matching attribute.
 **/
Element.prototype.getAttr = function(name, xmlns) {
    if (!xmlns)
        return this.attrs[name]

    var namespaces = this.getXmlns()

    if (!namespaces[xmlns])
        return null

    return this.attrs[[namespaces[xmlns], name].join(':')]
}

/**
 * xmlns can be null
 **/
Element.prototype.getChild = function(name, xmlns) {
    return this.getChildren(name, xmlns)[0]
}

/**
 * xmlns can be null
 **/
Element.prototype.getChildren = function(name, xmlns) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (child.getName &&
            (child.getName() === name) &&
            (!xmlns || (child.getNS() === xmlns)))
            result.push(child)
    }
    return result
}

/**
 * xmlns and recursive can be null
 **/
Element.prototype.getChildByAttr = function(attr, val, xmlns, recursive) {
    return this.getChildrenByAttr(attr, val, xmlns, recursive)[0]
}

/**
 * xmlns and recursive can be null
 **/
Element.prototype.getChildrenByAttr = function(attr, val, xmlns, recursive) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (child.attrs &&
            (child.attrs[attr] === val) &&
            (!xmlns || (child.getNS() === xmlns)))
            result.push(child)
        if (recursive && child.getChildrenByAttr) {
            result.push(child.getChildrenByAttr(attr, val, xmlns, true))
        }
    }
    if (recursive) result = [].concat.apply([], result)
    return result
}

Element.prototype.getChildrenByFilter = function(filter, recursive) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (filter(child))
            result.push(child)
        if (recursive && child.getChildrenByFilter){
            result.push(child.getChildrenByFilter(filter, true))
        }
    }
    if (recursive) {
        result = [].concat.apply([], result)
    }
    return result
}

Element.prototype.getText = function() {
    var text = ''
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if ((typeof child === 'string') || (typeof child === 'number')) {
            text += child
        }
    }
    return text
}

Element.prototype.getChildText = function(name, xmlns) {
    var child = this.getChild(name, xmlns)
    return child ? child.getText() : null
}

/**
 * Return all direct descendents that are Elements.
 * This differs from `getChildren` in that it will exclude text nodes,
 * processing instructions, etc.
 */
Element.prototype.getChildElements = function() {
    return this.getChildrenByFilter(function(child) {
        return child instanceof Element
    })
}

/*** Builder ***/

/** returns uppermost parent */
Element.prototype.root = function() {
    if (this.parent)
        return this.parent.root()
    else
        return this
}
Element.prototype.tree = Element.prototype.root

/** just parent or itself */
Element.prototype.up = function() {
    if (this.parent)
        return this.parent
    else
        return this
}

Element.prototype._getElement = function(name, attrs) {
    var element = new Element(name, attrs)
    return element
}

/** create child node and return it */
Element.prototype.c = function(name, attrs) {
    return this.cnode(this._getElement(name, attrs))
}

Element.prototype.cnode = function(child) {
    this.children.push(child)
    child.parent = this
    return child
}

/** add text node and return element */
Element.prototype.t = function(text) {
    this.children.push(text)
    return this
}

/*** Manipulation ***/

/**
 * Either:
 *   el.remove(childEl)
 *   el.remove('author', 'urn:...')
 */
Element.prototype.remove = function(el, xmlns) {
    var filter
    if (typeof el === 'string') {
        /* 1st parameter is tag name */
        filter = function(child) {
            return !(child.is &&
                 child.is(el, xmlns))
        }
    } else {
        /* 1st parameter is element */
        filter = function(child) {
            return child !== el
        }
    }

    this.children = this.children.filter(filter)

    return this
}

/**
 * To use in case you want the same XML data for separate uses.
 * Please refrain from this practise unless you know what you are
 * doing. Building XML with ltx is easy!
 */
Element.prototype.clone = function() {
    var clone = this._getElement(this.name, this.attrs)
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        clone.cnode(child.clone ? child.clone() : child)
    }
    return clone
}

Element.prototype.text = function(val) {
    if (val && this.children.length === 1) {
        this.children[0] = val
        return this
    }
    return this.getText()
}

Element.prototype.attr = function(attr, val) {
    if (((typeof val !== 'undefined') || (val === null))) {
        if (!this.attrs) {
            this.attrs = {}
        }
        this.attrs[attr] = val
        return this
    }
    return this.attrs[attr]
}

/*** Serialization ***/

Element.prototype.toString = function() {
    var s = ''
    this.write(function(c) {
        s += c
    })
    return s
}

Element.prototype.toJSON = function() {
    return {
        name: this.name,
        attrs: this.attrs,
        children: this.children.map(function(child) {
            return child && child.toJSON ? child.toJSON() : child
        })
    }
}

Element.prototype._addChildren = function(writer) {
    writer('>')
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        /* Skip null/undefined */
        if (child || (child === 0)) {
            if (child.write) {
                child.write(writer)
            } else if (typeof child === 'string') {
                writer(escapeXmlText(child))
            } else if (child.toString) {
                writer(escapeXmlText(child.toString(10)))
            }
        }
    }
    writer('</')
    writer(this.name)
    writer('>')
}

Element.prototype.write = function(writer) {
    writer('<')
    writer(this.name)
    for (var k in this.attrs) {
        var v = this.attrs[k]
        if (v || (v === '') || (v === 0)) {
            writer(' ')
            writer(k)
            writer('="')
            if (typeof v !== 'string') {
                v = v.toString(10)
            }
            writer(escapeXml(v))
            writer('"')
        }
    }
    if (this.children.length === 0) {
        writer('/>')
    } else {
        this._addChildren(writer)
    }
}

function escapeXml(s) {
    return s.
        replace(/\&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;').
        replace(/"/g, '&quot;').
        replace(/"/g, '&apos;')
}

function escapeXmlText(s) {
    return s.
        replace(/\&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;')
}

exports.Element = Element
exports.escapeXml = escapeXml

},{}],25:[function(require,module,exports){
'use strict';

/* Cause browserify to bundle SAX parsers: */
var parse = require('./parse')

parse.availableSaxParsers.push(parse.bestSaxParser = require('./sax/sax_ltx'))

/* SHIM */
module.exports = require('./index')
},{"./index":26,"./parse":27,"./sax/sax_ltx":28}],26:[function(require,module,exports){
'use strict';

var parse = require('./parse')

/**
 * The only (relevant) data structure
 */
exports.Element = require('./dom-element')

/**
 * Helper
 */
exports.escapeXml = require('./element').escapeXml

/**
 * DOM parser interface
 */
exports.parse = parse.parse
exports.Parser = parse.Parser

/**
 * SAX parser interface
 */
exports.availableSaxParsers = parse.availableSaxParsers
exports.bestSaxParser = parse.bestSaxParser

},{"./dom-element":23,"./element":24,"./parse":27}],27:[function(require,module,exports){
'use strict';

var events = require('events')
  , util = require('util')
  , DOMElement = require('./dom-element')


exports.availableSaxParsers = []
exports.bestSaxParser = null

var saxParsers = [
    './sax/sax_expat.js',
    './sax/sax_ltx.js',
    /*'./sax_easysax.js', './sax_node-xml.js',*/
    './sax/sax_saxjs.js'
]

saxParsers.forEach(function(modName) {
    var mod
    try {
        mod = require(modName)
    } catch (e) {
        /* Silently missing libraries drop for debug:
        console.error(e.stack || e)
         */
    }
    if (mod) {
        exports.availableSaxParsers.push(mod)
        if (!exports.bestSaxParser) {
            exports.bestSaxParser = mod
        }
    }
})

exports.Parser = function(saxParser) {
    events.EventEmitter.call(this)
    var self = this

    var ParserMod = saxParser || exports.bestSaxParser
    if (!ParserMod) {
        throw new Error('No SAX parser available')
    }
    this.parser = new ParserMod()

    var el
    this.parser.addListener('startElement', function(name, attrs) {
        var child = new DOMElement(name, attrs)
        if (!el) {
            el = child
        } else {
            el = el.cnode(child)
        }
    })
    this.parser.addListener('endElement', function(name) {
        /* jshint -W035 */
        if (!el) {
            /* Err */
        } else if (name === el.name) {
            if (el.parent) {
                el = el.parent
            } else if (!self.tree) {
                self.tree = el
                el = undefined
            }
        }
        /* jshint +W035 */
    })
    this.parser.addListener('text', function(str) {
        if (el) {
            el.t(str)
        }
    })
    this.parser.addListener('error', function(e) {
        self.error = e
        self.emit('error', e)
    })
}

util.inherits(exports.Parser, events.EventEmitter)

exports.Parser.prototype.write = function(data) {
    this.parser.write(data)
}

exports.Parser.prototype.end = function(data) {
    this.parser.end(data)

    if (!this.error) {
        if (this.tree) {
            this.emit('tree', this.tree)
        } else {
            this.emit('error', new Error('Incomplete document'))
        }
    }
}

exports.parse = function(data, saxParser) {
    var p = new exports.Parser(saxParser)
    var result = null
      , error = null

    p.on('tree', function(tree) {
        result = tree
    })
    p.on('error', function(e) {
        error = e
    })

    p.write(data)
    p.end()

    if (error) {
        throw error
    } else {
        return result
    }
}

},{"./dom-element":23,"events":14,"util":22}],28:[function(require,module,exports){
'use strict';

var util = require('util')
  , events = require('events')

var STATE_TEXT = 0,
    STATE_IGNORE_TAG = 1,
    STATE_TAG_NAME = 2,
    STATE_TAG = 3,
    STATE_ATTR_NAME = 4,
    STATE_ATTR_EQ = 5,
    STATE_ATTR_QUOT = 6,
    STATE_ATTR_VALUE = 7

var SaxLtx = module.exports = function SaxLtx() {
    events.EventEmitter.call(this)

    var state = STATE_TEXT, remainder
    var tagName, attrs, endTag, selfClosing, attrQuote
    var recordStart = 0
    var attrName

    this._handleTagOpening = function(endTag, tagName, attrs) {
        if (!endTag) {
            this.emit('startElement', tagName, attrs)
            if (selfClosing) {
                this.emit('endElement', tagName)
            }
        } else {
            this.emit('endElement', tagName)
        }
    }

    this.write = function(data) {
        /* jshint -W071 */
        /* jshint -W074 */
        if (typeof data !== 'string') {
            data = data.toString()
        }
        var pos = 0

        /* Anything from previous write()? */
        if (remainder) {
            data = remainder + data
            pos += remainder.length
            remainder = null
        }

        function endRecording() {
            if (typeof recordStart === 'number') {
                var recorded = data.slice(recordStart, pos)
                recordStart = undefined
                return recorded
            }
        }

        for(; pos < data.length; pos++) {
            var c = data.charCodeAt(pos)
            //console.log("state", state, "c", c, data[pos])
            switch(state) {
            case STATE_TEXT:
                if (c === 60 /* < */) {
                    var text = endRecording()
                    if (text) {
                        this.emit('text', unescapeXml(text))
                    }
                    state = STATE_TAG_NAME
                    recordStart = pos + 1
                    attrs = {}
                }
                break
            case STATE_TAG_NAME:
                if (c === 47 /* / */ && recordStart === pos) {
                    recordStart = pos + 1
                    endTag = true
                } else if (c === 33 /* ! */ || c === 63 /* ? */) {
                    recordStart = undefined
                    state = STATE_IGNORE_TAG
                } else if (c <= 32 || c === 47 /* / */ || c === 62 /* > */) {
                    tagName = endRecording()
                    pos--
                    state = STATE_TAG
                }
                break
            case STATE_IGNORE_TAG:
                if (c === 62 /* > */) {
                    state = STATE_TEXT
                }
                break
            case STATE_TAG:
                if (c === 62 /* > */) {
                    this._handleTagOpening(endTag, tagName, attrs)
                    tagName = undefined
                    attrs = undefined
                    endTag = undefined
                    selfClosing = undefined
                    state = STATE_TEXT
                    recordStart = pos + 1
                } else if (c === 47 /* / */) {
                    selfClosing = true
                } else if (c > 32) {
                    recordStart = pos
                    state = STATE_ATTR_NAME
                }
                break
            case STATE_ATTR_NAME:
                if (c <= 32 || c === 61 /* = */) {
                    attrName = endRecording()
                    pos--
                    state = STATE_ATTR_EQ
                }
                break
            case STATE_ATTR_EQ:
                if (c === 61 /* = */) {
                    state = STATE_ATTR_QUOT
                }
                break
            case STATE_ATTR_QUOT:
                if (c === 34 /* " */ || c === 39 /* ' */) {
                    attrQuote = c
                    state = STATE_ATTR_VALUE
                    recordStart = pos + 1
                }
                break
            case STATE_ATTR_VALUE:
                if (c === attrQuote) {
                    var value = unescapeXml(endRecording())
                    attrs[attrName] = value
                    attrName = undefined
                    state = STATE_TAG
                }
                break
            }
        }

        if (typeof recordStart === 'number' &&
            recordStart <= data.length) {

            remainder = data.slice(recordStart)
            recordStart = 0
        }
    }

    /*var origEmit = this.emit
    this.emit = function() {
    console.log('ltx', arguments)
    origEmit.apply(this, arguments)
    }*/
}
util.inherits(SaxLtx, events.EventEmitter)


SaxLtx.prototype.end = function(data) {
    if (data) {
        this.write(data)
    }

    /* Uh, yeah */
    this.write = function() {}
}

function unescapeXml(s) {
    return s.
        replace(/\&(amp|#38);/g, '&').
        replace(/\&(lt|#60);/g, '<').
        replace(/\&(gt|#62);/g, '>').
        replace(/\&(quot|#34);/g, '"').
        replace(/\&(apos|#39);/g, '\'').
        replace(/\&(nbsp|#160);/g, '\n')
}

},{"events":14,"util":22}],29:[function(require,module,exports){
(function (__dirname){
'use strict';

var Session = require('./lib/session')
  , Connection = require('node-xmpp-core').Connection
  , JID = require('node-xmpp-core').JID
  , Stanza = require ('node-xmpp-core').Stanza
  , sasl = require('./lib/sasl')
  , Anonymous = require('./lib/authentication/anonymous')
  , Plain = require('./lib/authentication/plain')
  , DigestMD5 = require('./lib/authentication/digestmd5')
  , XOAuth2 = require('./lib/authentication/xoauth2')
  , XFacebookPlatform = require('./lib/authentication/xfacebook')
  , External = require('./lib/authentication/external')
  , exec = require('child_process').exec
  , util = require('util')
  , debug = require('debug')('xmpp:client')
  , ltx = require('node-xmpp-core').ltx

var NS_CLIENT = 'jabber:client'
var NS_REGISTER = 'jabber:iq:register'
var NS_XMPP_SASL = 'urn:ietf:params:xml:ns:xmpp-sasl'
var NS_XMPP_BIND = 'urn:ietf:params:xml:ns:xmpp-bind'
var NS_XMPP_SESSION = 'urn:ietf:params:xml:ns:xmpp-session'

var STATE_PREAUTH = 0
  , STATE_AUTH = 1
  , STATE_AUTHED = 2
  , STATE_BIND = 3
  , STATE_SESSION = 4
  , STATE_ONLINE = 5

var IQID_SESSION = 'sess'
  , IQID_BIND = 'bind'

/* jshint latedef: false */
/* jshint -W079 */
/* jshint -W020 */
var decode64, encode64, Buffer
if (typeof btoa === 'undefined') {
    var btoa = null
    var atob = null
}

if (typeof btoa === 'function') {
    decode64 = function(encoded) {
        return atob(encoded)
    }
} else {
    Buffer = require('buffer').Buffer
    decode64 = function(encoded) {
        return (new Buffer(encoded, 'base64')).toString('utf8')
    }
}
if (typeof atob === 'function') {
    encode64 = function(decoded) {
        return btoa(decoded)
    }
} else {
    Buffer = require('buffer').Buffer
    encode64 = function(decoded) {
        return (new Buffer(decoded, 'utf8')).toString('base64')
    }
}

/**
 * params object:
 *   jid: String (required)
 *   password: String (required)
 *   host: String (optional)
 *   port: Number (optional)
 *   reconnect: Boolean (optional)
 *   autostart: Boolean (optional) - if we start connecting to a given port
 *   register: Boolean (option) - register account before authentication
 *   legacySSL: Boolean (optional) - connect to the legacy SSL port, requires at least the host to be specified
 *   credentials: Dictionary (optional) - TLS or SSL key and certificate credentials
 *   actAs: String (optional) - if admin user act on behalf of another user (just user)
 *   disallowTLS: Boolean (optional) - prevent upgrading the connection to a secure one via TLS
 *   preferred: String (optional) - Preferred SASL mechanism to use
 *   bosh.url: String (optional) - BOSH endpoint to use
 *   bosh.prebind: Function(error, data) (optional) - Just prebind a new BOSH session for browser client use
 *            error String - Result of XMPP error. Ex : [Error: XMPP authentication failure]
 *            data Object - Result of XMPP BOSH connection.
 *
 * Examples:
 *   var cl = new xmpp.Client({
 *       jid: "me@example.com",
 *       password: "secret"
 *   })
 *   var facebook = new xmpp.Client({
 *       jid: '-' + fbUID + '@chat.facebook.com',
 *       api_key: '54321', // api key of your facebook app
 *       access_token: 'abcdefg', // user access token
 *       host: 'chat.facebook.com'
 *   })
 *   var gtalk = new xmpp.Client({
 *       jid: 'me@gmail.com',
 *       oauth2_token: 'xxxx.xxxxxxxxxxx', // from OAuth2
 *       oauth2_auth: 'http://www.google.com/talk/protocol/auth',
 *       host: 'talk.google.com'
 *   })
 *   var prebind = new xmpp.Client({
 *       jid: "me@example.com",
 *       password: "secret",
 *       bosh: {
 *           url: "http://example.com/http-bind",
 *           prebind: function(error, data) {
 *               if (error) {}
 *               res.send({ rid: data.rid, sid: data.sid })
 *           }
 *       }
 *   })
 *
 * Example SASL EXTERNAL:
 *
 * var myCredentials = {
 *   // These are necessary only if using the client certificate authentication
 *   key: fs.readFileSync('key.pem'),
 *   cert: fs.readFileSync('cert.pem'),
 *   // passphrase: 'optional'
 * }
 * var cl = new xmppClient({
 *     jid: "me@example.com",
 *     credentials: myCredentials
 *     preferred: 'EXTERNAL' // not really required, but possible
 * })
 *
 */
function Client(options) {
    this.options = {}
    if (options) this.options = options
    this.availableSaslMechanisms = [
        XOAuth2, XFacebookPlatform, External, DigestMD5, Plain, Anonymous
    ]

    if (this.options.autostart !== false)
        this.connect()
}

util.inherits(Client, Session)

Client.NS_CLIENT = NS_CLIENT

Client.prototype.connect = function() {
    if (this.options.bosh && this.options.bosh.prebind) {
        debug('load bosh prebind')
        var cb = this.options.bosh.prebind
        delete this.options.bosh.prebind
        var cmd = 'node ' + __dirname +
            '/lib/prebind.js '
        delete this.options.bosh.prebind
        cmd += encodeURI(JSON.stringify(this.options))
        exec(
            cmd,
            function (error, stdout, stderr) {
                if (error) {
                    cb(error, null)
                } else {
                    var r = stdout.match(/rid:+[ 0-9]*/i)
                    r = (r[0].split(':'))[1].trim()
                    var s = stdout.match(/sid:+[ a-z+'"-_A-Z+0-9]*/i)
                    s = (s[0].split(':'))[1]
                        .replace('\'','')
                        .replace('\'','')
                        .trim()
                    if (r && s) {
                        return cb(null, { rid: r, sid: s })
                    }
                    cb(stderr)
                }
            }
        )
    } else {
        this.options.xmlns = NS_CLIENT
        /* jshint camelcase: false */
        delete this.did_bind
        delete this.did_session

        this.state = STATE_PREAUTH
        this.on('end', function() {
            this.state = STATE_PREAUTH
            delete this.did_bind
            delete this.did_session
        })

        Session.call(this, this.options)
        this.options.jid = this.jid

        this.connection.on('disconnect', function(error) {
            this.state = STATE_PREAUTH
            if (!this.connection.reconnect) {
                if (error) this.emit('error', error)
                this.emit('offline')
            }
            delete this.did_bind
            delete this.did_session
        }.bind(this))

        // If server and client have multiple possible auth mechanisms
        // we try to select the preferred one
        if (this.options.preferred) {
            this.preferredSaslMechanism = this.options.preferred
        } else {
            this.preferredSaslMechanism = 'DIGEST-MD5'
        }

        var mechs = sasl.detectMechanisms(this.options, this.availableSaslMechanisms)
        this.availableSaslMechanisms = mechs
    }
}

Client.prototype.onStanza = function(stanza) {
    /* Actually, we shouldn't wait for <stream:features/> if
       this.streamAttrs.version is missing, but who uses pre-XMPP-1.0
       these days anyway? */
    if ((this.state !== STATE_ONLINE) && stanza.is('features')) {
        this.streamFeatures = stanza
        this.useFeatures()
    } else if (this.state === STATE_PREAUTH) {
        this.emit('stanza:preauth', stanza)
    } else if (this.state === STATE_AUTH) {
        this._handleAuthState(stanza)
    } else if ((this.state === STATE_BIND) && stanza.is('iq') && (stanza.attrs.id === IQID_BIND)) {
        this._handleBindState(stanza)
    } else if ((this.state === STATE_SESSION) && (true === stanza.is('iq')) &&
        (stanza.attrs.id === IQID_SESSION)) {
        this._handleSessionState(stanza)
    } else if (stanza.name === 'stream:error') {
        if (!this.reconnect)
            this.emit('error', stanza)
    } else if (this.state === STATE_ONLINE) {
        this.emit('stanza', stanza)
    }
}

Client.prototype._handleSessionState = function(stanza) {
    if (stanza.attrs.type === 'result') {
        this.state = STATE_AUTHED
        /* jshint camelcase: false */
        this.did_session = true

        /* no stream restart, but next feature (most probably
           we'll go online next) */
        this.useFeatures()
    } else {
        this.emit('error', 'Cannot bind resource')
    }
}

Client.prototype._handleBindState = function(stanza) {
    if (stanza.attrs.type === 'result') {
        this.state = STATE_AUTHED
        /*jshint camelcase: false */
        this.did_bind = true

        var bindEl = stanza.getChild('bind', NS_XMPP_BIND)
        if (bindEl && bindEl.getChild('jid')) {
            this.jid = new JID(bindEl.getChild('jid').getText())
        }

        /* no stream restart, but next feature */
        this.useFeatures()
    } else {
        this.emit('error', 'Cannot bind resource')
    }
}

Client.prototype._handleAuthState = function(stanza) {
    if (stanza.is('challenge', NS_XMPP_SASL)) {
        var challengeMsg = decode64(stanza.getText())
        var responseMsg = encode64(this.mech.challenge(challengeMsg))
        var response = new Stanza.Element(
            'response', { xmlns: NS_XMPP_SASL }
        ).t(responseMsg)
        this.send(response)
    } else if (stanza.is('success', NS_XMPP_SASL)) {
        this.mech = null
        this.state = STATE_AUTHED
        this.emit('auth')
    } else {
        this.emit('error', 'XMPP authentication failure')
    }
}

Client.prototype._handlePreAuthState = function() {
    this.state = STATE_AUTH
    var offeredMechs = this.streamFeatures.
        getChild('mechanisms', NS_XMPP_SASL).
        getChildren('mechanism', NS_XMPP_SASL).
        map(function(el) { return el.getText() })
    this.mech = sasl.selectMechanism(
        offeredMechs,
        this.preferredSaslMechanism,
        this.availableSaslMechanisms
    )
    if (this.mech) {
        this.mech.authzid = this.jid.bare().toString()
        this.mech.authcid = this.jid.user
        this.mech.password = this.password
        /*jshint camelcase: false */
        this.mech.api_key = this.api_key
        this.mech.access_token = this.access_token
        this.mech.oauth2_token = this.oauth2_token
        this.mech.oauth2_auth = this.oauth2_auth
        this.mech.realm = this.jid.domain  // anything?
        if (this.actAs) this.mech.actAs = this.actAs.user
        this.mech.digest_uri = 'xmpp/' + this.jid.domain
        var authMsg = encode64(this.mech.auth())
        var attrs = this.mech.authAttrs()
        attrs.xmlns = NS_XMPP_SASL
        attrs.mechanism = this.mech.name
        this.send(new Stanza.Element('auth', attrs)
            .t(authMsg))
    } else {
        this.emit('error', 'No usable SASL mechanism')
    }
}

/**
 * Either we just received <stream:features/>, or we just enabled a
 * feature and are looking for the next.
 */
Client.prototype.useFeatures = function() {
    /* jshint camelcase: false */
    if ((this.state === STATE_PREAUTH) && this.register) {
        delete this.register
        this.doRegister()
    } else if ((this.state === STATE_PREAUTH) &&
        this.streamFeatures.getChild('mechanisms', NS_XMPP_SASL)) {
        this._handlePreAuthState()
    } else if ((this.state === STATE_AUTHED) &&
               !this.did_bind &&
               this.streamFeatures.getChild('bind', NS_XMPP_BIND)) {
        this.state = STATE_BIND
        var bindEl = new Stanza.Element(
            'iq',
            { type: 'set', id: IQID_BIND }
        ).c('bind', { xmlns: NS_XMPP_BIND })
        if (this.jid.resource)
            bindEl.c('resource').t(this.jid.resource)
        this.send(bindEl)
    } else if ((this.state === STATE_AUTHED) &&
               !this.did_session &&
               this.streamFeatures.getChild('session', NS_XMPP_SESSION)) {
        this.state = STATE_SESSION
        var stanza = new Stanza.Element(
          'iq',
          { type: 'set', to: this.jid.domain, id: IQID_SESSION  }
        ).c('session', { xmlns: NS_XMPP_SESSION })
        this.send(stanza)
    } else if (this.state === STATE_AUTHED) {
        /* Ok, we're authenticated and all features have been
           processed */
        this.state = STATE_ONLINE
        this.emit('online', { jid: this.jid })
    }
}

Client.prototype.doRegister = function() {
    var id = 'register' + Math.ceil(Math.random() * 99999)
    var iq = new Stanza.Element(
        'iq',
        { type: 'set', id: id, to: this.jid.domain }
    ).c('query', { xmlns: NS_REGISTER })
    .c('username').t(this.jid.user).up()
    .c('password').t(this.password)
    this.send(iq)

    var self = this
    var onReply = function(reply) {
        if (reply.is('iq') && (reply.attrs.id === id)) {
            self.removeListener('stanza', onReply)

            if (reply.attrs.type === 'result') {
                /* Registration successful, proceed to auth */
                self.useFeatures()
            } else {
                self.emit('error', new Error('Registration error'))
            }
        }
    }
    this.on('stanza:preauth', onReply)
}

/**
 * returns all registered sasl mechanisms
 */
Client.prototype.getSaslMechanisms = function() {
    return this.availableSaslMechanisms
}

/**
 * removes all registered sasl mechanisms
 */
Client.prototype.clearSaslMechanism = function() {
    this.availableSaslMechanisms = []
}

/**
 * register a new sasl mechanism
 */
Client.prototype.registerSaslMechanism = function(method) {
    // check if method is registered
    if (this.availableSaslMechanisms.indexOf(method) === -1 ) {
        this.availableSaslMechanisms.push(method)
    }
}

/**
 * unregister an existing sasl mechanism
 */
Client.prototype.unregisterSaslMechanism = function(method) {
    // check if method is registered
    var index = this.availableSaslMechanisms.indexOf(method)
    if (index >= 0) {
        this.availableSaslMechanisms = this.availableSaslMechanisms.splice(index, 1)
    }
}

Client.SASL = sasl
Client.Client = Client
Client.Stanza = Stanza
Client.ltx = ltx
module.exports = Client
}).call(this,"/../../node_modules/node-xmpp-client")
},{"./lib/authentication/anonymous":30,"./lib/authentication/digestmd5":31,"./lib/authentication/external":32,"./lib/authentication/plain":34,"./lib/authentication/xfacebook":35,"./lib/authentication/xoauth2":36,"./lib/sasl":38,"./lib/session":39,"buffer":5,"child_process":3,"debug":42,"node-xmpp-core":45,"util":22}],30:[function(require,module,exports){
'use strict';

var util = require('util')
  , Mechanism = require('./mechanism')

/**
 * @see http://tools.ietf.org/html/rfc4505
 * @see http://xmpp.org/extensions/xep-0175.html
 */
function Anonymous() {}

util.inherits(Anonymous, Mechanism)

Anonymous.prototype.name = 'ANONYMOUS'

Anonymous.prototype.auth = function() {
    return this.authzid
};

Anonymous.prototype.match = function() {
    return true
}

module.exports = Anonymous
},{"./mechanism":33,"util":22}],31:[function(require,module,exports){
'use strict';

var util = require('util')
  , crypto = require('crypto')
  , Mechanism = require('./mechanism')


/**
 * Hash a string
 */
function md5(s, encoding) {
    var hash = crypto.createHash('md5')
    hash.update(s)
    return hash.digest(encoding || 'binary')
}
function md5Hex(s) {
    return md5(s, 'hex')
}

/**
 * Parse SASL serialization
 */
function parseDict(s) {
    var result = {}
    while (s) {
        var m
        if ((m = /^(.+?)=(.*?[^\\]),\s*(.*)/.exec(s))) {
            result[m[1]] = m[2].replace(/\"/g, '')
            s = m[3]
        } else if ((m = /^(.+?)=(.+?),\s*(.*)/.exec(s))) {
            result[m[1]] = m[2]
            s = m[3]
        } else if ((m = /^(.+?)="(.*?[^\\])"$/.exec(s))) {
            result[m[1]] = m[2]
            s = m[3]
        } else if ((m = /^(.+?)=(.+?)$/.exec(s))) {
            result[m[1]] = m[2]
            s = m[3]
        } else {
            s = null
        }
    }
    return result
}

/**
 * SASL serialization
 */
function encodeDict(dict) {
    var s = ''
    for (var k in dict) {
        var v = dict[k]
        if (v) s += ',' + k + '="' + v + '"'
    }
    return s.substr(1) // without first ','
}

/**
 * Right-justify a string,
 * eg. pad with 0s
 */
function rjust(s, targetLen, padding) {
    while (s.length < targetLen)
        s = padding + s
    return s
}

/**
 * Generate a string of 8 digits
 * (number used once)
 */
function generateNonce() {
    var result = ''
    for (var i = 0; i < 8; i++)
        result += String.fromCharCode(48 +
            Math.ceil(Math.random() * 10))
    return result
}

/**
 * @see http://tools.ietf.org/html/rfc2831
 * @see http://wiki.xmpp.org/web/SASLandDIGEST-MD5
 */
function DigestMD5() {
    /*jshint camelcase: false */
    this.nonce_count = 0
    this.cnonce = generateNonce()
    this.authcid = null
    this.actAs = null
    this.realm = null
    this.password = null
}

util.inherits(DigestMD5, Mechanism)

DigestMD5.prototype.name = 'DIGEST-MD5'

DigestMD5.prototype.auth = function() {
    return ''
}

DigestMD5.prototype.getNC = function() {
    /*jshint camelcase: false */
    return rjust(this.nonce_count.toString(), 8, '0')
}

DigestMD5.prototype.responseValue = function(s) {
    var dict = parseDict(s)
    if (dict.realm)
        this.realm = dict.realm

    var value
    /*jshint camelcase: false */
    if (dict.nonce && dict.qop) {
        this.nonce_count++
        var a1 = md5(this.authcid + ':' +
            this.realm + ':' +
            this.password) + ':' +
            dict.nonce + ':' +
            this.cnonce
        if (this.actAs) a1 += ':' + this.actAs

        var a2 = 'AUTHENTICATE:' + this.digest_uri
        if ((dict.qop === 'auth-int') || (dict.qop === 'auth-conf'))
            a2 += ':00000000000000000000000000000000'

        value = md5Hex(md5Hex(a1) + ':' +
            dict.nonce + ':' +
            this.getNC() + ':' +
            this.cnonce + ':' +
            dict.qop + ':' +
            md5Hex(a2))
    }
    return value
}

DigestMD5.prototype.challenge = function(s) {
    var dict = parseDict(s)
    if (dict.realm)
        this.realm = dict.realm

    var response
    /*jshint camelcase: false */
    if (dict.nonce && dict.qop) {
        var responseValue = this.responseValue(s)
        response = {
            username: this.authcid,
            realm: this.realm,
            nonce: dict.nonce,
            cnonce: this.cnonce,
            nc: this.getNC(),
            qop: dict.qop,
            'digest-uri': this.digest_uri,
            response: responseValue,
            charset: 'utf-8'
        }
        if (this.actAs) response.authzid = this.actAs
    } else if (dict.rspauth) {
        return ''
    }
    return encodeDict(response)
}

DigestMD5.prototype.serverChallenge = function() {
    var dict = {}
    dict.realm = ''
    this.nonce = dict.nonce = generateNonce()
    dict.qop = 'auth'
    this.charset = dict.charset = 'utf-8'
    dict.algorithm = 'md5-sess'
    return encodeDict(dict)
}

// Used on the server to check for auth!
DigestMD5.prototype.response = function(s) {
    var dict = parseDict(s)
    this.authcid = dict.username

    if (dict.nonce !== this.nonce) return false
    if (!dict.cnonce) return false

    this.cnonce = dict.cnonce
    if (this.charset !== dict.charset) return false

    this.response = dict.response
    return true
}

DigestMD5.prototype.match = function(options) {
    if (options.password) return true
    return false
}

module.exports = DigestMD5

},{"./mechanism":33,"crypto":9,"util":22}],32:[function(require,module,exports){
'use strict';

var util = require('util')
  , Mechanism = require('./mechanism')

/**
 * @see http://xmpp.org/extensions/xep-0178.html
 */
function External() {}

util.inherits(External, Mechanism)

External.prototype.name = 'EXTERNAL'

External.prototype.auth = function() {
    return (this.authzid)
}

External.prototype.match = function(options) {
    if (options.credentials) return true
    return false
}

module.exports = External
},{"./mechanism":33,"util":22}],33:[function(require,module,exports){
'use strict';

/**
 * Each implemented mechanism offers multiple methods
 * - name : name of the auth method
 * - auth :
 * - match: checks if the client has enough options to
 *          offer this mechanis to xmpp servers
 * - authServer: takes a stanza and extracts the information
 */

var util = require('util')
  , EventEmitter = require('events').EventEmitter

// Mechanisms
function Mechanism() {}

util.inherits(Mechanism, EventEmitter)

Mechanism.prototype.authAttrs = function() {
    return {}
}

module.exports = Mechanism
},{"events":14,"util":22}],34:[function(require,module,exports){
'use strict';

var util = require('util')
  , Mechanism = require('./mechanism')

function Plain() {}

util.inherits(Plain, Mechanism)

Plain.prototype.name = 'PLAIN'

Plain.prototype.auth = function() {
    return this.authzid + '\0' +
        this.authcid + '\0' +
        this.password;
}

Plain.prototype.match = function(options) {
    if (options.password) return true
    return false
}

module.exports = Plain
},{"./mechanism":33,"util":22}],35:[function(require,module,exports){
'use strict';

var util = require('util')
  , Mechanism = require('./mechanism')
  , querystring = require('querystring')

/**
 * @see https://developers.facebook.com/docs/chat/#platauth
 */
var XFacebookPlatform = function() {}

util.inherits(XFacebookPlatform, Mechanism)

XFacebookPlatform.prototype.name = 'X-FACEBOOK-PLATFORM'
XFacebookPlatform.prototype.host = 'chat.facebook.com'

XFacebookPlatform.prototype.auth = function() {
    return ''
}

XFacebookPlatform.prototype.challenge = function(s) {
    var dict = querystring.parse(s)

    /*jshint camelcase: false */
    var response = {
        api_key: this.api_key,
        call_id: new Date().getTime(),
        method: dict.method,
        nonce: dict.nonce,
        access_token: this.access_token,
        v: '1.0'
    }

    return querystring.stringify(response)
}

XFacebookPlatform.prototype.match = function(options) {
    var host = XFacebookPlatform.prototype.host
    if ((options.host === host) ||
        (options.jid && (options.jid.getDomain() === host))) {
        return true
    }
    return false
}

module.exports = XFacebookPlatform
},{"./mechanism":33,"querystring":20,"util":22}],36:[function(require,module,exports){
'use strict';

var util = require('util')
  , Mechanism = require('./mechanism')

/**
 * @see https://developers.google.com/talk/jep_extensions/oauth
 */
/*jshint camelcase: false */
function XOAuth2() {
    this.oauth2_auth = null
    this.authzid = null
}

util.inherits(XOAuth2, Mechanism)

XOAuth2.prototype.name = 'X-OAUTH2'
XOAuth2.prototype.NS_GOOGLE_AUTH = 'http://www.google.com/talk/protocol/auth'

XOAuth2.prototype.auth = function() {
    return '\0' + this.authzid + '\0' + this.oauth2_token
}

XOAuth2.prototype.authAttrs = function() {
    return {
        'auth:service': 'oauth2',
        'xmlns:auth': this.oauth2_auth
    }
}

XOAuth2.prototype.match = function(options) {
    return (options.oauth2_auth === XOAuth2.prototype.NS_GOOGLE_AUTH)
}

module.exports = XOAuth2

},{"./mechanism":33,"util":22}],37:[function(require,module,exports){
(function (process){
'use strict';

var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , request = require('request')
  , ltx = require('node-xmpp-core').ltx
  , debug = require('debug')('xmpp:client:bosh')

function BOSHConnection(opts) {
    var that = this
    EventEmitter.call(this)

    this.boshURL = opts.bosh.url
    this.jid = opts.jid
    this.wait = opts.wait;
    this.xmlnsAttrs = {
        xmlns: 'http://jabber.org/protocol/httpbind',
        'xmlns:xmpp': 'urn:xmpp:xbosh',
        'xmlns:stream': 'http://etherx.jabber.org/streams'
    }
    if (opts.xmlns) {
        for (var prefix in opts.xmlns) {
            if (prefix) {
                this.xmlnsAttrs['xmlns:' + prefix] = opts.xmlns[prefix]
            } else {
                this.xmlnsAttrs.xmlns = opts.xmlns[prefix]
            }
        }
    }
    this.currentRequests = 0
    this.queue = []
    this.rid = Math.ceil(Math.random() * 9999999999)

    this.request({
            to: this.jid.domain,
            ver: '1.6',
            wait: this.wait,
            hold: '1',
            content: this.contentType
        },
        [],
        function(err, bodyEl) {
            if (err) {
                that.emit('error', err)
            } else if (bodyEl && bodyEl.attrs) {
                that.sid = bodyEl.attrs.sid
                that.maxRequests = parseInt(bodyEl.attrs.requests, 10) || 2
                if (that.sid && (that.maxRequests > 0)) {
                    that.emit('connect')
                    that.processResponse(bodyEl)
                    process.nextTick(that.mayRequest.bind(that))
                } else {
                    that.emit('error', 'Invalid parameters')
                }
            }
        })
}

util.inherits(BOSHConnection, EventEmitter)

BOSHConnection.prototype.contentType = 'text/xml charset=utf-8'

BOSHConnection.prototype.send = function(stanza) {
    this.queue.push(stanza.root())
    process.nextTick(this.mayRequest.bind(this))
}

BOSHConnection.prototype.processResponse = function(bodyEl) {
    debug('process bosh server response ' + bodyEl.toString())
    if (bodyEl && bodyEl.children) {
        for(var i = 0; i < bodyEl.children.length; i++) {
            var child = bodyEl.children[i]
            if (child.name && child.attrs && child.children)
                this.emit('stanza', child)
        }
    }
    if (bodyEl && (bodyEl.attrs.type === 'terminate')) {
        if (!this.shutdown || bodyEl.attrs.condition)
            this.emit('error',
                      new Error(bodyEl.attrs.condition || 'Session terminated'))
        this.emit('disconnect')
        this.emit('end')
        this.emit('close')
    }
}

BOSHConnection.prototype.mayRequest = function() {
    var canRequest =
        /* Must have a session already */
        this.sid &&
        /* We can only receive when one request is in flight */
        ((this.currentRequests === 0) ||
         /* Is there something to send, and are we allowed? */
         (((this.queue.length > 0) && (this.currentRequests < this.maxRequests)))
        )

    if (!canRequest) return

    var stanzas = this.queue
    this.queue = []
    this.rid++
    this.request({}, stanzas, function(err, bodyEl) {
        if (err) {
            this.emit('error', err)
            this.emit('disconnect')
            this.emit('end')
            delete this.sid
            this.emit('close')
        } else {
            if (bodyEl) this.processResponse(bodyEl)

            process.nextTick(this.mayRequest.bind(this))
        }
    }.bind(this))
}

BOSHConnection.prototype.end = function(stanzas) {
    stanzas = stanzas || []
    if (typeof stanzas !== Array) stanzas = [stanzas]

    stanzas = this.queue.concat(stanzas)
    this.shutdown = true
    this.queue = []
    this.rid++
    this.request({ type: 'terminate' }, stanzas, function(err, bodyEl) {
        if (bodyEl) this.processResponse(bodyEl)

        this.emit('disconnect')
        this.emit('end')
        delete this.sid
        this.emit('close')
    }.bind(this))
}

BOSHConnection.prototype.maxHTTPRetries = 5

BOSHConnection.prototype.request = function(attrs, children, cb, retry) {
    var that = this
    retry = retry || 0

    attrs.rid = this.rid.toString()
    if (this.sid) attrs.sid = this.sid

    for (var k in this.xmlnsAttrs) {
        attrs[k] = this.xmlnsAttrs[k]
    }
    var boshEl = new ltx.Element('body', attrs)
    for (var i = 0; i < children.length; i++) {
        boshEl.cnode(children[i])
    }

    request({
            uri: this.boshURL,
            method: 'POST',
            headers: { 'Content-Type': this.contentType },
            body: boshEl.toString()
        },
        function(err, res, body) {
            that.currentRequests--

            if (err) {
                if (retry < that.maxHTTPRetries) {
                    return that.request(attrs, children, cb, retry + 1)
                } else {
                    return cb(err)
                }
            }
            if ((res.statusCode < 200) || (res.statusCode >= 400)) {
                return cb(new Error('HTTP status ' + res.statusCode))
            }

            var bodyEl
            try {
                bodyEl = ltx.parse(body)
            } catch(e) {
                return cb(e)
            }

            if (bodyEl &&
                (bodyEl.attrs.type === 'terminate') &&
                bodyEl.attrs.condition) {
                cb(new Error(bodyEl.attrs.condition))
            } else if (bodyEl) {
                cb(null, bodyEl)
            } else {
                cb(new Error('no <body/>'))
            }
        }
    )
    this.currentRequests++
}

module.exports = BOSHConnection

}).call(this,require("oMfpAn"))
},{"debug":42,"events":14,"node-xmpp-core":45,"oMfpAn":17,"request":41,"util":22}],38:[function(require,module,exports){
'use strict';

var Mechanism = require('./authentication/mechanism')

/**
 * Available methods for client-side authentication (Client)
 * @param  Array offeredMechs  methods offered by server
 * @param  Array preferredMech preferred methods by client
 * @param  Array availableMech available methods on client
 */
function selectMechanism(offeredMechs, preferredMech, availableMech) {
    var mechClasses = []
    var byName = {}
    var Mech
    if (Array.isArray(availableMech)) {
        mechClasses = mechClasses.concat(availableMech)
    }
    mechClasses.forEach(function(mechClass) {
        byName[mechClass.prototype.name] = mechClass
    })
    /* Any preferred? */
    if (byName[preferredMech] &&
        (offeredMechs.indexOf(preferredMech) >= 0)) {
        Mech = byName[preferredMech]
    }
    /* By priority */
    mechClasses.forEach(function(mechClass) {
        if (!Mech &&
            (offeredMechs.indexOf(mechClass.prototype.name) >= 0))
            Mech = mechClass
    })

    return Mech ? new Mech() : null
}

/**
 * Will detect the available mechanisms based on the given options
 * @param  {[type]} options client configuration
 * @param  Array availableMech available methods on client
 * @return {[type]}         available options
 */
function detectMechanisms(options, availableMech) {
    var mechClasses = availableMech ? availableMech : []

    var detect = []
    mechClasses.forEach(function(mechClass) {
        var match = mechClass.prototype.match
        if (match(options)) detect.push(mechClass)
    })
    return detect
}

exports.selectMechanism = selectMechanism
exports.detectMechanisms = detectMechanisms
exports.AbstractMechanism = Mechanism

},{"./authentication/mechanism":33}],39:[function(require,module,exports){
(function (process){
'use strict';

var util = require('util')
  , tls = require('tls')
  , crypto = require('crypto')
  , EventEmitter = require('events').EventEmitter
  , Connection = require('node-xmpp-core').Connection
  , JID = require('node-xmpp-core').JID
  , SRV = require('node-xmpp-core').SRV
  , BOSHConnection = require('./bosh')
  , WSConnection = require('./websockets')
  , debug = require('debug')('xmpp:client:session')

function Session(opts) {
    EventEmitter.call(this)

    this.setOptions(opts)

    if (opts.websocket && opts.websocket.url) {
        debug('start websocket connection')
        this._setupWebsocketConnection(opts)
    } else if (opts.bosh && opts.bosh.url) {
        debug('start bosh connection')
        this._setupBoshConnection(opts)
    } else {
        debug('start socket connection')
        this._setupSocketConnection(opts)
    }
}

util.inherits(Session, EventEmitter)

Session.prototype._setupSocketConnection = function(opts) {
    var params = {
        xmlns: { '': opts.xmlns },
        streamAttrs: {
            version: '1.0',
            to: this.jid.domain
        },
        serialized: opts.serialized
    }
    for (var  key in opts)
        if (!(key in params))
            params[key] = opts[key]

    this.connection = new Connection(params)
    this._addConnectionListeners()

    if (opts.host) {
        this._socketConnectionToHost(opts)
    } else if (!SRV) {
        throw 'Cannot load SRV'
    } else {
        this._performSrvLookup(opts)
    }
}

Session.prototype._socketConnectionToHost = function(opts) {
    if (opts.legacySSL) {
        this.connection.allowTLS = false
        this.connection.connect({
            socket:function () {
                return tls.connect(
                    opts.port || 5223,
                    opts.host,
                    opts.credentials || {},
                    function() {
                        if (this.socket.authorized)
                            this.emit('connect', this.socket)
                        else
                            this.emit('error', 'unauthorized')
                    }.bind(this)
                )
            }
        })
    } else {
        if (opts.credentials) {
            this.connection.credentials = crypto
                .createCredentials(opts.credentials)
        }
        if (opts.disallowTLS) this.connection.allowTLS = false
        this.connection.listen({
            socket:function () {
                // wait for connect event listeners
                process.nextTick(function () {
                    this.socket.connect(opts.port || 5222, opts.host)
                }.bind(this))
                var socket = opts.socket
                opts.socket = null
                return socket // maybe create new socket
            }
        })
    }
}

Session.prototype._performSrvLookup = function(opts) {
    if (opts.legacySSL) {
        throw 'LegacySSL mode does not support DNS lookups'
    }
    if (opts.credentials)
        this.connection.credentials = crypto.createCredentials(opts.credentials)
    if (opts.disallowTLS)
        this.connection.allowTLS = false
    this.connection.listen({socket:SRV.connect({
        socket:      opts.socket,
        services:    ['_xmpp-client._tcp'],
        domain:      this.jid.domain,
        defaultPort: 5222
    })})
}

Session.prototype._setupBoshConnection = function(opts) {
    this.connection = new BOSHConnection({
        jid: this.jid,
        bosh: opts.bosh,
        wait: this.wait
    })
    this._addConnectionListeners()
}

Session.prototype._setupWebsocketConnection = function(opts) {
    this.connection = new WSConnection({
        jid: this.jid,
        websocket: opts.websocket
    })
    this._addConnectionListeners()
    this.connection.on('connected', function() {
        // Clients start <stream:stream>, servers reply
        if (this.connection.startStream)
            this.connection.startStream()
    }.bind(this))
}

Session.prototype.setOptions = function(opts) {
    /* jshint camelcase: false */
    this.jid = (typeof opts.jid === 'string') ? new JID(opts.jid) : opts.jid
    this.password = opts.password
    this.preferredSaslMechanism = opts.preferredSaslMechanism
    this.api_key = opts.api_key
    this.access_token = opts.access_token
    this.oauth2_token = opts.oauth2_token
    this.oauth2_auth = opts.oauth2_auth
    this.register = opts.register
    this.wait = opts.wait || '10'
    if (typeof opts.actAs === 'string') {
        this.actAs = new JID(opts.actAs)
    } else {
        this.actAs = opts.actAs
    }
}

Session.prototype._addConnectionListeners = function (con) {
    con = con || this.connection
    con.on('stanza', this.onStanza.bind(this))
    con.on('drain', this.emit.bind(this, 'drain'))
    con.on('end', this.emit.bind(this, 'end'))
    con.on('close', this.emit.bind(this, 'close'))
    con.on('error', this.emit.bind(this, 'error'))
    con.on('connect', this.emit.bind(this, 'connect'))
    con.on('reconnect', this.emit.bind(this, 'reconnect'))
    con.on('disconnect', this.emit.bind(this, 'disconnect'))
    if (con.startStream) {
        con.on('connect', function () {
            // Clients start <stream:stream>, servers reply
            con.startStream()
        })
        this.on('auth', function () {
            con.startStream()
        })
    }
}

Session.prototype.pause = function() {
    if (this.connection && this.connection.pause)
        this.connection.pause()
}

Session.prototype.resume = function() {
    if (this.connection && this.connection.resume)
        this.connection.resume()
}

Session.prototype.send = function(stanza) {
    return this.connection ? this.connection.send(stanza) : false
}

Session.prototype.end = function() {
    if (this.connection)
        this.connection.end()
}

Session.prototype.onStanza = function() {}

module.exports = Session

}).call(this,require("oMfpAn"))
},{"./bosh":37,"./websockets":40,"crypto":9,"debug":42,"events":14,"node-xmpp-core":45,"oMfpAn":17,"tls":3,"util":22}],40:[function(require,module,exports){
'use strict';

var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , ltx = require('node-xmpp-core').ltx
  , StreamParser = require('node-xmpp-core').StreamParser
  , WebSocket = require('faye-websocket') && require('faye-websocket').Client ?
      require('faye-websocket').Client : window.WebSocket
  , Connection = require('node-xmpp-core').Connection
  , debug = require('debug')('xmpp:client:websockets')

function WSConnection(opts) {
    EventEmitter.call(this)

    this.url = opts.websocket.url
    this.jid = opts.jid
    this.xmlns = {}
    this.websocket = new WebSocket(this.url, ['xmpp'])
    this.websocket.onopen = this.onopen.bind(this)
    this.websocket.onmessage = this.onmessage.bind(this)
    this.websocket.onclose = this.onclose.bind(this)
    this.websocket.onerror = this.onerror.bind(this)
}

util.inherits(WSConnection, EventEmitter)

WSConnection.prototype.maxStanzaSize = 65535
WSConnection.prototype.xmppVersion = '1.0'

WSConnection.prototype.onopen = function() {
    this.startParser()
    this.emit('connected')
}

WSConnection.prototype.startParser = function() {
    var self = this
    this.parser = new StreamParser.StreamParser(this.maxStanzaSize)

    this.parser.on('start', function(attrs) {
        self.streamAttrs = attrs
        /* We need those xmlns often, store them extra */
        self.streamNsAttrs = {}
        for (var k in attrs) {
            if ((k === 'xmlns') ||
                (k.substr(0, 6) === 'xmlns:')) {
                self.streamNsAttrs[k] = attrs[k]
            }
        }

        /* Notify in case we don't wait for <stream:features/>
           (Component or non-1.0 streams)
         */
        self.emit('streamStart', attrs)
    })
    this.parser.on('stanza', function(stanza) {
        //self.onStanza(self.addStreamNs(stanza))
        self.onStanza(stanza)
    })
    this.parser.on('error', this.onerror.bind(this))
    this.parser.on('end', function() {
        self.stopParser()
        self.end()
    })
}

WSConnection.prototype.stopParser = function() {
    /* No more events, please (may happen however) */
    if (this.parser) {
        /* Get GC'ed */
        delete this.parser
    }
}

WSConnection.prototype.onmessage = function(msg) {
    debug('ws msg <--', msg.data)
    if (msg && msg.data && this.parser)
        this.parser.write(msg.data)
}

WSConnection.prototype.onStanza = function(stanza) {
    if (stanza.is('error', Connection.NS_STREAM)) {
        /* TODO: extract error text */
        this.emit('error', stanza)
    } else {
        this.emit('stanza', stanza)
    }
}

WSConnection.prototype.startStream = function() {
    var attrs = {}
    for(var k in this.xmlns) {
        if (this.xmlns.hasOwnProperty(k)) {
            if (!k) {
                attrs.xmlns = this.xmlns[k]
            } else {
                attrs['xmlns:' + k] = this.xmlns[k]
            }
        }
    }
    if (this.xmppVersion)
        attrs.version = this.xmppVersion
    if (this.streamTo)
        attrs.to = this.streamTo
    if (this.streamId)
        attrs.id = this.streamId
    if (this.jid)
        attrs.to = this.jid.domain
    attrs.xmlns = 'jabber:client'
    attrs['xmlns:stream'] = Connection.NS_STREAM

    var el = new ltx.Element('stream:stream', attrs)
    // make it non-empty to cut the closing tag
    el.t(' ')
    var s = el.toString()
    this.send(s.substr(0, s.indexOf(' </stream:stream>')))

    this.streamOpened = true
}

WSConnection.prototype.send = function(stanza) {
    if (stanza.root) stanza = stanza.root()
    stanza = stanza.toString()
    debug('ws send -->', stanza)
    this.websocket.send(stanza)
}

WSConnection.prototype.onclose = function() {
    this.emit('disconnect')
    this.emit('close')
}

WSConnection.prototype.end = function() {
    this.send('</stream:stream>')
    this.emit('disconnect')
    this.emit('end')
    if (this.websocket)
        this.websocket.close()
}

WSConnection.prototype.onerror = function(e) {
    this.emit('error', e)
}

module.exports = WSConnection

},{"debug":42,"events":14,"faye-websocket":3,"node-xmpp-core":45,"util":22}],41:[function(require,module,exports){
// Browser Request
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// UMD HEADER START 
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.returnExports = factory();
  }
}(this, function () {
// UMD HEADER END

var XHR = XMLHttpRequest
if (!XHR) throw new Error('missing XMLHttpRequest')
request.log = {
  'trace': noop, 'debug': noop, 'info': noop, 'warn': noop, 'error': noop
}

var DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 minutes

//
// request
//

function request(options, callback) {
  // The entry-point to the API: prep the options object and pass the real work to run_xhr.
  if(typeof callback !== 'function')
    throw new Error('Bad callback given: ' + callback)

  if(!options)
    throw new Error('No options given')

  var options_onResponse = options.onResponse; // Save this for later.

  if(typeof options === 'string')
    options = {'uri':options};
  else
    options = JSON.parse(JSON.stringify(options)); // Use a duplicate for mutating.

  options.onResponse = options_onResponse // And put it back.

  if (options.verbose) request.log = getLogger();

  if(options.url) {
    options.uri = options.url;
    delete options.url;
  }

  if(!options.uri && options.uri !== "")
    throw new Error("options.uri is a required argument");

  if(typeof options.uri != "string")
    throw new Error("options.uri must be a string");

  var unsupported_options = ['proxy', '_redirectsFollowed', 'maxRedirects', 'followRedirect']
  for (var i = 0; i < unsupported_options.length; i++)
    if(options[ unsupported_options[i] ])
      throw new Error("options." + unsupported_options[i] + " is not supported")

  options.callback = callback
  options.method = options.method || 'GET';
  options.headers = options.headers || {};
  options.body    = options.body || null
  options.timeout = options.timeout || request.DEFAULT_TIMEOUT

  if(options.headers.host)
    throw new Error("Options.headers.host is not supported");

  if(options.json) {
    options.headers.accept = options.headers.accept || 'application/json'
    if(options.method !== 'GET')
      options.headers['content-type'] = 'application/json'

    if(typeof options.json !== 'boolean')
      options.body = JSON.stringify(options.json)
    else if(typeof options.body !== 'string')
      options.body = JSON.stringify(options.body)
  }
  
  //BEGIN QS Hack
  var serialize = function(obj) {
    var str = [];
    for(var p in obj)
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    return str.join("&");
  }
  
  if(options.qs){
    var qs = (typeof options.qs == 'string')? options.qs : serialize(options.qs);
    if(options.uri.indexOf('?') !== -1){ //no get params
        options.uri = options.uri+'&'+qs;
    }else{ //existing get params
        options.uri = options.uri+'?'+qs;
    }
  }
  //END QS Hack
  
  //BEGIN FORM Hack
  var multipart = function(obj) {
    //todo: support file type (useful?)
    var result = {};
    result.boundry = '-------------------------------'+Math.floor(Math.random()*1000000000);
    var lines = [];
    for(var p in obj){
        if (obj.hasOwnProperty(p)) {
            lines.push(
                '--'+result.boundry+"\n"+
                'Content-Disposition: form-data; name="'+p+'"'+"\n"+
                "\n"+
                obj[p]+"\n"
            );
        }
    }
    lines.push( '--'+result.boundry+'--' );
    result.body = lines.join('');
    result.length = result.body.length;
    result.type = 'multipart/form-data; boundary='+result.boundry;
    return result;
  }
  
  if(options.form){
    if(typeof options.form == 'string') throw('form name unsupported');
    if(options.method === 'POST'){
        var encoding = (options.encoding || 'application/x-www-form-urlencoded').toLowerCase();
        options.headers['content-type'] = encoding;
        switch(encoding){
            case 'application/x-www-form-urlencoded':
                options.body = serialize(options.form).replace(/%20/g, "+");
                break;
            case 'multipart/form-data':
                var multi = multipart(options.form);
                //options.headers['content-length'] = multi.length;
                options.body = multi.body;
                options.headers['content-type'] = multi.type;
                break;
            default : throw new Error('unsupported encoding:'+encoding);
        }
    }
  }
  //END FORM Hack

  // If onResponse is boolean true, call back immediately when the response is known,
  // not when the full request is complete.
  options.onResponse = options.onResponse || noop
  if(options.onResponse === true) {
    options.onResponse = callback
    options.callback = noop
  }

  // XXX Browsers do not like this.
  //if(options.body)
  //  options.headers['content-length'] = options.body.length;

  // HTTP basic authentication
  if(!options.headers.authorization && options.auth)
    options.headers.authorization = 'Basic ' + b64_enc(options.auth.username + ':' + options.auth.password);

  return run_xhr(options)
}

var req_seq = 0
function run_xhr(options) {
  var xhr = new XHR
    , timed_out = false
    , is_cors = is_crossDomain(options.uri)
    , supports_cors = ('withCredentials' in xhr)

  req_seq += 1
  xhr.seq_id = req_seq
  xhr.id = req_seq + ': ' + options.method + ' ' + options.uri
  xhr._id = xhr.id // I know I will type "_id" from habit all the time.

  if(is_cors && !supports_cors) {
    var cors_err = new Error('Browser does not support cross-origin request: ' + options.uri)
    cors_err.cors = 'unsupported'
    return options.callback(cors_err, xhr)
  }

  xhr.timeoutTimer = setTimeout(too_late, options.timeout)
  function too_late() {
    timed_out = true
    var er = new Error('ETIMEDOUT')
    er.code = 'ETIMEDOUT'
    er.duration = options.timeout

    request.log.error('Timeout', { 'id':xhr._id, 'milliseconds':options.timeout })
    return options.callback(er, xhr)
  }

  // Some states can be skipped over, so remember what is still incomplete.
  var did = {'response':false, 'loading':false, 'end':false}

  xhr.onreadystatechange = on_state_change
  xhr.open(options.method, options.uri, true) // asynchronous
  if(is_cors)
    xhr.withCredentials = !! options.withCredentials
  xhr.send(options.body)
  return xhr

  function on_state_change(event) {
    if(timed_out)
      return request.log.debug('Ignoring timed out state change', {'state':xhr.readyState, 'id':xhr.id})

    request.log.debug('State change', {'state':xhr.readyState, 'id':xhr.id, 'timed_out':timed_out})

    if(xhr.readyState === XHR.OPENED) {
      request.log.debug('Request started', {'id':xhr.id})
      for (var key in options.headers)
        xhr.setRequestHeader(key, options.headers[key])
    }

    else if(xhr.readyState === XHR.HEADERS_RECEIVED)
      on_response()

    else if(xhr.readyState === XHR.LOADING) {
      on_response()
      on_loading()
    }

    else if(xhr.readyState === XHR.DONE) {
      on_response()
      on_loading()
      on_end()
    }
  }

  function on_response() {
    if(did.response)
      return

    did.response = true
    request.log.debug('Got response', {'id':xhr.id, 'status':xhr.status})
    clearTimeout(xhr.timeoutTimer)
    xhr.statusCode = xhr.status // Node request compatibility

    // Detect failed CORS requests.
    if(is_cors && xhr.statusCode == 0) {
      var cors_err = new Error('CORS request rejected: ' + options.uri)
      cors_err.cors = 'rejected'

      // Do not process this request further.
      did.loading = true
      did.end = true

      return options.callback(cors_err, xhr)
    }

    options.onResponse(null, xhr)
  }

  function on_loading() {
    if(did.loading)
      return

    did.loading = true
    request.log.debug('Response body loading', {'id':xhr.id})
    // TODO: Maybe simulate "data" events by watching xhr.responseText
  }

  function on_end() {
    if(did.end)
      return

    did.end = true
    request.log.debug('Request done', {'id':xhr.id})

    xhr.body = xhr.responseText
    if(options.json) {
      try        { xhr.body = JSON.parse(xhr.responseText) }
      catch (er) { return options.callback(er, xhr)        }
    }

    options.callback(null, xhr, xhr.body)
  }

} // request

request.withCredentials = false;
request.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;

//
// defaults
//

request.defaults = function(options, requester) {
  var def = function (method) {
    var d = function (params, callback) {
      if(typeof params === 'string')
        params = {'uri': params};
      else {
        params = JSON.parse(JSON.stringify(params));
      }
      for (var i in options) {
        if (params[i] === undefined) params[i] = options[i]
      }
      return method(params, callback)
    }
    return d
  }
  var de = def(request)
  de.get = def(request.get)
  de.post = def(request.post)
  de.put = def(request.put)
  de.head = def(request.head)
  return de
}

//
// HTTP method shortcuts
//

var shortcuts = [ 'get', 'put', 'post', 'head' ];
shortcuts.forEach(function(shortcut) {
  var method = shortcut.toUpperCase();
  var func   = shortcut.toLowerCase();

  request[func] = function(opts) {
    if(typeof opts === 'string')
      opts = {'method':method, 'uri':opts};
    else {
      opts = JSON.parse(JSON.stringify(opts));
      opts.method = method;
    }

    var args = [opts].concat(Array.prototype.slice.apply(arguments, [1]));
    return request.apply(this, args);
  }
})

//
// CouchDB shortcut
//

request.couch = function(options, callback) {
  if(typeof options === 'string')
    options = {'uri':options}

  // Just use the request API to do JSON.
  options.json = true
  if(options.body)
    options.json = options.body
  delete options.body

  callback = callback || noop

  var xhr = request(options, couch_handler)
  return xhr

  function couch_handler(er, resp, body) {
    if(er)
      return callback(er, resp, body)

    if((resp.statusCode < 200 || resp.statusCode > 299) && body.error) {
      // The body is a Couch JSON object indicating the error.
      er = new Error('CouchDB error: ' + (body.error.reason || body.error.error))
      for (var key in body)
        er[key] = body[key]
      return callback(er, resp, body);
    }

    return callback(er, resp, body);
  }
}

//
// Utility
//

function noop() {}

function getLogger() {
  var logger = {}
    , levels = ['trace', 'debug', 'info', 'warn', 'error']
    , level, i

  for(i = 0; i < levels.length; i++) {
    level = levels[i]

    logger[level] = noop
    if(typeof console !== 'undefined' && console && console[level])
      logger[level] = formatted(console, level)
  }

  return logger
}

function formatted(obj, method) {
  return formatted_logger

  function formatted_logger(str, context) {
    if(typeof context === 'object')
      str += ' ' + JSON.stringify(context)

    return obj[method].call(obj, str)
  }
}

// Return whether a URL is a cross-domain request.
function is_crossDomain(url) {
  var rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/

  // jQuery #8138, IE may throw an exception when accessing
  // a field from window.location if document.domain has been set
  var ajaxLocation
  try { ajaxLocation = location.href }
  catch (e) {
    // Use the href attribute of an A element since IE will modify it given document.location
    ajaxLocation = document.createElement( "a" );
    ajaxLocation.href = "";
    ajaxLocation = ajaxLocation.href;
  }

  var ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || []
    , parts = rurl.exec(url.toLowerCase() )

  var result = !!(
    parts &&
    (  parts[1] != ajaxLocParts[1]
    || parts[2] != ajaxLocParts[2]
    || (parts[3] || (parts[1] === "http:" ? 80 : 443)) != (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? 80 : 443))
    )
  )

  //console.debug('is_crossDomain('+url+') -> ' + result)
  return result
}

// MIT License from http://phpjs.org/functions/base64_encode:358
function b64_enc (data) {
    // Encodes string using MIME base64 algorithm
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc="", tmp_arr = [];

    if (!data) {
        return data;
    }

    // assume utf8 data
    // data = this.utf8_encode(data+'');

    do { // pack three octets into four hexets
        o1 = data.charCodeAt(i++);
        o2 = data.charCodeAt(i++);
        o3 = data.charCodeAt(i++);

        bits = o1<<16 | o2<<8 | o3;

        h1 = bits>>18 & 0x3f;
        h2 = bits>>12 & 0x3f;
        h3 = bits>>6 & 0x3f;
        h4 = bits & 0x3f;

        // use hexets to index into b64, and append result to encoded string
        tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
    } while (i < data.length);

    enc = tmp_arr.join('');

    switch (data.length % 3) {
        case 1:
            enc = enc.slice(0, -2) + '==';
        break;
        case 2:
            enc = enc.slice(0, -1) + '=';
        break;
    }

    return enc;
}
    return request;
//UMD FOOTER START
}));
//UMD FOOTER END

},{}],42:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // This hackery is required for IE8,
  // where the `console.log` function doesn't have 'apply'
  return 'object' == typeof console
    && 'function' == typeof console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      localStorage.removeItem('debug');
    } else {
      localStorage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = localStorage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

},{"./debug":43}],43:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":44}],44:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 's':
      return n * s;
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],45:[function(require,module,exports){
var extend = require('util')._extend

exports.Stanza = {}
extend(exports.Stanza, require('./lib/stanza'))
exports.JID = require('./lib/jid')
exports.Connection = require('./lib/connection')
exports.SRV = require('./lib/srv')
exports.StreamParser = require('./lib/stream_parser')
exports.ltx = require('ltx')
},{"./lib/connection":46,"./lib/jid":47,"./lib/srv":48,"./lib/stanza":49,"./lib/stream_parser":50,"ltx":54,"util":22}],46:[function(require,module,exports){
'use strict';

var net = require('net')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , ltx = require('ltx')
  , reconnect = require('reconnect-core')
  , StreamParser = require('./stream_parser')
  , starttls = require('tls-connect')
  , debug = require('debug')('xmpp:connection')
  , extend = require('util')._extend

var NS_XMPP_TLS = 'urn:ietf:params:xml:ns:xmpp-tls'
var NS_STREAM = 'http://etherx.jabber.org/streams'
var NS_XMPP_STREAMS = 'urn:ietf:params:xml:ns:xmpp-streams'

var INITIAL_RECONNECT_DELAY =  1e3
var MAX_RECONNECT_DELAY     = 30e3

function defaultInjection(emitter, opts) {
    // clone opts
    var options = extend({}, opts)

    // add computed options
    /* jshint -W014 */
    options.initialDelay = (opts && (opts.initialReconnectDelay
                            ||  opts.reconnectDelay)) || INITIAL_RECONNECT_DELAY
    options.maxDelay = (opts &&   opts.maxReconnectDelay)  || MAX_RECONNECT_DELAY
    options.immediate = opts && opts.socket && typeof opts.socket !== 'function'
    options.type =      opts && opts.delayType
    options.emitter =   emitter

    // return calculated options
    return options
}

/**
 Base class for connection-based streams (TCP).
 The socket parameter is optional for incoming connections.
*/
function Connection(opts) {
    
    EventEmitter.call(this)

    this.streamAttrs = (opts && opts.streamAttrs) || {}
    this.xmlns = (opts && opts.xmlns) || {}
    this.xmlns.stream = NS_STREAM

    this.rejectUnauthorized = (opts && opts.rejectUnauthorized) ? true : false
    this.serialized = (opts && opts.serialized) ? true : false
    this.requestCert = (opts && opts.requestCert) ? true : false

    this.servername = (opts && opts.servername)

    this._setupSocket(defaultInjection(this, opts))
    this.once('reconnect', function () {
        this.reconnect = opts && opts.reconnect
    })
}

util.inherits(Connection, EventEmitter)

Connection.prototype.NS_XMPP_TLS = NS_XMPP_TLS
Connection.NS_STREAM = NS_STREAM
Connection.prototype.NS_XMPP_STREAMS = NS_XMPP_STREAMS
// Defaults
Connection.prototype.allowTLS = true

Connection.prototype._setupSocket = function (options) {
    debug('setup socket')
    var previousOptions = {}
    var inject = reconnect(function (opts) {
        var previousSocket = this.socket
        /* if this opts.preserve is on
         * the previous options are stored until next time.
         * this is needed to restore from a setSecure call.
         */
        if (opts.preserve === 'on') {
            opts.preserve = previousOptions
            previousOptions = opts
        } else if (opts.preserve) {
            // switch back to the preversed options
            opts = previousOptions = opts.preserve
        } else {
            // keep some state for eg SRV.connect
            opts = previousOptions = opts || previousOptions
        }

        if (typeof opts.socket === 'function') {
            debug('use lazy socket')
            /* lazy evaluation
             * (can be retriggered by calling connection.connect()
             *  without arguments after a previous
             *  connection.connect({socket:function() { … }})) */
            this.socket = opts.socket.call(this)
        } else {
            debug('use standard socket')
            // only use this socket once
            this.socket = opts.socket
            opts.socket = null
            if (this.socket) {
                this.once('connect', function () {
                    inject.options.immediate = false
                })
            }
        }
        this.socket = this.socket || new net.Socket()
        if (previousSocket !== this.socket)
            this.setupStream()
        return this.socket
    }.bind(this))

    inject(inject.options = options)

    this.on('connection', function () {
        if (!this.parser)
            this.startParser()
    })
    this.on('end', function () {
        previousOptions = {}
    })
}

/**
 Used by both the constructor and by reinitialization in setSecure().
*/
Connection.prototype.setupStream = function() {
    debug('setup stream')
    this.socket.on('end', this.onEnd.bind(this))
    this.socket.on('data', this.onData.bind(this))
    this.socket.on('close', this.onClose.bind(this))
    // let them sniff unparsed XML
    this.socket.on('data',  this.emit.bind(this, 'data'))
    this.socket.on('drain', this.emit.bind(this, 'drain'))
    // ignore errors after disconnect
    this.socket.on('error', function () { })

    if (!this.socket.serializeStanza) {
        /**
        * This is optimized for continuous TCP streams. If your "socket"
        * actually transports frames (WebSockets) and you can't have
        * stanzas split across those, use:
        *     cb(el.toString())
        */
        if (this.serialized) {
            this.socket.serializeStanza = function(el, cb) {
                // Continuously write out
                el.write(function(s) {
                    cb(s)
                })
            }
        } else {
            this.socket.serializeStanza = function(el, cb) {
                cb(el.toString())
            }
        }
    }
}

Connection.prototype.pause = function() {
    if (this.socket.pause) this.socket.pause()
}

Connection.prototype.resume = function() {
    if (this.socket.resume) this.socket.resume()
}

/** Climbs the stanza up if a child was passed,
    but you can send strings and buffers too.

    Returns whether the socket flushed data.
*/
Connection.prototype.send = function(stanza) {
    var flushed = true
    if (!this.socket) {
        return // Doh!
    }
    if (!this.socket.writable) {
        this.socket.end()
        return
    }

    debug('send: ' + stanza.toString())
    if (stanza.root) {
        var el = this.rmXmlns(stanza.root())
        this.socket.serializeStanza(el, function(s) {
            flushed = this.write(s)
        }.bind(this.socket))
    } else {
        flushed = this.socket.write(stanza)
    }
    return flushed
}

Connection.prototype.startParser = function() {
    var self = this
    this.parser = new StreamParser.StreamParser(this.maxStanzaSize)

    this.parser.on('streamStart', function(attrs) {
        /* We need those xmlns often, store them extra */
        self.streamNsAttrs = {}
        for (var k in attrs) {
            if (k === 'xmlns' || (k.substr(0, 6) === 'xmlns:'))
                self.streamNsAttrs[k] = attrs[k]
        }

        /* Notify in case we don't wait for <stream:features/>
           (Component or non-1.0 streams)
         */
        self.emit('streamStart', attrs)
    })
    this.parser.on('stanza', function(stanza) {
        self.onStanza(self.addStreamNs(stanza))
    })
    this.parser.on('error', function(e) {
        self.error(e.condition || 'internal-server-error', e.message)
    })
    this.parser.once('end', function() {
        self.stopParser()
        if (self.reconnect)
            self.once('reconnect', self.startParser.bind(self))
        else
            self.end()
    })
}

Connection.prototype.stopParser = function() {
    /* No more events, please (may happen however) */
    if (this.parser) {
        var parser = this.parser
        /* Get GC'ed */
        delete this.parser
        parser.end()
    }
}

Connection.prototype.startStream = function() {
    var attrs = {}
    for (var k in this.xmlns) {
        if (this.xmlns.hasOwnProperty(k)) {
            if (!k)
                attrs.xmlns = this.xmlns[k]
            else
                attrs['xmlns:' + k] = this.xmlns[k]
        }
    }
    for (k in this.streamAttrs) {
        if (this.streamAttrs.hasOwnProperty(k))
            attrs[k] = this.streamAttrs[k]
    }

    if (this.streamTo) { // in case of a component connecting
        attrs.to = this.streamTo
    }

    var el = new ltx.Element('stream:stream', attrs)
    // make it non-empty to cut the closing tag
    el.t(' ')
    var s = el.toString()
    this.send(s.substr(0, s.indexOf(' </stream:stream>')))

    this.streamOpened = true
}

Connection.prototype.onData = function(data) {
    debug('receive: ' + data.toString('utf8'))
    if (this.parser)
        this.parser.write(data)
}

Connection.prototype.setSecure = function(credentials, isServer) {
    // Remove old event listeners
    this.socket.removeAllListeners('data')
    // retain socket 'end' listeners because ssl layer doesn't support it
    this.socket.removeAllListeners('drain')
    this.socket.removeAllListeners('close')
    // remove idle_timeout
    if (this.socket.clearTimer)
        this.socket.clearTimer()

    var cleartext = starttls({
        socket: this.socket,
        rejectUnauthorized: this.rejectUnauthorized,
        credentials: credentials || this.credentials,
        requestCert: this.requestCert,
        isServer: !!isServer
    }, function() {
        this.isSecure = true
        this.once('disconnect', function () {
            this.isSecure = false
        })
        cleartext.emit('connect', cleartext)
    }.bind(this))
    cleartext.on('clientError', this.emit.bind(this, 'error'))
    if (!this.reconnect) {
        this.reconnect = true // need this so stopParser works properly
        this.once('reconnect', function () {this.reconnect = false})
    }
    this.stopParser()
    // if we reconnect we need to get back to the previous socket creation
    this.listen({socket:cleartext, preserve:'on'})
}

function getAllText(el) {
    return !el.children ? el : el.children.reduce(function (text, child) {
        return text + getAllText(child)
    }, '')
}

/**
 * This is not an event listener, but takes care of the TLS handshake
 * before 'stanza' events are emitted to the derived classes.
 */
Connection.prototype.onStanza = function(stanza) {
    if (stanza.is('error', NS_STREAM)) {
        var error = new Error('' + getAllText(stanza))
        error.stanza = stanza
        this.socket.emit('error', error)
    } else if (stanza.is('features', this.NS_STREAM) &&
        this.allowTLS &&
        !this.isSecure &&
        stanza.getChild('starttls', this.NS_XMPP_TLS)) {
        /* Signal willingness to perform TLS handshake */
        this.send(new ltx.Element('starttls', { xmlns: this.NS_XMPP_TLS }))
    } else if (this.allowTLS &&
        stanza.is('proceed', this.NS_XMPP_TLS)) {
        /* Server is waiting for TLS handshake */
        this.setSecure()
    } else {
        this.emit('stanza', stanza)
    }
}

/**
 * Add stream xmlns to a stanza
 *
 * Does not add our default xmlns as it is different for
 * C2S/S2S/Component connections.
 */
Connection.prototype.addStreamNs = function(stanza) {
    for (var attr in this.streamNsAttrs) {
        if (!stanza.attrs[attr] &&
            !((attr === 'xmlns') && (this.streamNsAttrs[attr] === this.xmlns['']))
           ) {
            stanza.attrs[attr] = this.streamNsAttrs[attr]
        }
    }
    return stanza
}

/**
 * Remove superfluous xmlns that were aleady declared in
 * our <stream:stream>
 */
Connection.prototype.rmXmlns = function(stanza) {
    for (var prefix in this.xmlns) {
        var attr = prefix ? 'xmlns:' + prefix : 'xmlns'
        if (stanza.attrs[attr] === this.xmlns[prefix])
            delete stanza.attrs[attr]
    }
    return stanza
}

/**
 * XMPP-style end connection for user
 */
Connection.prototype.onEnd = function() {
    if (this.socket && this.socket.writable) {
        if (this.streamOpened) {
            this.socket.write('</stream:stream>')
            delete this.streamOpened
        }
    }
    if (!this.reconnect)
        this.emit('end')
}

Connection.prototype.onClose = function() {
    if (!this.reconnect)
        this.emit('close')
}

/**
 * End connection with stream error.
 * Emits 'error' event too.
 *
 * @param {String} condition XMPP error condition, see RFC3920 4.7.3. Defined Conditions
 * @param {String} text Optional error message
 */
Connection.prototype.error = function(condition, message) {
    this.emit('error', new Error(message))

    if (!this.socket || !this.socket.writable) return

    /* RFC 3920, 4.7.1 stream-level errors rules */
    if (!this.streamOpened) this.startStream()

    var error = new ltx.Element('stream:error')
    error.c(condition, { xmlns: NS_XMPP_STREAMS })
    if (message) {
        error.c( 'text', {
            xmlns: NS_XMPP_STREAMS,
            'xml:lang': 'en'
        }).t(message)
    }

    this.send(error)
    this.end()
}

module.exports = Connection

},{"./stream_parser":50,"debug":51,"events":14,"ltx":54,"net":3,"reconnect-core":64,"tls-connect":71,"util":22}],47:[function(require,module,exports){
var StringPrep = require('node-stringprep').StringPrep
  , toUnicode = require('node-stringprep').toUnicode


/**
 * JID implements 
 * - Xmpp addresses according to RFC6122
 * - XEP-0106: JID Escaping
 *
 * @see http://tools.ietf.org/html/rfc6122#section-2
 * @see http://xmpp.org/extensions/xep-0106.html
 */
function JID(a, b, c) {
    this.local = null
    this.domain = null
    this.resource = null

    if (a && (!b) && (!c)) {
        this.parseJID(a)
    } else if (b) {
        this.setLocal(a)
        this.setDomain(b)
        this.setResource(c)
    } else {
        throw new Error('Argument error')
    }
}

JID.prototype.parseJID = function(s) {
    if (s.indexOf('@') >= 0) {
        this.setLocal(s.substr(0, s.lastIndexOf('@')))
        s = s.substr(s.lastIndexOf('@') + 1)
    }
    if (s.indexOf('/') >= 0) {
        this.setResource(s.substr(s.indexOf('/') + 1))
        s = s.substr(0, s.indexOf('/'))
    }
    this.setDomain(s)
}

JID.prototype.toString = function(unescape) {
    var s = this.domain
    if (this.local) s = this.getLocal(unescape) + '@' + s
    if (this.resource) s = s + '/' + this.resource
    return s
}

/**
 * Convenience method to distinguish users
 **/
JID.prototype.bare = function() {
    if (this.resource) {
        return new JID(this.local, this.domain, null)
    } else {
        return this
    }
}

/**
 * Comparison function
 **/
JID.prototype.equals = function(other) {
    return (this.local === other.local) &&
        (this.domain === other.domain) &&
        (this.resource === other.resource)
}

/* Deprecated, use setLocal() [see RFC6122] */
JID.prototype.setUser = function(user) {
    return this.setLocal(user)
}

/**
 * Setters that do stringprep normalization.
 **/
JID.prototype.setLocal = function(local, escape) {
    escape = escape || this.detectEscape(local)

    if (escape) {
        local = this.escapeLocal(local)
    }

    this.local = this.user = local && this.prep('nodeprep', local)
    return this
}

/**
 * http://xmpp.org/rfcs/rfc6122.html#addressing-domain
 */
JID.prototype.setDomain = function(domain) {
    this.domain = domain &&
        this.prep('nameprep', domain.split('.').map(toUnicode).join('.'))
    return this
}

JID.prototype.setResource = function(resource) {
    this.resource = resource && this.prep('resourceprep', resource)
    return this
}

JID.prototype.getLocal = function(unescape) {
    unescape = unescape || false
    var local = null
    
    if (unescape) {
        local = this.unescapeLocal(this.local)
    } else {
        local = this.local
    }

    return local;
}

JID.prototype.prep = function(operation, value) {
    var p = new StringPrep(operation)
    return p.prepare(value)
}

/* Deprecated, use getLocal() [see RFC6122] */
JID.prototype.getUser = function() {
    return this.getLocal()
}

JID.prototype.getDomain = function() {
    return this.domain
}

JID.prototype.getResource = function() {
    return this.resource
}

JID.prototype.detectEscape = function (local) {
    if (!local) return false

    // remove all escaped secquences
    var tmp = local.replace(/\\20/g, '')
        .replace(/\\22/g, '')
        .replace(/\\26/g, '')
        .replace(/\\27/g, '')
        .replace(/\\2f/g, '')
        .replace(/\\3a/g, '')
        .replace(/\\3c/g, '')
        .replace(/\\3e/g, '')
        .replace(/\\40/g, '')
        .replace(/\\5c/g, '')

    // detect if we have unescaped sequences
    var search = tmp.search(/\\| |\"|\&|\'|\/|:|<|>|@/g);
    if (search === -1) {
        return false
    } else {
        return true
    }
}

/** 
 * Escape the local part of a JID.
 *
 * @see http://xmpp.org/extensions/xep-0106.html
 * @param String local local part of a jid
 * @return An escaped local part
 */
JID.prototype.escapeLocal = function (local) {
    if (local === null) return null

    /* jshint -W044 */
    return local.replace(/^\s+|\s+$/g, '')
        .replace(/\\/g, '\\5c')
        .replace(/ /g, '\\20')
        .replace(/\"/g, '\\22')
        .replace(/\&/g, '\\26')
        .replace(/\'/g, '\\27')
        .replace(/\//g, '\\2f')
        .replace(/:/g, '\\3a')
        .replace(/</g, '\\3c')
        .replace(/>/g, '\\3e')
        .replace(/@/g, '\\40')
        .replace(/\3a/g, '\5c3a')
       
    
}

/** 
 * Unescape a local part of a JID.
 *
 * @see http://xmpp.org/extensions/xep-0106.html
 * @param String local local part of a jid
 * @return unescaped local part
 */
JID.prototype.unescapeLocal = function (local) {
    if (local === null) return null

    return local.replace(/\\20/g, ' ')
        .replace(/\\22/g, '\"')
        .replace(/\\26/g, '&')
        .replace(/\\27/g, '\'')
        .replace(/\\2f/g, '/')
        .replace(/\\3a/g, ':')
        .replace(/\\3c/g, '<')
        .replace(/\\3e/g, '>')
        .replace(/\\40/g, '@')
        .replace(/\\5c/g, '\\')
}

if ((typeof exports !== 'undefined') && (exports !== null)) {
    module.exports = JID
} else if ((typeof window !== 'undefined') && (window !== null)) {
    window.JID = JID
}

},{"node-stringprep":58}],48:[function(require,module,exports){
'use strict';


var dns = require('dns')

function compareNumbers(a, b) {
    a = parseInt(a, 10)
    b = parseInt(b, 10)
    if (a < b)
        return -1
    if (a > b)
        return 1
    return 0
}

function groupSrvRecords(addrs) {
    var groups = {}  // by priority
    addrs.forEach(function(addr) {
        if (!groups.hasOwnProperty(addr.priority))
            groups[addr.priority] = []

        groups[addr.priority].push(addr)
    })

    var result = []
    Object.keys(groups).sort(compareNumbers).forEach(function(priority) {
        var group = groups[priority]
        var totalWeight = 0
        group.forEach(function(addr) {
            totalWeight += addr.weight
        })
        var w = Math.floor(Math.random() * totalWeight)
        totalWeight = 0
        var candidate = group[0]
        group.forEach(function(addr) {
            totalWeight += addr.weight
            if (w < totalWeight)
                candidate = addr
        })
        if (candidate)
            result.push(candidate)
    })
    return result
}

function resolveSrv(name, cb) {
    dns.resolveSrv(name, function(err, addrs) {
        if (err) {
            /* no SRV record, try domain as A */
            cb(err)
        } else {
            var pending = 0, error, results = []
            var cb1 = function(e, addrs1) {
                error = error || e
                results = results.concat(addrs1)
                pending--
                if (pending < 1) {
                    cb(results ? null : error, results)
                }
            }
            var gSRV = groupSrvRecords(addrs)
            pending = gSRV.length
            gSRV.forEach(function(addr) {
                resolveHost(addr.name, function(e, a) {
                    if (a) {
                        a = a.map(function(a1) {
                            return { name: a1, port: addr.port }
                        })
                    }
                    cb1(e, a)
                })
            })
        }
    })
}

// one of both A & AAAA, in case of broken tunnels
function resolveHost(name, cb) {
    var error, results = []
    var cb1 = function(e, addr) {
        error = error || e
        if (addr)
            results.push(addr)

        cb((results.length > 0) ? null : error, results)
    }

    dns.lookup(name, cb1)
}

// connection attempts to multiple addresses in a row
function tryConnect(connection, addrs) {
    connection.on('connect', cleanup)
    connection.on('disconnect', connectNext)
    return connectNext()

    function cleanup() {
        connection.removeListener('connect', cleanup)
        connection.removeListener('disconnect', connectNext)
    }

    function connectNext() {
        var addr = addrs.shift()
        if (addr)
            connection.socket.connect(addr.port, addr.name)
        else
            cleanup()
    }
}

// returns a lazy iterator which can be restarted via connection.connect()
exports.connect = function connect(opts) {
    var services = opts.services.slice()
    // lazy evaluation to determine endpoint
    function tryServices(retry) {
        /* jshint -W040 */
        var connection = this
        if (!connection.socket && opts.socket) {
            if (typeof opts.socket === 'function') {
                connection.socket = opts.socket.call(this)
            } else {
                connection.socket = opts.socket
            }
            opts.socket = null
        } else if (!retry) {
            connection.socket = null
        }
        var service = services.shift()
        if (service) {
            resolveSrv(service + '.' + opts.domain, function(error, addrs) {
                if (addrs)
                    tryConnect(connection, addrs)
                // call tryServices again
                else {
                    tryServices.call(connection, 'retry')
                }
            })
        } else {
            resolveHost(opts.domain, function(error, addrs) {
                if (addrs && addrs.length > 0) {
                    addrs = addrs.map(function(addr) {
                        return { name: addr,
                                 port: opts.defaultPort }
                    })
                    tryConnect(connection, addrs)
                } else if (connection.reconnect)  {
                    // retry from the beginning
                    services = opts.services.slice()
                    // get a new socket
                    connection.socket = null
                } else {
                    error = error || new Error('No addresses resolved for ' +
                                                opts.domain)
                    connection.emit('error', error)
                }
            })
        }
        return connection.socket
    }
    return tryServices
}

},{"dns":3}],49:[function(require,module,exports){
'use strict';

var util = require('util')
  , ltx = require('ltx')

function Stanza(name, attrs) {
    ltx.Element.call(this, name, attrs)
}

util.inherits(Stanza, ltx.Element)

Stanza.prototype.clone = function() {
    var clone = new Stanza(this.name, {})
    for (var k in this.attrs) {
        if (this.attrs.hasOwnProperty(k))
            clone.attrs[k] = this.attrs[k]
    }
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        clone.cnode(child.clone ? child.clone() : child)
    }
    return clone
}

/**
 * Common attribute getters/setters for all stanzas
 */

Object.defineProperty(Stanza.prototype, 'from', {
    get: function() {
        return this.attrs.from
    },

    set: function(from) {
        this.attrs.from = from
    }
});

Object.defineProperty(Stanza.prototype, 'to', {
    get: function() {
        return this.attrs.to
    },

    set: function(to) {
        this.attrs.to = to
    }
});

Object.defineProperty(Stanza.prototype, 'id', {
    get: function() {
        return this.attrs.id
    },

    set: function(id) {
        this.attrs.id = id
    }
});

Object.defineProperty(Stanza.prototype, 'type', {
    get: function() {
        return this.attrs.type
    },

    set: function(type) {
        this.attrs.type = type
    }
});

/**
 * Stanza kinds
 */

function Message(attrs) {
    Stanza.call(this, 'message', attrs)
}

util.inherits(Message, Stanza)

function Presence(attrs) {
    Stanza.call(this, 'presence', attrs)
}

util.inherits(Presence, Stanza)

function Iq(attrs) {
    Stanza.call(this, 'iq', attrs)
}

util.inherits(Iq, Stanza)

exports.Element = ltx.Element
exports.Stanza = Stanza
exports.Message = Message
exports.Presence = Presence
exports.Iq = Iq

},{"ltx":54,"util":22}],50:[function(require,module,exports){
'use strict';

var util = require('util')
  , EventEmitter = require('events').EventEmitter
  , ltx = require('ltx')
  , Stanza = require('./stanza').Stanza

/**
 * Recognizes <stream:stream> and collects stanzas used for ordinary
 * TCP streams and Websockets.
 *
 * API: write(data) & end(data)
 * Events: streamStart, stanza, end, error
 */
function StreamParser(maxStanzaSize) {
    EventEmitter.call(this)

    var self = this
    this.parser = new ltx.bestSaxParser()

    /* Count traffic for entire life-time */
    this.bytesParsed = 0
    this.maxStanzaSize = maxStanzaSize
    /* Will be reset upon first stanza, but enforce maxStanzaSize until it is parsed */
    this.bytesParsedOnStanzaBegin = 0

    this.parser.on('startElement', function(name, attrs) {
            // TODO: refuse anything but <stream:stream>
            if (!self.element && (name === 'stream:stream')) {
                self.emit('streamStart', attrs)
            } else {
                var child
                if (!self.element) {
                    /* A new stanza */
                    child = new Stanza(name, attrs)
                    self.element = child
                      /* For maxStanzaSize enforcement */
                    self.bytesParsedOnStanzaBegin = self.bytesParsed
                } else {
                    /* A child element of a stanza */
                    child = new ltx.Element(name, attrs)
                    self.element = self.element.cnode(child)
                }
            }
        }
    )

    this.parser.on('endElement', function(name) {
        if (!self.element && (name === 'stream:stream')) {
            self.end()
        } else if (self.element && (name === self.element.name)) {
            if (self.element.parent) {
                self.element = self.element.parent
            } else {
                /* Stanza complete */
                self.emit('stanza', self.element)
                delete self.element
                /* maxStanzaSize doesn't apply until next startElement */
                delete self.bytesParsedOnStanzaBegin
            }
        } else {
            self.error('xml-not-well-formed', 'XML parse error')
        }
    })

    this.parser.on('text', function(str) {
        if (self.element)
            self.element.t(str)
    })

    this.parser.on('entityDecl', function() {
        /* Entity declarations are forbidden in XMPP. We must abort to
         * avoid a billion laughs.
         */
        self.error('xml-not-well-formed', 'No entity declarations allowed')
        self.end()
    })

    this.parser.on('error', this.emit.bind(this, 'error'))
}

util.inherits(StreamParser, EventEmitter)


/* 
 * hack for most usecases, do we have a better idea?
 *   catch the following:
 *   <?xml version="1.0"?>
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <?xml version="1.0" encoding="UTF-16" standalone="yes"?>
 */
StreamParser.prototype.checkXMLHeader = function (data) {
    // check for xml tag
    var index = data.indexOf('<?xml');

    if (index !== -1) {
        var end = data.indexOf('?>');
        if (index >= 0 && end >= 0 && index < end+2) {
            var search = data.substring(index,end+2);
            data = data.replace(search, '');
        }
    }

    return data;
}

StreamParser.prototype.write = function(data) {
    /*if (/^<stream:stream [^>]+\/>$/.test(data)) {
    data = data.replace(/\/>$/, ">")
    }*/
    if (this.parser) {
        
        data = data.toString('utf8')
        data = this.checkXMLHeader(data)

    /* If a maxStanzaSize is configured, the current stanza must consist only of this many bytes */
        if (this.bytesParsedOnStanzaBegin && this.maxStanzaSize &&
            this.bytesParsed > this.bytesParsedOnStanzaBegin + this.maxStanzaSize) {

            this.error('policy-violation', 'Maximum stanza size exceeded')
            return
        }
        this.bytesParsed += data.length

        this.parser.write(data)
    }
}

StreamParser.prototype.end = function(data) {
    if (data) {
        this.write(data)
    }
    /* Get GC'ed */
    delete this.parser
    this.emit('end')
}

StreamParser.prototype.error = function(condition, message) {
    var e = new Error(message)
    e.condition = condition
    this.emit('error', e)
}

exports.StreamParser = StreamParser
},{"./stanza":49,"events":14,"ltx":54,"util":22}],51:[function(require,module,exports){

/**
 * Expose `debug()` as the module.
 */

module.exports = debug;

/**
 * Create a debugger with the given `name`.
 *
 * @param {String} name
 * @return {Type}
 * @api public
 */

function debug(name) {
  if (!debug.enabled(name)) return function(){};

  return function(fmt){
    fmt = coerce(fmt);

    var curr = new Date;
    var ms = curr - (debug[name] || curr);
    debug[name] = curr;

    fmt = name
      + ' '
      + fmt
      + ' +' + debug.humanize(ms);

    // This hackery is required for IE8
    // where `console.log` doesn't have 'apply'
    window.console
      && console.log
      && Function.prototype.apply.call(console.log, console, arguments);
  }
}

/**
 * The currently active debug mode names.
 */

debug.names = [];
debug.skips = [];

/**
 * Enables a debug mode by name. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} name
 * @api public
 */

debug.enable = function(name) {
  try {
    localStorage.debug = name;
  } catch(e){}

  var split = (name || '').split(/[\s,]+/)
    , len = split.length;

  for (var i = 0; i < len; i++) {
    name = split[i].replace('*', '.*?');
    if (name[0] === '-') {
      debug.skips.push(new RegExp('^' + name.substr(1) + '$'));
    }
    else {
      debug.names.push(new RegExp('^' + name + '$'));
    }
  }
};

/**
 * Disable debug output.
 *
 * @api public
 */

debug.disable = function(){
  debug.enable('');
};

/**
 * Humanize the given `ms`.
 *
 * @param {Number} m
 * @return {String}
 * @api private
 */

debug.humanize = function(ms) {
  var sec = 1000
    , min = 60 * 1000
    , hour = 60 * min;

  if (ms >= hour) return (ms / hour).toFixed(1) + 'h';
  if (ms >= min) return (ms / min).toFixed(1) + 'm';
  if (ms >= sec) return (ms / sec | 0) + 's';
  return ms + 'ms';
};

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

debug.enabled = function(name) {
  for (var i = 0, len = debug.skips.length; i < len; i++) {
    if (debug.skips[i].test(name)) {
      return false;
    }
  }
  for (var i = 0, len = debug.names.length; i < len; i++) {
    if (debug.names[i].test(name)) {
      return true;
    }
  }
  return false;
};

/**
 * Coerce `val`.
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

// persist

try {
  if (window.localStorage) debug.enable(localStorage.debug);
} catch(e){}

},{}],52:[function(require,module,exports){
arguments[4][23][0].apply(exports,arguments)
},{"./element":53,"util":22}],53:[function(require,module,exports){
'use strict';

/**
 * This cheap replica of DOM/Builder puts me to shame :-)
 *
 * Attributes are in the element.attrs object. Children is a list of
 * either other Elements or Strings for text content.
 **/
function Element(name, attrs) {
    this.name = name
    this.parent = null
    this.attrs = attrs || {}
    this.children = []
}

/*** Accessors ***/

/**
 * if (element.is('message', 'jabber:client')) ...
 **/
Element.prototype.is = function(name, xmlns) {
    return (this.getName() === name) &&
        (!xmlns || (this.getNS() === xmlns))
}

/* without prefix */
Element.prototype.getName = function() {
    if (this.name.indexOf(':') >= 0)
        return this.name.substr(this.name.indexOf(':') + 1)
    else
        return this.name
}

/**
 * retrieves the namespace of the current element, upwards recursively
 **/
Element.prototype.getNS = function() {
    if (this.name.indexOf(':') >= 0) {
        var prefix = this.name.substr(0, this.name.indexOf(':'))
        return this.findNS(prefix)
    } else {
        return this.findNS()
    }
}

/**
 * find the namespace to the given prefix, upwards recursively
 **/
Element.prototype.findNS = function(prefix) {
    if (!prefix) {
        /* default namespace */
        if (this.attrs.xmlns)
            return this.attrs.xmlns
        else if (this.parent)
            return this.parent.findNS()
    } else {
        /* prefixed namespace */
        var attr = 'xmlns:' + prefix
        if (this.attrs[attr])
            return this.attrs[attr]
        else if (this.parent)
            return this.parent.findNS(prefix)
    }
}

/**
 * Recursiverly gets all xmlns defined, in the form of {url:prefix}
 **/
Element.prototype.getXmlns = function() {
    var namespaces = {}

    if (this.parent)
        namespaces = this.parent.getXmlns()

    for (var attr in this.attrs) {
        var m = attr.match('xmlns:?(.*)')
        if (this.attrs.hasOwnProperty(attr) && m) {
            namespaces[this.attrs[attr]] = m[1]
        }
    }
    return namespaces
}


/**
 * xmlns can be null, returns the matching attribute.
 **/
Element.prototype.getAttr = function(name, xmlns) {
    if (!xmlns)
        return this.attrs[name]

    var namespaces = this.getXmlns()

    if (!namespaces[xmlns])
        return null

    return this.attrs[[namespaces[xmlns], name].join(':')]
}

/**
 * xmlns can be null
 **/
Element.prototype.getChild = function(name, xmlns) {
    return this.getChildren(name, xmlns)[0]
}

/**
 * xmlns can be null
 **/
Element.prototype.getChildren = function(name, xmlns) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (child.getName &&
            (child.getName() === name) &&
            (!xmlns || (child.getNS() === xmlns)))
            result.push(child)
    }
    return result
}

/**
 * xmlns and recursive can be null
 **/
Element.prototype.getChildByAttr = function(attr, val, xmlns, recursive) {
    return this.getChildrenByAttr(attr, val, xmlns, recursive)[0]
}

/**
 * xmlns and recursive can be null
 **/
Element.prototype.getChildrenByAttr = function(attr, val, xmlns, recursive) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (child.attrs &&
            (child.attrs[attr] === val) &&
            (!xmlns || (child.getNS() === xmlns)))
            result.push(child)
        if (recursive && child.getChildrenByAttr) {
            result.push(child.getChildrenByAttr(attr, val, xmlns, true))
        }
    }
    if (recursive) result = [].concat.apply([], result)
    return result
}

Element.prototype.getChildrenByFilter = function(filter, recursive) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (filter(child))
            result.push(child)
        if (recursive && child.getChildrenByFilter){
            result.push(child.getChildrenByFilter(filter, true))
        }
    }
    if (recursive) {
        result = [].concat.apply([], result)
    }
    return result
}

Element.prototype.getText = function() {
    var text = ''
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if ((typeof child === 'string') || (typeof child === 'number')) {
            text += child
        }
    }
    return text
}

Element.prototype.getChildText = function(name, xmlns) {
    var child = this.getChild(name, xmlns)
    return child ? child.getText() : null
}

/**
 * Return all direct descendents that are Elements.
 * This differs from `getChildren` in that it will exclude text nodes,
 * processing instructions, etc.
 */
Element.prototype.getChildElements = function() {
    return this.getChildrenByFilter(function(child) {
        return child instanceof Element
    })
}

/*** Builder ***/

/** returns uppermost parent */
Element.prototype.root = function() {
    if (this.parent)
        return this.parent.root()
    else
        return this
}
Element.prototype.tree = Element.prototype.root

/** just parent or itself */
Element.prototype.up = function() {
    if (this.parent)
        return this.parent
    else
        return this
}

Element.prototype._getElement = function(name, attrs) {
    var element = new Element(name, attrs)
    return element
}

/** create child node and return it */
Element.prototype.c = function(name, attrs) {
    return this.cnode(this._getElement(name, attrs))
}

Element.prototype.cnode = function(child) {
    this.children.push(child)
    child.parent = this
    return child
}

/** add text node and return element */
Element.prototype.t = function(text) {
    this.children.push(text)
    return this
}

/*** Manipulation ***/

/**
 * Either:
 *   el.remove(childEl)
 *   el.remove('author', 'urn:...')
 */
Element.prototype.remove = function(el, xmlns) {
    var filter
    if (typeof el === 'string') {
        /* 1st parameter is tag name */
        filter = function(child) {
            return !(child.is &&
                 child.is(el, xmlns))
        }
    } else {
        /* 1st parameter is element */
        filter = function(child) {
            return child !== el
        }
    }

    this.children = this.children.filter(filter)

    return this
}

/**
 * To use in case you want the same XML data for separate uses.
 * Please refrain from this practise unless you know what you are
 * doing. Building XML with ltx is easy!
 */
Element.prototype.clone = function() {
    var clone = this._getElement(this.name, {})
    for (var k in this.attrs) {
        if (this.attrs.hasOwnProperty(k))
            clone.attrs[k] = this.attrs[k]
    }
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        clone.cnode(child.clone ? child.clone() : child)
    }
    return clone
}

Element.prototype.text = function(val) {
    if (val && this.children.length === 1) {
        this.children[0] = val
        return this
    }
    return this.getText()
}

Element.prototype.attr = function(attr, val) {
    if (((typeof val !== 'undefined') || (val === null))) {
        if (!this.attrs) {
            this.attrs = {}
        }
        this.attrs[attr] = val
        return this
    }
    return this.attrs[attr]
}

/*** Serialization ***/

Element.prototype.toString = function() {
    var s = ''
    this.write(function(c) {
        s += c
    })
    return s
}

Element.prototype.toJSON = function() {
    return {
        name: this.name,
        attrs: this.attrs,
        children: this.children.map(function(child) {
            return child && child.toJSON ? child.toJSON() : child;
        })
    }
}

Element.prototype._addChildren = function(writer) {
    writer('>')
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        /* Skip null/undefined */
        if (child || (child === 0)) {
            if (child.write) {
                child.write(writer)
            } else if (typeof child === 'string') {
                writer(escapeXmlText(child))
            } else if (child.toString) {
                writer(escapeXmlText(child.toString(10)))
            }
        }
    }
    writer('</')
    writer(this.name)
    writer('>')
}

Element.prototype.write = function(writer) {
    writer('<')
    writer(this.name)
    for (var k in this.attrs) {
        var v = this.attrs[k]
        if (v || (v === '') || (v === 0)) {
            writer(' ')
            writer(k)
            writer('="')
            if (typeof v !== 'string') {
                v = v.toString(10)
            }
            writer(escapeXml(v))
            writer('"')
        }
    }
    if (this.children.length === 0) {
        writer('/>')
    } else {
        this._addChildren(writer)
    }
}

function escapeXml(s) {
    return s.
        replace(/\&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;').
        replace(/"/g, '&quot;').
        replace(/"/g, '&apos;')
}

function escapeXmlText(s) {
    return s.
        replace(/\&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;')
}

exports.Element = Element
exports.escapeXml = escapeXml

},{}],54:[function(require,module,exports){
arguments[4][25][0].apply(exports,arguments)
},{"./index":55,"./parse":56,"./sax/sax_ltx":57}],55:[function(require,module,exports){
arguments[4][26][0].apply(exports,arguments)
},{"./dom-element":52,"./element":53,"./parse":56}],56:[function(require,module,exports){
arguments[4][27][0].apply(exports,arguments)
},{"./dom-element":52,"events":14,"util":22}],57:[function(require,module,exports){
module.exports=require(28)
},{"events":14,"util":22}],58:[function(require,module,exports){
'use strict';

var log = require('debug')('node-stringprep')

// from unicode/uidna.h
var UIDNA_ALLOW_UNASSIGNED = 1
var UIDNA_USE_STD3_RULES = 2

try {
    var bindings = require('bindings')('node_stringprep.node')
} catch (ex) {
    console.warn(
        'Cannot load StringPrep-' +
        require('./package.json').version +
        ' bindings (using fallback). You may need to ' +
        '`npm install node-stringprep`'
    )
    log(ex)
}

var toUnicode = function(value, options) {
    options = options || {}
    try {
        return bindings.toUnicode(value,
            (options.allowUnassigned && UIDNA_ALLOW_UNASSIGNED) | 0)
    } catch (e) {
        return value
    }
}

var toASCII = function(value, options) {
    options = options || {}
    try {
        return bindings.toASCII(value,
            (options.allowUnassigned && UIDNA_ALLOW_UNASSIGNED) |
            (options.useSTD3Rules && UIDNA_USE_STD3_RULES))
    } catch (e) {
        if (options.throwIfError) {
            throw e
        } else {
            return value
        }
    }
}

var StringPrep = function(operation) {
    this.operation = operation
    try {
        this.stringPrep = new bindings.StringPrep(this.operation)
    } catch (e) {
        this.stringPrep = null
        log('Operation does not exist', operation, e)
    }
}

StringPrep.prototype.UNKNOWN_PROFILE_TYPE = 'Unknown profile type'
StringPrep.prototype.UNHANDLED_FALLBACK = 'Unhandled JS fallback'
StringPrep.prototype.LIBICU_NOT_AVAILABLE = 'libicu unavailable'

StringPrep.prototype.useJsFallbacks = true

StringPrep.prototype.prepare = function(value) {
    this.value = value
    try {
        if (this.stringPrep) {
            return this.stringPrep.prepare(this.value)
        }
    } catch (e) {}
    if (false === this.useJsFallbacks) {
        throw new Error(this.LIBICU_NOT_AVAILABLE)
    }
    return this.jsFallback()
}

StringPrep.prototype.isNative = function() {
    return (null !== this.stringPrep)
}

StringPrep.prototype.jsFallback = function() {
    switch (this.operation) {
        case 'nameprep':
        case 'nodeprep':
            return this.value.toLowerCase()
        case 'resourceprep':
            return this.value
        case 'nfs4_cs_prep':
        case 'nfs4_cis_prep':
        case 'nfs4_mixed_prep prefix':
        case 'nfs4_mixed_prep suffix':
        case 'iscsi':
        case 'mib':
        case 'saslprep':
        case 'trace':
        case 'ldap':
        case 'ldapci':
            throw new Error(this.UNHANDLED_FALLBACK)
        default:
            throw new Error(this.UNKNOWN_PROFILE_TYPE)
    }
}

StringPrep.prototype.disableJsFallbacks = function() {
    this.useJsFallbacks = false
}

StringPrep.prototype.enableJsFallbacks = function() {
    this.useJsFallbacks = true
}

module.exports = {
    toUnicode: toUnicode,
    toASCII: toASCII,
    StringPrep: StringPrep
}

},{"./package.json":63,"bindings":59,"debug":60}],59:[function(require,module,exports){
(function (process,__filename){

/**
 * Module dependencies.
 */

var fs = require('fs')
  , path = require('path')
  , join = path.join
  , dirname = path.dirname
  , exists = fs.existsSync || path.existsSync
  , defaults = {
        arrow: process.env.NODE_BINDINGS_ARROW || ' → '
      , compiled: process.env.NODE_BINDINGS_COMPILED_DIR || 'compiled'
      , platform: process.platform
      , arch: process.arch
      , version: process.versions.node
      , bindings: 'bindings.node'
      , try: [
          // node-gyp's linked version in the "build" dir
          [ 'module_root', 'build', 'bindings' ]
          // node-waf and gyp_addon (a.k.a node-gyp)
        , [ 'module_root', 'build', 'Debug', 'bindings' ]
        , [ 'module_root', 'build', 'Release', 'bindings' ]
          // Debug files, for development (legacy behavior, remove for node v0.9)
        , [ 'module_root', 'out', 'Debug', 'bindings' ]
        , [ 'module_root', 'Debug', 'bindings' ]
          // Release files, but manually compiled (legacy behavior, remove for node v0.9)
        , [ 'module_root', 'out', 'Release', 'bindings' ]
        , [ 'module_root', 'Release', 'bindings' ]
          // Legacy from node-waf, node <= 0.4.x
        , [ 'module_root', 'build', 'default', 'bindings' ]
          // Production "Release" buildtype binary (meh...)
        , [ 'module_root', 'compiled', 'version', 'platform', 'arch', 'bindings' ]
        ]
    }

/**
 * The main `bindings()` function loads the compiled bindings for a given module.
 * It uses V8's Error API to determine the parent filename that this function is
 * being invoked from, which is then used to find the root directory.
 */

function bindings (opts) {

  // Argument surgery
  if (typeof opts == 'string') {
    opts = { bindings: opts }
  } else if (!opts) {
    opts = {}
  }
  opts.__proto__ = defaults

  // Get the module root
  if (!opts.module_root) {
    opts.module_root = exports.getRoot(exports.getFileName())
  }

  // Ensure the given bindings name ends with .node
  if (path.extname(opts.bindings) != '.node') {
    opts.bindings += '.node'
  }

  var tries = []
    , i = 0
    , l = opts.try.length
    , n
    , b
    , err

  for (; i<l; i++) {
    n = join.apply(null, opts.try[i].map(function (p) {
      return opts[p] || p
    }))
    tries.push(n)
    try {
      b = opts.path ? require.resolve(n) : require(n)
      if (!opts.path) {
        b.path = n
      }
      return b
    } catch (e) {
      if (!/not find/i.test(e.message)) {
        throw e
      }
    }
  }

  err = new Error('Could not locate the bindings file. Tried:\n'
    + tries.map(function (a) { return opts.arrow + a }).join('\n'))
  err.tries = tries
  throw err
}
module.exports = exports = bindings


/**
 * Gets the filename of the JavaScript file that invokes this function.
 * Used to help find the root directory of a module.
 */

exports.getFileName = function getFileName () {
  var origPST = Error.prepareStackTrace
    , origSTL = Error.stackTraceLimit
    , dummy = {}
    , fileName

  Error.stackTraceLimit = 10

  Error.prepareStackTrace = function (e, st) {
    for (var i=0, l=st.length; i<l; i++) {
      fileName = st[i].getFileName()
      if (fileName !== __filename) {
        return
      }
    }
  }

  // run the 'prepareStackTrace' function above
  Error.captureStackTrace(dummy)
  dummy.stack

  // cleanup
  Error.prepareStackTrace = origPST
  Error.stackTraceLimit = origSTL

  return fileName
}

/**
 * Gets the root directory of a module, given an arbitrary filename
 * somewhere in the module tree. The "root directory" is the directory
 * containing the `package.json` file.
 *
 *   In:  /home/nate/node-native-module/lib/index.js
 *   Out: /home/nate/node-native-module
 */

exports.getRoot = function getRoot (file) {
  var dir = dirname(file)
    , prev
  while (true) {
    if (dir === '.') {
      // Avoids an infinite loop in rare cases, like the REPL
      dir = process.cwd()
    }
    if (exists(join(dir, 'package.json')) || exists(join(dir, 'node_modules'))) {
      // Found the 'package.json' file or 'node_modules' dir; we're done
      return dir
    }
    if (prev === dir) {
      // Got to the top
      throw new Error('Could not find module root given file: "' + file
                    + '". Do you have a `package.json` file? ')
    }
    // Try the parent dir next
    prev = dir
    dir = join(dir, '..')
  }
}

}).call(this,require("oMfpAn"),"/../../node_modules/node-xmpp-client/node_modules/node-xmpp-core/node_modules/node-stringprep/node_modules/bindings/bindings.js")
},{"fs":3,"oMfpAn":17,"path":16}],60:[function(require,module,exports){
module.exports=require(42)
},{"./debug":61}],61:[function(require,module,exports){
module.exports=require(43)
},{"ms":62}],62:[function(require,module,exports){
module.exports=require(44)
},{}],63:[function(require,module,exports){
module.exports={
  "name": "node-stringprep",
  "version": "0.5.4",
  "main": "index.js",
  "description": "ICU StringPrep profiles",
  "keywords": [
    "unicode",
    "stringprep",
    "icu"
  ],
  "scripts": {
    "test": "grunt test",
    "install": "node-gyp rebuild"
  },
  "dependencies": {
    "nan": "~1.2.0",
    "bindings": "~1.1.1",
    "debug": "~2.0.0"
  },
  "devDependencies": {
    "proxyquire": "~0.5.2",
    "grunt-mocha-cli": "~1.3.0",
    "grunt-contrib-jshint": "~0.7.2",
    "should": "~2.1.1",
    "grunt": "~0.4.2"
  },
  "repository": {
    "type": "git",
    "path": "git://github.com/node-xmpp/node-stringprep.git"
  },
  "homepage": "http://github.com/node-xmpp/node-stringprep",
  "bugs": {
    "url": "http://github.com/node-xmpp/node-stringprep/issues"
  },
  "author": {
    "name": "Lloyd Watkin",
    "email": "lloyd@evilprofessor.co.uk",
    "url": "http://evilprofessor.co.uk"
  },
  "licenses": [
    {
      "type": "MIT"
    }
  ],
  "engines": {
    "node": ">=0.8"
  },
  "gypfile": true,
  "_id": "node-stringprep@0.5.4",
  "dist": {
    "shasum": "dd03b3d8f6f83137754cc1ea1a55675447b0ab92",
    "tarball": "http://registry.npmjs.org/node-stringprep/-/node-stringprep-0.5.4.tgz"
  },
  "_from": "node-stringprep@^0.5.2",
  "_npmVersion": "1.4.3",
  "_npmUser": {
    "name": "lloydwatkin",
    "email": "lloyd@evilprofessor.co.uk"
  },
  "maintainers": [
    {
      "name": "astro",
      "email": "astro@spaceboyz.net"
    },
    {
      "name": "lloydwatkin",
      "email": "lloyd@evilprofessor.co.uk"
    }
  ],
  "directories": {},
  "_shasum": "dd03b3d8f6f83137754cc1ea1a55675447b0ab92",
  "_resolved": "https://registry.npmjs.org/node-stringprep/-/node-stringprep-0.5.4.tgz"
}

},{}],64:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter
var backoff = require('backoff')
var noop = function () {}

module.exports =
function (createConnection) {
  return function (opts, onConnect) {
    onConnect = 'function' == typeof opts ? opts : onConnect
    opts = 'object' == typeof opts ? opts : {initialDelay: 1e3, maxDelay: 30e3}
    if(!onConnect)
      onConnect = opts.onConnect

    var emitter = opts.emitter || new EventEmitter()
    emitter.connected = false
    emitter.reconnect = true

    if(onConnect)
      emitter.on('connect', onConnect)

    var backoffMethod = (backoff[opts.type] || backoff.fibonacci) (opts)

    backoffMethod.on('backoff', function (n, d) {
      emitter.emit('backoff', n, d)
    })

    var args
    var cleanup = noop
    backoffMethod.on('ready', attempt)
    function attempt (n, delay) {
      if(!emitter.reconnect) return

      cleanup()
      emitter.emit('reconnect', n, delay)
      var con = createConnection.apply(null, args)
      if (con !== emitter._connection)
        emitter.emit('connection', con)
      emitter._connection = con

      cleanup = onCleanup
      function onCleanup(err) {
        cleanup = noop
        con.removeListener('connect', connect)
        con.removeListener('error', onDisconnect)
        con.removeListener('close', onDisconnect)
        con.removeListener('end'  , onDisconnect)

        //hack to make http not crash.
        //HTTP IS THE WORST PROTOCOL.
        if(con.constructor.name == 'Request')
          con.on('error', noop)

      }

      function onDisconnect (err) {
        emitter.connected = false
        onCleanup(err)

        //emit disconnect before checking reconnect, so user has a chance to decide not to.
        emitter.emit('disconnect', err)

        if(!emitter.reconnect) return
        try { backoffMethod.backoff() } catch (_) { }
      }

      function connect() {
        backoffMethod.reset()
        emitter.connected = true
        if(onConnect)
          con.removeListener('connect', onConnect)
        emitter.emit('connect', con)
      }

      con
        .on('error', onDisconnect)
        .on('close', onDisconnect)
        .on('end'  , onDisconnect)

      if(opts.immediate || con.constructor.name == 'Request') {
        emitter.connected = true
        emitter.emit('connect', con)
        con.once('data', function () {
          //this is the only way to know for sure that data is coming...
          backoffMethod.reset()
        })
      } else {
        con.on('connect', connect)
      }
    }

    emitter.connect =
    emitter.listen = function () {
      this.reconnect = true
      backoffMethod.reset()
      args = [].slice.call(arguments)
      attempt(0, 0)
      return emitter
    }

    //force reconnection

    emitter.end =
    emitter.disconnect = function () {
      emitter.reconnect = false

      if(emitter._connection)
        emitter._connection.end()

      emitter.emit('disconnect')
      return emitter
    }

    return emitter
  }

}

},{"backoff":65,"events":14}],65:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var Backoff = require('./lib/backoff');
var ExponentialBackoffStrategy = require('./lib/strategy/exponential');
var FibonacciBackoffStrategy = require('./lib/strategy/fibonacci');
var FunctionCall = require('./lib/function_call.js');

module.exports.Backoff = Backoff;
module.exports.FunctionCall = FunctionCall;
module.exports.FibonacciStrategy = FibonacciBackoffStrategy;
module.exports.ExponentialStrategy = ExponentialBackoffStrategy;

/**
 * Constructs a Fibonacci backoff.
 * @param options Fibonacci backoff strategy arguments.
 * @return The fibonacci backoff.
 * @see FibonacciBackoffStrategy
 */
module.exports.fibonacci = function(options) {
    return new Backoff(new FibonacciBackoffStrategy(options));
};

/**
 * Constructs an exponential backoff.
 * @param options Exponential strategy arguments.
 * @return The exponential backoff.
 * @see ExponentialBackoffStrategy
 */
module.exports.exponential = function(options) {
    return new Backoff(new ExponentialBackoffStrategy(options));
};

/**
 * Constructs a FunctionCall for the given function and arguments.
 * @param fn The function to wrap in a backoff handler.
 * @param vargs The function's arguments (var args).
 * @param callback The function's callback.
 * @return The FunctionCall instance.
 */
module.exports.call = function(fn, vargs, callback) {
    var args = Array.prototype.slice.call(arguments);
    fn = args[0];
    vargs = args.slice(1, args.length - 1);
    callback = args[args.length - 1];
    return new FunctionCall(fn, vargs, callback);
};

},{"./lib/backoff":66,"./lib/function_call.js":67,"./lib/strategy/exponential":68,"./lib/strategy/fibonacci":69}],66:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var events = require('events');
var util = require('util');

/**
 * Backoff driver.
 * @param backoffStrategy Backoff delay generator/strategy.
 * @constructor
 */
function Backoff(backoffStrategy) {
    events.EventEmitter.call(this);

    this.backoffStrategy_ = backoffStrategy;
    this.maxNumberOfRetry_ = -1;
    this.backoffNumber_ = 0;
    this.backoffDelay_ = 0;
    this.timeoutID_ = -1;

    this.handlers = {
        backoff: this.onBackoff_.bind(this)
    };
}
util.inherits(Backoff, events.EventEmitter);

/**
 * Sets a limit, greater than 0, on the maximum number of backoffs. A 'fail'
 * event will be emitted when the limit is reached.
 * @param maxNumberOfRetry The maximum number of backoffs.
 */
Backoff.prototype.failAfter = function(maxNumberOfRetry) {
    if (maxNumberOfRetry < 1) {
        throw new Error('Maximum number of retry must be greater than 0. ' +
                        'Actual: ' + maxNumberOfRetry);
    }

    this.maxNumberOfRetry_ = maxNumberOfRetry;
};

/**
 * Starts a backoff operation.
 * @param err Optional paramater to let the listeners know why the backoff
 *     operation was started.
 */
Backoff.prototype.backoff = function(err) {
    if (this.timeoutID_ !== -1) {
        throw new Error('Backoff in progress.');
    }

    if (this.backoffNumber_ === this.maxNumberOfRetry_) {
        this.emit('fail', err);
        this.reset();
    } else {
        this.backoffDelay_ = this.backoffStrategy_.next();
        this.timeoutID_ = setTimeout(this.handlers.backoff, this.backoffDelay_);
        this.emit('backoff', this.backoffNumber_, this.backoffDelay_, err);
    }
};

/**
 * Handles the backoff timeout completion.
 * @private
 */
Backoff.prototype.onBackoff_ = function() {
    this.timeoutID_ = -1;
    this.emit('ready', this.backoffNumber_, this.backoffDelay_);
    this.backoffNumber_++;
};

/**
 * Stops any backoff operation and resets the backoff delay to its inital
 * value.
 */
Backoff.prototype.reset = function() {
    this.backoffNumber_ = 0;
    this.backoffStrategy_.reset();
    clearTimeout(this.timeoutID_);
    this.timeoutID_ = -1;
};

module.exports = Backoff;

},{"events":14,"util":22}],67:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var events = require('events');
var util = require('util');

var Backoff = require('./backoff');
var FibonacciBackoffStrategy = require('./strategy/fibonacci');

/**
 * Returns true if the specified value is a function
 * @param val Variable to test.
 * @return Whether variable is a function.
 */
function isFunction(val) {
    return typeof val == 'function';
}

/**
 * Manages the calling of a function in a backoff loop.
 * @param fn Function to wrap in a backoff handler.
 * @param args Array of function's arguments.
 * @param callback Function's callback.
 * @constructor
 */
function FunctionCall(fn, args, callback) {
    events.EventEmitter.call(this);

    if (!isFunction(fn)) {
        throw new Error('fn should be a function.' +
                        'Actual: ' + typeof fn);
    }

    if (!isFunction(callback)) {
        throw new Error('callback should be a function.' +
                        'Actual: ' + typeof fn);
    }

    this.function_ = fn;
    this.arguments_ = args;
    this.callback_ = callback;
    this.results_ = [];

    this.backoff_ = null;
    this.strategy_ = null;
    this.failAfter_ = -1;

    this.state_ = FunctionCall.State_.PENDING;
}
util.inherits(FunctionCall, events.EventEmitter);

/**
 * Enum of states in which the FunctionCall can be.
 * @private
 */
FunctionCall.State_ = {
    PENDING: 0,
    RUNNING: 1,
    COMPLETED: 2,
    ABORTED: 3
};

/**
 * @return Whether the call is pending.
 */
FunctionCall.prototype.isPending = function() {
    return this.state_ == FunctionCall.State_.PENDING;
};

/**
 * @return Whether the call is in progress.
 */
FunctionCall.prototype.isRunning = function() {
    return this.state_ == FunctionCall.State_.RUNNING;
};

/**
 * @return Whether the call is completed.
 */
FunctionCall.prototype.isCompleted = function() {
    return this.state_ == FunctionCall.State_.COMPLETED;
};

/**
 * @return Whether the call is aborted.
 */
FunctionCall.prototype.isAborted = function() {
    return this.state_ == FunctionCall.State_.ABORTED;
};

/**
 * Sets the backoff strategy.
 * @param strategy The backoff strategy to use.
 * @return Itself for chaining.
 */
FunctionCall.prototype.setStrategy = function(strategy) {
    if (!this.isPending()) {
        throw new Error('FunctionCall in progress.');
    }
    this.strategy_ = strategy;
    return this;
};

/**
 * Returns all intermediary results returned by the wrapped function since
 * the initial call.
 * @return An array of intermediary results.
 */
FunctionCall.prototype.getResults = function() {
    return this.results_.concat();
};

/**
 * Sets the backoff limit.
 * @param maxNumberOfRetry The maximum number of backoffs.
 * @return Itself for chaining.
 */
FunctionCall.prototype.failAfter = function(maxNumberOfRetry) {
    if (!this.isPending()) {
        throw new Error('FunctionCall in progress.');
    }
    this.failAfter_ = maxNumberOfRetry;
    return this;
};

/**
 * Aborts the call.
 */
FunctionCall.prototype.abort = function() {
    if (this.isCompleted()) {
        throw new Error('FunctionCall already completed.');
    }

    if (this.isRunning()) {
        this.backoff_.reset();
    }

    this.state_ = FunctionCall.State_.ABORTED;
};

/**
 * Initiates the call to the wrapped function.
 * @param backoffFactory Optional factory function used to create the backoff
 *     instance.
 */
FunctionCall.prototype.start = function(backoffFactory) {
    if (this.isAborted()) {
        throw new Error('FunctionCall aborted.');
    } else if (!this.isPending()) {
        throw new Error('FunctionCall already started.');
    }

    var strategy = this.strategy_ || new FibonacciBackoffStrategy();

    this.backoff_ = backoffFactory ?
        backoffFactory(strategy) :
        new Backoff(strategy);

    this.backoff_.on('ready', this.doCall_.bind(this));
    this.backoff_.on('fail', this.doCallback_.bind(this));
    this.backoff_.on('backoff', this.handleBackoff_.bind(this));

    if (this.failAfter_ > 0) {
        this.backoff_.failAfter(this.failAfter_);
    }

    this.state_ = FunctionCall.State_.RUNNING;
    this.doCall_();
};

/**
 * Calls the wrapped function.
 * @private
 */
FunctionCall.prototype.doCall_ = function() {
    var eventArgs = ['call'].concat(this.arguments_);
    events.EventEmitter.prototype.emit.apply(this, eventArgs);
    var callback = this.handleFunctionCallback_.bind(this);
    this.function_.apply(null, this.arguments_.concat(callback));
};

/**
 * Calls the wrapped function's callback with the last result returned by the
 * wrapped function.
 * @private
 */
FunctionCall.prototype.doCallback_ = function() {
    var args = this.results_[this.results_.length - 1];
    this.callback_.apply(null, args);
};

/**
 * Handles wrapped function's completion. This method acts as a replacement
 * for the original callback function.
 * @private
 */
FunctionCall.prototype.handleFunctionCallback_ = function() {
    if (this.isAborted()) {
        return;
    }

    var args = Array.prototype.slice.call(arguments);
    this.results_.push(args); // Save callback arguments.
    events.EventEmitter.prototype.emit.apply(this, ['callback'].concat(args));

    if (args[0]) {
        this.backoff_.backoff(args[0]);
    } else {
        this.state_ = FunctionCall.State_.COMPLETED;
        this.doCallback_();
    }
};

/**
 * Handles backoff event.
 * @param number Backoff number.
 * @param delay Backoff delay.
 * @param err The error that caused the backoff.
 * @private
 */
FunctionCall.prototype.handleBackoff_ = function(number, delay, err) {
    this.emit('backoff', number, delay, err);
};

module.exports = FunctionCall;

},{"./backoff":66,"./strategy/fibonacci":69,"events":14,"util":22}],68:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var util = require('util');

var BackoffStrategy = require('./strategy');

/**
 * Exponential backoff strategy.
 * @extends BackoffStrategy
 */
function ExponentialBackoffStrategy(options) {
    BackoffStrategy.call(this, options);
    this.backoffDelay_ = 0;
    this.nextBackoffDelay_ = this.getInitialDelay();
}
util.inherits(ExponentialBackoffStrategy, BackoffStrategy);

/** @inheritDoc */
ExponentialBackoffStrategy.prototype.next_ = function() {
    this.backoffDelay_ = Math.min(this.nextBackoffDelay_, this.getMaxDelay());
    this.nextBackoffDelay_ = this.backoffDelay_ * 2;
    return this.backoffDelay_;
};

/** @inheritDoc */
ExponentialBackoffStrategy.prototype.reset_ = function() {
    this.backoffDelay_ = 0;
    this.nextBackoffDelay_ = this.getInitialDelay();
};

module.exports = ExponentialBackoffStrategy;

},{"./strategy":70,"util":22}],69:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var util = require('util');

var BackoffStrategy = require('./strategy');

/**
 * Fibonacci backoff strategy.
 * @extends BackoffStrategy
 */
function FibonacciBackoffStrategy(options) {
    BackoffStrategy.call(this, options);
    this.backoffDelay_ = 0;
    this.nextBackoffDelay_ = this.getInitialDelay();
}
util.inherits(FibonacciBackoffStrategy, BackoffStrategy);

/** @inheritDoc */
FibonacciBackoffStrategy.prototype.next_ = function() {
    var backoffDelay = Math.min(this.nextBackoffDelay_, this.getMaxDelay());
    this.nextBackoffDelay_ += this.backoffDelay_;
    this.backoffDelay_ = backoffDelay;
    return backoffDelay;
};

/** @inheritDoc */
FibonacciBackoffStrategy.prototype.reset_ = function() {
    this.nextBackoffDelay_ = this.getInitialDelay();
    this.backoffDelay_ = 0;
};

module.exports = FibonacciBackoffStrategy;

},{"./strategy":70,"util":22}],70:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var events = require('events');
var util = require('util');

function isDef(value) {
    return value !== undefined && value !== null;
}

/**
 * Abstract class defining the skeleton for all backoff strategies.
 * @param options Backoff strategy options.
 * @param options.randomisationFactor The randomisation factor, must be between
 * 0 and 1.
 * @param options.initialDelay The backoff initial delay, in milliseconds.
 * @param options.maxDelay The backoff maximal delay, in milliseconds.
 * @constructor
 */
function BackoffStrategy(options) {
    options = options || {};

    if (isDef(options.initialDelay) && options.initialDelay < 1) {
        throw new Error('The initial timeout must be greater than 0.');
    } else if (isDef(options.maxDelay) && options.maxDelay < 1) {
        throw new Error('The maximal timeout must be greater than 0.');
    }

    this.initialDelay_ = options.initialDelay || 100;
    this.maxDelay_ = options.maxDelay || 10000;

    if (this.maxDelay_ <= this.initialDelay_) {
        throw new Error('The maximal backoff delay must be ' +
                        'greater than the initial backoff delay.');
    }

    if (isDef(options.randomisationFactor) &&
        (options.randomisationFactor < 0 || options.randomisationFactor > 1)) {
        throw new Error('The randomisation factor must be between 0 and 1.');
    }

    this.randomisationFactor_ = options.randomisationFactor || 0;
}

/**
 * Retrieves the maximal backoff delay.
 * @return The maximal backoff delay, in milliseconds.
 */
BackoffStrategy.prototype.getMaxDelay = function() {
    return this.maxDelay_;
};

/**
 * Retrieves the initial backoff delay.
 * @return The initial backoff delay, in milliseconds.
 */
BackoffStrategy.prototype.getInitialDelay = function() {
    return this.initialDelay_;
};

/**
 * Template method that computes the next backoff delay.
 * @return The backoff delay, in milliseconds.
 */
BackoffStrategy.prototype.next = function() {
    var backoffDelay = this.next_();
    var randomisationMultiple = 1 + Math.random() * this.randomisationFactor_;
    var randomizedDelay = Math.round(backoffDelay * randomisationMultiple);
    return randomizedDelay;
};

/**
 * Computes the next backoff delay.
 * @return The backoff delay, in milliseconds.
 * @protected
 */
BackoffStrategy.prototype.next_ = function() {
    throw new Error('BackoffStrategy.next_() unimplemented.');
};

/**
 * Template method that resets the backoff delay to its initial value.
 */
BackoffStrategy.prototype.reset = function() {
    this.reset_();
};

/**
 * Resets the backoff delay to its initial value.
 * @protected
 */
BackoffStrategy.prototype.reset_ = function() {
    throw new Error('BackoffStrategy.reset_() unimplemented.');
};

module.exports = BackoffStrategy;

},{"events":14,"util":22}],71:[function(require,module,exports){
(function (process){
'use strict';

module.exports = connect;
connect.connect = connect;

/* this whole file only exists because tls.start
 * doens't exists and tls.connect cannot start server
 * connections
 *
 * copied from _tls_wrap.js
 */

// Target API:
//
//  var s = require('net').createStream(25, 'smtp.example.com')
//  s.on('connect', function() {
//   require('tls-connect')(s, {credentials:creds, isServer:false}, function() {
//      if (!s.authorized) {
//        s.destroy()
//        return
//      }
//
//      s.end("hello world\n")
//    })
//  })

var net = require('net')
var tls = require('tls')
var util = require('util')
var assert = require('assert')
var crypto = require('crypto')

// Returns an array [options] or [options, cb]
// It is the same as the argument of Socket.prototype.connect().
function __normalizeConnectArgs(args) {
  var options = {};

  if (typeof(args[0]) == 'object') {
    // connect(options, [cb])
    options = args[0];
  } else if (isPipeName(args[0])) {
    // connect(path, [cb]);
    options.path = args[0];
  } else {
    // connect(port, [host], [cb])
    options.port = args[0];
    if (typeof(args[1]) === 'string') {
      options.host = args[1];
    }
  }

  var cb = args[args.length - 1];
  return typeof(cb) === 'function' ? [options, cb] : [options];
}

function __checkServerIdentity(host, cert) {
  // Create regexp to much hostnames
  function regexpify(host, wildcards) {
    // Add trailing dot (make hostnames uniform)
    if (!/\.$/.test(host)) host += '.';

    // The same applies to hostname with more than one wildcard,
    // if hostname has wildcard when wildcards are not allowed,
    // or if there are less than two dots after wildcard (i.e. *.com or *d.com)
    //
    // also
    //
    // "The client SHOULD NOT attempt to match a presented identifier in
    // which the wildcard character comprises a label other than the
    // left-most label (e.g., do not match bar.*.example.net)."
    // RFC6125
    if (!wildcards && /\*/.test(host) || /[\.\*].*\*/.test(host) ||
        /\*/.test(host) && !/\*.*\..+\..+/.test(host)) {
      return /$./;
    }

    // Replace wildcard chars with regexp's wildcard and
    // escape all characters that have special meaning in regexps
    // (i.e. '.', '[', '{', '*', and others)
    var re = host.replace(
        /\*([a-z0-9\\-_\.])|[\.,\-\\\^\$+?*\[\]\(\):!\|{}]/g,
        function(all, sub) {
          if (sub) return '[a-z0-9\\-_]*' + (sub === '-' ? '\\-' : sub);
          return '\\' + all;
        });

    return new RegExp('^' + re + '$', 'i');
  }

  var dnsNames = [],
      uriNames = [],
      ips = [],
      matchCN = true,
      valid = false;

  // There're several names to perform check against:
  // CN and altnames in certificate extension
  // (DNS names, IP addresses, and URIs)
  //
  // Walk through altnames and generate lists of those names
  if (cert.subjectaltname) {
    cert.subjectaltname.split(/, /g).forEach(function(altname) {
      if (/^DNS:/.test(altname)) {
        dnsNames.push(altname.slice(4));
      } else if (/^IP Address:/.test(altname)) {
        ips.push(altname.slice(11));
      } else if (/^URI:/.test(altname)) {
        var uri = url.parse(altname.slice(4));
        if (uri) uriNames.push(uri.hostname);
      }
    });
  }

  // If hostname is an IP address, it should be present in the list of IP
  // addresses.
  if (net.isIP(host)) {
    valid = ips.some(function(ip) {
      return ip === host;
    });
  } else {
    // Transform hostname to canonical form
    if (!/\.$/.test(host)) host += '.';

    // Otherwise check all DNS/URI records from certificate
    // (with allowed wildcards)
    dnsNames = dnsNames.map(function(name) {
      return regexpify(name, true);
    });

    // Wildcards ain't allowed in URI names
    uriNames = uriNames.map(function(name) {
      return regexpify(name, false);
    });

    dnsNames = dnsNames.concat(uriNames);

    if (dnsNames.length > 0) matchCN = false;


    // Match against Common Name (CN) only if no supported identifiers are
    // present.
    //
    // "As noted, a client MUST NOT seek a match for a reference identifier
    //  of CN-ID if the presented identifiers include a DNS-ID, SRV-ID,
    //  URI-ID, or any application-specific identifier types supported by the
    //  client."
    // RFC6125
    if (matchCN) {
      var commonNames = cert.subject.CN;
      if (util.isArray(commonNames)) {
        for (var i = 0, k = commonNames.length; i < k; ++i) {
          dnsNames.push(regexpify(commonNames[i], true));
        }
      } else {
        dnsNames.push(regexpify(commonNames, true));
      }
    }

    valid = dnsNames.some(function(re) {
      return re.test(host);
    });
  }

  return valid;
};

// Target API:
//
//  var s = tls.connect({port: 8000, host: "google.com"}, function() {
//    if (!s.authorized) {
//      s.destroy();
//      return;
//    }
//
//    // s.socket;
//
//    s.end("hello world\n");
//  });
//
//
function normalizeConnectArgs(listArgs) {
  var args = __normalizeConnectArgs(listArgs);
  var options = args[0];
  var cb = args[1];

  if (typeof(listArgs[1]) === 'object') {
    options = util._extend(options, listArgs[1]);
  } else if (typeof(listArgs[2]) === 'object') {
    options = util._extend(options, listArgs[2]);
  }

  return (cb) ? [options, cb] : [options];
}

function legacyConnect(hostname, options, NPN, credentials) {
  assert(options.socket);
  var pair = tls.createSecurePair(credentials,
                                  !!options.isServer,
                                  !!options.requestCert,
                                  !!options.rejectUnauthorized,
                                  {
                                    NPNProtocols: NPN.NPNProtocols,
                                    servername: hostname
                                  });
  legacyPipe(pair, options.socket);
  pair.cleartext._controlReleased = true;
  pair.on('error', function(err) {
    pair.cleartext.emit('error', err);
  });

  return pair;
}

function connect(/* [port, host], options, cb */) {
  var args = normalizeConnectArgs(arguments);
  var options = args[0];
  var cb = args[1];

  var defaults = {
    rejectUnauthorized: '0' !== process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    requestCert: true,
    isServer: false
  };
  options = util._extend(defaults, options || {});

  var hostname = options.servername ||
                 options.host ||
                 options.socket && options.socket._host ||
                 '127.0.0.1',
      NPN = {},
      credentials = options.credentials || crypto.createCredentials(options);
  if (tls.convertNPNProtocols)
    tls.convertNPNProtocols(options.NPNProtocols, NPN);

  // Wrapping TLS socket inside another TLS socket was requested -
  // create legacy secure pair
  var socket;
  var legacy;
  var result;
  if (typeof tls.TLSSocket === 'undefined') {
    legacy = true;
    socket = legacyConnect(hostname, options, NPN, credentials);
    result = socket.cleartext;
  } else {
    legacy = false;
    socket = new tls.TLSSocket(options.socket, {
      credentials: credentials,
      isServer: !!options.isServer,
      requestCert: !!options.requestCert,
      rejectUnauthorized: !!options.rejectUnauthorized,
      NPNProtocols: NPN.NPNProtocols
    });
    result = socket;
  }

  if (socket._handle && !socket._connecting) {
    onHandle();
  } else {
    // Not even started connecting yet (or probably resolving dns address),
    // catch socket errors and assign handle.
    if (!legacy && options.socket) {
      options.socket.once('connect', function() {
        assert(options.socket._handle);
        socket._handle = options.socket._handle;
        socket._handle.owner = socket;

        socket.emit('connect');
      });
    }
    socket.once('connect', onHandle);
  }

  if (cb)
    result.once('secureConnect', cb);

  if (!options.socket) {
    assert(!legacy);
    var connect_opt;
    if (options.path && !options.port) {
      connect_opt = { path: options.path };
    } else {
      connect_opt = {
        port: options.port,
        host: options.host,
        localAddress: options.localAddress
      };
    }
    socket.connect(connect_opt);
  }

  return result;

  function onHandle() {
    if (!legacy)
      socket._releaseControl();

    if (options.session)
      socket.setSession(options.session);

    if (!legacy) {
      if (options.servername)
        socket.setServername(options.servername);

      if (!options.isServer)
        socket._start();
    }
    socket.on('secure', function() {
      var ssl = socket._ssl || socket.ssl;
      var verifyError = ssl.verifyError();

      // Verify that server's identity matches it's certificate's names
      if (!verifyError) {
        var cert = result.getPeerCertificate();
        var validCert = __checkServerIdentity(hostname, cert);
        if (!validCert) {
          verifyError = new Error('Hostname/IP doesn\'t match certificate\'s ' +
                                  'altnames');
        }
      }

      if (verifyError) {
        result.authorized = false;
        result.authorizationError = verifyError.message;

        if (options.rejectUnauthorized) {
          result.emit('error', verifyError);
          result.destroy();
          return;
        } else {
          result.emit('secureConnect');
        }
      } else {
        result.authorized = true;
        result.emit('secureConnect');
      }

      // Uncork incoming data
      result.removeListener('end', onHangUp);
    });

    function onHangUp() {
      // NOTE: This logic is shared with _http_client.js
      if (!socket._hadError) {
        socket._hadError = true;
        var error = new Error('socket hang up');
        error.code = 'ECONNRESET';
        socket.destroy();
        socket.emit('error', error);
      }
    }
    result.once('end', onHangUp);
  }
};

function legacyPipe(pair, socket) {
  pair.encrypted.pipe(socket);
  socket.pipe(pair.encrypted);

  pair.encrypted.on('close', function() {
    process.nextTick(function() {
      // Encrypted should be unpiped from socket to prevent possible
      // write after destroy.
      if (pair.encrypted.unpipe)
        pair.encrypted.unpipe(socket);
      socket.destroySoon();
    });
  });

  pair.fd = socket.fd;
  pair._handle = socket._handle;
  var cleartext = pair.cleartext;
  cleartext.socket = socket;
  cleartext.encrypted = pair.encrypted;
  cleartext.authorized = false;

  // cycle the data whenever the socket drains, so that
  // we can pull some more into it.  normally this would
  // be handled by the fact that pipe() triggers read() calls
  // on writable.drain, but CryptoStreams are a bit more
  // complicated.  Since the encrypted side actually gets
  // its data from the cleartext side, we have to give it a
  // light kick to get in motion again.
  socket.on('drain', function() {
    if (pair.encrypted._pending && pair.encrypted._writePending)
      pair.encrypted._writePending();
    if (pair.cleartext._pending && pair.cleartext._writePending)
      pair.cleartext._writePending();
    if (pair.encrypted.read)
      pair.encrypted.read(0);
    if (pair.cleartext.read)
      pair.cleartext.read(0);
  });

  function onerror(e) {
    if (cleartext._controlReleased) {
      cleartext.emit('error', e);
    }
  }

  function onclose() {
    socket.removeListener('error', onerror);
    socket.removeListener('timeout', ontimeout);
  }

  function ontimeout() {
    cleartext.emit('timeout');
  }

  socket.on('error', onerror);
  socket.on('close', onclose);
  socket.on('timeout', ontimeout);

  return cleartext;
};

}).call(this,require("oMfpAn"))
},{"assert":4,"crypto":9,"net":3,"oMfpAn":17,"tls":3,"util":22}]},{},[2])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL2xpYi9jb25uZWN0b3IuY29mZmVlIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbGliL3htcHAtY29ubmVjdG9yL3htcHAtY29ubmVjdG9yLmNvZmZlZSIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbGliL19lbXB0eS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Fzc2VydC9hc3NlcnQuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2Jhc2U2NC1qcy9saWIvYjY0LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pZWVlNzU0L2luZGV4LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvaGVscGVycy5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2NyeXB0by1icm93c2VyaWZ5L2luZGV4LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvbWQ1LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvcm5nLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvc2hhLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvc2hhMjU2LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvZXZlbnRzL2V2ZW50cy5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luaGVyaXRzL2luaGVyaXRzX2Jyb3dzZXIuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wYXRoLWJyb3dzZXJpZnkvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmctZXMzL2VuY29kZS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9pbmRleC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3V0aWwvc3VwcG9ydC9pc0J1ZmZlckJyb3dzZXIuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3V0aWwuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbHR4L2xpYi9kb20tZWxlbWVudC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9sdHgvbGliL2VsZW1lbnQuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbHR4L2xpYi9pbmRleC1icm93c2VyaWZ5LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL2x0eC9saWIvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbHR4L2xpYi9wYXJzZS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9sdHgvbGliL3NheC9zYXhfbHR4LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYXV0aGVudGljYXRpb24vYW5vbnltb3VzLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL2F1dGhlbnRpY2F0aW9uL2RpZ2VzdG1kNS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9hdXRoZW50aWNhdGlvbi9leHRlcm5hbC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9hdXRoZW50aWNhdGlvbi9tZWNoYW5pc20uanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYXV0aGVudGljYXRpb24vcGxhaW4uanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYXV0aGVudGljYXRpb24veGZhY2Vib29rLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL2F1dGhlbnRpY2F0aW9uL3hvYXV0aDIuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYm9zaC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9zYXNsLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL3Nlc3Npb24uanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvd2Vic29ja2V0cy5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9icm93c2VyLXJlcXVlc3QvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvZGVidWcvYnJvd3Nlci5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9kZWJ1Zy9kZWJ1Zy5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9kZWJ1Zy9ub2RlX21vZHVsZXMvbXMvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbGliL2Nvbm5lY3Rpb24uanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbGliL2ppZC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9saWIvc3J2LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL2xpYi9zdGFuemEuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbGliL3N0cmVhbV9wYXJzZXIuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL2RlYnVnL2RlYnVnLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9sdHgvbGliL2RvbS1lbGVtZW50LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9sdHgvbGliL2VsZW1lbnQuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL2x0eC9saWIvaW5kZXgtYnJvd3NlcmlmeS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbHR4L2xpYi9pbmRleC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbHR4L2xpYi9wYXJzZS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbm9kZS1zdHJpbmdwcmVwL2luZGV4LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9ub2RlLXN0cmluZ3ByZXAvbm9kZV9tb2R1bGVzL2JpbmRpbmdzL2JpbmRpbmdzLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9ub2RlLXN0cmluZ3ByZXAvcGFja2FnZS5qc29uIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9yZWNvbm5lY3QtY29yZS9pbmRleC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvcmVjb25uZWN0LWNvcmUvbm9kZV9tb2R1bGVzL2JhY2tvZmYvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2xpYi9iYWNrb2ZmLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9yZWNvbm5lY3QtY29yZS9ub2RlX21vZHVsZXMvYmFja29mZi9saWIvZnVuY3Rpb25fY2FsbC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS9ZYXR0YS1Db25uZWN0b3JzL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvcmVjb25uZWN0LWNvcmUvbm9kZV9tb2R1bGVzL2JhY2tvZmYvbGliL3N0cmF0ZWd5L2V4cG9uZW50aWFsLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9yZWNvbm5lY3QtY29yZS9ub2RlX21vZHVsZXMvYmFja29mZi9saWIvc3RyYXRlZ3kvZmlib25hY2NpLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL1lhdHRhLUNvbm5lY3RvcnMvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9yZWNvbm5lY3QtY29yZS9ub2RlX21vZHVsZXMvYmFja29mZi9saWIvc3RyYXRlZ3kvc3RyYXRlZ3kuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UvWWF0dGEtQ29ubmVjdG9ycy9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3Rscy1jb25uZWN0L3N0YXJ0dGxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQ0EsSUFBQSxTQUFBOztBQUFBO0FBRWUsRUFBQSxtQkFBQSxHQUFBO0FBRVgsSUFBQSxJQUFDLENBQUEsU0FBRCxHQUFhLEtBQWIsQ0FBQTtBQUFBLElBRUEsSUFBQyxDQUFBLG1CQUFELEdBQXVCLEVBRnZCLENBQUE7QUFBQSxJQUlBLElBQUMsQ0FBQSxXQUFELEdBQWUsRUFKZixDQUFBO0FBQUEsSUFNQSxJQUFDLENBQUEsb0JBQUQsR0FBd0IsRUFOeEIsQ0FBQTtBQUFBLElBUUEsSUFBQyxDQUFBLGdCQUFELEdBQW9CLEVBUnBCLENBQUE7QUFBQSxJQVVBLElBQUMsQ0FBQSxrQkFBRCxHQUFzQixFQVZ0QixDQUFBO0FBQUEsSUFXQSxJQUFDLENBQUEsZ0JBQUQsR0FBb0IsRUFYcEIsQ0FGVztFQUFBLENBQWI7O0FBQUEsc0JBZUEscUJBQUEsR0FBdUIsU0FBQSxHQUFBO1dBQ3JCLElBQUMsQ0FBQSxHQURvQjtFQUFBLENBZnZCLENBQUE7O0FBQUEsc0JBa0JBLGFBQUEsR0FBZSxTQUFDLENBQUQsR0FBQTtXQUNiLElBQUMsQ0FBQSxnQkFBZ0IsQ0FBQyxJQUFsQixDQUF1QixDQUF2QixFQURhO0VBQUEsQ0FsQmYsQ0FBQTs7QUFBQSxzQkF5QkEsVUFBQSxHQUFZLFNBQUMsSUFBRCxHQUFBO0FBQ1YsSUFBQSxJQUFHLElBQUMsQ0FBQSxTQUFKO2FBQ0UsSUFBSyxDQUFBLENBQUEsQ0FBRSxDQUFDLEtBQVIsQ0FBYyxJQUFkLEVBQW9CLElBQUssU0FBekIsRUFERjtLQUFBLE1BQUE7YUFHRSxJQUFDLENBQUEsbUJBQW1CLENBQUMsSUFBckIsQ0FBMEIsSUFBMUIsRUFIRjtLQURVO0VBQUEsQ0F6QlosQ0FBQTs7QUFBQSxzQkFtQ0EsYUFBQSxHQUFlLFNBQUMsQ0FBRCxHQUFBO1dBQ2IsSUFBQyxDQUFBLGdCQUFnQixDQUFDLElBQWxCLENBQXVCLENBQXZCLEVBRGE7RUFBQSxDQW5DZixDQUFBOztBQUFBLHNCQTJDQSxTQUFBLEdBQVcsU0FBQyxLQUFELEVBQVEsT0FBUixHQUFBO1dBQ1QsSUFBQyxDQUFBLFVBQUQsQ0FBWSxDQUFDLEtBQUQsRUFBUSxLQUFSLEVBQWUsT0FBZixDQUFaLEVBRFM7RUFBQSxDQTNDWCxDQUFBOztBQUFBLHNCQW1EQSxPQUFBLEdBQVMsU0FBQyxJQUFELEVBQU8sT0FBUCxHQUFBO1dBQ1AsSUFBQyxDQUFBLFVBQUQsQ0FBWSxDQUFDLEtBQUQsRUFBUSxJQUFSLEVBQWMsT0FBZCxDQUFaLEVBRE87RUFBQSxDQW5EVCxDQUFBOztBQUFBLHNCQTBEQSxTQUFBLEdBQVcsU0FBQyxPQUFELEdBQUE7V0FDVCxJQUFDLENBQUEsVUFBRCxDQUFZLE9BQVosRUFEUztFQUFBLENBMURYLENBQUE7O0FBQUEsc0JBeUVBLFdBQUEsR0FBYSxTQUFBLEdBQUE7QUFDWCxRQUFBLHFCQUFBO0FBQUE7U0FBUyxnR0FBVCxHQUFBO0FBQ0Usb0JBQUEsSUFBQyxDQUFBLGtCQUFrQixDQUFDLE9BQXBCLENBQTRCLFNBQVUsQ0FBQSxDQUFBLENBQXRDLEVBQUEsQ0FERjtBQUFBO29CQURXO0VBQUEsQ0F6RWIsQ0FBQTs7bUJBQUE7O0lBRkYsQ0FBQTs7QUFBQSxNQWlGTSxDQUFDLE9BQVAsR0FBaUIsU0FqRmpCLENBQUE7Ozs7O0FDQUEsSUFBQSw2RkFBQTtFQUFBO2lTQUFBOztBQUFBLElBQUEsR0FBTyxPQUFBLENBQVEsa0JBQVIsQ0FBUCxDQUFBOztBQUFBLEdBQ0EsR0FBTSxPQUFBLENBQVEsS0FBUixDQUROLENBQUE7O0FBQUEseUJBR0EsR0FBNEIsU0FBQyxHQUFELEdBQUE7U0FDMUIsR0FBRyxDQUFDLEtBQUosQ0FBVSxHQUFWLENBQWUsQ0FBQSxDQUFBLEVBRFc7QUFBQSxDQUg1QixDQUFBOztBQUFBLFNBTUEsR0FBWSxPQUFBLENBQVEsY0FBUixDQU5aLENBQUE7O0FBQUEsYUFtQkEsR0FBZ0IsU0FBQyxDQUFELEdBQUE7QUFDZCxNQUFBLHlCQUFBO0FBQUEsRUFBQSxXQUFBLEdBQWMsU0FBQyxJQUFELEdBQUE7QUFDWixRQUFBLDJCQUFBO0FBQUE7QUFBQTtTQUFBLDJDQUFBO21CQUFBO0FBQ0UsTUFBQSxJQUFHLENBQUMsQ0FBQyxZQUFGLENBQWUsU0FBZixDQUFBLEtBQTZCLE1BQWhDO3NCQUNFLFdBQUEsQ0FBWSxDQUFaLEdBREY7T0FBQSxNQUFBO3NCQUdFLFlBQUEsQ0FBYSxDQUFiLEdBSEY7T0FERjtBQUFBO29CQURZO0VBQUEsQ0FBZCxDQUFBO0FBQUEsRUFPQSxZQUFBLEdBQWUsU0FBQyxJQUFELEdBQUE7QUFDYixRQUFBLGdEQUFBO0FBQUEsSUFBQSxJQUFBLEdBQU8sRUFBUCxDQUFBO0FBQ0E7QUFBQSxTQUFBLFlBQUE7eUJBQUE7QUFDRSxNQUFBLEdBQUEsR0FBTSxRQUFBLENBQVMsS0FBVCxDQUFOLENBQUE7QUFDQSxNQUFBLElBQUcsS0FBQSxDQUFNLEdBQU4sQ0FBQSxJQUFjLENBQUMsRUFBQSxHQUFHLEdBQUosQ0FBQSxLQUFjLEtBQS9CO0FBQ0UsUUFBQSxJQUFLLENBQUEsSUFBQSxDQUFMLEdBQWEsS0FBYixDQURGO09BQUEsTUFBQTtBQUdFLFFBQUEsSUFBSyxDQUFBLElBQUEsQ0FBTCxHQUFhLEdBQWIsQ0FIRjtPQUZGO0FBQUEsS0FEQTtBQU9BO0FBQUEsU0FBQSw0Q0FBQTtvQkFBQTtBQUNFLE1BQUEsSUFBQSxHQUFPLENBQUMsQ0FBQyxJQUFULENBQUE7QUFDQSxNQUFBLElBQUcsQ0FBQyxDQUFDLFlBQUYsQ0FBZSxTQUFmLENBQUEsS0FBNkIsTUFBaEM7QUFDRSxRQUFBLElBQUssQ0FBQSxJQUFBLENBQUwsR0FBYSxXQUFBLENBQVksQ0FBWixDQUFiLENBREY7T0FBQSxNQUFBO0FBR0UsUUFBQSxJQUFLLENBQUEsSUFBQSxDQUFMLEdBQWEsWUFBQSxDQUFhLENBQWIsQ0FBYixDQUhGO09BRkY7QUFBQSxLQVBBO1dBYUEsS0FkYTtFQUFBLENBUGYsQ0FBQTtTQXNCQSxZQUFBLENBQWEsQ0FBYixFQXZCYztBQUFBLENBbkJoQixDQUFBOztBQUFBLGNBcURBLEdBQWlCLFNBQUMsQ0FBRCxFQUFJLElBQUosR0FBQTtBQUVmLE1BQUEsMkJBQUE7QUFBQSxFQUFBLGFBQUEsR0FBZ0IsU0FBQyxDQUFELEVBQUksSUFBSixHQUFBO0FBQ2QsUUFBQSxXQUFBO0FBQUEsU0FBQSxZQUFBO3lCQUFBO0FBQ0UsTUFBQSxJQUFPLGFBQVA7QUFBQTtPQUFBLE1BRUssSUFBRyxLQUFLLENBQUMsV0FBTixLQUFxQixNQUF4QjtBQUNILFFBQUEsYUFBQSxDQUFjLENBQUMsQ0FBQyxDQUFGLENBQUksSUFBSixDQUFkLEVBQXlCLEtBQXpCLENBQUEsQ0FERztPQUFBLE1BRUEsSUFBRyxLQUFLLENBQUMsV0FBTixLQUFxQixLQUF4QjtBQUNILFFBQUEsWUFBQSxDQUFhLENBQUMsQ0FBQyxDQUFGLENBQUksSUFBSixDQUFiLEVBQXdCLEtBQXhCLENBQUEsQ0FERztPQUFBLE1BQUE7QUFHSCxRQUFBLENBQUMsQ0FBQyxZQUFGLENBQWUsSUFBZixFQUFvQixLQUFwQixDQUFBLENBSEc7T0FMUDtBQUFBLEtBQUE7V0FTQSxFQVZjO0VBQUEsQ0FBaEIsQ0FBQTtBQUFBLEVBV0EsWUFBQSxHQUFlLFNBQUMsQ0FBRCxFQUFJLEtBQUosR0FBQTtBQUNiLFFBQUEsV0FBQTtBQUFBLElBQUEsQ0FBQyxDQUFDLFlBQUYsQ0FBZSxTQUFmLEVBQXlCLE1BQXpCLENBQUEsQ0FBQTtBQUNBLFNBQUEsNENBQUE7b0JBQUE7QUFDRSxNQUFBLElBQUcsQ0FBQyxDQUFDLFdBQUYsS0FBaUIsTUFBcEI7QUFDRSxRQUFBLGFBQUEsQ0FBYyxDQUFDLENBQUMsQ0FBRixDQUFJLGVBQUosQ0FBZCxFQUFvQyxDQUFwQyxDQUFBLENBREY7T0FBQSxNQUFBO0FBR0UsUUFBQSxZQUFBLENBQWEsQ0FBQyxDQUFDLENBQUYsQ0FBSSxlQUFKLENBQWIsRUFBbUMsQ0FBbkMsQ0FBQSxDQUhGO09BREY7QUFBQSxLQURBO1dBTUEsRUFQYTtFQUFBLENBWGYsQ0FBQTtBQW1CQSxFQUFBLElBQUcsSUFBSSxDQUFDLFdBQUwsS0FBb0IsTUFBdkI7V0FDRSxhQUFBLENBQWMsQ0FBQyxDQUFDLENBQUYsQ0FBSSxPQUFKLEVBQVk7QUFBQSxNQUFDLEtBQUEsRUFBTSxxQ0FBUDtLQUFaLENBQWQsRUFBMEUsSUFBMUUsRUFERjtHQUFBLE1BRUssSUFBRyxJQUFJLENBQUMsV0FBTCxLQUFvQixLQUF2QjtXQUNILFlBQUEsQ0FBYSxDQUFDLENBQUMsQ0FBRixDQUFJLE9BQUosRUFBWTtBQUFBLE1BQUMsS0FBQSxFQUFNLHFDQUFQO0tBQVosQ0FBYixFQUF5RSxJQUF6RSxFQURHO0dBQUEsTUFBQTtBQUdILFVBQVUsSUFBQSxLQUFBLENBQU0sMkJBQU4sQ0FBVixDQUhHO0dBdkJVO0FBQUEsQ0FyRGpCLENBQUE7O0FBQUE7QUFtRkUsa0NBQUEsQ0FBQTs7QUFBYSxFQUFBLHVCQUFDLElBQUQsR0FBQTtBQUNYLFFBQUEsSUFBQTtBQUFBLElBQUEsNkNBQUEsQ0FBQSxDQUFBO0FBQUEsSUFDQSxJQUFDLENBQUEsSUFBRCxHQUFZLElBQUEsSUFBSSxDQUFDLE1BQUwsQ0FDVjtBQUFBLE1BQUEsR0FBQSxFQUFLLGNBQUw7QUFBQSxNQUNBLFNBQUEsRUFBVyxXQURYO0FBQUEsTUFFQSxTQUFBLEVBQ0U7QUFBQSxRQUFBLEdBQUEsRUFBSyxxQ0FBTDtPQUhGO0tBRFUsQ0FEWixDQUFBO0FBQUEsSUFPQSxJQUFDLENBQUEsVUFBRCxHQUFjLElBUGQsQ0FBQTtBQUFBLElBUUEsSUFBQyxDQUFBLFVBQUQsR0FBYyxLQVJkLENBQUE7QUFBQSxJQVVBLElBQUMsQ0FBQSxXQUFELEdBQWUsRUFWZixDQUFBO0FBQUEsSUFXQSxJQUFBLEdBQU8sSUFYUCxDQUFBO0FBQUEsSUFZQSxJQUFDLENBQUEsSUFBSSxDQUFDLEVBQU4sQ0FBUyxRQUFULEVBQW1CLFNBQUEsR0FBQTtBQUtqQixVQUFBLG9DQUFBO0FBQUEsTUFBQSxJQUFJLENBQUMsSUFBTCxHQUFZLElBQUEsR0FBTyx5QkFBbkIsQ0FBQTtBQUFBLE1BQ0EsSUFBSSxDQUFDLFFBQUwsR0FBZ0IsSUFBSSxDQUFDLElBQUwsR0FBWSxHQUFaLEdBQWtCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBRGhELENBQUE7QUFBQSxNQUVBLElBQUksQ0FBQyxFQUFMLEdBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFGeEIsQ0FBQTtBQUdBO0FBQUEsV0FBQSwyQ0FBQTtxQkFBQTtBQUNFLFFBQUEsQ0FBQSxDQUFFLElBQUksQ0FBQyxFQUFQLENBQUEsQ0FERjtBQUFBLE9BSEE7QUFBQSxNQUtBLGlCQUFBLEdBQXdCLElBQUEsR0FBRyxDQUFDLE9BQUosQ0FBWSxVQUFaLEVBQ3BCO0FBQUEsUUFBQSxFQUFBLEVBQUksSUFBSSxDQUFDLFFBQVQ7T0FEb0IsQ0FFdEIsQ0FBQyxDQUZxQixDQUVuQixHQUZtQixFQUVkLEVBRmMsQ0FMeEIsQ0FBQTthQVFBLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBVixDQUFlLGlCQUFmLEVBYmlCO0lBQUEsQ0FBbkIsQ0FaQSxDQUFBO0FBQUEsSUEyQkEsSUFBQyxDQUFBLElBQUksQ0FBQyxFQUFOLENBQVMsUUFBVCxFQUFtQixTQUFDLE1BQUQsR0FBQTtBQUNqQixVQUFBLCtFQUFBO0FBQUEsTUFBQSxNQUFBLEdBQVMsTUFBTSxDQUFDLFlBQVAsQ0FBb0IsTUFBcEIsQ0FBVCxDQUFBO0FBQ0EsTUFBQSxJQUFHLE1BQU0sQ0FBQyxFQUFQLENBQVUsVUFBVixDQUFIO0FBQ0UsUUFBQSxXQUFBLEdBQWMsTUFBTSxDQUFDLFFBQVAsQ0FBZ0IsR0FBaEIsRUFBb0IscUNBQXBCLENBQTBELENBQUMsUUFBM0QsQ0FBb0UsTUFBcEUsQ0FBMkUsQ0FBQyxZQUE1RSxDQUF5RixNQUF6RixDQUFkLENBQUE7QUFDQSxRQUFBLElBQUcsTUFBQSxLQUFVLElBQUksQ0FBQyxRQUFsQjtBQUNFLFVBQUEsSUFBSSxDQUFDLElBQUwsR0FBWSxXQUFaLENBQUE7QUFDQSxVQUFBLElBQUcsSUFBSSxDQUFDLElBQUwsS0FBYSxXQUFoQjtBQUVFLFlBQUEsSUFBSSxDQUFDLFNBQUwsR0FBaUIsSUFBakIsQ0FGRjtXQUZGO1NBQUEsTUFLSyxJQUFHLE1BQU0sQ0FBQyxZQUFQLENBQW9CLE1BQXBCLENBQUEsS0FBK0IsYUFBbEM7QUFDSCxVQUFBLE1BQUEsQ0FBQSxJQUFXLENBQUMsV0FBWSxDQUFBLHlCQUFBLENBQTBCLE1BQTFCLENBQUEsQ0FBeEIsQ0FERztTQUFBLE1BQUE7QUFHSCxVQUFBLElBQUksQ0FBQyxXQUFZLENBQUEseUJBQUEsQ0FBMEIsTUFBMUIsQ0FBQSxDQUFqQixHQUFxRCxNQUFyRCxDQUFBO0FBQ0EsVUFBQSxJQUFHLENBQUEsSUFBSyxDQUFBLFNBQUwsSUFBbUIsV0FBQSxLQUFlLFdBQXJDO0FBQ0UsWUFBQSxJQUFJLENBQUMsWUFBTCxDQUFrQixNQUFsQixDQUFBLENBREY7V0FKRztTQVBQO09BQUEsTUFBQTtBQWNFLFFBQUEsSUFBRyxNQUFBLEtBQVUsSUFBSSxDQUFDLFFBQWxCO0FBQ0UsaUJBQU8sSUFBUCxDQURGO1NBQUE7QUFBQSxRQUVBLEdBQUEsR0FBTSxNQUFNLENBQUMsUUFBUCxDQUFnQixPQUFoQixFQUF5QixxQ0FBekIsQ0FGTixDQUFBOztVQUdBLElBQUksQ0FBQyxrQkFBbUI7U0FIeEI7QUFBQSxRQUlBLElBQUksQ0FBQyxlQUFMLEVBSkEsQ0FBQTtBQU1BLFFBQUEsSUFBRyxXQUFIO0FBQ0UsVUFBQSxHQUFBLEdBQU0sYUFBQSxDQUFjLEdBQWQsQ0FBTixDQUFBO0FBQ0EsVUFBQSxJQUFPLHFCQUFQO0FBQ0U7QUFBQSxpQkFBQSwyQ0FBQTsyQkFBQTtBQUNFLGNBQUEsQ0FBQSxDQUFFLE1BQUYsRUFBVSxHQUFWLENBQUEsQ0FERjtBQUFBLGFBREY7V0FBQSxNQUFBO0FBSUUsWUFBQSxJQUFBLEdBQU8sSUFBSSxDQUFDLGtCQUFtQixDQUFBLEdBQUcsQ0FBQyxTQUFKLEdBQWMsQ0FBZCxDQUF4QixDQUF5QyxHQUFHLENBQUMsSUFBN0MsQ0FBUCxDQUFBO0FBQ0EsWUFBQSxJQUFHLEdBQUcsQ0FBQyxTQUFKLEdBQWdCLENBQWhCLEdBQW9CLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUEvQztBQUNFLGNBQUEsSUFBSSxDQUFDLEtBQUwsQ0FBVyxNQUFYLEVBQ0U7QUFBQSxnQkFBQSxTQUFBLEVBQVcsR0FBRyxDQUFDLFNBQUosR0FBZ0IsQ0FBM0I7QUFBQSxnQkFDQSxJQUFBLEVBQU0sSUFETjtlQURGLENBQUEsQ0FBQTtBQUdBLGNBQUEsSUFBRyxzQkFBSDtBQUNFLGdCQUFBLFVBQUEsR0FBZ0IsQ0FBQSxTQUFDLFFBQUQsRUFBa0IsU0FBbEIsR0FBQTt5QkFDZCxTQUFBLEdBQUE7QUFDRSxvQkFBQSxJQUFBLEdBQU8sSUFBSSxDQUFDLGtCQUFtQixDQUFBLEdBQUcsQ0FBQyxTQUFKLEdBQWMsQ0FBZCxDQUF4QixDQUF5QyxJQUFJLENBQUMsWUFBOUMsQ0FBUCxDQUFBOzJCQUNBLElBQUksQ0FBQyxLQUFMLENBQVcsTUFBWCxFQUNFO0FBQUEsc0JBQUEsU0FBQSxFQUFXLFNBQUEsR0FBWSxDQUF2QjtBQUFBLHNCQUNBLElBQUEsRUFBTSxJQUROO0FBQUEsc0JBRUEsVUFBQSxFQUFZLE1BRlo7cUJBREYsRUFGRjtrQkFBQSxFQURjO2dCQUFBLENBQUEsQ0FBSCxDQUFlLElBQWYsRUFBaUMsR0FBRyxDQUFDLFNBQXJDLENBQWIsQ0FBQTtBQUFBLGdCQU9BLFVBQUEsQ0FBVyxVQUFYLEVBQXVCLElBQXZCLENBUEEsQ0FERjtlQUpGO2FBREE7QUFjQSxZQUFBLElBQUcsd0JBQUEsSUFBb0IsQ0FBQSxJQUFRLENBQUMsU0FBaEM7QUFDRSxjQUFBLElBQUksQ0FBQyxTQUFMLEdBQWlCLElBQWpCLENBQUE7QUFDQTtBQUFBLG1CQUFBLDhDQUFBOzhCQUFBO0FBQ0UsZ0JBQUEsQ0FBQSxDQUFBLENBQUEsQ0FERjtBQUFBLGVBRkY7YUFsQkY7V0FGRjtTQXBCRjtPQURBO2FBNkNBLE9BQU8sQ0FBQyxHQUFSLENBQVksWUFBQSxHQUFhLE1BQU0sQ0FBQyxRQUFQLENBQUEsQ0FBekIsRUE5Q2lCO0lBQUEsQ0FBbkIsQ0EzQkEsQ0FEVztFQUFBLENBQWI7O0FBQUEsMEJBNEVBLEtBQUEsR0FBTyxTQUFDLElBQUQsRUFBTyxJQUFQLEVBQWEsSUFBYixHQUFBO0FBR0wsUUFBQSxVQUFBO0FBQUEsSUFBQSxJQUFHLElBQUMsQ0FBQSxTQUFELElBQWMsd0JBQWQsSUFBaUMsSUFBQyxDQUFBLFVBQXJDOztRQUNFLElBQUMsQ0FBQSxjQUFlO09BQWhCO0FBQUEsTUFDQSxJQUFDLENBQUEsV0FBRCxFQURBLENBQUE7QUFBQSxNQUVBLENBQUEsR0FBUSxJQUFBLEdBQUcsQ0FBQyxPQUFKLENBQVksU0FBWixFQUNOO0FBQUEsUUFBQSxFQUFBLEVBQUksSUFBSjtBQUFBLFFBQ0EsSUFBQSxFQUFTLFlBQUgsR0FBYyxJQUFkLEdBQXdCLE1BRDlCO09BRE0sQ0FGUixDQUFBO0FBQUEsTUFLQSxPQUFBLEdBQVUsY0FBQSxDQUFlLENBQWYsRUFBa0IsSUFBbEIsQ0FMVixDQUFBO0FBQUEsTUFNQSxPQUFPLENBQUMsR0FBUixDQUFZLFdBQUEsR0FBWSxPQUFPLENBQUMsUUFBUixDQUFBLENBQXhCLENBTkEsQ0FBQTthQU9BLElBQUMsQ0FBQSxJQUFJLENBQUMsSUFBTixDQUFXLE9BQVgsRUFSRjtLQUhLO0VBQUEsQ0E1RVAsQ0FBQTs7QUFBQSwwQkF5RkEsVUFBQSxHQUFZLFNBQUMsSUFBRCxHQUFBO1dBQ1YsSUFBQyxDQUFBLEtBQUQsQ0FBTyxJQUFDLENBQUEsSUFBUixFQUFjLElBQWQsRUFBb0IsV0FBcEIsRUFEVTtFQUFBLENBekZaLENBQUE7O0FBQUEsMEJBNEZBLFVBQUEsR0FBWSxTQUFBLEdBQUEsQ0E1RlosQ0FBQTs7QUFBQSwwQkE4RkEsWUFBQSxHQUFjLFNBQUMsSUFBRCxHQUFBO0FBQ1osSUFBQSxJQUFHLENBQUEsSUFBSyxDQUFBLFVBQVI7QUFDRSxNQUFBLElBQUMsQ0FBQSxVQUFELEdBQWMsSUFBZCxDQUFBO0FBQUEsTUFDQSxJQUFDLENBQUEsS0FBRCxDQUFPLElBQVAsRUFDRTtBQUFBLFFBQUEsU0FBQSxFQUFXLElBQUMsQ0FBQSxrQkFBa0IsQ0FBQyxNQUFwQixHQUEyQixDQUF0QztBQUFBLFFBQ0EsVUFBQSxFQUFZLE1BRFo7QUFBQSxRQUVBLElBQUEsRUFBTSxFQUZOO09BREYsQ0FEQSxDQUFBO2FBTUEsSUFBQyxDQUFBLFVBQUQsQ0FDRTtBQUFBLFFBQUEsU0FBQSxFQUFXLElBQUMsQ0FBQSxrQkFBa0IsQ0FBQyxNQUFwQixHQUEyQixDQUF0QztBQUFBLFFBQ0EsSUFBQSxFQUFNLElBQUMsQ0FBQSxrQkFBbUIsQ0FBQSxJQUFDLENBQUEsa0JBQWtCLENBQUMsTUFBcEIsR0FBMkIsQ0FBM0IsQ0FBcEIsQ0FBa0QsRUFBbEQsQ0FETjtPQURGLEVBUEY7S0FEWTtFQUFBLENBOUZkLENBQUE7O3VCQUFBOztHQUQwQixVQWxGNUIsQ0FBQTs7QUE2TEEsSUFBRyxzQkFBSDtBQUNFLEVBQUEsTUFBTSxDQUFDLE9BQVAsR0FBaUIsYUFBakIsQ0FERjtDQTdMQTs7QUFnTUEsSUFBRyxnREFBSDtBQUNFLEVBQUEsTUFBTSxDQUFDLGFBQVAsR0FBdUIsYUFBdkIsQ0FERjtDQWhNQTs7Ozs7QUNEQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4V0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNWtCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4YUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5ZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeklBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFhBOztBQ0FBOztBQ0FBOzs7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcbmNsYXNzIENvbm5lY3RvclxuICBcbiAgY29uc3RydWN0b3I6ICgpLT5cbiAgICAjIGlzIHNldCB0byB0cnVlIHdoZW4gdGhpcyBpcyBzeW5jZWQgd2l0aCBhbGwgb3RoZXIgY29ubmVjdGlvbnNcbiAgICBAaXNfc3luY2VkID0gZmFsc2VcbiAgICAjIGNvbXB1dGUgYWxsIG9mIHRoZXNlIGZ1bmN0aW9ucyB3aGVuIGFsbCBjb25uZWN0aW9ucyBhcmUgc3luY2VkLlxuICAgIEBjb21wdXRlX3doZW5fc3luY2VkID0gW11cbiAgICAjIFBlZXJqcyBDb25uZWN0aW9uczoga2V5OiBjb25uLWlkLCB2YWx1ZTogY29ublxuICAgIEBjb25uZWN0aW9ucyA9IHt9XG4gICAgIyBDb25uZWN0aW9ucywgdGhhdCBoYXZlIGJlZW4gaW5pdGlhbGl6ZWQsIGJ1dCBoYXZlIG5vdCBiZWVuIChmdWxseSkgc3luY2VkIHlldC5cbiAgICBAdW5zeW5jZWRfY29ubmVjdGlvbnMgPSB7fVxuICAgICMgTGlzdCBvZiBmdW5jdGlvbnMgdGhhdCBzaGFsbCBwcm9jZXNzIGluY29taW5nIGRhdGFcbiAgICBAcmVjZWl2ZV9oYW5kbGVycyA9IFtdXG4gICAgIyBBIGxpc3Qgb2YgZnVuY3Rpb25zIHRoYXQgYXJlIGV4ZWN1dGVkIChsZWZ0IHRvIHJpZ2h0KSB3aGVuIHN5bmNpbmcgd2l0aCBhIHBlZXIuIFxuICAgIEBzeW5jX3Byb2Nlc3Nfb3JkZXIgPSBbXVxuICAgIEB3aGVuX3VzZXJfaWRfc2V0ID0gW11cbiAgXG4gIGdldFVuaXF1ZUNvbm5lY3Rpb25JZDogLT5cbiAgICBAaWQgIyBtYWtlIHN1cmUsIHRoYXQgZXZlcnkgY29ubmVjdG9yIGltcGxlbWVudGF0aW9uIGRvZXMgaXQgbGlrZSB0aGlzXG4gIFxuICB3aGVuVXNlcklkU2V0OiAoZiktPlxuICAgIEB3aGVuX3VzZXJfaWRfc2V0LnB1c2ggZlxuICBcbiAgI1xuICAjIEV4ZWN1dGUgYSBmdW5jdGlvbiBfd2hlbl8gd2UgYXJlIGNvbm5lY3RlZC4gSWYgbm90IGNvbm5lY3RlZCwgd2FpdCB1bnRpbCBjb25uZWN0ZWQuXG4gICMgQHBhcmFtIGYge0Z1bmN0aW9ufSBXaWxsIGJlIGV4ZWN1dGVkIG9uIHRoZSBQZWVySnMtQ29ubmVjdG9yIGNvbnRleHQuXG4gICNcbiAgd2hlblN5bmNlZDogKGFyZ3MpLT5cbiAgICBpZiBAaXNfc3luY2VkXG4gICAgICBhcmdzWzBdLmFwcGx5IHRoaXMsIGFyZ3NbMS4uXVxuICAgIGVsc2VcbiAgICAgIEBjb21wdXRlX3doZW5fc3luY2VkLnB1c2ggYXJncyBcbiAgXG4gICNcbiAgIyBFeGVjdXRlIGFuIGZ1bmN0aW9uIF93aGVuXyBhIG1lc3NhZ2UgaXMgcmVjZWl2ZWQuXG4gICMgQHBhcmFtIGYge0Z1bmN0aW9ufSBXaWxsIGJlIGV4ZWN1dGVkIG9uIHRoZSBQZWVySnMtQ29ubmVjdG9yIGNvbnRleHQuIGYgd2lsbCBiZSBjYWxsZWQgd2l0aCAoc2VuZGVyX2lkLCBicm9hZGNhc3Qge3RydWV8ZmFsc2V9LCBtZXNzYWdlKS5cbiAgI1xuICB3aGVuUmVjZWl2aW5nOiAoZiktPlxuICAgIEByZWNlaXZlX2hhbmRsZXJzLnB1c2ggZlxuICBcbiAgI1xuICAjIFNlbmQgYSBtZXNzYWdlIHRvIGEgKHN1Yiktc2V0IG9mIGFsbCBjb25uZWN0ZWQgcGVlcnMuXG4gICMgQHBhcmFtIHBlZXJzIHtBcnJheTxjb25uZWN0aW9uX2lkcz59IEEgc2V0IG9mIGlkcy5cbiAgIyBAcGFyYW0gbWVzc2FnZSB7T2JqZWN0fSBUaGUgbWVzc2FnZSB0byBzZW5kLlxuICAjXG4gIG11bHRpY2FzdDogKHBlZXJzLCBtZXNzYWdlKS0+XG4gICAgQHdoZW5TeW5jZWQgW19zZW5kLCBwZWVycywgbWVzc2FnZV1cbiAgXG4gICNcbiAgIyBTZW5kIGEgbWVzc2FnZSB0byBvbmUgb2YgdGhlIGNvbm5lY3RlZCBwZWVycy5cbiAgIyBAcGFyYW0gcGVlcnMge2Nvbm5lY3Rpb25faWR9IEEgY29ubmVjdGlvbiBpZC5cbiAgIyBAcGFyYW0gbWVzc2FnZSB7T2JqZWN0fSBUaGUgbWVzc2FnZSB0byBzZW5kLlxuICAjXG4gIHVuaWNhc3Q6IChwZWVyLCBtZXNzYWdlKS0+XG4gICAgQHdoZW5TeW5jZWQgW19zZW5kLCBwZWVyLCBtZXNzYWdlXVxuICBcbiAgIyBcbiAgIyBCcm9hZGNhc3QgYSBtZXNzYWdlIHRvIGFsbCBjb25uZWN0ZWQgcGVlcnMuXG4gICMgQHBhcmFtIG1lc3NhZ2Uge09iamVjdH0gVGhlIG1lc3NhZ2UgdG8gYnJvYWRjYXN0LlxuICAjIFxuICBicm9hZGNhc3Q6IChtZXNzYWdlKS0+XG4gICAgQF9icm9hZGNhc3QobWVzc2FnZSlcblxuIFxuICAjXG4gICMgRGVmaW5lIGhvdyB5b3Ugd2FudCB0byBoYW5kbGUgdGhlIHN5bmMgcHJvY2VzcyBvZiB0d28gdXNlcnMuXG4gICMgVGhpcyBpcyBhIHN5bmNocm9ub3VzIGhhbmRzaGFrZS4gRXZlcnkgdXNlciB3aWxsIHBlcmZvcm0gZXhhY3RseSB0aGUgc2FtZSBhY3Rpb25zIGF0IHRoZSBzYW1lIHRpbWUuIEUuZy5cbiAgIyBAZXhhbXBsZVxuICAjICAgd2hlblN5bmNpbmcoZnVuY3Rpb24oKXsgLy8gZmlyc3QgY2FsbCBtdXN0IG5vdCBoYXZlIHBhcmFtZXRlcnMhXG4gICMgICAgICAgcmV0dXJuIHRoaXMuaWQ7IC8vIFNlbmQgdGhlIGlkIG9mIHRoaXMgY29ubmVjdG9yLlxuICAjICAgfSxmdW5jdGlvbihwZWVyaWQpeyAvLyB5b3UgcmVjZWl2ZSB0aGUgcGVlcmlkIG9mIHRoZSBvdGhlciBjb25uZWN0aW9ucy5cbiAgIyAgICAgICAvLyB5b3UgY2FuIGRvIHNvbWV0aGluZyB3aXRoIHRoZSBwZWVyaWRcbiAgIyAgICAgICAvLyByZXR1cm4gXCJ5b3UgYXJlIG15IGZyaWVuZFwiOyAvLyB5b3UgY291bGQgc2VuZCBhbm90aGVyIG1hc3NhZ2UuXG4gICMgICB9KTsgLy8gdGhpcyBpcyB0aGUgZW5kIG9mIHRoZSBzeW5jIHByb2Nlc3MuXG4gICNcbiAgd2hlblN5bmNpbmc6ICgpLT5cbiAgICBmb3IgaSBpbiBbKGFyZ3VtZW50cy5sZW5ndGgtMSkuLjBdXG4gICAgICBAc3luY19wcm9jZXNzX29yZGVyLnVuc2hpZnQgYXJndW1lbnRzW2ldXG5cblxuXG5tb2R1bGUuZXhwb3J0cyA9IENvbm5lY3RvclxuIiwiXG5YTVBQID0gcmVxdWlyZSBcIm5vZGUteG1wcC1jbGllbnRcIlxubHR4ID0gcmVxdWlyZSBcImx0eFwiXG5cbmV4dHJhY3RfcmVzb3VyY2VfZnJvbV9qaWQgPSAoamlkKS0+XG4gIGppZC5zcGxpdChcIi9cIilbMV1cblxuQ29ubmVjdG9yID0gcmVxdWlyZSAnLi4vY29ubmVjdG9yJ1xuXG5cbiMgQ3VycmVudGx5LCB0aGUgSEIgZW5jb2RlcyBvcGVyYXRpb25zIGFzIEpTT04uIEZvciB0aGUgbW9tZW50IEkgd2FudCB0byBrZWVwIGl0XG4jIHRoYXQgd2F5LiBNYXliZSB3ZSBzdXBwb3J0IGVuY29kaW5nIGluIHRoZSBIQiBhcyBYTUwgaW4gdGhlIGZ1dHVyZSwgYnV0IGZvciBub3cgSSBkb24ndCB3YW50XG4jIHRvbyBtdWNoIG92ZXJoZWFkLiBZYXR0YSBpcyB2ZXJ5IGxpa2VseSB0byBnZXQgY2hhbmdlZCBhIGxvdCBpbiB0aGUgZnV0dXJlXG4jXG4jIEJlY2F1c2Ugd2UgZG9uJ3Qgd2FudCB0byBlbmNvZGUgSlNPTiBhcyBzdHJpbmcgKHdpdGggY2hhcmFjdGVyIGVzY2FwaW5nLCB3aWNoIG1ha2VzIGl0IHByZXR0eSBtdWNoIHVucmVhZGFibGUpXG4jIHdlIGVuY29kZSB0aGUgSlNPTiBhcyBYTUwuXG4jXG4jIFdoZW4gdGhlIEhCIHN1cHBvcnQgZW5jb2RpbmcgYXMgWE1MLCB0aGUgZm9ybWF0IHNob3VsZCBsb29rIHByZXR0eSBtdWNoIGxpa2UgdGhpcy5cblxuIyBkb2VzIG5vdCBzdXBwb3J0IHByaW1pdGl2ZSB2YWx1ZXMgYXMgYXJyYXkgZWxlbWVudHNcbnBhcnNlX21lc3NhZ2UgPSAobSktPlxuICBwYXJzZV9hcnJheSA9IChub2RlKS0+XG4gICAgZm9yIG4gaW4gbm9kZS5jaGlsZHJlblxuICAgICAgaWYgbi5nZXRBdHRyaWJ1dGUoXCJpc0FycmF5XCIpIGlzIFwidHJ1ZVwiXG4gICAgICAgIHBhcnNlX2FycmF5IG5cbiAgICAgIGVsc2VcbiAgICAgICAgcGFyc2Vfb2JqZWN0IG5cblxuICBwYXJzZV9vYmplY3QgPSAobm9kZSktPlxuICAgIGpzb24gPSB7fVxuICAgIGZvciBuYW1lLCB2YWx1ZSAgb2Ygbm9kZS5hdHRyc1xuICAgICAgaW50ID0gcGFyc2VJbnQodmFsdWUpXG4gICAgICBpZiBpc05hTihpbnQpIG9yIChcIlwiK2ludCkgaXNudCB2YWx1ZVxuICAgICAgICBqc29uW25hbWVdID0gdmFsdWVcbiAgICAgIGVsc2VcbiAgICAgICAganNvbltuYW1lXSA9IGludFxuICAgIGZvciBuIGluIG5vZGUuY2hpbGRyZW5cbiAgICAgIG5hbWUgPSBuLm5hbWVcbiAgICAgIGlmIG4uZ2V0QXR0cmlidXRlKFwiaXNBcnJheVwiKSBpcyBcInRydWVcIlxuICAgICAgICBqc29uW25hbWVdID0gcGFyc2VfYXJyYXkgblxuICAgICAgZWxzZVxuICAgICAgICBqc29uW25hbWVdID0gcGFyc2Vfb2JqZWN0IG5cbiAgICBqc29uXG4gIHBhcnNlX29iamVjdCBtXG5cbiMgZW5jb2RlIG1lc3NhZ2UgaW4geG1sXG4jIHdlIHVzZSBzdHJpbmcgYmVjYXVzZSBTdHJvcGhlIG9ubHkgYWNjZXB0cyBhbiBcInhtbC1zdHJpbmdcIi4uXG4jIFNvIHthOjQsYjp7Yzo1fX0gd2lsbCBsb29rIGxpa2VcbiMgPHlhdHRhIGE9XCI0XCI+XG4jICAgPGIgYz1cIjVcIj48L2I+XG4jIDwveWF0dGE+XG4jIG0gLSBsdHggZWxlbWVudFxuIyBqc29uIC0gZ3Vlc3MgaXQgOylcbiNcbmVuY29kZV9tZXNzYWdlID0gKG0sIGpzb24pLT5cbiAgIyBhdHRyaWJ1dGVzIGlzIG9wdGlvbmFsXG4gIGVuY29kZV9vYmplY3QgPSAobSwganNvbiktPlxuICAgIGZvciBuYW1lLHZhbHVlIG9mIGpzb25cbiAgICAgIGlmIG5vdCB2YWx1ZT9cbiAgICAgICAgIyBub3BcbiAgICAgIGVsc2UgaWYgdmFsdWUuY29uc3RydWN0b3IgaXMgT2JqZWN0XG4gICAgICAgIGVuY29kZV9vYmplY3QgbS5jKG5hbWUpLCB2YWx1ZVxuICAgICAgZWxzZSBpZiB2YWx1ZS5jb25zdHJ1Y3RvciBpcyBBcnJheVxuICAgICAgICBlbmNvZGVfYXJyYXkgbS5jKG5hbWUpLCB2YWx1ZVxuICAgICAgZWxzZVxuICAgICAgICBtLnNldEF0dHJpYnV0ZShuYW1lLHZhbHVlKVxuICAgIG1cbiAgZW5jb2RlX2FycmF5ID0gKG0sIGFycmF5KS0+XG4gICAgbS5zZXRBdHRyaWJ1dGUoXCJpc0FycmF5XCIsXCJ0cnVlXCIpXG4gICAgZm9yIGUgaW4gYXJyYXlcbiAgICAgIGlmIGUuY29uc3RydWN0b3IgaXMgT2JqZWN0XG4gICAgICAgIGVuY29kZV9vYmplY3QgbS5jKFwiYXJyYXktZWxlbWVudFwiKSwgZVxuICAgICAgZWxzZVxuICAgICAgICBlbmNvZGVfYXJyYXkgbS5jKFwiYXJyYXktZWxlbWVudFwiKSwgZVxuICAgIG1cbiAgaWYganNvbi5jb25zdHJ1Y3RvciBpcyBPYmplY3RcbiAgICBlbmNvZGVfb2JqZWN0IG0uYyhcInlhdHRhXCIse3htbG5zOlwiaHR0cDovL3lhdHRhLm5pbmphL2Nvbm5lY3Rvci1zdGFuemFcIn0pLCBqc29uXG4gIGVsc2UgaWYganNvbi5jb25zdHJ1Y3RvciBpcyBBcnJheVxuICAgIGVuY29kZV9hcnJheSBtLmMoXCJ5YXR0YVwiLHt4bWxuczpcImh0dHA6Ly95YXR0YS5uaW5qYS9jb25uZWN0b3Itc3RhbnphXCJ9KSwganNvblxuICBlbHNlXG4gICAgdGhyb3cgbmV3IEVycm9yIFwiSSBjYW4ndCBlbmNvZGUgdGhpcyBqc29uIVwiXG5cblxuY2xhc3MgWE1QUENvbm5lY3RvciBleHRlbmRzIENvbm5lY3RvclxuICBjb25zdHJ1Y3RvcjogKHJvb20pLT5cbiAgICBzdXBlcigpXG4gICAgQHhtcHAgPSBuZXcgWE1QUC5DbGllbnRcbiAgICAgIGppZDogJ0B5YXR0YS5uaW5qYSdcbiAgICAgIHByZWZlcnJlZDogXCJBTk9OWU1PVVNcIlxuICAgICAgd2Vic29ja2V0OlxuICAgICAgICB1cmw6ICd3c3M6eWF0dGEubmluamE6NTI4MS94bXBwLXdlYnNvY2tldCdcblxuICAgIEBfaXNfc2VydmVyID0gdHJ1ZVxuICAgIEBpc19zeW5jaW5nID0gZmFsc2VcblxuICAgIEBjb25uZWN0aW9ucyA9IHt9XG4gICAgdGhhdCA9IEBcbiAgICBAeG1wcC5vbiAnb25saW5lJywgLT5cbiAgICAgICMgbG9naW4gdG8gcm9vbVxuICAgICAgIyBXYW50IHRvIGJlIGxpa2UgdGhpczpcbiAgICAgICMgPHByZXNlbmNlIGZyb209J2EzM2I5NzU4LTYyZjgtNDJlMS1hODI3LTgzZWYwNGY4ODdjNUB5YXR0YS5uaW5qYS9jNDllYjdmYi0xOTIzLTQyZjItOWNjYS00Yzk3NDc3ZWE3YTgnIHRvPSd0aGluZ0Bjb25mZXJlbmNlLnlhdHRhLm5pbmphL2M0OWViN2ZiLTE5MjMtNDJmMi05Y2NhLTRjOTc0NzdlYTdhOCcgeG1sbnM9J2phYmJlcjpjbGllbnQnPlxuICAgICAgIyA8eCB4bWxucz0naHR0cDovL2phYmJlci5vcmcvcHJvdG9jb2wvbXVjJy8+PC9wcmVzZW5jZT5cbiAgICAgIHRoYXQucm9vbSA9IHJvb20gKyBcIkBjb25mZXJlbmNlLnlhdHRhLm5pbmphXCJcbiAgICAgIHRoYXQucm9vbV9qaWQgPSB0aGF0LnJvb20gKyBcIi9cIiArIHRoYXQueG1wcC5qaWQucmVzb3VyY2VcbiAgICAgIHRoYXQuaWQgPSB0aGF0LnhtcHAuamlkLnJlc291cmNlXG4gICAgICBmb3IgZiBpbiB0aGF0LndoZW5fdXNlcl9pZF9zZXRcbiAgICAgICAgZih0aGF0LmlkKVxuICAgICAgcm9vbV9zdWJzY3JpcHRpb24gPSBuZXcgbHR4LkVsZW1lbnQgJ3ByZXNlbmNlJyxcbiAgICAgICAgICB0bzogdGhhdC5yb29tX2ppZFxuICAgICAgICAuYyAneCcsIHt9XG4gICAgICB0aGF0LnhtcHAuc2VuZCByb29tX3N1YnNjcmlwdGlvblxuXG4gICAgQHhtcHAub24gJ3N0YW56YScsIChzdGFuemEpLT5cbiAgICAgIHNlbmRlciA9IHN0YW56YS5nZXRBdHRyaWJ1dGUgXCJmcm9tXCJcbiAgICAgIGlmIHN0YW56YS5pcyBcInByZXNlbmNlXCJcbiAgICAgICAgc2VuZGVyX3JvbGUgPSBzdGFuemEuZ2V0Q2hpbGQoXCJ4XCIsXCJodHRwOi8vamFiYmVyLm9yZy9wcm90b2NvbC9tdWMjdXNlclwiKS5nZXRDaGlsZChcIml0ZW1cIikuZ2V0QXR0cmlidXRlKFwicm9sZVwiKVxuICAgICAgICBpZiBzZW5kZXIgaXMgdGhhdC5yb29tX2ppZFxuICAgICAgICAgIHRoYXQucm9sZSA9IHNlbmRlcl9yb2xlXG4gICAgICAgICAgaWYgdGhhdC5yb2xlIGlzIFwibW9kZXJhdG9yXCJcbiAgICAgICAgICAgICMgdGhpcyBjbGllbnQgY3JlYXRlZCB0aGlzIHJvb20sIHRoZXJlZm9yZSB0aGVyZSBpcyAoc2hvdWxkIGJlKSBub2JvZHkgdG8gc3luYyB0b1xuICAgICAgICAgICAgdGhhdC5pc19zeW5jZWQgPSB0cnVlXG4gICAgICAgIGVsc2UgaWYgc3RhbnphLmdldEF0dHJpYnV0ZShcInR5cGVcIikgaXMgXCJ1bmF2YWlsYWJsZVwiXG4gICAgICAgICAgZGVsZXRlIHRoYXQuY29ubmVjdGlvbnNbZXh0cmFjdF9yZXNvdXJjZV9mcm9tX2ppZCBzZW5kZXJdXG4gICAgICAgIGVsc2VcbiAgICAgICAgICB0aGF0LmNvbm5lY3Rpb25zW2V4dHJhY3RfcmVzb3VyY2VfZnJvbV9qaWQgc2VuZGVyXSA9IHNlbmRlclxuICAgICAgICAgIGlmIG5vdCBAaXNfc3luY2VkIGFuZCBzZW5kZXJfcm9sZSBpcyBcIm1vZGVyYXRvclwiXG4gICAgICAgICAgICB0aGF0Ll9wZXJmb3JtU3luYyBzZW5kZXJcbiAgICAgIGVsc2VcbiAgICAgICAgaWYgc2VuZGVyIGlzIHRoYXQucm9vbV9qaWRcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICByZXMgPSBzdGFuemEuZ2V0Q2hpbGQgXCJ5YXR0YVwiLCBcImh0dHA6Ly95YXR0YS5uaW5qYS9jb25uZWN0b3Itc3RhbnphXCJcbiAgICAgICAgdGhhdC5yZWNlaXZlX2NvdW50ZXIgPz0gMFxuICAgICAgICB0aGF0LnJlY2VpdmVfY291bnRlcisrXG4gICAgICAgICMgY291bGQgYmUgc29tZSBzaW1wbGUgdGV4dCBtZXNzYWdlXG4gICAgICAgIGlmIHJlcz9cbiAgICAgICAgICByZXMgPSBwYXJzZV9tZXNzYWdlIHJlc1xuICAgICAgICAgIGlmIG5vdCByZXMuc3luY19zdGVwP1xuICAgICAgICAgICAgZm9yIGYgaW4gdGhhdC5yZWNlaXZlX2hhbmRsZXJzXG4gICAgICAgICAgICAgIGYgc2VuZGVyLCByZXNcbiAgICAgICAgICBlbHNlXG4gICAgICAgICAgICBkYXRhID0gdGhhdC5zeW5jX3Byb2Nlc3Nfb3JkZXJbcmVzLnN5bmNfc3RlcCsxXShyZXMuZGF0YSlcbiAgICAgICAgICAgIGlmIHJlcy5zeW5jX3N0ZXAgKyAyIDwgdGhhdC5zeW5jX3Byb2Nlc3Nfb3JkZXIubGVuZ3RoXG4gICAgICAgICAgICAgIHRoYXQuX3NlbmQgc2VuZGVyLFxuICAgICAgICAgICAgICAgIHN5bmNfc3RlcDogcmVzLnN5bmNfc3RlcCArIDFcbiAgICAgICAgICAgICAgICBkYXRhOiBkYXRhXG4gICAgICAgICAgICAgIGlmIHJlcy5zZW5kX2FnYWluP1xuICAgICAgICAgICAgICAgIHNlbmRfYWdhaW4gPSBkbyAob2xkX2RhdGEgPSBkYXRhLCBzeW5jX3N0ZXAgPSByZXMuc3luY19zdGVwKS0+XG4gICAgICAgICAgICAgICAgICAoKS0+XG4gICAgICAgICAgICAgICAgICAgIGRhdGEgPSB0aGF0LnN5bmNfcHJvY2Vzc19vcmRlcltyZXMuc3luY19zdGVwKzFdKGRhdGEuc3RhdGVfdmVjdG9yKVxuICAgICAgICAgICAgICAgICAgICB0aGF0Ll9zZW5kIHNlbmRlcixcbiAgICAgICAgICAgICAgICAgICAgICBzeW5jX3N0ZXA6IHN5bmNfc3RlcCArIDFcbiAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBkYXRhXG4gICAgICAgICAgICAgICAgICAgICAgc2VudF9hZ2FpbjogXCJ0cnVlXCJcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0IHNlbmRfYWdhaW4sIDMwMDBcbiAgICAgICAgICAgIGlmIHJlcy5zZW50X2FnYWluPyBhbmQgbm90IHRoYXQuaXNfc3luY2VkXG4gICAgICAgICAgICAgIHRoYXQuaXNfc3luY2VkID0gdHJ1ZVxuICAgICAgICAgICAgICBmb3IgZiBpbiB0aGF0LmNvbXB1dGVfd2hlbl9zeW5jZWRcbiAgICAgICAgICAgICAgICBmKClcbiAgICAgIGNvbnNvbGUubG9nIFwiUkVDRUlWRUQ6IFwiK3N0YW56YS50b1N0cmluZygpXG5cbiAgX3NlbmQ6ICh1c2VyLCBqc29uLCB0eXBlKS0+XG4gICAgIyBkbyBub3Qgc2VuZCB5YXR0YS1vcGVyYXRpb25zIGlmIG5vdCBzeW5jZWQsXG4gICAgIyBzZW5kIHN5bmMgbWVzc2FnZXMgdGhvdWdoXG4gICAgaWYgQGlzX3N5bmNlZCBvciBqc29uLnN5bmNfc3RlcD8gb3IgQGlzX3N5bmNpbmdcbiAgICAgIEBzZW5kX2NvbnRlciA/PSAwXG4gICAgICBAc2VuZF9jb250ZXIrK1xuICAgICAgbSA9IG5ldyBsdHguRWxlbWVudCBcIm1lc3NhZ2VcIixcbiAgICAgICAgdG86IHVzZXJcbiAgICAgICAgdHlwZTogaWYgdHlwZT8gdGhlbiB0eXBlIGVsc2UgXCJjaGF0XCJcbiAgICAgIG1lc3NhZ2UgPSBlbmNvZGVfbWVzc2FnZShtLCBqc29uKVxuICAgICAgY29uc29sZS5sb2cgXCJTRU5ESU5HOiBcIittZXNzYWdlLnRvU3RyaW5nKClcbiAgICAgIEB4bXBwLnNlbmQgbWVzc2FnZVxuXG4gIF9icm9hZGNhc3Q6IChqc29uKS0+XG4gICAgQF9zZW5kIEByb29tLCBqc29uLCBcImdyb3VwY2hhdFwiXG5cbiAgaW52b2tlU3luYzogKCktPlxuXG4gIF9wZXJmb3JtU3luYzogKHVzZXIpLT5cbiAgICBpZiBub3QgQGlzX3N5bmNpbmdcbiAgICAgIEBpc19zeW5jaW5nID0gdHJ1ZVxuICAgICAgQF9zZW5kIHVzZXIsXG4gICAgICAgIHN5bmNfc3RlcDogQHN5bmNfcHJvY2Vzc19vcmRlci5sZW5ndGgtM1xuICAgICAgICBzZW5kX2FnYWluOiBcInRydWVcIlxuICAgICAgICBkYXRhOiBbXVxuXG4gICAgICBAX2Jyb2FkY2FzdFxuICAgICAgICBzeW5jX3N0ZXA6IEBzeW5jX3Byb2Nlc3Nfb3JkZXIubGVuZ3RoLTJcbiAgICAgICAgZGF0YTogQHN5bmNfcHJvY2Vzc19vcmRlcltAc3luY19wcm9jZXNzX29yZGVyLmxlbmd0aC0yXShbXSlcblxuaWYgbW9kdWxlLmV4cG9ydHM/XG4gIG1vZHVsZS5leHBvcnRzID0gWE1QUENvbm5lY3RvclxuXG5pZiB3aW5kb3c/XG4gIHdpbmRvdy5YTVBQQ29ubmVjdG9yID0gWE1QUENvbm5lY3RvclxuXG5cblxuXG4iLG51bGwsIi8vIGh0dHA6Ly93aWtpLmNvbW1vbmpzLm9yZy93aWtpL1VuaXRfVGVzdGluZy8xLjBcbi8vXG4vLyBUSElTIElTIE5PVCBURVNURUQgTk9SIExJS0VMWSBUTyBXT1JLIE9VVFNJREUgVjghXG4vL1xuLy8gT3JpZ2luYWxseSBmcm9tIG5hcndoYWwuanMgKGh0dHA6Ly9uYXJ3aGFsanMub3JnKVxuLy8gQ29weXJpZ2h0IChjKSAyMDA5IFRob21hcyBSb2JpbnNvbiA8Mjgwbm9ydGguY29tPlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbi8vIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlICdTb2Z0d2FyZScpLCB0b1xuLy8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGVcbi8vIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vclxuLy8gc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbi8vIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbi8vIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCAnQVMgSVMnLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4vLyBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbi8vIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuLy8gQVVUSE9SUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU5cbi8vIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT05cbi8vIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyB3aGVuIHVzZWQgaW4gbm9kZSwgdGhpcyB3aWxsIGFjdHVhbGx5IGxvYWQgdGhlIHV0aWwgbW9kdWxlIHdlIGRlcGVuZCBvblxuLy8gdmVyc3VzIGxvYWRpbmcgdGhlIGJ1aWx0aW4gdXRpbCBtb2R1bGUgYXMgaGFwcGVucyBvdGhlcndpc2Vcbi8vIHRoaXMgaXMgYSBidWcgaW4gbm9kZSBtb2R1bGUgbG9hZGluZyBhcyBmYXIgYXMgSSBhbSBjb25jZXJuZWRcbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbC8nKTtcblxudmFyIHBTbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcbnZhciBoYXNPd24gPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG4vLyAxLiBUaGUgYXNzZXJ0IG1vZHVsZSBwcm92aWRlcyBmdW5jdGlvbnMgdGhhdCB0aHJvd1xuLy8gQXNzZXJ0aW9uRXJyb3IncyB3aGVuIHBhcnRpY3VsYXIgY29uZGl0aW9ucyBhcmUgbm90IG1ldC4gVGhlXG4vLyBhc3NlcnQgbW9kdWxlIG11c3QgY29uZm9ybSB0byB0aGUgZm9sbG93aW5nIGludGVyZmFjZS5cblxudmFyIGFzc2VydCA9IG1vZHVsZS5leHBvcnRzID0gb2s7XG5cbi8vIDIuIFRoZSBBc3NlcnRpb25FcnJvciBpcyBkZWZpbmVkIGluIGFzc2VydC5cbi8vIG5ldyBhc3NlcnQuQXNzZXJ0aW9uRXJyb3IoeyBtZXNzYWdlOiBtZXNzYWdlLFxuLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdHVhbDogYWN0dWFsLFxuLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBleHBlY3RlZCB9KVxuXG5hc3NlcnQuQXNzZXJ0aW9uRXJyb3IgPSBmdW5jdGlvbiBBc3NlcnRpb25FcnJvcihvcHRpb25zKSB7XG4gIHRoaXMubmFtZSA9ICdBc3NlcnRpb25FcnJvcic7XG4gIHRoaXMuYWN0dWFsID0gb3B0aW9ucy5hY3R1YWw7XG4gIHRoaXMuZXhwZWN0ZWQgPSBvcHRpb25zLmV4cGVjdGVkO1xuICB0aGlzLm9wZXJhdG9yID0gb3B0aW9ucy5vcGVyYXRvcjtcbiAgaWYgKG9wdGlvbnMubWVzc2FnZSkge1xuICAgIHRoaXMubWVzc2FnZSA9IG9wdGlvbnMubWVzc2FnZTtcbiAgICB0aGlzLmdlbmVyYXRlZE1lc3NhZ2UgPSBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLm1lc3NhZ2UgPSBnZXRNZXNzYWdlKHRoaXMpO1xuICAgIHRoaXMuZ2VuZXJhdGVkTWVzc2FnZSA9IHRydWU7XG4gIH1cbiAgdmFyIHN0YWNrU3RhcnRGdW5jdGlvbiA9IG9wdGlvbnMuc3RhY2tTdGFydEZ1bmN0aW9uIHx8IGZhaWw7XG5cbiAgaWYgKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcywgc3RhY2tTdGFydEZ1bmN0aW9uKTtcbiAgfVxuICBlbHNlIHtcbiAgICAvLyBub24gdjggYnJvd3NlcnMgc28gd2UgY2FuIGhhdmUgYSBzdGFja3RyYWNlXG4gICAgdmFyIGVyciA9IG5ldyBFcnJvcigpO1xuICAgIGlmIChlcnIuc3RhY2spIHtcbiAgICAgIHZhciBvdXQgPSBlcnIuc3RhY2s7XG5cbiAgICAgIC8vIHRyeSB0byBzdHJpcCB1c2VsZXNzIGZyYW1lc1xuICAgICAgdmFyIGZuX25hbWUgPSBzdGFja1N0YXJ0RnVuY3Rpb24ubmFtZTtcbiAgICAgIHZhciBpZHggPSBvdXQuaW5kZXhPZignXFxuJyArIGZuX25hbWUpO1xuICAgICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICAgIC8vIG9uY2Ugd2UgaGF2ZSBsb2NhdGVkIHRoZSBmdW5jdGlvbiBmcmFtZVxuICAgICAgICAvLyB3ZSBuZWVkIHRvIHN0cmlwIG91dCBldmVyeXRoaW5nIGJlZm9yZSBpdCAoYW5kIGl0cyBsaW5lKVxuICAgICAgICB2YXIgbmV4dF9saW5lID0gb3V0LmluZGV4T2YoJ1xcbicsIGlkeCArIDEpO1xuICAgICAgICBvdXQgPSBvdXQuc3Vic3RyaW5nKG5leHRfbGluZSArIDEpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLnN0YWNrID0gb3V0O1xuICAgIH1cbiAgfVxufTtcblxuLy8gYXNzZXJ0LkFzc2VydGlvbkVycm9yIGluc3RhbmNlb2YgRXJyb3JcbnV0aWwuaW5oZXJpdHMoYXNzZXJ0LkFzc2VydGlvbkVycm9yLCBFcnJvcik7XG5cbmZ1bmN0aW9uIHJlcGxhY2VyKGtleSwgdmFsdWUpIHtcbiAgaWYgKHV0aWwuaXNVbmRlZmluZWQodmFsdWUpKSB7XG4gICAgcmV0dXJuICcnICsgdmFsdWU7XG4gIH1cbiAgaWYgKHV0aWwuaXNOdW1iZXIodmFsdWUpICYmIChpc05hTih2YWx1ZSkgfHwgIWlzRmluaXRlKHZhbHVlKSkpIHtcbiAgICByZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcbiAgfVxuICBpZiAodXRpbC5pc0Z1bmN0aW9uKHZhbHVlKSB8fCB1dGlsLmlzUmVnRXhwKHZhbHVlKSkge1xuICAgIHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gdHJ1bmNhdGUocywgbikge1xuICBpZiAodXRpbC5pc1N0cmluZyhzKSkge1xuICAgIHJldHVybiBzLmxlbmd0aCA8IG4gPyBzIDogcy5zbGljZSgwLCBuKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcztcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRNZXNzYWdlKHNlbGYpIHtcbiAgcmV0dXJuIHRydW5jYXRlKEpTT04uc3RyaW5naWZ5KHNlbGYuYWN0dWFsLCByZXBsYWNlciksIDEyOCkgKyAnICcgK1xuICAgICAgICAgc2VsZi5vcGVyYXRvciArICcgJyArXG4gICAgICAgICB0cnVuY2F0ZShKU09OLnN0cmluZ2lmeShzZWxmLmV4cGVjdGVkLCByZXBsYWNlciksIDEyOCk7XG59XG5cbi8vIEF0IHByZXNlbnQgb25seSB0aGUgdGhyZWUga2V5cyBtZW50aW9uZWQgYWJvdmUgYXJlIHVzZWQgYW5kXG4vLyB1bmRlcnN0b29kIGJ5IHRoZSBzcGVjLiBJbXBsZW1lbnRhdGlvbnMgb3Igc3ViIG1vZHVsZXMgY2FuIHBhc3Ncbi8vIG90aGVyIGtleXMgdG8gdGhlIEFzc2VydGlvbkVycm9yJ3MgY29uc3RydWN0b3IgLSB0aGV5IHdpbGwgYmVcbi8vIGlnbm9yZWQuXG5cbi8vIDMuIEFsbCBvZiB0aGUgZm9sbG93aW5nIGZ1bmN0aW9ucyBtdXN0IHRocm93IGFuIEFzc2VydGlvbkVycm9yXG4vLyB3aGVuIGEgY29ycmVzcG9uZGluZyBjb25kaXRpb24gaXMgbm90IG1ldCwgd2l0aCBhIG1lc3NhZ2UgdGhhdFxuLy8gbWF5IGJlIHVuZGVmaW5lZCBpZiBub3QgcHJvdmlkZWQuICBBbGwgYXNzZXJ0aW9uIG1ldGhvZHMgcHJvdmlkZVxuLy8gYm90aCB0aGUgYWN0dWFsIGFuZCBleHBlY3RlZCB2YWx1ZXMgdG8gdGhlIGFzc2VydGlvbiBlcnJvciBmb3Jcbi8vIGRpc3BsYXkgcHVycG9zZXMuXG5cbmZ1bmN0aW9uIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgb3BlcmF0b3IsIHN0YWNrU3RhcnRGdW5jdGlvbikge1xuICB0aHJvdyBuZXcgYXNzZXJ0LkFzc2VydGlvbkVycm9yKHtcbiAgICBtZXNzYWdlOiBtZXNzYWdlLFxuICAgIGFjdHVhbDogYWN0dWFsLFxuICAgIGV4cGVjdGVkOiBleHBlY3RlZCxcbiAgICBvcGVyYXRvcjogb3BlcmF0b3IsXG4gICAgc3RhY2tTdGFydEZ1bmN0aW9uOiBzdGFja1N0YXJ0RnVuY3Rpb25cbiAgfSk7XG59XG5cbi8vIEVYVEVOU0lPTiEgYWxsb3dzIGZvciB3ZWxsIGJlaGF2ZWQgZXJyb3JzIGRlZmluZWQgZWxzZXdoZXJlLlxuYXNzZXJ0LmZhaWwgPSBmYWlsO1xuXG4vLyA0LiBQdXJlIGFzc2VydGlvbiB0ZXN0cyB3aGV0aGVyIGEgdmFsdWUgaXMgdHJ1dGh5LCBhcyBkZXRlcm1pbmVkXG4vLyBieSAhIWd1YXJkLlxuLy8gYXNzZXJ0Lm9rKGd1YXJkLCBtZXNzYWdlX29wdCk7XG4vLyBUaGlzIHN0YXRlbWVudCBpcyBlcXVpdmFsZW50IHRvIGFzc2VydC5lcXVhbCh0cnVlLCAhIWd1YXJkLFxuLy8gbWVzc2FnZV9vcHQpOy4gVG8gdGVzdCBzdHJpY3RseSBmb3IgdGhlIHZhbHVlIHRydWUsIHVzZVxuLy8gYXNzZXJ0LnN0cmljdEVxdWFsKHRydWUsIGd1YXJkLCBtZXNzYWdlX29wdCk7LlxuXG5mdW5jdGlvbiBvayh2YWx1ZSwgbWVzc2FnZSkge1xuICBpZiAoIXZhbHVlKSBmYWlsKHZhbHVlLCB0cnVlLCBtZXNzYWdlLCAnPT0nLCBhc3NlcnQub2spO1xufVxuYXNzZXJ0Lm9rID0gb2s7XG5cbi8vIDUuIFRoZSBlcXVhbGl0eSBhc3NlcnRpb24gdGVzdHMgc2hhbGxvdywgY29lcmNpdmUgZXF1YWxpdHkgd2l0aFxuLy8gPT0uXG4vLyBhc3NlcnQuZXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQuZXF1YWwgPSBmdW5jdGlvbiBlcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChhY3R1YWwgIT0gZXhwZWN0ZWQpIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJz09JywgYXNzZXJ0LmVxdWFsKTtcbn07XG5cbi8vIDYuIFRoZSBub24tZXF1YWxpdHkgYXNzZXJ0aW9uIHRlc3RzIGZvciB3aGV0aGVyIHR3byBvYmplY3RzIGFyZSBub3QgZXF1YWxcbi8vIHdpdGggIT0gYXNzZXJ0Lm5vdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0Lm5vdEVxdWFsID0gZnVuY3Rpb24gbm90RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoYWN0dWFsID09IGV4cGVjdGVkKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnIT0nLCBhc3NlcnQubm90RXF1YWwpO1xuICB9XG59O1xuXG4vLyA3LiBUaGUgZXF1aXZhbGVuY2UgYXNzZXJ0aW9uIHRlc3RzIGEgZGVlcCBlcXVhbGl0eSByZWxhdGlvbi5cbi8vIGFzc2VydC5kZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQuZGVlcEVxdWFsID0gZnVuY3Rpb24gZGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKCFfZGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnZGVlcEVxdWFsJywgYXNzZXJ0LmRlZXBFcXVhbCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIF9kZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCkge1xuICAvLyA3LjEuIEFsbCBpZGVudGljYWwgdmFsdWVzIGFyZSBlcXVpdmFsZW50LCBhcyBkZXRlcm1pbmVkIGJ5ID09PS5cbiAgaWYgKGFjdHVhbCA9PT0gZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcblxuICB9IGVsc2UgaWYgKHV0aWwuaXNCdWZmZXIoYWN0dWFsKSAmJiB1dGlsLmlzQnVmZmVyKGV4cGVjdGVkKSkge1xuICAgIGlmIChhY3R1YWwubGVuZ3RoICE9IGV4cGVjdGVkLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhY3R1YWwubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChhY3R1YWxbaV0gIT09IGV4cGVjdGVkW2ldKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG5cbiAgLy8gNy4yLiBJZiB0aGUgZXhwZWN0ZWQgdmFsdWUgaXMgYSBEYXRlIG9iamVjdCwgdGhlIGFjdHVhbCB2YWx1ZSBpc1xuICAvLyBlcXVpdmFsZW50IGlmIGl0IGlzIGFsc28gYSBEYXRlIG9iamVjdCB0aGF0IHJlZmVycyB0byB0aGUgc2FtZSB0aW1lLlxuICB9IGVsc2UgaWYgKHV0aWwuaXNEYXRlKGFjdHVhbCkgJiYgdXRpbC5pc0RhdGUoZXhwZWN0ZWQpKSB7XG4gICAgcmV0dXJuIGFjdHVhbC5nZXRUaW1lKCkgPT09IGV4cGVjdGVkLmdldFRpbWUoKTtcblxuICAvLyA3LjMgSWYgdGhlIGV4cGVjdGVkIHZhbHVlIGlzIGEgUmVnRXhwIG9iamVjdCwgdGhlIGFjdHVhbCB2YWx1ZSBpc1xuICAvLyBlcXVpdmFsZW50IGlmIGl0IGlzIGFsc28gYSBSZWdFeHAgb2JqZWN0IHdpdGggdGhlIHNhbWUgc291cmNlIGFuZFxuICAvLyBwcm9wZXJ0aWVzIChgZ2xvYmFsYCwgYG11bHRpbGluZWAsIGBsYXN0SW5kZXhgLCBgaWdub3JlQ2FzZWApLlxuICB9IGVsc2UgaWYgKHV0aWwuaXNSZWdFeHAoYWN0dWFsKSAmJiB1dGlsLmlzUmVnRXhwKGV4cGVjdGVkKSkge1xuICAgIHJldHVybiBhY3R1YWwuc291cmNlID09PSBleHBlY3RlZC5zb3VyY2UgJiZcbiAgICAgICAgICAgYWN0dWFsLmdsb2JhbCA9PT0gZXhwZWN0ZWQuZ2xvYmFsICYmXG4gICAgICAgICAgIGFjdHVhbC5tdWx0aWxpbmUgPT09IGV4cGVjdGVkLm11bHRpbGluZSAmJlxuICAgICAgICAgICBhY3R1YWwubGFzdEluZGV4ID09PSBleHBlY3RlZC5sYXN0SW5kZXggJiZcbiAgICAgICAgICAgYWN0dWFsLmlnbm9yZUNhc2UgPT09IGV4cGVjdGVkLmlnbm9yZUNhc2U7XG5cbiAgLy8gNy40LiBPdGhlciBwYWlycyB0aGF0IGRvIG5vdCBib3RoIHBhc3MgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnLFxuICAvLyBlcXVpdmFsZW5jZSBpcyBkZXRlcm1pbmVkIGJ5ID09LlxuICB9IGVsc2UgaWYgKCF1dGlsLmlzT2JqZWN0KGFjdHVhbCkgJiYgIXV0aWwuaXNPYmplY3QoZXhwZWN0ZWQpKSB7XG4gICAgcmV0dXJuIGFjdHVhbCA9PSBleHBlY3RlZDtcblxuICAvLyA3LjUgRm9yIGFsbCBvdGhlciBPYmplY3QgcGFpcnMsIGluY2x1ZGluZyBBcnJheSBvYmplY3RzLCBlcXVpdmFsZW5jZSBpc1xuICAvLyBkZXRlcm1pbmVkIGJ5IGhhdmluZyB0aGUgc2FtZSBudW1iZXIgb2Ygb3duZWQgcHJvcGVydGllcyAoYXMgdmVyaWZpZWRcbiAgLy8gd2l0aCBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwpLCB0aGUgc2FtZSBzZXQgb2Yga2V5c1xuICAvLyAoYWx0aG91Z2ggbm90IG5lY2Vzc2FyaWx5IHRoZSBzYW1lIG9yZGVyKSwgZXF1aXZhbGVudCB2YWx1ZXMgZm9yIGV2ZXJ5XG4gIC8vIGNvcnJlc3BvbmRpbmcga2V5LCBhbmQgYW4gaWRlbnRpY2FsICdwcm90b3R5cGUnIHByb3BlcnR5LiBOb3RlOiB0aGlzXG4gIC8vIGFjY291bnRzIGZvciBib3RoIG5hbWVkIGFuZCBpbmRleGVkIHByb3BlcnRpZXMgb24gQXJyYXlzLlxuICB9IGVsc2Uge1xuICAgIHJldHVybiBvYmpFcXVpdihhY3R1YWwsIGV4cGVjdGVkKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0FyZ3VtZW50cyhvYmplY3QpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmplY3QpID09ICdbb2JqZWN0IEFyZ3VtZW50c10nO1xufVxuXG5mdW5jdGlvbiBvYmpFcXVpdihhLCBiKSB7XG4gIGlmICh1dGlsLmlzTnVsbE9yVW5kZWZpbmVkKGEpIHx8IHV0aWwuaXNOdWxsT3JVbmRlZmluZWQoYikpXG4gICAgcmV0dXJuIGZhbHNlO1xuICAvLyBhbiBpZGVudGljYWwgJ3Byb3RvdHlwZScgcHJvcGVydHkuXG4gIGlmIChhLnByb3RvdHlwZSAhPT0gYi5wcm90b3R5cGUpIHJldHVybiBmYWxzZTtcbiAgLy9+fn5JJ3ZlIG1hbmFnZWQgdG8gYnJlYWsgT2JqZWN0LmtleXMgdGhyb3VnaCBzY3Jld3kgYXJndW1lbnRzIHBhc3NpbmcuXG4gIC8vICAgQ29udmVydGluZyB0byBhcnJheSBzb2x2ZXMgdGhlIHByb2JsZW0uXG4gIGlmIChpc0FyZ3VtZW50cyhhKSkge1xuICAgIGlmICghaXNBcmd1bWVudHMoYikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgYSA9IHBTbGljZS5jYWxsKGEpO1xuICAgIGIgPSBwU2xpY2UuY2FsbChiKTtcbiAgICByZXR1cm4gX2RlZXBFcXVhbChhLCBiKTtcbiAgfVxuICB0cnkge1xuICAgIHZhciBrYSA9IG9iamVjdEtleXMoYSksXG4gICAgICAgIGtiID0gb2JqZWN0S2V5cyhiKSxcbiAgICAgICAga2V5LCBpO1xuICB9IGNhdGNoIChlKSB7Ly9oYXBwZW5zIHdoZW4gb25lIGlzIGEgc3RyaW5nIGxpdGVyYWwgYW5kIHRoZSBvdGhlciBpc24ndFxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBoYXZpbmcgdGhlIHNhbWUgbnVtYmVyIG9mIG93bmVkIHByb3BlcnRpZXMgKGtleXMgaW5jb3Jwb3JhdGVzXG4gIC8vIGhhc093blByb3BlcnR5KVxuICBpZiAoa2EubGVuZ3RoICE9IGtiLmxlbmd0aClcbiAgICByZXR1cm4gZmFsc2U7XG4gIC8vdGhlIHNhbWUgc2V0IG9mIGtleXMgKGFsdGhvdWdoIG5vdCBuZWNlc3NhcmlseSB0aGUgc2FtZSBvcmRlciksXG4gIGthLnNvcnQoKTtcbiAga2Iuc29ydCgpO1xuICAvL35+fmNoZWFwIGtleSB0ZXN0XG4gIGZvciAoaSA9IGthLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgaWYgKGthW2ldICE9IGtiW2ldKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vZXF1aXZhbGVudCB2YWx1ZXMgZm9yIGV2ZXJ5IGNvcnJlc3BvbmRpbmcga2V5LCBhbmRcbiAgLy9+fn5wb3NzaWJseSBleHBlbnNpdmUgZGVlcCB0ZXN0XG4gIGZvciAoaSA9IGthLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAga2V5ID0ga2FbaV07XG4gICAgaWYgKCFfZGVlcEVxdWFsKGFba2V5XSwgYltrZXldKSkgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyA4LiBUaGUgbm9uLWVxdWl2YWxlbmNlIGFzc2VydGlvbiB0ZXN0cyBmb3IgYW55IGRlZXAgaW5lcXVhbGl0eS5cbi8vIGFzc2VydC5ub3REZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQubm90RGVlcEVxdWFsID0gZnVuY3Rpb24gbm90RGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKF9kZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCkpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICdub3REZWVwRXF1YWwnLCBhc3NlcnQubm90RGVlcEVxdWFsKTtcbiAgfVxufTtcblxuLy8gOS4gVGhlIHN0cmljdCBlcXVhbGl0eSBhc3NlcnRpb24gdGVzdHMgc3RyaWN0IGVxdWFsaXR5LCBhcyBkZXRlcm1pbmVkIGJ5ID09PS5cbi8vIGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5zdHJpY3RFcXVhbCA9IGZ1bmN0aW9uIHN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKGFjdHVhbCAhPT0gZXhwZWN0ZWQpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICc9PT0nLCBhc3NlcnQuc3RyaWN0RXF1YWwpO1xuICB9XG59O1xuXG4vLyAxMC4gVGhlIHN0cmljdCBub24tZXF1YWxpdHkgYXNzZXJ0aW9uIHRlc3RzIGZvciBzdHJpY3QgaW5lcXVhbGl0eSwgYXNcbi8vIGRldGVybWluZWQgYnkgIT09LiAgYXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0Lm5vdFN0cmljdEVxdWFsID0gZnVuY3Rpb24gbm90U3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoYWN0dWFsID09PSBleHBlY3RlZCkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJyE9PScsIGFzc2VydC5ub3RTdHJpY3RFcXVhbCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGV4cGVjdGVkRXhjZXB0aW9uKGFjdHVhbCwgZXhwZWN0ZWQpIHtcbiAgaWYgKCFhY3R1YWwgfHwgIWV4cGVjdGVkKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChleHBlY3RlZCkgPT0gJ1tvYmplY3QgUmVnRXhwXScpIHtcbiAgICByZXR1cm4gZXhwZWN0ZWQudGVzdChhY3R1YWwpO1xuICB9IGVsc2UgaWYgKGFjdHVhbCBpbnN0YW5jZW9mIGV4cGVjdGVkKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gZWxzZSBpZiAoZXhwZWN0ZWQuY2FsbCh7fSwgYWN0dWFsKSA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBfdGhyb3dzKHNob3VsZFRocm93LCBibG9jaywgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgdmFyIGFjdHVhbDtcblxuICBpZiAodXRpbC5pc1N0cmluZyhleHBlY3RlZCkpIHtcbiAgICBtZXNzYWdlID0gZXhwZWN0ZWQ7XG4gICAgZXhwZWN0ZWQgPSBudWxsO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBibG9jaygpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgYWN0dWFsID0gZTtcbiAgfVxuXG4gIG1lc3NhZ2UgPSAoZXhwZWN0ZWQgJiYgZXhwZWN0ZWQubmFtZSA/ICcgKCcgKyBleHBlY3RlZC5uYW1lICsgJykuJyA6ICcuJykgK1xuICAgICAgICAgICAgKG1lc3NhZ2UgPyAnICcgKyBtZXNzYWdlIDogJy4nKTtcblxuICBpZiAoc2hvdWxkVGhyb3cgJiYgIWFjdHVhbCkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgJ01pc3NpbmcgZXhwZWN0ZWQgZXhjZXB0aW9uJyArIG1lc3NhZ2UpO1xuICB9XG5cbiAgaWYgKCFzaG91bGRUaHJvdyAmJiBleHBlY3RlZEV4Y2VwdGlvbihhY3R1YWwsIGV4cGVjdGVkKSkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgJ0dvdCB1bndhbnRlZCBleGNlcHRpb24nICsgbWVzc2FnZSk7XG4gIH1cblxuICBpZiAoKHNob3VsZFRocm93ICYmIGFjdHVhbCAmJiBleHBlY3RlZCAmJlxuICAgICAgIWV4cGVjdGVkRXhjZXB0aW9uKGFjdHVhbCwgZXhwZWN0ZWQpKSB8fCAoIXNob3VsZFRocm93ICYmIGFjdHVhbCkpIHtcbiAgICB0aHJvdyBhY3R1YWw7XG4gIH1cbn1cblxuLy8gMTEuIEV4cGVjdGVkIHRvIHRocm93IGFuIGVycm9yOlxuLy8gYXNzZXJ0LnRocm93cyhibG9jaywgRXJyb3Jfb3B0LCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC50aHJvd3MgPSBmdW5jdGlvbihibG9jaywgLypvcHRpb25hbCovZXJyb3IsIC8qb3B0aW9uYWwqL21lc3NhZ2UpIHtcbiAgX3Rocm93cy5hcHBseSh0aGlzLCBbdHJ1ZV0uY29uY2F0KHBTbGljZS5jYWxsKGFyZ3VtZW50cykpKTtcbn07XG5cbi8vIEVYVEVOU0lPTiEgVGhpcyBpcyBhbm5veWluZyB0byB3cml0ZSBvdXRzaWRlIHRoaXMgbW9kdWxlLlxuYXNzZXJ0LmRvZXNOb3RUaHJvdyA9IGZ1bmN0aW9uKGJsb2NrLCAvKm9wdGlvbmFsKi9tZXNzYWdlKSB7XG4gIF90aHJvd3MuYXBwbHkodGhpcywgW2ZhbHNlXS5jb25jYXQocFNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xufTtcblxuYXNzZXJ0LmlmRXJyb3IgPSBmdW5jdGlvbihlcnIpIHsgaWYgKGVycikge3Rocm93IGVycjt9fTtcblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciBrZXlzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoaGFzT3duLmNhbGwob2JqLCBrZXkpKSBrZXlzLnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4ga2V5cztcbn07XG4iLCIvKiFcbiAqIFRoZSBidWZmZXIgbW9kdWxlIGZyb20gbm9kZS5qcywgZm9yIHRoZSBicm93c2VyLlxuICpcbiAqIEBhdXRob3IgICBGZXJvc3MgQWJvdWtoYWRpamVoIDxmZXJvc3NAZmVyb3NzLm9yZz4gPGh0dHA6Ly9mZXJvc3Mub3JnPlxuICogQGxpY2Vuc2UgIE1JVFxuICovXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcblxuZXhwb3J0cy5CdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuU2xvd0J1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyXG5cbi8qKlxuICogSWYgYEJ1ZmZlci5fdXNlVHlwZWRBcnJheXNgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAoY29tcGF0aWJsZSBkb3duIHRvIElFNilcbiAqL1xuQnVmZmVyLl91c2VUeXBlZEFycmF5cyA9IChmdW5jdGlvbiAoKSB7XG4gIC8vIERldGVjdCBpZiBicm93c2VyIHN1cHBvcnRzIFR5cGVkIEFycmF5cy4gU3VwcG9ydGVkIGJyb3dzZXJzIGFyZSBJRSAxMCssIEZpcmVmb3ggNCssXG4gIC8vIENocm9tZSA3KywgU2FmYXJpIDUuMSssIE9wZXJhIDExLjYrLCBpT1MgNC4yKy4gSWYgdGhlIGJyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBhZGRpbmdcbiAgLy8gcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLCB0aGVuIHRoYXQncyB0aGUgc2FtZSBhcyBubyBgVWludDhBcnJheWAgc3VwcG9ydFxuICAvLyBiZWNhdXNlIHdlIG5lZWQgdG8gYmUgYWJsZSB0byBhZGQgYWxsIHRoZSBub2RlIEJ1ZmZlciBBUEkgbWV0aG9kcy4gVGhpcyBpcyBhbiBpc3N1ZVxuICAvLyBpbiBGaXJlZm94IDQtMjkuIE5vdyBmaXhlZDogaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9Njk1NDM4XG4gIHRyeSB7XG4gICAgdmFyIGJ1ZiA9IG5ldyBBcnJheUJ1ZmZlcigwKVxuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheShidWYpXG4gICAgYXJyLmZvbyA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIDQyIH1cbiAgICByZXR1cm4gNDIgPT09IGFyci5mb28oKSAmJlxuICAgICAgICB0eXBlb2YgYXJyLnN1YmFycmF5ID09PSAnZnVuY3Rpb24nIC8vIENocm9tZSA5LTEwIGxhY2sgYHN1YmFycmF5YFxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn0pKClcblxuLyoqXG4gKiBDbGFzczogQnVmZmVyXG4gKiA9PT09PT09PT09PT09XG4gKlxuICogVGhlIEJ1ZmZlciBjb25zdHJ1Y3RvciByZXR1cm5zIGluc3RhbmNlcyBvZiBgVWludDhBcnJheWAgdGhhdCBhcmUgYXVnbWVudGVkXG4gKiB3aXRoIGZ1bmN0aW9uIHByb3BlcnRpZXMgZm9yIGFsbCB0aGUgbm9kZSBgQnVmZmVyYCBBUEkgZnVuY3Rpb25zLiBXZSB1c2VcbiAqIGBVaW50OEFycmF5YCBzbyB0aGF0IHNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0IHJldHVybnNcbiAqIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIEJ5IGF1Z21lbnRpbmcgdGhlIGluc3RhbmNlcywgd2UgY2FuIGF2b2lkIG1vZGlmeWluZyB0aGUgYFVpbnQ4QXJyYXlgXG4gKiBwcm90b3R5cGUuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlciAoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQnVmZmVyKSlcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKVxuXG4gIHZhciB0eXBlID0gdHlwZW9mIHN1YmplY3RcblxuICAvLyBXb3JrYXJvdW5kOiBub2RlJ3MgYmFzZTY0IGltcGxlbWVudGF0aW9uIGFsbG93cyBmb3Igbm9uLXBhZGRlZCBzdHJpbmdzXG4gIC8vIHdoaWxlIGJhc2U2NC1qcyBkb2VzIG5vdC5cbiAgaWYgKGVuY29kaW5nID09PSAnYmFzZTY0JyAmJiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHN1YmplY3QgPSBzdHJpbmd0cmltKHN1YmplY3QpXG4gICAgd2hpbGUgKHN1YmplY3QubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgICAgc3ViamVjdCA9IHN1YmplY3QgKyAnPSdcbiAgICB9XG4gIH1cblxuICAvLyBGaW5kIHRoZSBsZW5ndGhcbiAgdmFyIGxlbmd0aFxuICBpZiAodHlwZSA9PT0gJ251bWJlcicpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKVxuICAgIGxlbmd0aCA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHN1YmplY3QsIGVuY29kaW5nKVxuICBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0JylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdC5sZW5ndGgpIC8vIGFzc3VtZSB0aGF0IG9iamVjdCBpcyBhcnJheS1saWtlXG4gIGVsc2VcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG5lZWRzIHRvIGJlIGEgbnVtYmVyLCBhcnJheSBvciBzdHJpbmcuJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgLy8gUHJlZmVycmVkOiBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGJ1ZiA9IEJ1ZmZlci5fYXVnbWVudChuZXcgVWludDhBcnJheShsZW5ndGgpKVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gVEhJUyBpbnN0YW5jZSBvZiBCdWZmZXIgKGNyZWF0ZWQgYnkgYG5ld2ApXG4gICAgYnVmID0gdGhpc1xuICAgIGJ1Zi5sZW5ndGggPSBsZW5ndGhcbiAgICBidWYuX2lzQnVmZmVyID0gdHJ1ZVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgdHlwZW9mIHN1YmplY3QuYnl0ZUxlbmd0aCA9PT0gJ251bWJlcicpIHtcbiAgICAvLyBTcGVlZCBvcHRpbWl6YXRpb24gLS0gdXNlIHNldCBpZiB3ZSdyZSBjb3B5aW5nIGZyb20gYSB0eXBlZCBhcnJheVxuICAgIGJ1Zi5fc2V0KHN1YmplY3QpXG4gIH0gZWxzZSBpZiAoaXNBcnJheWlzaChzdWJqZWN0KSkge1xuICAgIC8vIFRyZWF0IGFycmF5LWlzaCBvYmplY3RzIGFzIGEgYnl0ZSBhcnJheVxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSlcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdC5yZWFkVUludDgoaSlcbiAgICAgIGVsc2VcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdFtpXVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgIGJ1Zi53cml0ZShzdWJqZWN0LCAwLCBlbmNvZGluZylcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiAhQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBTVEFUSUMgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5pc0J1ZmZlciA9IGZ1bmN0aW9uIChiKSB7XG4gIHJldHVybiAhIShiICE9PSBudWxsICYmIGIgIT09IHVuZGVmaW5lZCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmJ5dGVMZW5ndGggPSBmdW5jdGlvbiAoc3RyLCBlbmNvZGluZykge1xuICB2YXIgcmV0XG4gIHN0ciA9IHN0ciArICcnXG4gIHN3aXRjaCAoZW5jb2RpbmcgfHwgJ3V0ZjgnKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggLyAyXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IHV0ZjhUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoICogMlxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiAobGlzdCwgdG90YWxMZW5ndGgpIHtcbiAgYXNzZXJ0KGlzQXJyYXkobGlzdCksICdVc2FnZTogQnVmZmVyLmNvbmNhdChsaXN0LCBbdG90YWxMZW5ndGhdKVxcbicgK1xuICAgICAgJ2xpc3Qgc2hvdWxkIGJlIGFuIEFycmF5LicpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodHlwZW9mIHRvdGFsTGVuZ3RoICE9PSAnbnVtYmVyJykge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbi8vIEJVRkZFUiBJTlNUQU5DRSBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBfaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBhc3NlcnQoc3RyTGVuICUgMiA9PT0gMCwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG5cbiAgaWYgKGxlbmd0aCA+IHN0ckxlbiAvIDIpIHtcbiAgICBsZW5ndGggPSBzdHJMZW4gLyAyXG4gIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHZhciBieXRlID0gcGFyc2VJbnQoc3RyaW5nLnN1YnN0cihpICogMiwgMiksIDE2KVxuICAgIGFzc2VydCghaXNOYU4oYnl0ZSksICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuICAgIGJ1ZltvZmZzZXQgKyBpXSA9IGJ5dGVcbiAgfVxuICBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9IGkgKiAyXG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIF91dGY4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYXNjaWlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihhc2NpaVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gX2FzY2lpV3JpdGUoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF91dGYxNmxlV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmMTZsZVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIFN1cHBvcnQgYm90aCAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpXG4gIC8vIGFuZCB0aGUgbGVnYWN5IChzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgaWYgKGlzRmluaXRlKG9mZnNldCkpIHtcbiAgICBpZiAoIWlzRmluaXRlKGxlbmd0aCkpIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIH0gZWxzZSB7ICAvLyBsZWdhY3lcbiAgICB2YXIgc3dhcCA9IGVuY29kaW5nXG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBvZmZzZXQgPSBsZW5ndGhcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSB0aGlzLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuXG4gIHZhciByZXRcbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBfaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gX3V0ZjhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBfYXNjaWlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0ID0gX2JpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBfYmFzZTY0V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IF91dGYxNmxlV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuICBzdGFydCA9IE51bWJlcihzdGFydCkgfHwgMFxuICBlbmQgPSAoZW5kICE9PSB1bmRlZmluZWQpXG4gICAgPyBOdW1iZXIoZW5kKVxuICAgIDogZW5kID0gc2VsZi5sZW5ndGhcblxuICAvLyBGYXN0cGF0aCBlbXB0eSBzdHJpbmdzXG4gIGlmIChlbmQgPT09IHN0YXJ0KVxuICAgIHJldHVybiAnJ1xuXG4gIHZhciByZXRcbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBfaGV4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gX3V0ZjhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBfYXNjaWlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0ID0gX2JpbmFyeVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBfYmFzZTY0U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IF91dGYxNmxlU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG4vLyBjb3B5KHRhcmdldEJ1ZmZlciwgdGFyZ2V0U3RhcnQ9MCwgc291cmNlU3RhcnQ9MCwgc291cmNlRW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiAodGFyZ2V0LCB0YXJnZXRfc3RhcnQsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNvdXJjZSA9IHRoaXNcblxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgJiYgZW5kICE9PSAwKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoIXRhcmdldF9zdGFydCkgdGFyZ2V0X3N0YXJ0ID0gMFxuXG4gIC8vIENvcHkgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHNvdXJjZS5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ3NvdXJjZUVuZCA8IHNvdXJjZVN0YXJ0JylcbiAgYXNzZXJ0KHRhcmdldF9zdGFydCA+PSAwICYmIHRhcmdldF9zdGFydCA8IHRhcmdldC5sZW5ndGgsXG4gICAgICAndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgc291cmNlLmxlbmd0aCwgJ3NvdXJjZVN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VFbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgLy8gQXJlIHdlIG9vYj9cbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKVxuICAgIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0IDwgZW5kIC0gc3RhcnQpXG4gICAgZW5kID0gdGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCArIHN0YXJ0XG5cbiAgdmFyIGxlbiA9IGVuZCAtIHN0YXJ0XG5cbiAgaWYgKGxlbiA8IDEwMCB8fCAhQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICB0YXJnZXRbaSArIHRhcmdldF9zdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldF9zdGFydClcbiAgfVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIF91dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmVzID0gJydcbiAgdmFyIHRtcCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIGlmIChidWZbaV0gPD0gMHg3Rikge1xuICAgICAgcmVzICs9IGRlY29kZVV0ZjhDaGFyKHRtcCkgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgICAgIHRtcCA9ICcnXG4gICAgfSBlbHNlIHtcbiAgICAgIHRtcCArPSAnJScgKyBidWZbaV0udG9TdHJpbmcoMTYpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlcyArIGRlY29kZVV0ZjhDaGFyKHRtcClcbn1cblxuZnVuY3Rpb24gX2FzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKVxuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgcmV0dXJuIHJldFxufVxuXG5mdW5jdGlvbiBfYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gX2FzY2lpU2xpY2UoYnVmLCBzdGFydCwgZW5kKVxufVxuXG5mdW5jdGlvbiBfaGV4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuXG4gIGlmICghc3RhcnQgfHwgc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgfHwgZW5kIDwgMCB8fCBlbmQgPiBsZW4pIGVuZCA9IGxlblxuXG4gIHZhciBvdXQgPSAnJ1xuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIG91dCArPSB0b0hleChidWZbaV0pXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiBfdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpKzFdICogMjU2KVxuICB9XG4gIHJldHVybiByZXNcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIChzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBzdGFydCA9IGNsYW1wKHN0YXJ0LCBsZW4sIDApXG4gIGVuZCA9IGNsYW1wKGVuZCwgbGVuLCBsZW4pXG5cbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICByZXR1cm4gQnVmZmVyLl9hdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gIH0gZWxzZSB7XG4gICAgdmFsID0gYnVmW29mZnNldF0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMl0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICAgIHZhbCB8PSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXQgKyAzXSA8PCAyNCA+Pj4gMClcbiAgfSBlbHNlIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAxXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAyXSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDNdXG4gICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXRdIDw8IDI0ID4+PiAwKVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCxcbiAgICAgICAgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHZhciBuZWcgPSB0aGlzW29mZnNldF0gJiAweDgwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDE2KGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQzMihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwMDAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRGbG9hdCAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdExFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZERvdWJsZSAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmYpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKSByZXR1cm5cblxuICB0aGlzW29mZnNldF0gPSB2YWx1ZVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlICYgKDB4ZmYgPDwgKDggKiAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSkpKSA+Pj5cbiAgICAgICAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZiwgLTB4ODApXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIHRoaXMud3JpdGVVSW50OCh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydClcbiAgZWxzZVxuICAgIHRoaXMud3JpdGVVSW50OCgweGZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmYsIC0weDgwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MTYoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgMHhmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQzMihidWYsIDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMy40MDI4MjM0NjYzODUyODg2ZSszOCwgLTMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLFxuICAgICAgICAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gKHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIGlmICghdmFsdWUpIHZhbHVlID0gMFxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQpIGVuZCA9IHRoaXMubGVuZ3RoXG5cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YWx1ZSA9IHZhbHVlLmNoYXJDb2RlQXQoMClcbiAgfVxuXG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmICFpc05hTih2YWx1ZSksICd2YWx1ZSBpcyBub3QgYSBudW1iZXInKVxuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCB0aGlzLmxlbmd0aCwgJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHRoaXMubGVuZ3RoLCAnZW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgdGhpc1tpXSA9IHZhbHVlXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgb3V0ID0gW11cbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBvdXRbaV0gPSB0b0hleCh0aGlzW2ldKVxuICAgIGlmIChpID09PSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTKSB7XG4gICAgICBvdXRbaSArIDFdID0gJy4uLidcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiAnPEJ1ZmZlciAnICsgb3V0LmpvaW4oJyAnKSArICc+J1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEFycmF5QnVmZmVyYCB3aXRoIHRoZSAqY29waWVkKiBtZW1vcnkgb2YgdGhlIGJ1ZmZlciBpbnN0YW5jZS5cbiAqIEFkZGVkIGluIE5vZGUgMC4xMi4gT25seSBhdmFpbGFibGUgaW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEFycmF5QnVmZmVyLlxuICovXG5CdWZmZXIucHJvdG90eXBlLnRvQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKHRoaXMpKS5idWZmZXJcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMubGVuZ3RoKVxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGJ1Zi5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMSlcbiAgICAgICAgYnVmW2ldID0gdGhpc1tpXVxuICAgICAgcmV0dXJuIGJ1Zi5idWZmZXJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCdWZmZXIudG9BcnJheUJ1ZmZlciBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicpXG4gIH1cbn1cblxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBzdHJpbmd0cmltIChzdHIpIHtcbiAgaWYgKHN0ci50cmltKSByZXR1cm4gc3RyLnRyaW0oKVxuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxufVxuXG52YXIgQlAgPSBCdWZmZXIucHJvdG90eXBlXG5cbi8qKlxuICogQXVnbWVudCBhIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBVaW50OEFycmF5IGNsYXNzISkgd2l0aCBCdWZmZXIgbWV0aG9kc1xuICovXG5CdWZmZXIuX2F1Z21lbnQgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG4vLyBzbGljZShzdGFydCwgZW5kKVxuZnVuY3Rpb24gY2xhbXAgKGluZGV4LCBsZW4sIGRlZmF1bHRWYWx1ZSkge1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSAnbnVtYmVyJykgcmV0dXJuIGRlZmF1bHRWYWx1ZVxuICBpbmRleCA9IH5+aW5kZXg7ICAvLyBDb2VyY2UgdG8gaW50ZWdlci5cbiAgaWYgKGluZGV4ID49IGxlbikgcmV0dXJuIGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIGluZGV4ICs9IGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGNvZXJjZSAobGVuZ3RoKSB7XG4gIC8vIENvZXJjZSBsZW5ndGggdG8gYSBudW1iZXIgKHBvc3NpYmx5IE5hTiksIHJvdW5kIHVwXG4gIC8vIGluIGNhc2UgaXQncyBmcmFjdGlvbmFsIChlLmcuIDEyMy40NTYpIHRoZW4gZG8gYVxuICAvLyBkb3VibGUgbmVnYXRlIHRvIGNvZXJjZSBhIE5hTiB0byAwLiBFYXN5LCByaWdodD9cbiAgbGVuZ3RoID0gfn5NYXRoLmNlaWwoK2xlbmd0aClcbiAgcmV0dXJuIGxlbmd0aCA8IDAgPyAwIDogbGVuZ3RoXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXkgKHN1YmplY3QpIHtcbiAgcmV0dXJuIChBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChzdWJqZWN0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzdWJqZWN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJ1xuICB9KShzdWJqZWN0KVxufVxuXG5mdW5jdGlvbiBpc0FycmF5aXNoIChzdWJqZWN0KSB7XG4gIHJldHVybiBpc0FycmF5KHN1YmplY3QpIHx8IEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSB8fFxuICAgICAgc3ViamVjdCAmJiB0eXBlb2Ygc3ViamVjdCA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHR5cGVvZiBzdWJqZWN0Lmxlbmd0aCA9PT0gJ251bWJlcidcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIHZhciBiID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBpZiAoYiA8PSAweDdGKVxuICAgICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkpXG4gICAgZWxzZSB7XG4gICAgICB2YXIgc3RhcnQgPSBpXG4gICAgICBpZiAoYiA+PSAweEQ4MDAgJiYgYiA8PSAweERGRkYpIGkrK1xuICAgICAgdmFyIGggPSBlbmNvZGVVUklDb21wb25lbnQoc3RyLnNsaWNlKHN0YXJ0LCBpKzEpKS5zdWJzdHIoMSkuc3BsaXQoJyUnKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBoLmxlbmd0aDsgaisrKVxuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYywgaGksIGxvXG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBwb3NcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG5cbi8qXG4gKiBXZSBoYXZlIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSB2YWx1ZSBpcyBhIHZhbGlkIGludGVnZXIuIFRoaXMgbWVhbnMgdGhhdCBpdFxuICogaXMgbm9uLW5lZ2F0aXZlLiBJdCBoYXMgbm8gZnJhY3Rpb25hbCBjb21wb25lbnQgYW5kIHRoYXQgaXQgZG9lcyBub3RcbiAqIGV4Y2VlZCB0aGUgbWF4aW11bSBhbGxvd2VkIHZhbHVlLlxuICovXG5mdW5jdGlvbiB2ZXJpZnVpbnQgKHZhbHVlLCBtYXgpIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlID49IDAsICdzcGVjaWZpZWQgYSBuZWdhdGl2ZSB2YWx1ZSBmb3Igd3JpdGluZyBhbiB1bnNpZ25lZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBpcyBsYXJnZXIgdGhhbiBtYXhpbXVtIHZhbHVlIGZvciB0eXBlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZzaW50ICh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZJRUVFNzU0ICh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbn1cblxuZnVuY3Rpb24gYXNzZXJ0ICh0ZXN0LCBtZXNzYWdlKSB7XG4gIGlmICghdGVzdCkgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UgfHwgJ0ZhaWxlZCBhc3NlcnRpb24nKVxufVxuIiwidmFyIGxvb2t1cCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcblxuOyhmdW5jdGlvbiAoZXhwb3J0cykge1xuXHQndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFyciA9ICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBVaW50OEFycmF5XG4gICAgOiBBcnJheVxuXG5cdHZhciBQTFVTICAgPSAnKycuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0ggID0gJy8nLmNoYXJDb2RlQXQoMClcblx0dmFyIE5VTUJFUiA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBMT1dFUiAgPSAnYScuY2hhckNvZGVBdCgwKVxuXHR2YXIgVVBQRVIgID0gJ0EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFBMVVNfVVJMX1NBRkUgPSAnLScuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0hfVVJMX1NBRkUgPSAnXycuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTIHx8XG5cdFx0ICAgIGNvZGUgPT09IFBMVVNfVVJMX1NBRkUpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIIHx8XG5cdFx0ICAgIGNvZGUgPT09IFNMQVNIX1VSTF9TQUZFKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdGV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRleHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJyA/ICh0aGlzLmJhc2U2NGpzID0ge30pIDogZXhwb3J0cykpXG4iLCJleHBvcnRzLnJlYWQgPSBmdW5jdGlvbihidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIG5CaXRzID0gLTcsXG4gICAgICBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDAsXG4gICAgICBkID0gaXNMRSA/IC0xIDogMSxcbiAgICAgIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV07XG5cbiAgaSArPSBkO1xuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBzID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gZUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIGUgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBtTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXM7XG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KTtcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pO1xuICAgIGUgPSBlIC0gZUJpYXM7XG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbik7XG59O1xuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGMsXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApLFxuICAgICAgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpLFxuICAgICAgZCA9IGlzTEUgPyAxIDogLTEsXG4gICAgICBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwO1xuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpO1xuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwO1xuICAgIGUgPSBlTWF4O1xuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS07XG4gICAgICBjICo9IDI7XG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcyk7XG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrO1xuICAgICAgYyAvPSAyO1xuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDA7XG4gICAgICBlID0gZU1heDtcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gZSArIGVCaWFzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gMDtcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KTtcblxuICBlID0gKGUgPDwgbUxlbikgfCBtO1xuICBlTGVuICs9IG1MZW47XG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCk7XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4O1xufTtcbiIsInZhciBCdWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5CdWZmZXI7XG52YXIgaW50U2l6ZSA9IDQ7XG52YXIgemVyb0J1ZmZlciA9IG5ldyBCdWZmZXIoaW50U2l6ZSk7IHplcm9CdWZmZXIuZmlsbCgwKTtcbnZhciBjaHJzeiA9IDg7XG5cbmZ1bmN0aW9uIHRvQXJyYXkoYnVmLCBiaWdFbmRpYW4pIHtcbiAgaWYgKChidWYubGVuZ3RoICUgaW50U2l6ZSkgIT09IDApIHtcbiAgICB2YXIgbGVuID0gYnVmLmxlbmd0aCArIChpbnRTaXplIC0gKGJ1Zi5sZW5ndGggJSBpbnRTaXplKSk7XG4gICAgYnVmID0gQnVmZmVyLmNvbmNhdChbYnVmLCB6ZXJvQnVmZmVyXSwgbGVuKTtcbiAgfVxuXG4gIHZhciBhcnIgPSBbXTtcbiAgdmFyIGZuID0gYmlnRW5kaWFuID8gYnVmLnJlYWRJbnQzMkJFIDogYnVmLnJlYWRJbnQzMkxFO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ1Zi5sZW5ndGg7IGkgKz0gaW50U2l6ZSkge1xuICAgIGFyci5wdXNoKGZuLmNhbGwoYnVmLCBpKSk7XG4gIH1cbiAgcmV0dXJuIGFycjtcbn1cblxuZnVuY3Rpb24gdG9CdWZmZXIoYXJyLCBzaXplLCBiaWdFbmRpYW4pIHtcbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIoc2l6ZSk7XG4gIHZhciBmbiA9IGJpZ0VuZGlhbiA/IGJ1Zi53cml0ZUludDMyQkUgOiBidWYud3JpdGVJbnQzMkxFO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykge1xuICAgIGZuLmNhbGwoYnVmLCBhcnJbaV0sIGkgKiA0LCB0cnVlKTtcbiAgfVxuICByZXR1cm4gYnVmO1xufVxuXG5mdW5jdGlvbiBoYXNoKGJ1ZiwgZm4sIGhhc2hTaXplLCBiaWdFbmRpYW4pIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYnVmKSkgYnVmID0gbmV3IEJ1ZmZlcihidWYpO1xuICB2YXIgYXJyID0gZm4odG9BcnJheShidWYsIGJpZ0VuZGlhbiksIGJ1Zi5sZW5ndGggKiBjaHJzeik7XG4gIHJldHVybiB0b0J1ZmZlcihhcnIsIGhhc2hTaXplLCBiaWdFbmRpYW4pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHsgaGFzaDogaGFzaCB9O1xuIiwidmFyIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlclxudmFyIHNoYSA9IHJlcXVpcmUoJy4vc2hhJylcbnZhciBzaGEyNTYgPSByZXF1aXJlKCcuL3NoYTI1NicpXG52YXIgcm5nID0gcmVxdWlyZSgnLi9ybmcnKVxudmFyIG1kNSA9IHJlcXVpcmUoJy4vbWQ1JylcblxudmFyIGFsZ29yaXRobXMgPSB7XG4gIHNoYTE6IHNoYSxcbiAgc2hhMjU2OiBzaGEyNTYsXG4gIG1kNTogbWQ1XG59XG5cbnZhciBibG9ja3NpemUgPSA2NFxudmFyIHplcm9CdWZmZXIgPSBuZXcgQnVmZmVyKGJsb2Nrc2l6ZSk7IHplcm9CdWZmZXIuZmlsbCgwKVxuZnVuY3Rpb24gaG1hYyhmbiwga2V5LCBkYXRhKSB7XG4gIGlmKCFCdWZmZXIuaXNCdWZmZXIoa2V5KSkga2V5ID0gbmV3IEJ1ZmZlcihrZXkpXG4gIGlmKCFCdWZmZXIuaXNCdWZmZXIoZGF0YSkpIGRhdGEgPSBuZXcgQnVmZmVyKGRhdGEpXG5cbiAgaWYoa2V5Lmxlbmd0aCA+IGJsb2Nrc2l6ZSkge1xuICAgIGtleSA9IGZuKGtleSlcbiAgfSBlbHNlIGlmKGtleS5sZW5ndGggPCBibG9ja3NpemUpIHtcbiAgICBrZXkgPSBCdWZmZXIuY29uY2F0KFtrZXksIHplcm9CdWZmZXJdLCBibG9ja3NpemUpXG4gIH1cblxuICB2YXIgaXBhZCA9IG5ldyBCdWZmZXIoYmxvY2tzaXplKSwgb3BhZCA9IG5ldyBCdWZmZXIoYmxvY2tzaXplKVxuICBmb3IodmFyIGkgPSAwOyBpIDwgYmxvY2tzaXplOyBpKyspIHtcbiAgICBpcGFkW2ldID0ga2V5W2ldIF4gMHgzNlxuICAgIG9wYWRbaV0gPSBrZXlbaV0gXiAweDVDXG4gIH1cblxuICB2YXIgaGFzaCA9IGZuKEJ1ZmZlci5jb25jYXQoW2lwYWQsIGRhdGFdKSlcbiAgcmV0dXJuIGZuKEJ1ZmZlci5jb25jYXQoW29wYWQsIGhhc2hdKSlcbn1cblxuZnVuY3Rpb24gaGFzaChhbGcsIGtleSkge1xuICBhbGcgPSBhbGcgfHwgJ3NoYTEnXG4gIHZhciBmbiA9IGFsZ29yaXRobXNbYWxnXVxuICB2YXIgYnVmcyA9IFtdXG4gIHZhciBsZW5ndGggPSAwXG4gIGlmKCFmbikgZXJyb3IoJ2FsZ29yaXRobTonLCBhbGcsICdpcyBub3QgeWV0IHN1cHBvcnRlZCcpXG4gIHJldHVybiB7XG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgaWYoIUJ1ZmZlci5pc0J1ZmZlcihkYXRhKSkgZGF0YSA9IG5ldyBCdWZmZXIoZGF0YSlcbiAgICAgICAgXG4gICAgICBidWZzLnB1c2goZGF0YSlcbiAgICAgIGxlbmd0aCArPSBkYXRhLmxlbmd0aFxuICAgICAgcmV0dXJuIHRoaXNcbiAgICB9LFxuICAgIGRpZ2VzdDogZnVuY3Rpb24gKGVuYykge1xuICAgICAgdmFyIGJ1ZiA9IEJ1ZmZlci5jb25jYXQoYnVmcylcbiAgICAgIHZhciByID0ga2V5ID8gaG1hYyhmbiwga2V5LCBidWYpIDogZm4oYnVmKVxuICAgICAgYnVmcyA9IG51bGxcbiAgICAgIHJldHVybiBlbmMgPyByLnRvU3RyaW5nKGVuYykgOiByXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGVycm9yICgpIHtcbiAgdmFyIG0gPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cykuam9pbignICcpXG4gIHRocm93IG5ldyBFcnJvcihbXG4gICAgbSxcbiAgICAnd2UgYWNjZXB0IHB1bGwgcmVxdWVzdHMnLFxuICAgICdodHRwOi8vZ2l0aHViLmNvbS9kb21pbmljdGFyci9jcnlwdG8tYnJvd3NlcmlmeSdcbiAgICBdLmpvaW4oJ1xcbicpKVxufVxuXG5leHBvcnRzLmNyZWF0ZUhhc2ggPSBmdW5jdGlvbiAoYWxnKSB7IHJldHVybiBoYXNoKGFsZykgfVxuZXhwb3J0cy5jcmVhdGVIbWFjID0gZnVuY3Rpb24gKGFsZywga2V5KSB7IHJldHVybiBoYXNoKGFsZywga2V5KSB9XG5leHBvcnRzLnJhbmRvbUJ5dGVzID0gZnVuY3Rpb24oc2l6ZSwgY2FsbGJhY2spIHtcbiAgaWYgKGNhbGxiYWNrICYmIGNhbGxiYWNrLmNhbGwpIHtcbiAgICB0cnkge1xuICAgICAgY2FsbGJhY2suY2FsbCh0aGlzLCB1bmRlZmluZWQsIG5ldyBCdWZmZXIocm5nKHNpemUpKSlcbiAgICB9IGNhdGNoIChlcnIpIHsgY2FsbGJhY2soZXJyKSB9XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIocm5nKHNpemUpKVxuICB9XG59XG5cbmZ1bmN0aW9uIGVhY2goYSwgZikge1xuICBmb3IodmFyIGkgaW4gYSlcbiAgICBmKGFbaV0sIGkpXG59XG5cbi8vIHRoZSBsZWFzdCBJIGNhbiBkbyBpcyBtYWtlIGVycm9yIG1lc3NhZ2VzIGZvciB0aGUgcmVzdCBvZiB0aGUgbm9kZS5qcy9jcnlwdG8gYXBpLlxuZWFjaChbJ2NyZWF0ZUNyZWRlbnRpYWxzJ1xuLCAnY3JlYXRlQ2lwaGVyJ1xuLCAnY3JlYXRlQ2lwaGVyaXYnXG4sICdjcmVhdGVEZWNpcGhlcidcbiwgJ2NyZWF0ZURlY2lwaGVyaXYnXG4sICdjcmVhdGVTaWduJ1xuLCAnY3JlYXRlVmVyaWZ5J1xuLCAnY3JlYXRlRGlmZmllSGVsbG1hbidcbiwgJ3Bia2RmMiddLCBmdW5jdGlvbiAobmFtZSkge1xuICBleHBvcnRzW25hbWVdID0gZnVuY3Rpb24gKCkge1xuICAgIGVycm9yKCdzb3JyeSwnLCBuYW1lLCAnaXMgbm90IGltcGxlbWVudGVkIHlldCcpXG4gIH1cbn0pXG4iLCIvKlxyXG4gKiBBIEphdmFTY3JpcHQgaW1wbGVtZW50YXRpb24gb2YgdGhlIFJTQSBEYXRhIFNlY3VyaXR5LCBJbmMuIE1ENSBNZXNzYWdlXHJcbiAqIERpZ2VzdCBBbGdvcml0aG0sIGFzIGRlZmluZWQgaW4gUkZDIDEzMjEuXHJcbiAqIFZlcnNpb24gMi4xIENvcHlyaWdodCAoQykgUGF1bCBKb2huc3RvbiAxOTk5IC0gMjAwMi5cclxuICogT3RoZXIgY29udHJpYnV0b3JzOiBHcmVnIEhvbHQsIEFuZHJldyBLZXBlcnQsIFlkbmFyLCBMb3N0aW5ldFxyXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIExpY2Vuc2VcclxuICogU2VlIGh0dHA6Ly9wYWpob21lLm9yZy51ay9jcnlwdC9tZDUgZm9yIG1vcmUgaW5mby5cclxuICovXHJcblxyXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xyXG5cclxuLypcclxuICogUGVyZm9ybSBhIHNpbXBsZSBzZWxmLXRlc3QgdG8gc2VlIGlmIHRoZSBWTSBpcyB3b3JraW5nXHJcbiAqL1xyXG5mdW5jdGlvbiBtZDVfdm1fdGVzdCgpXHJcbntcclxuICByZXR1cm4gaGV4X21kNShcImFiY1wiKSA9PSBcIjkwMDE1MDk4M2NkMjRmYjBkNjk2M2Y3ZDI4ZTE3ZjcyXCI7XHJcbn1cclxuXHJcbi8qXHJcbiAqIENhbGN1bGF0ZSB0aGUgTUQ1IG9mIGFuIGFycmF5IG9mIGxpdHRsZS1lbmRpYW4gd29yZHMsIGFuZCBhIGJpdCBsZW5ndGhcclxuICovXHJcbmZ1bmN0aW9uIGNvcmVfbWQ1KHgsIGxlbilcclxue1xyXG4gIC8qIGFwcGVuZCBwYWRkaW5nICovXHJcbiAgeFtsZW4gPj4gNV0gfD0gMHg4MCA8PCAoKGxlbikgJSAzMik7XHJcbiAgeFsoKChsZW4gKyA2NCkgPj4+IDkpIDw8IDQpICsgMTRdID0gbGVuO1xyXG5cclxuICB2YXIgYSA9ICAxNzMyNTg0MTkzO1xyXG4gIHZhciBiID0gLTI3MTczMzg3OTtcclxuICB2YXIgYyA9IC0xNzMyNTg0MTk0O1xyXG4gIHZhciBkID0gIDI3MTczMzg3ODtcclxuXHJcbiAgZm9yKHZhciBpID0gMDsgaSA8IHgubGVuZ3RoOyBpICs9IDE2KVxyXG4gIHtcclxuICAgIHZhciBvbGRhID0gYTtcclxuICAgIHZhciBvbGRiID0gYjtcclxuICAgIHZhciBvbGRjID0gYztcclxuICAgIHZhciBvbGRkID0gZDtcclxuXHJcbiAgICBhID0gbWQ1X2ZmKGEsIGIsIGMsIGQsIHhbaSsgMF0sIDcgLCAtNjgwODc2OTM2KTtcclxuICAgIGQgPSBtZDVfZmYoZCwgYSwgYiwgYywgeFtpKyAxXSwgMTIsIC0zODk1NjQ1ODYpO1xyXG4gICAgYyA9IG1kNV9mZihjLCBkLCBhLCBiLCB4W2krIDJdLCAxNywgIDYwNjEwNTgxOSk7XHJcbiAgICBiID0gbWQ1X2ZmKGIsIGMsIGQsIGEsIHhbaSsgM10sIDIyLCAtMTA0NDUyNTMzMCk7XHJcbiAgICBhID0gbWQ1X2ZmKGEsIGIsIGMsIGQsIHhbaSsgNF0sIDcgLCAtMTc2NDE4ODk3KTtcclxuICAgIGQgPSBtZDVfZmYoZCwgYSwgYiwgYywgeFtpKyA1XSwgMTIsICAxMjAwMDgwNDI2KTtcclxuICAgIGMgPSBtZDVfZmYoYywgZCwgYSwgYiwgeFtpKyA2XSwgMTcsIC0xNDczMjMxMzQxKTtcclxuICAgIGIgPSBtZDVfZmYoYiwgYywgZCwgYSwgeFtpKyA3XSwgMjIsIC00NTcwNTk4Myk7XHJcbiAgICBhID0gbWQ1X2ZmKGEsIGIsIGMsIGQsIHhbaSsgOF0sIDcgLCAgMTc3MDAzNTQxNik7XHJcbiAgICBkID0gbWQ1X2ZmKGQsIGEsIGIsIGMsIHhbaSsgOV0sIDEyLCAtMTk1ODQxNDQxNyk7XHJcbiAgICBjID0gbWQ1X2ZmKGMsIGQsIGEsIGIsIHhbaSsxMF0sIDE3LCAtNDIwNjMpO1xyXG4gICAgYiA9IG1kNV9mZihiLCBjLCBkLCBhLCB4W2krMTFdLCAyMiwgLTE5OTA0MDQxNjIpO1xyXG4gICAgYSA9IG1kNV9mZihhLCBiLCBjLCBkLCB4W2krMTJdLCA3ICwgIDE4MDQ2MDM2ODIpO1xyXG4gICAgZCA9IG1kNV9mZihkLCBhLCBiLCBjLCB4W2krMTNdLCAxMiwgLTQwMzQxMTAxKTtcclxuICAgIGMgPSBtZDVfZmYoYywgZCwgYSwgYiwgeFtpKzE0XSwgMTcsIC0xNTAyMDAyMjkwKTtcclxuICAgIGIgPSBtZDVfZmYoYiwgYywgZCwgYSwgeFtpKzE1XSwgMjIsICAxMjM2NTM1MzI5KTtcclxuXHJcbiAgICBhID0gbWQ1X2dnKGEsIGIsIGMsIGQsIHhbaSsgMV0sIDUgLCAtMTY1Nzk2NTEwKTtcclxuICAgIGQgPSBtZDVfZ2coZCwgYSwgYiwgYywgeFtpKyA2XSwgOSAsIC0xMDY5NTAxNjMyKTtcclxuICAgIGMgPSBtZDVfZ2coYywgZCwgYSwgYiwgeFtpKzExXSwgMTQsICA2NDM3MTc3MTMpO1xyXG4gICAgYiA9IG1kNV9nZyhiLCBjLCBkLCBhLCB4W2krIDBdLCAyMCwgLTM3Mzg5NzMwMik7XHJcbiAgICBhID0gbWQ1X2dnKGEsIGIsIGMsIGQsIHhbaSsgNV0sIDUgLCAtNzAxNTU4NjkxKTtcclxuICAgIGQgPSBtZDVfZ2coZCwgYSwgYiwgYywgeFtpKzEwXSwgOSAsICAzODAxNjA4Myk7XHJcbiAgICBjID0gbWQ1X2dnKGMsIGQsIGEsIGIsIHhbaSsxNV0sIDE0LCAtNjYwNDc4MzM1KTtcclxuICAgIGIgPSBtZDVfZ2coYiwgYywgZCwgYSwgeFtpKyA0XSwgMjAsIC00MDU1Mzc4NDgpO1xyXG4gICAgYSA9IG1kNV9nZyhhLCBiLCBjLCBkLCB4W2krIDldLCA1ICwgIDU2ODQ0NjQzOCk7XHJcbiAgICBkID0gbWQ1X2dnKGQsIGEsIGIsIGMsIHhbaSsxNF0sIDkgLCAtMTAxOTgwMzY5MCk7XHJcbiAgICBjID0gbWQ1X2dnKGMsIGQsIGEsIGIsIHhbaSsgM10sIDE0LCAtMTg3MzYzOTYxKTtcclxuICAgIGIgPSBtZDVfZ2coYiwgYywgZCwgYSwgeFtpKyA4XSwgMjAsICAxMTYzNTMxNTAxKTtcclxuICAgIGEgPSBtZDVfZ2coYSwgYiwgYywgZCwgeFtpKzEzXSwgNSAsIC0xNDQ0NjgxNDY3KTtcclxuICAgIGQgPSBtZDVfZ2coZCwgYSwgYiwgYywgeFtpKyAyXSwgOSAsIC01MTQwMzc4NCk7XHJcbiAgICBjID0gbWQ1X2dnKGMsIGQsIGEsIGIsIHhbaSsgN10sIDE0LCAgMTczNTMyODQ3Myk7XHJcbiAgICBiID0gbWQ1X2dnKGIsIGMsIGQsIGEsIHhbaSsxMl0sIDIwLCAtMTkyNjYwNzczNCk7XHJcblxyXG4gICAgYSA9IG1kNV9oaChhLCBiLCBjLCBkLCB4W2krIDVdLCA0ICwgLTM3ODU1OCk7XHJcbiAgICBkID0gbWQ1X2hoKGQsIGEsIGIsIGMsIHhbaSsgOF0sIDExLCAtMjAyMjU3NDQ2Myk7XHJcbiAgICBjID0gbWQ1X2hoKGMsIGQsIGEsIGIsIHhbaSsxMV0sIDE2LCAgMTgzOTAzMDU2Mik7XHJcbiAgICBiID0gbWQ1X2hoKGIsIGMsIGQsIGEsIHhbaSsxNF0sIDIzLCAtMzUzMDk1NTYpO1xyXG4gICAgYSA9IG1kNV9oaChhLCBiLCBjLCBkLCB4W2krIDFdLCA0ICwgLTE1MzA5OTIwNjApO1xyXG4gICAgZCA9IG1kNV9oaChkLCBhLCBiLCBjLCB4W2krIDRdLCAxMSwgIDEyNzI4OTMzNTMpO1xyXG4gICAgYyA9IG1kNV9oaChjLCBkLCBhLCBiLCB4W2krIDddLCAxNiwgLTE1NTQ5NzYzMik7XHJcbiAgICBiID0gbWQ1X2hoKGIsIGMsIGQsIGEsIHhbaSsxMF0sIDIzLCAtMTA5NDczMDY0MCk7XHJcbiAgICBhID0gbWQ1X2hoKGEsIGIsIGMsIGQsIHhbaSsxM10sIDQgLCAgNjgxMjc5MTc0KTtcclxuICAgIGQgPSBtZDVfaGgoZCwgYSwgYiwgYywgeFtpKyAwXSwgMTEsIC0zNTg1MzcyMjIpO1xyXG4gICAgYyA9IG1kNV9oaChjLCBkLCBhLCBiLCB4W2krIDNdLCAxNiwgLTcyMjUyMTk3OSk7XHJcbiAgICBiID0gbWQ1X2hoKGIsIGMsIGQsIGEsIHhbaSsgNl0sIDIzLCAgNzYwMjkxODkpO1xyXG4gICAgYSA9IG1kNV9oaChhLCBiLCBjLCBkLCB4W2krIDldLCA0ICwgLTY0MDM2NDQ4Nyk7XHJcbiAgICBkID0gbWQ1X2hoKGQsIGEsIGIsIGMsIHhbaSsxMl0sIDExLCAtNDIxODE1ODM1KTtcclxuICAgIGMgPSBtZDVfaGgoYywgZCwgYSwgYiwgeFtpKzE1XSwgMTYsICA1MzA3NDI1MjApO1xyXG4gICAgYiA9IG1kNV9oaChiLCBjLCBkLCBhLCB4W2krIDJdLCAyMywgLTk5NTMzODY1MSk7XHJcblxyXG4gICAgYSA9IG1kNV9paShhLCBiLCBjLCBkLCB4W2krIDBdLCA2ICwgLTE5ODYzMDg0NCk7XHJcbiAgICBkID0gbWQ1X2lpKGQsIGEsIGIsIGMsIHhbaSsgN10sIDEwLCAgMTEyNjg5MTQxNSk7XHJcbiAgICBjID0gbWQ1X2lpKGMsIGQsIGEsIGIsIHhbaSsxNF0sIDE1LCAtMTQxNjM1NDkwNSk7XHJcbiAgICBiID0gbWQ1X2lpKGIsIGMsIGQsIGEsIHhbaSsgNV0sIDIxLCAtNTc0MzQwNTUpO1xyXG4gICAgYSA9IG1kNV9paShhLCBiLCBjLCBkLCB4W2krMTJdLCA2ICwgIDE3MDA0ODU1NzEpO1xyXG4gICAgZCA9IG1kNV9paShkLCBhLCBiLCBjLCB4W2krIDNdLCAxMCwgLTE4OTQ5ODY2MDYpO1xyXG4gICAgYyA9IG1kNV9paShjLCBkLCBhLCBiLCB4W2krMTBdLCAxNSwgLTEwNTE1MjMpO1xyXG4gICAgYiA9IG1kNV9paShiLCBjLCBkLCBhLCB4W2krIDFdLCAyMSwgLTIwNTQ5MjI3OTkpO1xyXG4gICAgYSA9IG1kNV9paShhLCBiLCBjLCBkLCB4W2krIDhdLCA2ICwgIDE4NzMzMTMzNTkpO1xyXG4gICAgZCA9IG1kNV9paShkLCBhLCBiLCBjLCB4W2krMTVdLCAxMCwgLTMwNjExNzQ0KTtcclxuICAgIGMgPSBtZDVfaWkoYywgZCwgYSwgYiwgeFtpKyA2XSwgMTUsIC0xNTYwMTk4MzgwKTtcclxuICAgIGIgPSBtZDVfaWkoYiwgYywgZCwgYSwgeFtpKzEzXSwgMjEsICAxMzA5MTUxNjQ5KTtcclxuICAgIGEgPSBtZDVfaWkoYSwgYiwgYywgZCwgeFtpKyA0XSwgNiAsIC0xNDU1MjMwNzApO1xyXG4gICAgZCA9IG1kNV9paShkLCBhLCBiLCBjLCB4W2krMTFdLCAxMCwgLTExMjAyMTAzNzkpO1xyXG4gICAgYyA9IG1kNV9paShjLCBkLCBhLCBiLCB4W2krIDJdLCAxNSwgIDcxODc4NzI1OSk7XHJcbiAgICBiID0gbWQ1X2lpKGIsIGMsIGQsIGEsIHhbaSsgOV0sIDIxLCAtMzQzNDg1NTUxKTtcclxuXHJcbiAgICBhID0gc2FmZV9hZGQoYSwgb2xkYSk7XHJcbiAgICBiID0gc2FmZV9hZGQoYiwgb2xkYik7XHJcbiAgICBjID0gc2FmZV9hZGQoYywgb2xkYyk7XHJcbiAgICBkID0gc2FmZV9hZGQoZCwgb2xkZCk7XHJcbiAgfVxyXG4gIHJldHVybiBBcnJheShhLCBiLCBjLCBkKTtcclxuXHJcbn1cclxuXHJcbi8qXHJcbiAqIFRoZXNlIGZ1bmN0aW9ucyBpbXBsZW1lbnQgdGhlIGZvdXIgYmFzaWMgb3BlcmF0aW9ucyB0aGUgYWxnb3JpdGhtIHVzZXMuXHJcbiAqL1xyXG5mdW5jdGlvbiBtZDVfY21uKHEsIGEsIGIsIHgsIHMsIHQpXHJcbntcclxuICByZXR1cm4gc2FmZV9hZGQoYml0X3JvbChzYWZlX2FkZChzYWZlX2FkZChhLCBxKSwgc2FmZV9hZGQoeCwgdCkpLCBzKSxiKTtcclxufVxyXG5mdW5jdGlvbiBtZDVfZmYoYSwgYiwgYywgZCwgeCwgcywgdClcclxue1xyXG4gIHJldHVybiBtZDVfY21uKChiICYgYykgfCAoKH5iKSAmIGQpLCBhLCBiLCB4LCBzLCB0KTtcclxufVxyXG5mdW5jdGlvbiBtZDVfZ2coYSwgYiwgYywgZCwgeCwgcywgdClcclxue1xyXG4gIHJldHVybiBtZDVfY21uKChiICYgZCkgfCAoYyAmICh+ZCkpLCBhLCBiLCB4LCBzLCB0KTtcclxufVxyXG5mdW5jdGlvbiBtZDVfaGgoYSwgYiwgYywgZCwgeCwgcywgdClcclxue1xyXG4gIHJldHVybiBtZDVfY21uKGIgXiBjIF4gZCwgYSwgYiwgeCwgcywgdCk7XHJcbn1cclxuZnVuY3Rpb24gbWQ1X2lpKGEsIGIsIGMsIGQsIHgsIHMsIHQpXHJcbntcclxuICByZXR1cm4gbWQ1X2NtbihjIF4gKGIgfCAofmQpKSwgYSwgYiwgeCwgcywgdCk7XHJcbn1cclxuXHJcbi8qXHJcbiAqIEFkZCBpbnRlZ2Vycywgd3JhcHBpbmcgYXQgMl4zMi4gVGhpcyB1c2VzIDE2LWJpdCBvcGVyYXRpb25zIGludGVybmFsbHlcclxuICogdG8gd29yayBhcm91bmQgYnVncyBpbiBzb21lIEpTIGludGVycHJldGVycy5cclxuICovXHJcbmZ1bmN0aW9uIHNhZmVfYWRkKHgsIHkpXHJcbntcclxuICB2YXIgbHN3ID0gKHggJiAweEZGRkYpICsgKHkgJiAweEZGRkYpO1xyXG4gIHZhciBtc3cgPSAoeCA+PiAxNikgKyAoeSA+PiAxNikgKyAobHN3ID4+IDE2KTtcclxuICByZXR1cm4gKG1zdyA8PCAxNikgfCAobHN3ICYgMHhGRkZGKTtcclxufVxyXG5cclxuLypcclxuICogQml0d2lzZSByb3RhdGUgYSAzMi1iaXQgbnVtYmVyIHRvIHRoZSBsZWZ0LlxyXG4gKi9cclxuZnVuY3Rpb24gYml0X3JvbChudW0sIGNudClcclxue1xyXG4gIHJldHVybiAobnVtIDw8IGNudCkgfCAobnVtID4+PiAoMzIgLSBjbnQpKTtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBtZDUoYnVmKSB7XHJcbiAgcmV0dXJuIGhlbHBlcnMuaGFzaChidWYsIGNvcmVfbWQ1LCAxNik7XHJcbn07XHJcbiIsIi8vIE9yaWdpbmFsIGNvZGUgYWRhcHRlZCBmcm9tIFJvYmVydCBLaWVmZmVyLlxuLy8gZGV0YWlscyBhdCBodHRwczovL2dpdGh1Yi5jb20vYnJvb2ZhL25vZGUtdXVpZFxuKGZ1bmN0aW9uKCkge1xuICB2YXIgX2dsb2JhbCA9IHRoaXM7XG5cbiAgdmFyIG1hdGhSTkcsIHdoYXR3Z1JORztcblxuICAvLyBOT1RFOiBNYXRoLnJhbmRvbSgpIGRvZXMgbm90IGd1YXJhbnRlZSBcImNyeXB0b2dyYXBoaWMgcXVhbGl0eVwiXG4gIG1hdGhSTkcgPSBmdW5jdGlvbihzaXplKSB7XG4gICAgdmFyIGJ5dGVzID0gbmV3IEFycmF5KHNpemUpO1xuICAgIHZhciByO1xuXG4gICAgZm9yICh2YXIgaSA9IDAsIHI7IGkgPCBzaXplOyBpKyspIHtcbiAgICAgIGlmICgoaSAmIDB4MDMpID09IDApIHIgPSBNYXRoLnJhbmRvbSgpICogMHgxMDAwMDAwMDA7XG4gICAgICBieXRlc1tpXSA9IHIgPj4+ICgoaSAmIDB4MDMpIDw8IDMpICYgMHhmZjtcbiAgICB9XG5cbiAgICByZXR1cm4gYnl0ZXM7XG4gIH1cblxuICBpZiAoX2dsb2JhbC5jcnlwdG8gJiYgY3J5cHRvLmdldFJhbmRvbVZhbHVlcykge1xuICAgIHdoYXR3Z1JORyA9IGZ1bmN0aW9uKHNpemUpIHtcbiAgICAgIHZhciBieXRlcyA9IG5ldyBVaW50OEFycmF5KHNpemUpO1xuICAgICAgY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhieXRlcyk7XG4gICAgICByZXR1cm4gYnl0ZXM7XG4gICAgfVxuICB9XG5cbiAgbW9kdWxlLmV4cG9ydHMgPSB3aGF0d2dSTkcgfHwgbWF0aFJORztcblxufSgpKVxuIiwiLypcbiAqIEEgSmF2YVNjcmlwdCBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgU2VjdXJlIEhhc2ggQWxnb3JpdGhtLCBTSEEtMSwgYXMgZGVmaW5lZFxuICogaW4gRklQUyBQVUIgMTgwLTFcbiAqIFZlcnNpb24gMi4xYSBDb3B5cmlnaHQgUGF1bCBKb2huc3RvbiAyMDAwIC0gMjAwMi5cbiAqIE90aGVyIGNvbnRyaWJ1dG9yczogR3JlZyBIb2x0LCBBbmRyZXcgS2VwZXJ0LCBZZG5hciwgTG9zdGluZXRcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgTGljZW5zZVxuICogU2VlIGh0dHA6Ly9wYWpob21lLm9yZy51ay9jcnlwdC9tZDUgZm9yIGRldGFpbHMuXG4gKi9cblxudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcblxuLypcbiAqIENhbGN1bGF0ZSB0aGUgU0hBLTEgb2YgYW4gYXJyYXkgb2YgYmlnLWVuZGlhbiB3b3JkcywgYW5kIGEgYml0IGxlbmd0aFxuICovXG5mdW5jdGlvbiBjb3JlX3NoYTEoeCwgbGVuKVxue1xuICAvKiBhcHBlbmQgcGFkZGluZyAqL1xuICB4W2xlbiA+PiA1XSB8PSAweDgwIDw8ICgyNCAtIGxlbiAlIDMyKTtcbiAgeFsoKGxlbiArIDY0ID4+IDkpIDw8IDQpICsgMTVdID0gbGVuO1xuXG4gIHZhciB3ID0gQXJyYXkoODApO1xuICB2YXIgYSA9ICAxNzMyNTg0MTkzO1xuICB2YXIgYiA9IC0yNzE3MzM4Nzk7XG4gIHZhciBjID0gLTE3MzI1ODQxOTQ7XG4gIHZhciBkID0gIDI3MTczMzg3ODtcbiAgdmFyIGUgPSAtMTAwOTU4OTc3NjtcblxuICBmb3IodmFyIGkgPSAwOyBpIDwgeC5sZW5ndGg7IGkgKz0gMTYpXG4gIHtcbiAgICB2YXIgb2xkYSA9IGE7XG4gICAgdmFyIG9sZGIgPSBiO1xuICAgIHZhciBvbGRjID0gYztcbiAgICB2YXIgb2xkZCA9IGQ7XG4gICAgdmFyIG9sZGUgPSBlO1xuXG4gICAgZm9yKHZhciBqID0gMDsgaiA8IDgwOyBqKyspXG4gICAge1xuICAgICAgaWYoaiA8IDE2KSB3W2pdID0geFtpICsgal07XG4gICAgICBlbHNlIHdbal0gPSByb2wod1tqLTNdIF4gd1tqLThdIF4gd1tqLTE0XSBeIHdbai0xNl0sIDEpO1xuICAgICAgdmFyIHQgPSBzYWZlX2FkZChzYWZlX2FkZChyb2woYSwgNSksIHNoYTFfZnQoaiwgYiwgYywgZCkpLFxuICAgICAgICAgICAgICAgICAgICAgICBzYWZlX2FkZChzYWZlX2FkZChlLCB3W2pdKSwgc2hhMV9rdChqKSkpO1xuICAgICAgZSA9IGQ7XG4gICAgICBkID0gYztcbiAgICAgIGMgPSByb2woYiwgMzApO1xuICAgICAgYiA9IGE7XG4gICAgICBhID0gdDtcbiAgICB9XG5cbiAgICBhID0gc2FmZV9hZGQoYSwgb2xkYSk7XG4gICAgYiA9IHNhZmVfYWRkKGIsIG9sZGIpO1xuICAgIGMgPSBzYWZlX2FkZChjLCBvbGRjKTtcbiAgICBkID0gc2FmZV9hZGQoZCwgb2xkZCk7XG4gICAgZSA9IHNhZmVfYWRkKGUsIG9sZGUpO1xuICB9XG4gIHJldHVybiBBcnJheShhLCBiLCBjLCBkLCBlKTtcblxufVxuXG4vKlxuICogUGVyZm9ybSB0aGUgYXBwcm9wcmlhdGUgdHJpcGxldCBjb21iaW5hdGlvbiBmdW5jdGlvbiBmb3IgdGhlIGN1cnJlbnRcbiAqIGl0ZXJhdGlvblxuICovXG5mdW5jdGlvbiBzaGExX2Z0KHQsIGIsIGMsIGQpXG57XG4gIGlmKHQgPCAyMCkgcmV0dXJuIChiICYgYykgfCAoKH5iKSAmIGQpO1xuICBpZih0IDwgNDApIHJldHVybiBiIF4gYyBeIGQ7XG4gIGlmKHQgPCA2MCkgcmV0dXJuIChiICYgYykgfCAoYiAmIGQpIHwgKGMgJiBkKTtcbiAgcmV0dXJuIGIgXiBjIF4gZDtcbn1cblxuLypcbiAqIERldGVybWluZSB0aGUgYXBwcm9wcmlhdGUgYWRkaXRpdmUgY29uc3RhbnQgZm9yIHRoZSBjdXJyZW50IGl0ZXJhdGlvblxuICovXG5mdW5jdGlvbiBzaGExX2t0KHQpXG57XG4gIHJldHVybiAodCA8IDIwKSA/ICAxNTE4NTAwMjQ5IDogKHQgPCA0MCkgPyAgMTg1OTc3NTM5MyA6XG4gICAgICAgICAodCA8IDYwKSA/IC0xODk0MDA3NTg4IDogLTg5OTQ5NzUxNDtcbn1cblxuLypcbiAqIEFkZCBpbnRlZ2Vycywgd3JhcHBpbmcgYXQgMl4zMi4gVGhpcyB1c2VzIDE2LWJpdCBvcGVyYXRpb25zIGludGVybmFsbHlcbiAqIHRvIHdvcmsgYXJvdW5kIGJ1Z3MgaW4gc29tZSBKUyBpbnRlcnByZXRlcnMuXG4gKi9cbmZ1bmN0aW9uIHNhZmVfYWRkKHgsIHkpXG57XG4gIHZhciBsc3cgPSAoeCAmIDB4RkZGRikgKyAoeSAmIDB4RkZGRik7XG4gIHZhciBtc3cgPSAoeCA+PiAxNikgKyAoeSA+PiAxNikgKyAobHN3ID4+IDE2KTtcbiAgcmV0dXJuIChtc3cgPDwgMTYpIHwgKGxzdyAmIDB4RkZGRik7XG59XG5cbi8qXG4gKiBCaXR3aXNlIHJvdGF0ZSBhIDMyLWJpdCBudW1iZXIgdG8gdGhlIGxlZnQuXG4gKi9cbmZ1bmN0aW9uIHJvbChudW0sIGNudClcbntcbiAgcmV0dXJuIChudW0gPDwgY250KSB8IChudW0gPj4+ICgzMiAtIGNudCkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHNoYTEoYnVmKSB7XG4gIHJldHVybiBoZWxwZXJzLmhhc2goYnVmLCBjb3JlX3NoYTEsIDIwLCB0cnVlKTtcbn07XG4iLCJcbi8qKlxuICogQSBKYXZhU2NyaXB0IGltcGxlbWVudGF0aW9uIG9mIHRoZSBTZWN1cmUgSGFzaCBBbGdvcml0aG0sIFNIQS0yNTYsIGFzIGRlZmluZWRcbiAqIGluIEZJUFMgMTgwLTJcbiAqIFZlcnNpb24gMi4yLWJldGEgQ29weXJpZ2h0IEFuZ2VsIE1hcmluLCBQYXVsIEpvaG5zdG9uIDIwMDAgLSAyMDA5LlxuICogT3RoZXIgY29udHJpYnV0b3JzOiBHcmVnIEhvbHQsIEFuZHJldyBLZXBlcnQsIFlkbmFyLCBMb3N0aW5ldFxuICpcbiAqL1xuXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG52YXIgc2FmZV9hZGQgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBsc3cgPSAoeCAmIDB4RkZGRikgKyAoeSAmIDB4RkZGRik7XG4gIHZhciBtc3cgPSAoeCA+PiAxNikgKyAoeSA+PiAxNikgKyAobHN3ID4+IDE2KTtcbiAgcmV0dXJuIChtc3cgPDwgMTYpIHwgKGxzdyAmIDB4RkZGRik7XG59O1xuXG52YXIgUyA9IGZ1bmN0aW9uKFgsIG4pIHtcbiAgcmV0dXJuIChYID4+PiBuKSB8IChYIDw8ICgzMiAtIG4pKTtcbn07XG5cbnZhciBSID0gZnVuY3Rpb24oWCwgbikge1xuICByZXR1cm4gKFggPj4+IG4pO1xufTtcblxudmFyIENoID0gZnVuY3Rpb24oeCwgeSwgeikge1xuICByZXR1cm4gKCh4ICYgeSkgXiAoKH54KSAmIHopKTtcbn07XG5cbnZhciBNYWogPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gIHJldHVybiAoKHggJiB5KSBeICh4ICYgeikgXiAoeSAmIHopKTtcbn07XG5cbnZhciBTaWdtYTAyNTYgPSBmdW5jdGlvbih4KSB7XG4gIHJldHVybiAoUyh4LCAyKSBeIFMoeCwgMTMpIF4gUyh4LCAyMikpO1xufTtcblxudmFyIFNpZ21hMTI1NiA9IGZ1bmN0aW9uKHgpIHtcbiAgcmV0dXJuIChTKHgsIDYpIF4gUyh4LCAxMSkgXiBTKHgsIDI1KSk7XG59O1xuXG52YXIgR2FtbWEwMjU2ID0gZnVuY3Rpb24oeCkge1xuICByZXR1cm4gKFMoeCwgNykgXiBTKHgsIDE4KSBeIFIoeCwgMykpO1xufTtcblxudmFyIEdhbW1hMTI1NiA9IGZ1bmN0aW9uKHgpIHtcbiAgcmV0dXJuIChTKHgsIDE3KSBeIFMoeCwgMTkpIF4gUih4LCAxMCkpO1xufTtcblxudmFyIGNvcmVfc2hhMjU2ID0gZnVuY3Rpb24obSwgbCkge1xuICB2YXIgSyA9IG5ldyBBcnJheSgweDQyOEEyRjk4LDB4NzEzNzQ0OTEsMHhCNUMwRkJDRiwweEU5QjVEQkE1LDB4Mzk1NkMyNUIsMHg1OUYxMTFGMSwweDkyM0Y4MkE0LDB4QUIxQzVFRDUsMHhEODA3QUE5OCwweDEyODM1QjAxLDB4MjQzMTg1QkUsMHg1NTBDN0RDMywweDcyQkU1RDc0LDB4ODBERUIxRkUsMHg5QkRDMDZBNywweEMxOUJGMTc0LDB4RTQ5QjY5QzEsMHhFRkJFNDc4NiwweEZDMTlEQzYsMHgyNDBDQTFDQywweDJERTkyQzZGLDB4NEE3NDg0QUEsMHg1Q0IwQTlEQywweDc2Rjk4OERBLDB4OTgzRTUxNTIsMHhBODMxQzY2RCwweEIwMDMyN0M4LDB4QkY1OTdGQzcsMHhDNkUwMEJGMywweEQ1QTc5MTQ3LDB4NkNBNjM1MSwweDE0MjkyOTY3LDB4MjdCNzBBODUsMHgyRTFCMjEzOCwweDREMkM2REZDLDB4NTMzODBEMTMsMHg2NTBBNzM1NCwweDc2NkEwQUJCLDB4ODFDMkM5MkUsMHg5MjcyMkM4NSwweEEyQkZFOEExLDB4QTgxQTY2NEIsMHhDMjRCOEI3MCwweEM3NkM1MUEzLDB4RDE5MkU4MTksMHhENjk5MDYyNCwweEY0MEUzNTg1LDB4MTA2QUEwNzAsMHgxOUE0QzExNiwweDFFMzc2QzA4LDB4Mjc0ODc3NEMsMHgzNEIwQkNCNSwweDM5MUMwQ0IzLDB4NEVEOEFBNEEsMHg1QjlDQ0E0RiwweDY4MkU2RkYzLDB4NzQ4RjgyRUUsMHg3OEE1NjM2RiwweDg0Qzg3ODE0LDB4OENDNzAyMDgsMHg5MEJFRkZGQSwweEE0NTA2Q0VCLDB4QkVGOUEzRjcsMHhDNjcxNzhGMik7XG4gIHZhciBIQVNIID0gbmV3IEFycmF5KDB4NkEwOUU2NjcsIDB4QkI2N0FFODUsIDB4M0M2RUYzNzIsIDB4QTU0RkY1M0EsIDB4NTEwRTUyN0YsIDB4OUIwNTY4OEMsIDB4MUY4M0Q5QUIsIDB4NUJFMENEMTkpO1xuICAgIHZhciBXID0gbmV3IEFycmF5KDY0KTtcbiAgICB2YXIgYSwgYiwgYywgZCwgZSwgZiwgZywgaCwgaSwgajtcbiAgICB2YXIgVDEsIFQyO1xuICAvKiBhcHBlbmQgcGFkZGluZyAqL1xuICBtW2wgPj4gNV0gfD0gMHg4MCA8PCAoMjQgLSBsICUgMzIpO1xuICBtWygobCArIDY0ID4+IDkpIDw8IDQpICsgMTVdID0gbDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBtLmxlbmd0aDsgaSArPSAxNikge1xuICAgIGEgPSBIQVNIWzBdOyBiID0gSEFTSFsxXTsgYyA9IEhBU0hbMl07IGQgPSBIQVNIWzNdOyBlID0gSEFTSFs0XTsgZiA9IEhBU0hbNV07IGcgPSBIQVNIWzZdOyBoID0gSEFTSFs3XTtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IDY0OyBqKyspIHtcbiAgICAgIGlmIChqIDwgMTYpIHtcbiAgICAgICAgV1tqXSA9IG1baiArIGldO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgV1tqXSA9IHNhZmVfYWRkKHNhZmVfYWRkKHNhZmVfYWRkKEdhbW1hMTI1NihXW2ogLSAyXSksIFdbaiAtIDddKSwgR2FtbWEwMjU2KFdbaiAtIDE1XSkpLCBXW2ogLSAxNl0pO1xuICAgICAgfVxuICAgICAgVDEgPSBzYWZlX2FkZChzYWZlX2FkZChzYWZlX2FkZChzYWZlX2FkZChoLCBTaWdtYTEyNTYoZSkpLCBDaChlLCBmLCBnKSksIEtbal0pLCBXW2pdKTtcbiAgICAgIFQyID0gc2FmZV9hZGQoU2lnbWEwMjU2KGEpLCBNYWooYSwgYiwgYykpO1xuICAgICAgaCA9IGc7IGcgPSBmOyBmID0gZTsgZSA9IHNhZmVfYWRkKGQsIFQxKTsgZCA9IGM7IGMgPSBiOyBiID0gYTsgYSA9IHNhZmVfYWRkKFQxLCBUMik7XG4gICAgfVxuICAgIEhBU0hbMF0gPSBzYWZlX2FkZChhLCBIQVNIWzBdKTsgSEFTSFsxXSA9IHNhZmVfYWRkKGIsIEhBU0hbMV0pOyBIQVNIWzJdID0gc2FmZV9hZGQoYywgSEFTSFsyXSk7IEhBU0hbM10gPSBzYWZlX2FkZChkLCBIQVNIWzNdKTtcbiAgICBIQVNIWzRdID0gc2FmZV9hZGQoZSwgSEFTSFs0XSk7IEhBU0hbNV0gPSBzYWZlX2FkZChmLCBIQVNIWzVdKTsgSEFTSFs2XSA9IHNhZmVfYWRkKGcsIEhBU0hbNl0pOyBIQVNIWzddID0gc2FmZV9hZGQoaCwgSEFTSFs3XSk7XG4gIH1cbiAgcmV0dXJuIEhBU0g7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHNoYTI1NihidWYpIHtcbiAgcmV0dXJuIGhlbHBlcnMuaGFzaChidWYsIGNvcmVfc2hhMjU2LCAzMiwgdHJ1ZSk7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbmZ1bmN0aW9uIEV2ZW50RW1pdHRlcigpIHtcbiAgdGhpcy5fZXZlbnRzID0gdGhpcy5fZXZlbnRzIHx8IHt9O1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSB0aGlzLl9tYXhMaXN0ZW5lcnMgfHwgdW5kZWZpbmVkO1xufVxubW9kdWxlLmV4cG9ydHMgPSBFdmVudEVtaXR0ZXI7XG5cbi8vIEJhY2t3YXJkcy1jb21wYXQgd2l0aCBub2RlIDAuMTAueFxuRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlciA9IEV2ZW50RW1pdHRlcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fZXZlbnRzID0gdW5kZWZpbmVkO1xuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWF4TGlzdGVuZXJzID0gdW5kZWZpbmVkO1xuXG4vLyBCeSBkZWZhdWx0IEV2ZW50RW1pdHRlcnMgd2lsbCBwcmludCBhIHdhcm5pbmcgaWYgbW9yZSB0aGFuIDEwIGxpc3RlbmVycyBhcmVcbi8vIGFkZGVkIHRvIGl0LiBUaGlzIGlzIGEgdXNlZnVsIGRlZmF1bHQgd2hpY2ggaGVscHMgZmluZGluZyBtZW1vcnkgbGVha3MuXG5FdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycyA9IDEwO1xuXG4vLyBPYnZpb3VzbHkgbm90IGFsbCBFbWl0dGVycyBzaG91bGQgYmUgbGltaXRlZCB0byAxMC4gVGhpcyBmdW5jdGlvbiBhbGxvd3Ncbi8vIHRoYXQgdG8gYmUgaW5jcmVhc2VkLiBTZXQgdG8gemVybyBmb3IgdW5saW1pdGVkLlxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5zZXRNYXhMaXN0ZW5lcnMgPSBmdW5jdGlvbihuKSB7XG4gIGlmICghaXNOdW1iZXIobikgfHwgbiA8IDAgfHwgaXNOYU4obikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCduIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInKTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBlciwgaGFuZGxlciwgbGVuLCBhcmdzLCBpLCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gSWYgdGhlcmUgaXMgbm8gJ2Vycm9yJyBldmVudCBsaXN0ZW5lciB0aGVuIHRocm93LlxuICBpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xuICAgIGlmICghdGhpcy5fZXZlbnRzLmVycm9yIHx8XG4gICAgICAgIChpc09iamVjdCh0aGlzLl9ldmVudHMuZXJyb3IpICYmICF0aGlzLl9ldmVudHMuZXJyb3IubGVuZ3RoKSkge1xuICAgICAgZXIgPSBhcmd1bWVudHNbMV07XG4gICAgICBpZiAoZXIgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICB0aHJvdyBlcjsgLy8gVW5oYW5kbGVkICdlcnJvcicgZXZlbnRcbiAgICAgIH1cbiAgICAgIHRocm93IFR5cGVFcnJvcignVW5jYXVnaHQsIHVuc3BlY2lmaWVkIFwiZXJyb3JcIiBldmVudC4nKTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVyID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc1VuZGVmaW5lZChoYW5kbGVyKSlcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKGlzRnVuY3Rpb24oaGFuZGxlcikpIHtcbiAgICBzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICAgIC8vIGZhc3QgY2FzZXNcbiAgICAgIGNhc2UgMTpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xuICAgICAgICBicmVhaztcbiAgICAgIC8vIHNsb3dlclxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICAgICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChpc09iamVjdChoYW5kbGVyKSkge1xuICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcblxuICAgIGxpc3RlbmVycyA9IGhhbmRsZXIuc2xpY2UoKTtcbiAgICBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoO1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBtO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBUbyBhdm9pZCByZWN1cnNpb24gaW4gdGhlIGNhc2UgdGhhdCB0eXBlID09PSBcIm5ld0xpc3RlbmVyXCIhIEJlZm9yZVxuICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyXCIuXG4gIGlmICh0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsXG4gICAgICAgICAgICAgIGlzRnVuY3Rpb24obGlzdGVuZXIubGlzdGVuZXIpID9cbiAgICAgICAgICAgICAgbGlzdGVuZXIubGlzdGVuZXIgOiBsaXN0ZW5lcik7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgLy8gT3B0aW1pemUgdGhlIGNhc2Ugb2Ygb25lIGxpc3RlbmVyLiBEb24ndCBuZWVkIHRoZSBleHRyYSBhcnJheSBvYmplY3QuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XG4gIGVsc2UgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgLy8gSWYgd2UndmUgYWxyZWFkeSBnb3QgYW4gYXJyYXksIGp1c3QgYXBwZW5kLlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcbiAgZWxzZVxuICAgIC8vIEFkZGluZyB0aGUgc2Vjb25kIGVsZW1lbnQsIG5lZWQgdG8gY2hhbmdlIHRvIGFycmF5LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV0sIGxpc3RlbmVyXTtcblxuICAvLyBDaGVjayBmb3IgbGlzdGVuZXIgbGVha1xuICBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSAmJiAhdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCkge1xuICAgIHZhciBtO1xuICAgIGlmICghaXNVbmRlZmluZWQodGhpcy5fbWF4TGlzdGVuZXJzKSkge1xuICAgICAgbSA9IHRoaXMuX21heExpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IEV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzO1xuICAgIH1cblxuICAgIGlmIChtICYmIG0gPiAwICYmIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiBtKSB7XG4gICAgICB0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkID0gdHJ1ZTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyhub2RlKSB3YXJuaW5nOiBwb3NzaWJsZSBFdmVudEVtaXR0ZXIgbWVtb3J5ICcgK1xuICAgICAgICAgICAgICAgICAgICAnbGVhayBkZXRlY3RlZC4gJWQgbGlzdGVuZXJzIGFkZGVkLiAnICtcbiAgICAgICAgICAgICAgICAgICAgJ1VzZSBlbWl0dGVyLnNldE1heExpc3RlbmVycygpIHRvIGluY3JlYXNlIGxpbWl0LicsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGgpO1xuICAgICAgaWYgKHR5cGVvZiBjb25zb2xlLnRyYWNlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIC8vIG5vdCBzdXBwb3J0ZWQgaW4gSUUgMTBcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbiA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICB2YXIgZmlyZWQgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBnKCkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgZyk7XG5cbiAgICBpZiAoIWZpcmVkKSB7XG4gICAgICBmaXJlZCA9IHRydWU7XG4gICAgICBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgfVxuXG4gIGcubGlzdGVuZXIgPSBsaXN0ZW5lcjtcbiAgdGhpcy5vbih0eXBlLCBnKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8vIGVtaXRzIGEgJ3JlbW92ZUxpc3RlbmVyJyBldmVudCBpZmYgdGhlIGxpc3RlbmVyIHdhcyByZW1vdmVkXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIGxpc3QsIHBvc2l0aW9uLCBsZW5ndGgsIGk7XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgbGlzdCA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgbGVuZ3RoID0gbGlzdC5sZW5ndGg7XG4gIHBvc2l0aW9uID0gLTE7XG5cbiAgaWYgKGxpc3QgPT09IGxpc3RlbmVyIHx8XG4gICAgICAoaXNGdW5jdGlvbihsaXN0Lmxpc3RlbmVyKSAmJiBsaXN0Lmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuXG4gIH0gZWxzZSBpZiAoaXNPYmplY3QobGlzdCkpIHtcbiAgICBmb3IgKGkgPSBsZW5ndGg7IGktLSA+IDA7KSB7XG4gICAgICBpZiAobGlzdFtpXSA9PT0gbGlzdGVuZXIgfHxcbiAgICAgICAgICAobGlzdFtpXS5saXN0ZW5lciAmJiBsaXN0W2ldLmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICAgICAgcG9zaXRpb24gPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocG9zaXRpb24gPCAwKVxuICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICAgIGxpc3QubGVuZ3RoID0gMDtcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpc3Quc3BsaWNlKHBvc2l0aW9uLCAxKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBrZXksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICByZXR1cm4gdGhpcztcblxuICAvLyBub3QgbGlzdGVuaW5nIGZvciByZW1vdmVMaXN0ZW5lciwgbm8gbmVlZCB0byBlbWl0XG4gIGlmICghdGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApXG4gICAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICBlbHNlIGlmICh0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gZW1pdCByZW1vdmVMaXN0ZW5lciBmb3IgYWxsIGxpc3RlbmVycyBvbiBhbGwgZXZlbnRzXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgZm9yIChrZXkgaW4gdGhpcy5fZXZlbnRzKSB7XG4gICAgICBpZiAoa2V5ID09PSAncmVtb3ZlTGlzdGVuZXInKSBjb250aW51ZTtcbiAgICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKGtleSk7XG4gICAgfVxuICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKCdyZW1vdmVMaXN0ZW5lcicpO1xuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgbGlzdGVuZXJzID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGxpc3RlbmVycykpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVycyk7XG4gIH0gZWxzZSB7XG4gICAgLy8gTElGTyBvcmRlclxuICAgIHdoaWxlIChsaXN0ZW5lcnMubGVuZ3RoKVxuICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnNbbGlzdGVuZXJzLmxlbmd0aCAtIDFdKTtcbiAgfVxuICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gW107XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24odGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSBbdGhpcy5fZXZlbnRzW3R5cGVdXTtcbiAgZWxzZVxuICAgIHJldCA9IHRoaXMuX2V2ZW50c1t0eXBlXS5zbGljZSgpO1xuICByZXR1cm4gcmV0O1xufTtcblxuRXZlbnRFbWl0dGVyLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbihlbWl0dGVyLCB0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghZW1pdHRlci5fZXZlbnRzIHx8ICFlbWl0dGVyLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gMDtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbihlbWl0dGVyLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IDE7XG4gIGVsc2VcbiAgICByZXQgPSBlbWl0dGVyLl9ldmVudHNbdHlwZV0ubGVuZ3RoO1xuICByZXR1cm4gcmV0O1xufTtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuIiwiaWYgKHR5cGVvZiBPYmplY3QuY3JlYXRlID09PSAnZnVuY3Rpb24nKSB7XG4gIC8vIGltcGxlbWVudGF0aW9uIGZyb20gc3RhbmRhcmQgbm9kZS5qcyAndXRpbCcgbW9kdWxlXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICBjdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoc3VwZXJDdG9yLnByb3RvdHlwZSwge1xuICAgICAgY29uc3RydWN0b3I6IHtcbiAgICAgICAgdmFsdWU6IGN0b3IsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59IGVsc2Uge1xuICAvLyBvbGQgc2Nob29sIHNoaW0gZm9yIG9sZCBicm93c2Vyc1xuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgdmFyIFRlbXBDdG9yID0gZnVuY3Rpb24gKCkge31cbiAgICBUZW1wQ3Rvci5wcm90b3R5cGUgPSBzdXBlckN0b3IucHJvdG90eXBlXG4gICAgY3Rvci5wcm90b3R5cGUgPSBuZXcgVGVtcEN0b3IoKVxuICAgIGN0b3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY3RvclxuICB9XG59XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIHJlc29sdmVzIC4gYW5kIC4uIGVsZW1lbnRzIGluIGEgcGF0aCBhcnJheSB3aXRoIGRpcmVjdG9yeSBuYW1lcyB0aGVyZVxuLy8gbXVzdCBiZSBubyBzbGFzaGVzLCBlbXB0eSBlbGVtZW50cywgb3IgZGV2aWNlIG5hbWVzIChjOlxcKSBpbiB0aGUgYXJyYXlcbi8vIChzbyBhbHNvIG5vIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMgLSBpdCBkb2VzIG5vdCBkaXN0aW5ndWlzaFxuLy8gcmVsYXRpdmUgYW5kIGFic29sdXRlIHBhdGhzKVxuZnVuY3Rpb24gbm9ybWFsaXplQXJyYXkocGFydHMsIGFsbG93QWJvdmVSb290KSB7XG4gIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gIHZhciB1cCA9IDA7XG4gIGZvciAodmFyIGkgPSBwYXJ0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIHZhciBsYXN0ID0gcGFydHNbaV07XG4gICAgaWYgKGxhc3QgPT09ICcuJykge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gJy4uJykge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXArKztcbiAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cC0tO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgaWYgKGFsbG93QWJvdmVSb290KSB7XG4gICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICBwYXJ0cy51bnNoaWZ0KCcuLicpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBwYXJ0cztcbn1cblxuLy8gU3BsaXQgYSBmaWxlbmFtZSBpbnRvIFtyb290LCBkaXIsIGJhc2VuYW1lLCBleHRdLCB1bml4IHZlcnNpb25cbi8vICdyb290JyBpcyBqdXN0IGEgc2xhc2gsIG9yIG5vdGhpbmcuXG52YXIgc3BsaXRQYXRoUmUgPVxuICAgIC9eKFxcLz98KShbXFxzXFxTXSo/KSgoPzpcXC57MSwyfXxbXlxcL10rP3wpKFxcLlteLlxcL10qfCkpKD86W1xcL10qKSQvO1xudmFyIHNwbGl0UGF0aCA9IGZ1bmN0aW9uKGZpbGVuYW1lKSB7XG4gIHJldHVybiBzcGxpdFBhdGhSZS5leGVjKGZpbGVuYW1lKS5zbGljZSgxKTtcbn07XG5cbi8vIHBhdGgucmVzb2x2ZShbZnJvbSAuLi5dLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVzb2x2ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcmVzb2x2ZWRQYXRoID0gJycsXG4gICAgICByZXNvbHZlZEFic29sdXRlID0gZmFsc2U7XG5cbiAgZm9yICh2YXIgaSA9IGFyZ3VtZW50cy5sZW5ndGggLSAxOyBpID49IC0xICYmICFyZXNvbHZlZEFic29sdXRlOyBpLS0pIHtcbiAgICB2YXIgcGF0aCA9IChpID49IDApID8gYXJndW1lbnRzW2ldIDogcHJvY2Vzcy5jd2QoKTtcblxuICAgIC8vIFNraXAgZW1wdHkgYW5kIGludmFsaWQgZW50cmllc1xuICAgIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLnJlc29sdmUgbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfSBlbHNlIGlmICghcGF0aCkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgcmVzb2x2ZWRQYXRoID0gcGF0aCArICcvJyArIHJlc29sdmVkUGF0aDtcbiAgICByZXNvbHZlZEFic29sdXRlID0gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbiAgfVxuXG4gIC8vIEF0IHRoaXMgcG9pbnQgdGhlIHBhdGggc2hvdWxkIGJlIHJlc29sdmVkIHRvIGEgZnVsbCBhYnNvbHV0ZSBwYXRoLCBidXRcbiAgLy8gaGFuZGxlIHJlbGF0aXZlIHBhdGhzIHRvIGJlIHNhZmUgKG1pZ2h0IGhhcHBlbiB3aGVuIHByb2Nlc3MuY3dkKCkgZmFpbHMpXG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHJlc29sdmVkUGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihyZXNvbHZlZFBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhcmVzb2x2ZWRBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIHJldHVybiAoKHJlc29sdmVkQWJzb2x1dGUgPyAnLycgOiAnJykgKyByZXNvbHZlZFBhdGgpIHx8ICcuJztcbn07XG5cbi8vIHBhdGgubm9ybWFsaXplKHBhdGgpXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgdmFyIGlzQWJzb2x1dGUgPSBleHBvcnRzLmlzQWJzb2x1dGUocGF0aCksXG4gICAgICB0cmFpbGluZ1NsYXNoID0gc3Vic3RyKHBhdGgsIC0xKSA9PT0gJy8nO1xuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICBwYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhaXNBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIGlmICghcGF0aCAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHBhdGggPSAnLic7XG4gIH1cbiAgaWYgKHBhdGggJiYgdHJhaWxpbmdTbGFzaCkge1xuICAgIHBhdGggKz0gJy8nO1xuICB9XG5cbiAgcmV0dXJuIChpc0Fic29sdXRlID8gJy8nIDogJycpICsgcGF0aDtcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuaXNBYnNvbHV0ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHBhdGguY2hhckF0KDApID09PSAnLyc7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmpvaW4gPSBmdW5jdGlvbigpIHtcbiAgdmFyIHBhdGhzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcbiAgcmV0dXJuIGV4cG9ydHMubm9ybWFsaXplKGZpbHRlcihwYXRocywgZnVuY3Rpb24ocCwgaW5kZXgpIHtcbiAgICBpZiAodHlwZW9mIHAgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5qb2luIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH1cbiAgICByZXR1cm4gcDtcbiAgfSkuam9pbignLycpKTtcbn07XG5cblxuLy8gcGF0aC5yZWxhdGl2ZShmcm9tLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVsYXRpdmUgPSBmdW5jdGlvbihmcm9tLCB0bykge1xuICBmcm9tID0gZXhwb3J0cy5yZXNvbHZlKGZyb20pLnN1YnN0cigxKTtcbiAgdG8gPSBleHBvcnRzLnJlc29sdmUodG8pLnN1YnN0cigxKTtcblxuICBmdW5jdGlvbiB0cmltKGFycikge1xuICAgIHZhciBzdGFydCA9IDA7XG4gICAgZm9yICg7IHN0YXJ0IDwgYXJyLmxlbmd0aDsgc3RhcnQrKykge1xuICAgICAgaWYgKGFycltzdGFydF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICB2YXIgZW5kID0gYXJyLmxlbmd0aCAtIDE7XG4gICAgZm9yICg7IGVuZCA+PSAwOyBlbmQtLSkge1xuICAgICAgaWYgKGFycltlbmRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKHN0YXJ0ID4gZW5kKSByZXR1cm4gW107XG4gICAgcmV0dXJuIGFyci5zbGljZShzdGFydCwgZW5kIC0gc3RhcnQgKyAxKTtcbiAgfVxuXG4gIHZhciBmcm9tUGFydHMgPSB0cmltKGZyb20uc3BsaXQoJy8nKSk7XG4gIHZhciB0b1BhcnRzID0gdHJpbSh0by5zcGxpdCgnLycpKTtcblxuICB2YXIgbGVuZ3RoID0gTWF0aC5taW4oZnJvbVBhcnRzLmxlbmd0aCwgdG9QYXJ0cy5sZW5ndGgpO1xuICB2YXIgc2FtZVBhcnRzTGVuZ3RoID0gbGVuZ3RoO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGZyb21QYXJ0c1tpXSAhPT0gdG9QYXJ0c1tpXSkge1xuICAgICAgc2FtZVBhcnRzTGVuZ3RoID0gaTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHZhciBvdXRwdXRQYXJ0cyA9IFtdO1xuICBmb3IgKHZhciBpID0gc2FtZVBhcnRzTGVuZ3RoOyBpIDwgZnJvbVBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgb3V0cHV0UGFydHMucHVzaCgnLi4nKTtcbiAgfVxuXG4gIG91dHB1dFBhcnRzID0gb3V0cHV0UGFydHMuY29uY2F0KHRvUGFydHMuc2xpY2Uoc2FtZVBhcnRzTGVuZ3RoKSk7XG5cbiAgcmV0dXJuIG91dHB1dFBhcnRzLmpvaW4oJy8nKTtcbn07XG5cbmV4cG9ydHMuc2VwID0gJy8nO1xuZXhwb3J0cy5kZWxpbWl0ZXIgPSAnOic7XG5cbmV4cG9ydHMuZGlybmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgdmFyIHJlc3VsdCA9IHNwbGl0UGF0aChwYXRoKSxcbiAgICAgIHJvb3QgPSByZXN1bHRbMF0sXG4gICAgICBkaXIgPSByZXN1bHRbMV07XG5cbiAgaWYgKCFyb290ICYmICFkaXIpIHtcbiAgICAvLyBObyBkaXJuYW1lIHdoYXRzb2V2ZXJcbiAgICByZXR1cm4gJy4nO1xuICB9XG5cbiAgaWYgKGRpcikge1xuICAgIC8vIEl0IGhhcyBhIGRpcm5hbWUsIHN0cmlwIHRyYWlsaW5nIHNsYXNoXG4gICAgZGlyID0gZGlyLnN1YnN0cigwLCBkaXIubGVuZ3RoIC0gMSk7XG4gIH1cblxuICByZXR1cm4gcm9vdCArIGRpcjtcbn07XG5cblxuZXhwb3J0cy5iYXNlbmFtZSA9IGZ1bmN0aW9uKHBhdGgsIGV4dCkge1xuICB2YXIgZiA9IHNwbGl0UGF0aChwYXRoKVsyXTtcbiAgLy8gVE9ETzogbWFrZSB0aGlzIGNvbXBhcmlzb24gY2FzZS1pbnNlbnNpdGl2ZSBvbiB3aW5kb3dzP1xuICBpZiAoZXh0ICYmIGYuc3Vic3RyKC0xICogZXh0Lmxlbmd0aCkgPT09IGV4dCkge1xuICAgIGYgPSBmLnN1YnN0cigwLCBmLmxlbmd0aCAtIGV4dC5sZW5ndGgpO1xuICB9XG4gIHJldHVybiBmO1xufTtcblxuXG5leHBvcnRzLmV4dG5hbWUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHJldHVybiBzcGxpdFBhdGgocGF0aClbM107XG59O1xuXG5mdW5jdGlvbiBmaWx0ZXIgKHhzLCBmKSB7XG4gICAgaWYgKHhzLmZpbHRlcikgcmV0dXJuIHhzLmZpbHRlcihmKTtcbiAgICB2YXIgcmVzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoZih4c1tpXSwgaSwgeHMpKSByZXMucHVzaCh4c1tpXSk7XG4gICAgfVxuICAgIHJldHVybiByZXM7XG59XG5cbi8vIFN0cmluZy5wcm90b3R5cGUuc3Vic3RyIC0gbmVnYXRpdmUgaW5kZXggZG9uJ3Qgd29yayBpbiBJRThcbnZhciBzdWJzdHIgPSAnYWInLnN1YnN0cigtMSkgPT09ICdiJ1xuICAgID8gZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikgeyByZXR1cm4gc3RyLnN1YnN0cihzdGFydCwgbGVuKSB9XG4gICAgOiBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7XG4gICAgICAgIGlmIChzdGFydCA8IDApIHN0YXJ0ID0gc3RyLmxlbmd0aCArIHN0YXJ0O1xuICAgICAgICByZXR1cm4gc3RyLnN1YnN0cihzdGFydCwgbGVuKTtcbiAgICB9XG47XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpKSIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnByb2Nlc3MubmV4dFRpY2sgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBjYW5TZXRJbW1lZGlhdGUgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5zZXRJbW1lZGlhdGU7XG4gICAgdmFyIGNhblBvc3QgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5wb3N0TWVzc2FnZSAmJiB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lclxuICAgIDtcblxuICAgIGlmIChjYW5TZXRJbW1lZGlhdGUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmKSB7IHJldHVybiB3aW5kb3cuc2V0SW1tZWRpYXRlKGYpIH07XG4gICAgfVxuXG4gICAgaWYgKGNhblBvc3QpIHtcbiAgICAgICAgdmFyIHF1ZXVlID0gW107XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gZXYuc291cmNlO1xuICAgICAgICAgICAgaWYgKChzb3VyY2UgPT09IHdpbmRvdyB8fCBzb3VyY2UgPT09IG51bGwpICYmIGV2LmRhdGEgPT09ICdwcm9jZXNzLXRpY2snKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoJ3Byb2Nlc3MtdGljaycsICcqJyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgIH07XG59KSgpO1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxuLy8gSWYgb2JqLmhhc093blByb3BlcnR5IGhhcyBiZWVuIG92ZXJyaWRkZW4sIHRoZW4gY2FsbGluZ1xuLy8gb2JqLmhhc093blByb3BlcnR5KHByb3ApIHdpbGwgYnJlYWsuXG4vLyBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9qb3llbnQvbm9kZS9pc3N1ZXMvMTcwN1xuZnVuY3Rpb24gaGFzT3duUHJvcGVydHkob2JqLCBwcm9wKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihxcywgc2VwLCBlcSwgb3B0aW9ucykge1xuICBzZXAgPSBzZXAgfHwgJyYnO1xuICBlcSA9IGVxIHx8ICc9JztcbiAgdmFyIG9iaiA9IHt9O1xuXG4gIGlmICh0eXBlb2YgcXMgIT09ICdzdHJpbmcnIHx8IHFzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICB2YXIgcmVnZXhwID0gL1xcKy9nO1xuICBxcyA9IHFzLnNwbGl0KHNlcCk7XG5cbiAgdmFyIG1heEtleXMgPSAxMDAwO1xuICBpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy5tYXhLZXlzID09PSAnbnVtYmVyJykge1xuICAgIG1heEtleXMgPSBvcHRpb25zLm1heEtleXM7XG4gIH1cblxuICB2YXIgbGVuID0gcXMubGVuZ3RoO1xuICAvLyBtYXhLZXlzIDw9IDAgbWVhbnMgdGhhdCB3ZSBzaG91bGQgbm90IGxpbWl0IGtleXMgY291bnRcbiAgaWYgKG1heEtleXMgPiAwICYmIGxlbiA+IG1heEtleXMpIHtcbiAgICBsZW4gPSBtYXhLZXlzO1xuICB9XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSkge1xuICAgIHZhciB4ID0gcXNbaV0ucmVwbGFjZShyZWdleHAsICclMjAnKSxcbiAgICAgICAgaWR4ID0geC5pbmRleE9mKGVxKSxcbiAgICAgICAga3N0ciwgdnN0ciwgaywgdjtcblxuICAgIGlmIChpZHggPj0gMCkge1xuICAgICAga3N0ciA9IHguc3Vic3RyKDAsIGlkeCk7XG4gICAgICB2c3RyID0geC5zdWJzdHIoaWR4ICsgMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtzdHIgPSB4O1xuICAgICAgdnN0ciA9ICcnO1xuICAgIH1cblxuICAgIGsgPSBkZWNvZGVVUklDb21wb25lbnQoa3N0cik7XG4gICAgdiA9IGRlY29kZVVSSUNvbXBvbmVudCh2c3RyKTtcblxuICAgIGlmICghaGFzT3duUHJvcGVydHkob2JqLCBrKSkge1xuICAgICAgb2JqW2tdID0gdjtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkob2JqW2tdKSkge1xuICAgICAgb2JqW2tdLnB1c2godik7XG4gICAgfSBlbHNlIHtcbiAgICAgIG9ialtrXSA9IFtvYmpba10sIHZdO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBvYmo7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBzdHJpbmdpZnlQcmltaXRpdmUgPSBmdW5jdGlvbih2KSB7XG4gIHN3aXRjaCAodHlwZW9mIHYpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIHY7XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiB2ID8gJ3RydWUnIDogJ2ZhbHNlJztcblxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gaXNGaW5pdGUodikgPyB2IDogJyc7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuICcnO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9iaiwgc2VwLCBlcSwgbmFtZSkge1xuICBzZXAgPSBzZXAgfHwgJyYnO1xuICBlcSA9IGVxIHx8ICc9JztcbiAgaWYgKG9iaiA9PT0gbnVsbCkge1xuICAgIG9iaiA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBtYXAob2JqZWN0S2V5cyhvYmopLCBmdW5jdGlvbihrKSB7XG4gICAgICB2YXIga3MgPSBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKGspKSArIGVxO1xuICAgICAgaWYgKGlzQXJyYXkob2JqW2tdKSkge1xuICAgICAgICByZXR1cm4gb2JqW2tdLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZSh2KSk7XG4gICAgICAgIH0pLmpvaW4oc2VwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqW2tdKSk7XG4gICAgICB9XG4gICAgfSkuam9pbihzZXApO1xuXG4gIH1cblxuICBpZiAoIW5hbWUpIHJldHVybiAnJztcbiAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUobmFtZSkpICsgZXEgK1xuICAgICAgICAgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmopKTtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuXG5mdW5jdGlvbiBtYXAgKHhzLCBmKSB7XG4gIGlmICh4cy5tYXApIHJldHVybiB4cy5tYXAoZik7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgIHJlcy5wdXNoKGYoeHNbaV0sIGkpKTtcbiAgfVxuICByZXR1cm4gcmVzO1xufVxuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHJlcy5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuZGVjb2RlID0gZXhwb3J0cy5wYXJzZSA9IHJlcXVpcmUoJy4vZGVjb2RlJyk7XG5leHBvcnRzLmVuY29kZSA9IGV4cG9ydHMuc3RyaW5naWZ5ID0gcmVxdWlyZSgnLi9lbmNvZGUnKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNCdWZmZXIoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgdHlwZW9mIGFyZyA9PT0gJ29iamVjdCdcbiAgICAmJiB0eXBlb2YgYXJnLmNvcHkgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLmZpbGwgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLnJlYWRVSW50OCA9PT0gJ2Z1bmN0aW9uJztcbn0iLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsKXtcbi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG52YXIgZm9ybWF0UmVnRXhwID0gLyVbc2RqJV0vZztcbmV4cG9ydHMuZm9ybWF0ID0gZnVuY3Rpb24oZikge1xuICBpZiAoIWlzU3RyaW5nKGYpKSB7XG4gICAgdmFyIG9iamVjdHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgb2JqZWN0cy5wdXNoKGluc3BlY3QoYXJndW1lbnRzW2ldKSk7XG4gICAgfVxuICAgIHJldHVybiBvYmplY3RzLmpvaW4oJyAnKTtcbiAgfVxuXG4gIHZhciBpID0gMTtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gIHZhciBsZW4gPSBhcmdzLmxlbmd0aDtcbiAgdmFyIHN0ciA9IFN0cmluZyhmKS5yZXBsYWNlKGZvcm1hdFJlZ0V4cCwgZnVuY3Rpb24oeCkge1xuICAgIGlmICh4ID09PSAnJSUnKSByZXR1cm4gJyUnO1xuICAgIGlmIChpID49IGxlbikgcmV0dXJuIHg7XG4gICAgc3dpdGNoICh4KSB7XG4gICAgICBjYXNlICclcyc6IHJldHVybiBTdHJpbmcoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVkJzogcmV0dXJuIE51bWJlcihhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWonOlxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShhcmdzW2krK10pO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgcmV0dXJuICdbQ2lyY3VsYXJdJztcbiAgICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuICB9KTtcbiAgZm9yICh2YXIgeCA9IGFyZ3NbaV07IGkgPCBsZW47IHggPSBhcmdzWysraV0pIHtcbiAgICBpZiAoaXNOdWxsKHgpIHx8ICFpc09iamVjdCh4KSkge1xuICAgICAgc3RyICs9ICcgJyArIHg7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciArPSAnICcgKyBpbnNwZWN0KHgpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RyO1xufTtcblxuXG4vLyBNYXJrIHRoYXQgYSBtZXRob2Qgc2hvdWxkIG5vdCBiZSB1c2VkLlxuLy8gUmV0dXJucyBhIG1vZGlmaWVkIGZ1bmN0aW9uIHdoaWNoIHdhcm5zIG9uY2UgYnkgZGVmYXVsdC5cbi8vIElmIC0tbm8tZGVwcmVjYXRpb24gaXMgc2V0LCB0aGVuIGl0IGlzIGEgbm8tb3AuXG5leHBvcnRzLmRlcHJlY2F0ZSA9IGZ1bmN0aW9uKGZuLCBtc2cpIHtcbiAgLy8gQWxsb3cgZm9yIGRlcHJlY2F0aW5nIHRoaW5ncyBpbiB0aGUgcHJvY2VzcyBvZiBzdGFydGluZyB1cC5cbiAgaWYgKGlzVW5kZWZpbmVkKGdsb2JhbC5wcm9jZXNzKSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBleHBvcnRzLmRlcHJlY2F0ZShmbiwgbXNnKS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuICBpZiAocHJvY2Vzcy5ub0RlcHJlY2F0aW9uID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGZuO1xuICB9XG5cbiAgdmFyIHdhcm5lZCA9IGZhbHNlO1xuICBmdW5jdGlvbiBkZXByZWNhdGVkKCkge1xuICAgIGlmICghd2FybmVkKSB7XG4gICAgICBpZiAocHJvY2Vzcy50aHJvd0RlcHJlY2F0aW9uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtc2cpO1xuICAgICAgfSBlbHNlIGlmIChwcm9jZXNzLnRyYWNlRGVwcmVjYXRpb24pIHtcbiAgICAgICAgY29uc29sZS50cmFjZShtc2cpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihtc2cpO1xuICAgICAgfVxuICAgICAgd2FybmVkID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH1cblxuICByZXR1cm4gZGVwcmVjYXRlZDtcbn07XG5cblxudmFyIGRlYnVncyA9IHt9O1xudmFyIGRlYnVnRW52aXJvbjtcbmV4cG9ydHMuZGVidWdsb2cgPSBmdW5jdGlvbihzZXQpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKGRlYnVnRW52aXJvbikpXG4gICAgZGVidWdFbnZpcm9uID0gcHJvY2Vzcy5lbnYuTk9ERV9ERUJVRyB8fCAnJztcbiAgc2V0ID0gc2V0LnRvVXBwZXJDYXNlKCk7XG4gIGlmICghZGVidWdzW3NldF0pIHtcbiAgICBpZiAobmV3IFJlZ0V4cCgnXFxcXGInICsgc2V0ICsgJ1xcXFxiJywgJ2knKS50ZXN0KGRlYnVnRW52aXJvbikpIHtcbiAgICAgIHZhciBwaWQgPSBwcm9jZXNzLnBpZDtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBtc2cgPSBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCclcyAlZDogJXMnLCBzZXQsIHBpZCwgbXNnKTtcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7fTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGRlYnVnc1tzZXRdO1xufTtcblxuXG4vKipcbiAqIEVjaG9zIHRoZSB2YWx1ZSBvZiBhIHZhbHVlLiBUcnlzIHRvIHByaW50IHRoZSB2YWx1ZSBvdXRcbiAqIGluIHRoZSBiZXN0IHdheSBwb3NzaWJsZSBnaXZlbiB0aGUgZGlmZmVyZW50IHR5cGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBwcmludCBvdXQuXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0cyBPcHRpb25hbCBvcHRpb25zIG9iamVjdCB0aGF0IGFsdGVycyB0aGUgb3V0cHV0LlxuICovXG4vKiBsZWdhY3k6IG9iaiwgc2hvd0hpZGRlbiwgZGVwdGgsIGNvbG9ycyovXG5mdW5jdGlvbiBpbnNwZWN0KG9iaiwgb3B0cykge1xuICAvLyBkZWZhdWx0IG9wdGlvbnNcbiAgdmFyIGN0eCA9IHtcbiAgICBzZWVuOiBbXSxcbiAgICBzdHlsaXplOiBzdHlsaXplTm9Db2xvclxuICB9O1xuICAvLyBsZWdhY3kuLi5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gMykgY3R4LmRlcHRoID0gYXJndW1lbnRzWzJdO1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSA0KSBjdHguY29sb3JzID0gYXJndW1lbnRzWzNdO1xuICBpZiAoaXNCb29sZWFuKG9wdHMpKSB7XG4gICAgLy8gbGVnYWN5Li4uXG4gICAgY3R4LnNob3dIaWRkZW4gPSBvcHRzO1xuICB9IGVsc2UgaWYgKG9wdHMpIHtcbiAgICAvLyBnb3QgYW4gXCJvcHRpb25zXCIgb2JqZWN0XG4gICAgZXhwb3J0cy5fZXh0ZW5kKGN0eCwgb3B0cyk7XG4gIH1cbiAgLy8gc2V0IGRlZmF1bHQgb3B0aW9uc1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LnNob3dIaWRkZW4pKSBjdHguc2hvd0hpZGRlbiA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmRlcHRoKSkgY3R4LmRlcHRoID0gMjtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jb2xvcnMpKSBjdHguY29sb3JzID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY3VzdG9tSW5zcGVjdCkpIGN0eC5jdXN0b21JbnNwZWN0ID0gdHJ1ZTtcbiAgaWYgKGN0eC5jb2xvcnMpIGN0eC5zdHlsaXplID0gc3R5bGl6ZVdpdGhDb2xvcjtcbiAgcmV0dXJuIGZvcm1hdFZhbHVlKGN0eCwgb2JqLCBjdHguZGVwdGgpO1xufVxuZXhwb3J0cy5pbnNwZWN0ID0gaW5zcGVjdDtcblxuXG4vLyBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0FOU0lfZXNjYXBlX2NvZGUjZ3JhcGhpY3Ncbmluc3BlY3QuY29sb3JzID0ge1xuICAnYm9sZCcgOiBbMSwgMjJdLFxuICAnaXRhbGljJyA6IFszLCAyM10sXG4gICd1bmRlcmxpbmUnIDogWzQsIDI0XSxcbiAgJ2ludmVyc2UnIDogWzcsIDI3XSxcbiAgJ3doaXRlJyA6IFszNywgMzldLFxuICAnZ3JleScgOiBbOTAsIDM5XSxcbiAgJ2JsYWNrJyA6IFszMCwgMzldLFxuICAnYmx1ZScgOiBbMzQsIDM5XSxcbiAgJ2N5YW4nIDogWzM2LCAzOV0sXG4gICdncmVlbicgOiBbMzIsIDM5XSxcbiAgJ21hZ2VudGEnIDogWzM1LCAzOV0sXG4gICdyZWQnIDogWzMxLCAzOV0sXG4gICd5ZWxsb3cnIDogWzMzLCAzOV1cbn07XG5cbi8vIERvbid0IHVzZSAnYmx1ZScgbm90IHZpc2libGUgb24gY21kLmV4ZVxuaW5zcGVjdC5zdHlsZXMgPSB7XG4gICdzcGVjaWFsJzogJ2N5YW4nLFxuICAnbnVtYmVyJzogJ3llbGxvdycsXG4gICdib29sZWFuJzogJ3llbGxvdycsXG4gICd1bmRlZmluZWQnOiAnZ3JleScsXG4gICdudWxsJzogJ2JvbGQnLFxuICAnc3RyaW5nJzogJ2dyZWVuJyxcbiAgJ2RhdGUnOiAnbWFnZW50YScsXG4gIC8vIFwibmFtZVwiOiBpbnRlbnRpb25hbGx5IG5vdCBzdHlsaW5nXG4gICdyZWdleHAnOiAncmVkJ1xufTtcblxuXG5mdW5jdGlvbiBzdHlsaXplV2l0aENvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHZhciBzdHlsZSA9IGluc3BlY3Quc3R5bGVzW3N0eWxlVHlwZV07XG5cbiAgaWYgKHN0eWxlKSB7XG4gICAgcmV0dXJuICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMF0gKyAnbScgKyBzdHIgK1xuICAgICAgICAgICAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzFdICsgJ20nO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBzdHlsaXplTm9Db2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICByZXR1cm4gc3RyO1xufVxuXG5cbmZ1bmN0aW9uIGFycmF5VG9IYXNoKGFycmF5KSB7XG4gIHZhciBoYXNoID0ge307XG5cbiAgYXJyYXkuZm9yRWFjaChmdW5jdGlvbih2YWwsIGlkeCkge1xuICAgIGhhc2hbdmFsXSA9IHRydWU7XG4gIH0pO1xuXG4gIHJldHVybiBoYXNoO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFZhbHVlKGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcykge1xuICAvLyBQcm92aWRlIGEgaG9vayBmb3IgdXNlci1zcGVjaWZpZWQgaW5zcGVjdCBmdW5jdGlvbnMuXG4gIC8vIENoZWNrIHRoYXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW4gaW5zcGVjdCBmdW5jdGlvbiBvbiBpdFxuICBpZiAoY3R4LmN1c3RvbUluc3BlY3QgJiZcbiAgICAgIHZhbHVlICYmXG4gICAgICBpc0Z1bmN0aW9uKHZhbHVlLmluc3BlY3QpICYmXG4gICAgICAvLyBGaWx0ZXIgb3V0IHRoZSB1dGlsIG1vZHVsZSwgaXQncyBpbnNwZWN0IGZ1bmN0aW9uIGlzIHNwZWNpYWxcbiAgICAgIHZhbHVlLmluc3BlY3QgIT09IGV4cG9ydHMuaW5zcGVjdCAmJlxuICAgICAgLy8gQWxzbyBmaWx0ZXIgb3V0IGFueSBwcm90b3R5cGUgb2JqZWN0cyB1c2luZyB0aGUgY2lyY3VsYXIgY2hlY2suXG4gICAgICAhKHZhbHVlLmNvbnN0cnVjdG9yICYmIHZhbHVlLmNvbnN0cnVjdG9yLnByb3RvdHlwZSA9PT0gdmFsdWUpKSB7XG4gICAgdmFyIHJldCA9IHZhbHVlLmluc3BlY3QocmVjdXJzZVRpbWVzLCBjdHgpO1xuICAgIGlmICghaXNTdHJpbmcocmV0KSkge1xuICAgICAgcmV0ID0gZm9ybWF0VmFsdWUoY3R4LCByZXQsIHJlY3Vyc2VUaW1lcyk7XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cblxuICAvLyBQcmltaXRpdmUgdHlwZXMgY2Fubm90IGhhdmUgcHJvcGVydGllc1xuICB2YXIgcHJpbWl0aXZlID0gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpO1xuICBpZiAocHJpbWl0aXZlKSB7XG4gICAgcmV0dXJuIHByaW1pdGl2ZTtcbiAgfVxuXG4gIC8vIExvb2sgdXAgdGhlIGtleXMgb2YgdGhlIG9iamVjdC5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSk7XG4gIHZhciB2aXNpYmxlS2V5cyA9IGFycmF5VG9IYXNoKGtleXMpO1xuXG4gIGlmIChjdHguc2hvd0hpZGRlbikge1xuICAgIGtleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh2YWx1ZSk7XG4gIH1cblxuICAvLyBJRSBkb2Vzbid0IG1ha2UgZXJyb3IgZmllbGRzIG5vbi1lbnVtZXJhYmxlXG4gIC8vIGh0dHA6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS9pZS9kd3c1MnNidCh2PXZzLjk0KS5hc3B4XG4gIGlmIChpc0Vycm9yKHZhbHVlKVxuICAgICAgJiYgKGtleXMuaW5kZXhPZignbWVzc2FnZScpID49IDAgfHwga2V5cy5pbmRleE9mKCdkZXNjcmlwdGlvbicpID49IDApKSB7XG4gICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIC8vIFNvbWUgdHlwZSBvZiBvYmplY3Qgd2l0aG91dCBwcm9wZXJ0aWVzIGNhbiBiZSBzaG9ydGN1dHRlZC5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICB2YXIgbmFtZSA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbRnVuY3Rpb24nICsgbmFtZSArICddJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9XG4gICAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShEYXRlLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ2RhdGUnKTtcbiAgICB9XG4gICAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIHZhciBiYXNlID0gJycsIGFycmF5ID0gZmFsc2UsIGJyYWNlcyA9IFsneycsICd9J107XG5cbiAgLy8gTWFrZSBBcnJheSBzYXkgdGhhdCB0aGV5IGFyZSBBcnJheVxuICBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBhcnJheSA9IHRydWU7XG4gICAgYnJhY2VzID0gWydbJywgJ10nXTtcbiAgfVxuXG4gIC8vIE1ha2UgZnVuY3Rpb25zIHNheSB0aGF0IHRoZXkgYXJlIGZ1bmN0aW9uc1xuICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICB2YXIgbiA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgIGJhc2UgPSAnIFtGdW5jdGlvbicgKyBuICsgJ10nO1xuICB9XG5cbiAgLy8gTWFrZSBSZWdFeHBzIHNheSB0aGF0IHRoZXkgYXJlIFJlZ0V4cHNcbiAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBkYXRlcyB3aXRoIHByb3BlcnRpZXMgZmlyc3Qgc2F5IHRoZSBkYXRlXG4gIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIERhdGUucHJvdG90eXBlLnRvVVRDU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBlcnJvciB3aXRoIG1lc3NhZ2UgZmlyc3Qgc2F5IHRoZSBlcnJvclxuICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwICYmICghYXJyYXkgfHwgdmFsdWUubGVuZ3RoID09IDApKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyBicmFjZXNbMV07XG4gIH1cblxuICBpZiAocmVjdXJzZVRpbWVzIDwgMCkge1xuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW09iamVjdF0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuXG4gIGN0eC5zZWVuLnB1c2godmFsdWUpO1xuXG4gIHZhciBvdXRwdXQ7XG4gIGlmIChhcnJheSkge1xuICAgIG91dHB1dCA9IGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpO1xuICB9IGVsc2Uge1xuICAgIG91dHB1dCA9IGtleXMubWFwKGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpO1xuICAgIH0pO1xuICB9XG5cbiAgY3R4LnNlZW4ucG9wKCk7XG5cbiAgcmV0dXJuIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSkge1xuICBpZiAoaXNVbmRlZmluZWQodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgndW5kZWZpbmVkJywgJ3VuZGVmaW5lZCcpO1xuICBpZiAoaXNTdHJpbmcodmFsdWUpKSB7XG4gICAgdmFyIHNpbXBsZSA9ICdcXCcnICsgSlNPTi5zdHJpbmdpZnkodmFsdWUpLnJlcGxhY2UoL15cInxcIiQvZywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpICsgJ1xcJyc7XG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKHNpbXBsZSwgJ3N0cmluZycpO1xuICB9XG4gIGlmIChpc051bWJlcih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdudW1iZXInKTtcbiAgaWYgKGlzQm9vbGVhbih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdib29sZWFuJyk7XG4gIC8vIEZvciBzb21lIHJlYXNvbiB0eXBlb2YgbnVsbCBpcyBcIm9iamVjdFwiLCBzbyBzcGVjaWFsIGNhc2UgaGVyZS5cbiAgaWYgKGlzTnVsbCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCdudWxsJywgJ251bGwnKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRFcnJvcih2YWx1ZSkge1xuICByZXR1cm4gJ1snICsgRXJyb3IucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpICsgJ10nO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpIHtcbiAgdmFyIG91dHB1dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHZhbHVlLmxlbmd0aDsgaSA8IGw7ICsraSkge1xuICAgIGlmIChoYXNPd25Qcm9wZXJ0eSh2YWx1ZSwgU3RyaW5nKGkpKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBTdHJpbmcoaSksIHRydWUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0cHV0LnB1c2goJycpO1xuICAgIH1cbiAgfVxuICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgaWYgKCFrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIGtleSwgdHJ1ZSkpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvdXRwdXQ7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSkge1xuICB2YXIgbmFtZSwgc3RyLCBkZXNjO1xuICBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih2YWx1ZSwga2V5KSB8fCB7IHZhbHVlOiB2YWx1ZVtrZXldIH07XG4gIGlmIChkZXNjLmdldCkge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXIvU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tTZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKCFoYXNPd25Qcm9wZXJ0eSh2aXNpYmxlS2V5cywga2V5KSkge1xuICAgIG5hbWUgPSAnWycgKyBrZXkgKyAnXSc7XG4gIH1cbiAgaWYgKCFzdHIpIHtcbiAgICBpZiAoY3R4LnNlZW4uaW5kZXhPZihkZXNjLnZhbHVlKSA8IDApIHtcbiAgICAgIGlmIChpc051bGwocmVjdXJzZVRpbWVzKSkge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIG51bGwpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCByZWN1cnNlVGltZXMgLSAxKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdHIuaW5kZXhPZignXFxuJykgPiAtMSkge1xuICAgICAgICBpZiAoYXJyYXkpIHtcbiAgICAgICAgICBzdHIgPSBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJykuc3Vic3RyKDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ciA9ICdcXG4nICsgc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0NpcmN1bGFyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmIChpc1VuZGVmaW5lZChuYW1lKSkge1xuICAgIGlmIChhcnJheSAmJiBrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH1cbiAgICBuYW1lID0gSlNPTi5zdHJpbmdpZnkoJycgKyBrZXkpO1xuICAgIGlmIChuYW1lLm1hdGNoKC9eXCIoW2EtekEtWl9dW2EtekEtWl8wLTldKilcIiQvKSkge1xuICAgICAgbmFtZSA9IG5hbWUuc3Vic3RyKDEsIG5hbWUubGVuZ3RoIC0gMik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ25hbWUnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJylcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLyheXCJ8XCIkKS9nLCBcIidcIik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ3N0cmluZycpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBuYW1lICsgJzogJyArIHN0cjtcbn1cblxuXG5mdW5jdGlvbiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcykge1xuICB2YXIgbnVtTGluZXNFc3QgPSAwO1xuICB2YXIgbGVuZ3RoID0gb3V0cHV0LnJlZHVjZShmdW5jdGlvbihwcmV2LCBjdXIpIHtcbiAgICBudW1MaW5lc0VzdCsrO1xuICAgIGlmIChjdXIuaW5kZXhPZignXFxuJykgPj0gMCkgbnVtTGluZXNFc3QrKztcbiAgICByZXR1cm4gcHJldiArIGN1ci5yZXBsYWNlKC9cXHUwMDFiXFxbXFxkXFxkP20vZywgJycpLmxlbmd0aCArIDE7XG4gIH0sIDApO1xuXG4gIGlmIChsZW5ndGggPiA2MCkge1xuICAgIHJldHVybiBicmFjZXNbMF0gK1xuICAgICAgICAgICAoYmFzZSA9PT0gJycgPyAnJyA6IGJhc2UgKyAnXFxuICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgb3V0cHV0LmpvaW4oJyxcXG4gICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgYnJhY2VzWzFdO1xuICB9XG5cbiAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyAnICcgKyBvdXRwdXQuam9pbignLCAnKSArICcgJyArIGJyYWNlc1sxXTtcbn1cblxuXG4vLyBOT1RFOiBUaGVzZSB0eXBlIGNoZWNraW5nIGZ1bmN0aW9ucyBpbnRlbnRpb25hbGx5IGRvbid0IHVzZSBgaW5zdGFuY2VvZmBcbi8vIGJlY2F1c2UgaXQgaXMgZnJhZ2lsZSBhbmQgY2FuIGJlIGVhc2lseSBmYWtlZCB3aXRoIGBPYmplY3QuY3JlYXRlKClgLlxuZnVuY3Rpb24gaXNBcnJheShhcikge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShhcik7XG59XG5leHBvcnRzLmlzQXJyYXkgPSBpc0FycmF5O1xuXG5mdW5jdGlvbiBpc0Jvb2xlYW4oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnYm9vbGVhbic7XG59XG5leHBvcnRzLmlzQm9vbGVhbiA9IGlzQm9vbGVhbjtcblxuZnVuY3Rpb24gaXNOdWxsKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGwgPSBpc051bGw7XG5cbmZ1bmN0aW9uIGlzTnVsbE9yVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbE9yVW5kZWZpbmVkID0gaXNOdWxsT3JVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5leHBvcnRzLmlzTnVtYmVyID0gaXNOdW1iZXI7XG5cbmZ1bmN0aW9uIGlzU3RyaW5nKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N0cmluZyc7XG59XG5leHBvcnRzLmlzU3RyaW5nID0gaXNTdHJpbmc7XG5cbmZ1bmN0aW9uIGlzU3ltYm9sKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCc7XG59XG5leHBvcnRzLmlzU3ltYm9sID0gaXNTeW1ib2w7XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG5leHBvcnRzLmlzVW5kZWZpbmVkID0gaXNVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzUmVnRXhwKHJlKSB7XG4gIHJldHVybiBpc09iamVjdChyZSkgJiYgb2JqZWN0VG9TdHJpbmcocmUpID09PSAnW29iamVjdCBSZWdFeHBdJztcbn1cbmV4cG9ydHMuaXNSZWdFeHAgPSBpc1JlZ0V4cDtcblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5leHBvcnRzLmlzT2JqZWN0ID0gaXNPYmplY3Q7XG5cbmZ1bmN0aW9uIGlzRGF0ZShkKSB7XG4gIHJldHVybiBpc09iamVjdChkKSAmJiBvYmplY3RUb1N0cmluZyhkKSA9PT0gJ1tvYmplY3QgRGF0ZV0nO1xufVxuZXhwb3J0cy5pc0RhdGUgPSBpc0RhdGU7XG5cbmZ1bmN0aW9uIGlzRXJyb3IoZSkge1xuICByZXR1cm4gaXNPYmplY3QoZSkgJiZcbiAgICAgIChvYmplY3RUb1N0cmluZyhlKSA9PT0gJ1tvYmplY3QgRXJyb3JdJyB8fCBlIGluc3RhbmNlb2YgRXJyb3IpO1xufVxuZXhwb3J0cy5pc0Vycm9yID0gaXNFcnJvcjtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5leHBvcnRzLmlzRnVuY3Rpb24gPSBpc0Z1bmN0aW9uO1xuXG5mdW5jdGlvbiBpc1ByaW1pdGl2ZShhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbCB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N0cmluZycgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnIHx8ICAvLyBFUzYgc3ltYm9sXG4gICAgICAgICB0eXBlb2YgYXJnID09PSAndW5kZWZpbmVkJztcbn1cbmV4cG9ydHMuaXNQcmltaXRpdmUgPSBpc1ByaW1pdGl2ZTtcblxuZXhwb3J0cy5pc0J1ZmZlciA9IHJlcXVpcmUoJy4vc3VwcG9ydC9pc0J1ZmZlcicpO1xuXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyhvKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobyk7XG59XG5cblxuZnVuY3Rpb24gcGFkKG4pIHtcbiAgcmV0dXJuIG4gPCAxMCA/ICcwJyArIG4udG9TdHJpbmcoMTApIDogbi50b1N0cmluZygxMCk7XG59XG5cblxudmFyIG1vbnRocyA9IFsnSmFuJywgJ0ZlYicsICdNYXInLCAnQXByJywgJ01heScsICdKdW4nLCAnSnVsJywgJ0F1ZycsICdTZXAnLFxuICAgICAgICAgICAgICAnT2N0JywgJ05vdicsICdEZWMnXTtcblxuLy8gMjYgRmViIDE2OjE5OjM0XG5mdW5jdGlvbiB0aW1lc3RhbXAoKSB7XG4gIHZhciBkID0gbmV3IERhdGUoKTtcbiAgdmFyIHRpbWUgPSBbcGFkKGQuZ2V0SG91cnMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldE1pbnV0ZXMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldFNlY29uZHMoKSldLmpvaW4oJzonKTtcbiAgcmV0dXJuIFtkLmdldERhdGUoKSwgbW9udGhzW2QuZ2V0TW9udGgoKV0sIHRpbWVdLmpvaW4oJyAnKTtcbn1cblxuXG4vLyBsb2cgaXMganVzdCBhIHRoaW4gd3JhcHBlciB0byBjb25zb2xlLmxvZyB0aGF0IHByZXBlbmRzIGEgdGltZXN0YW1wXG5leHBvcnRzLmxvZyA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLmxvZygnJXMgLSAlcycsIHRpbWVzdGFtcCgpLCBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpKTtcbn07XG5cblxuLyoqXG4gKiBJbmhlcml0IHRoZSBwcm90b3R5cGUgbWV0aG9kcyBmcm9tIG9uZSBjb25zdHJ1Y3RvciBpbnRvIGFub3RoZXIuXG4gKlxuICogVGhlIEZ1bmN0aW9uLnByb3RvdHlwZS5pbmhlcml0cyBmcm9tIGxhbmcuanMgcmV3cml0dGVuIGFzIGEgc3RhbmRhbG9uZVxuICogZnVuY3Rpb24gKG5vdCBvbiBGdW5jdGlvbi5wcm90b3R5cGUpLiBOT1RFOiBJZiB0aGlzIGZpbGUgaXMgdG8gYmUgbG9hZGVkXG4gKiBkdXJpbmcgYm9vdHN0cmFwcGluZyB0aGlzIGZ1bmN0aW9uIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB1c2luZyBzb21lIG5hdGl2ZVxuICogZnVuY3Rpb25zIGFzIHByb3RvdHlwZSBzZXR1cCB1c2luZyBub3JtYWwgSmF2YVNjcmlwdCBkb2VzIG5vdCB3b3JrIGFzXG4gKiBleHBlY3RlZCBkdXJpbmcgYm9vdHN0cmFwcGluZyAoc2VlIG1pcnJvci5qcyBpbiByMTE0OTAzKS5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHdoaWNoIG5lZWRzIHRvIGluaGVyaXQgdGhlXG4gKiAgICAgcHJvdG90eXBlLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gc3VwZXJDdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHRvIGluaGVyaXQgcHJvdG90eXBlIGZyb20uXG4gKi9cbmV4cG9ydHMuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuXG5leHBvcnRzLl9leHRlbmQgPSBmdW5jdGlvbihvcmlnaW4sIGFkZCkge1xuICAvLyBEb24ndCBkbyBhbnl0aGluZyBpZiBhZGQgaXNuJ3QgYW4gb2JqZWN0XG4gIGlmICghYWRkIHx8ICFpc09iamVjdChhZGQpKSByZXR1cm4gb3JpZ2luO1xuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoYWRkKTtcbiAgdmFyIGkgPSBrZXlzLmxlbmd0aDtcbiAgd2hpbGUgKGktLSkge1xuICAgIG9yaWdpbltrZXlzW2ldXSA9IGFkZFtrZXlzW2ldXTtcbiAgfVxuICByZXR1cm4gb3JpZ2luO1xufTtcblxuZnVuY3Rpb24gaGFzT3duUHJvcGVydHkob2JqLCBwcm9wKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBFbGVtZW50ID0gcmVxdWlyZSgnLi9lbGVtZW50JykuRWxlbWVudFxuXG5mdW5jdGlvbiBET01FbGVtZW50KG5hbWUsIGF0dHJzKSB7XG4gICAgRWxlbWVudC5jYWxsKHRoaXMsIG5hbWUsIGF0dHJzKVxuXG4gICAgdGhpcy5ub2RlVHlwZSA9IDFcbiAgICB0aGlzLm5vZGVOYW1lID0gdGhpcy5sb2NhbE5hbWVcbn1cblxudXRpbC5pbmhlcml0cyhET01FbGVtZW50LCBFbGVtZW50KVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5fZ2V0RWxlbWVudCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJzKSB7XG4gICAgdmFyIGVsZW1lbnQgPSBuZXcgRE9NRWxlbWVudChuYW1lLCBhdHRycylcbiAgICByZXR1cm4gZWxlbWVudFxufVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoRE9NRWxlbWVudC5wcm90b3R5cGUsICdsb2NhbE5hbWUnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE5hbWUoKVxuICAgIH1cbn0pXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShET01FbGVtZW50LnByb3RvdHlwZSwgJ25hbWVzcGFjZVVSSScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0TlMoKVxuICAgIH1cbn0pXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShET01FbGVtZW50LnByb3RvdHlwZSwgJ3BhcmVudE5vZGUnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudFxuICAgIH1cbn0pXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShET01FbGVtZW50LnByb3RvdHlwZSwgJ2NoaWxkTm9kZXMnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNoaWxkcmVuXG4gICAgfVxufSlcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KERPTUVsZW1lbnQucHJvdG90eXBlLCAndGV4dENvbnRlbnQnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFRleHQoKVxuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdGhpcy5jaGlsZHJlbi5wdXNoKHZhbHVlKVxuICAgIH1cbn0pXG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLmdldEVsZW1lbnRzQnlUYWdOYW1lID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRDaGlsZHJlbihuYW1lKVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5nZXRBdHRyaWJ1dGUgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHJldHVybiB0aGlzLmdldEF0dHIobmFtZSlcbn1cblxuRE9NRWxlbWVudC5wcm90b3R5cGUuc2V0QXR0cmlidXRlID0gZnVuY3Rpb24gKG5hbWUsIHZhbHVlKSB7XG4gICAgdGhpcy5hdHRyKG5hbWUsIHZhbHVlKVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5nZXRBdHRyaWJ1dGVOUyA9IGZ1bmN0aW9uIChucywgbmFtZSkge1xuICAgIGlmIChucyA9PT0gJ2h0dHA6Ly93d3cudzMub3JnL1hNTC8xOTk4L25hbWVzcGFjZScpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0QXR0cihbJ3htbCcsIG5hbWVdLmpvaW4oJzonKSlcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZ2V0QXR0cihuYW1lLCBucylcbn1cblxuRE9NRWxlbWVudC5wcm90b3R5cGUuc2V0QXR0cmlidXRlTlMgPSBmdW5jdGlvbiAobnMsIG5hbWUsIHZhbHVlKSB7XG4gICAgdmFyIHByZWZpeFxuICAgIGlmIChucyA9PT0gJ2h0dHA6Ly93d3cudzMub3JnL1hNTC8xOTk4L25hbWVzcGFjZScpIHtcbiAgICAgICAgcHJlZml4ID0gJ3htbCdcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgbnNzID0gdGhpcy5nZXRYbWxucygpXG4gICAgICAgIHByZWZpeCA9IG5zc1tuc10gfHwgJydcbiAgICB9XG4gICAgaWYgKHByZWZpeCkge1xuICAgICAgICB0aGlzLmF0dHIoW3ByZWZpeCwgbmFtZV0uam9pbignOicpLCB2YWx1ZSlcbiAgICB9XG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLnJlbW92ZUF0dHJpYnV0ZSA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhpcy5hdHRyKG5hbWUsIG51bGwpXG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLnJlbW92ZUF0dHJpYnV0ZU5TID0gZnVuY3Rpb24gKG5zLCBuYW1lKSB7XG4gICAgdmFyIHByZWZpeFxuICAgIGlmIChucyA9PT0gJ2h0dHA6Ly93d3cudzMub3JnL1hNTC8xOTk4L25hbWVzcGFjZScpIHtcbiAgICAgICAgcHJlZml4ID0gJ3htbCdcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgbnNzID0gdGhpcy5nZXRYbWxucygpXG4gICAgICAgIHByZWZpeCA9IG5zc1tuc10gfHwgJydcbiAgICB9XG4gICAgaWYgKHByZWZpeCkge1xuICAgICAgICB0aGlzLmF0dHIoW3ByZWZpeCwgbmFtZV0uam9pbignOicpLCBudWxsKVxuICAgIH1cbn1cblxuRE9NRWxlbWVudC5wcm90b3R5cGUuYXBwZW5kQ2hpbGQgPSBmdW5jdGlvbiAoZWwpIHtcbiAgICB0aGlzLmNub2RlKGVsKVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5yZW1vdmVDaGlsZCA9IGZ1bmN0aW9uIChlbCkge1xuICAgIHRoaXMucmVtb3ZlKGVsKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERPTUVsZW1lbnRcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBUaGlzIGNoZWFwIHJlcGxpY2Egb2YgRE9NL0J1aWxkZXIgcHV0cyBtZSB0byBzaGFtZSA6LSlcbiAqXG4gKiBBdHRyaWJ1dGVzIGFyZSBpbiB0aGUgZWxlbWVudC5hdHRycyBvYmplY3QuIENoaWxkcmVuIGlzIGEgbGlzdCBvZlxuICogZWl0aGVyIG90aGVyIEVsZW1lbnRzIG9yIFN0cmluZ3MgZm9yIHRleHQgY29udGVudC5cbiAqKi9cbmZ1bmN0aW9uIEVsZW1lbnQobmFtZSwgYXR0cnMpIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lXG4gICAgdGhpcy5wYXJlbnQgPSBudWxsXG4gICAgdGhpcy5jaGlsZHJlbiA9IFtdXG4gICAgdGhpcy5zZXRBdHRycyhhdHRycylcbn1cblxuLyoqKiBBY2Nlc3NvcnMgKioqL1xuXG4vKipcbiAqIGlmIChlbGVtZW50LmlzKCdtZXNzYWdlJywgJ2phYmJlcjpjbGllbnQnKSkgLi4uXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5pcyA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgcmV0dXJuICh0aGlzLmdldE5hbWUoKSA9PT0gbmFtZSkgJiZcbiAgICAgICAgKCF4bWxucyB8fCAodGhpcy5nZXROUygpID09PSB4bWxucykpXG59XG5cbi8qIHdpdGhvdXQgcHJlZml4ICovXG5FbGVtZW50LnByb3RvdHlwZS5nZXROYW1lID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMubmFtZS5pbmRleE9mKCc6JykgPj0gMClcbiAgICAgICAgcmV0dXJuIHRoaXMubmFtZS5zdWJzdHIodGhpcy5uYW1lLmluZGV4T2YoJzonKSArIDEpXG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gdGhpcy5uYW1lXG59XG5cbi8qKlxuICogcmV0cmlldmVzIHRoZSBuYW1lc3BhY2Ugb2YgdGhlIGN1cnJlbnQgZWxlbWVudCwgdXB3YXJkcyByZWN1cnNpdmVseVxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0TlMgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5uYW1lLmluZGV4T2YoJzonKSA+PSAwKSB7XG4gICAgICAgIHZhciBwcmVmaXggPSB0aGlzLm5hbWUuc3Vic3RyKDAsIHRoaXMubmFtZS5pbmRleE9mKCc6JykpXG4gICAgICAgIHJldHVybiB0aGlzLmZpbmROUyhwcmVmaXgpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluZE5TKClcbiAgICB9XG59XG5cbi8qKlxuICogZmluZCB0aGUgbmFtZXNwYWNlIHRvIHRoZSBnaXZlbiBwcmVmaXgsIHVwd2FyZHMgcmVjdXJzaXZlbHlcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmZpbmROUyA9IGZ1bmN0aW9uKHByZWZpeCkge1xuICAgIGlmICghcHJlZml4KSB7XG4gICAgICAgIC8qIGRlZmF1bHQgbmFtZXNwYWNlICovXG4gICAgICAgIGlmICh0aGlzLmF0dHJzLnhtbG5zKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnMueG1sbnNcbiAgICAgICAgZWxzZSBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQuZmluZE5TKClcbiAgICB9IGVsc2Uge1xuICAgICAgICAvKiBwcmVmaXhlZCBuYW1lc3BhY2UgKi9cbiAgICAgICAgdmFyIGF0dHIgPSAneG1sbnM6JyArIHByZWZpeFxuICAgICAgICBpZiAodGhpcy5hdHRyc1thdHRyXSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmF0dHJzW2F0dHJdXG4gICAgICAgIGVsc2UgaWYgKHRoaXMucGFyZW50KVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50LmZpbmROUyhwcmVmaXgpXG4gICAgfVxufVxuXG4vKipcbiAqIFJlY3Vyc2l2ZXJseSBnZXRzIGFsbCB4bWxucyBkZWZpbmVkLCBpbiB0aGUgZm9ybSBvZiB7dXJsOnByZWZpeH1cbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldFhtbG5zID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5hbWVzcGFjZXMgPSB7fVxuXG4gICAgaWYgKHRoaXMucGFyZW50KVxuICAgICAgICBuYW1lc3BhY2VzID0gdGhpcy5wYXJlbnQuZ2V0WG1sbnMoKVxuXG4gICAgZm9yICh2YXIgYXR0ciBpbiB0aGlzLmF0dHJzKSB7XG4gICAgICAgIHZhciBtID0gYXR0ci5tYXRjaCgneG1sbnM6PyguKiknKVxuICAgICAgICBpZiAodGhpcy5hdHRycy5oYXNPd25Qcm9wZXJ0eShhdHRyKSAmJiBtKSB7XG4gICAgICAgICAgICBuYW1lc3BhY2VzW3RoaXMuYXR0cnNbYXR0cl1dID0gbVsxXVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBuYW1lc3BhY2VzXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLnNldEF0dHJzID0gZnVuY3Rpb24oYXR0cnMpIHtcbiAgICB0aGlzLmF0dHJzID0ge31cbiAgICBPYmplY3Qua2V5cyhhdHRycyB8fCB7fSkuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgdGhpcy5hdHRyc1trZXldID0gYXR0cnNba2V5XVxuICAgIH0sIHRoaXMpXG59XG5cbi8qKlxuICogeG1sbnMgY2FuIGJlIG51bGwsIHJldHVybnMgdGhlIG1hdGNoaW5nIGF0dHJpYnV0ZS5cbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldEF0dHIgPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIGlmICgheG1sbnMpXG4gICAgICAgIHJldHVybiB0aGlzLmF0dHJzW25hbWVdXG5cbiAgICB2YXIgbmFtZXNwYWNlcyA9IHRoaXMuZ2V0WG1sbnMoKVxuXG4gICAgaWYgKCFuYW1lc3BhY2VzW3htbG5zXSlcbiAgICAgICAgcmV0dXJuIG51bGxcblxuICAgIHJldHVybiB0aGlzLmF0dHJzW1tuYW1lc3BhY2VzW3htbG5zXSwgbmFtZV0uam9pbignOicpXVxufVxuXG4vKipcbiAqIHhtbG5zIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZCA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW4obmFtZSwgeG1sbnMpWzBdXG59XG5cbi8qKlxuICogeG1sbnMgY2FuIGJlIG51bGxcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkcmVuID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICB2YXIgcmVzdWx0ID0gW11cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBpZiAoY2hpbGQuZ2V0TmFtZSAmJlxuICAgICAgICAgICAgKGNoaWxkLmdldE5hbWUoKSA9PT0gbmFtZSkgJiZcbiAgICAgICAgICAgICgheG1sbnMgfHwgKGNoaWxkLmdldE5TKCkgPT09IHhtbG5zKSkpXG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZClcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG4vKipcbiAqIHhtbG5zIGFuZCByZWN1cnNpdmUgY2FuIGJlIG51bGxcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkQnlBdHRyID0gZnVuY3Rpb24oYXR0ciwgdmFsLCB4bWxucywgcmVjdXJzaXZlKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW5CeUF0dHIoYXR0ciwgdmFsLCB4bWxucywgcmVjdXJzaXZlKVswXVxufVxuXG4vKipcbiAqIHhtbG5zIGFuZCByZWN1cnNpdmUgY2FuIGJlIG51bGxcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkcmVuQnlBdHRyID0gZnVuY3Rpb24oYXR0ciwgdmFsLCB4bWxucywgcmVjdXJzaXZlKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKGNoaWxkLmF0dHJzICYmXG4gICAgICAgICAgICAoY2hpbGQuYXR0cnNbYXR0cl0gPT09IHZhbCkgJiZcbiAgICAgICAgICAgICgheG1sbnMgfHwgKGNoaWxkLmdldE5TKCkgPT09IHhtbG5zKSkpXG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZClcbiAgICAgICAgaWYgKHJlY3Vyc2l2ZSAmJiBjaGlsZC5nZXRDaGlsZHJlbkJ5QXR0cikge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQuZ2V0Q2hpbGRyZW5CeUF0dHIoYXR0ciwgdmFsLCB4bWxucywgdHJ1ZSkpXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlY3Vyc2l2ZSkgcmVzdWx0ID0gW10uY29uY2F0LmFwcGx5KFtdLCByZXN1bHQpXG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZHJlbkJ5RmlsdGVyID0gZnVuY3Rpb24oZmlsdGVyLCByZWN1cnNpdmUpIHtcbiAgICB2YXIgcmVzdWx0ID0gW11cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBpZiAoZmlsdGVyKGNoaWxkKSlcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkKVxuICAgICAgICBpZiAocmVjdXJzaXZlICYmIGNoaWxkLmdldENoaWxkcmVuQnlGaWx0ZXIpe1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQuZ2V0Q2hpbGRyZW5CeUZpbHRlcihmaWx0ZXIsIHRydWUpKVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZWN1cnNpdmUpIHtcbiAgICAgICAgcmVzdWx0ID0gW10uY29uY2F0LmFwcGx5KFtdLCByZXN1bHQpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuZ2V0VGV4dCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciB0ZXh0ID0gJydcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBpZiAoKHR5cGVvZiBjaGlsZCA9PT0gJ3N0cmluZycpIHx8ICh0eXBlb2YgY2hpbGQgPT09ICdudW1iZXInKSkge1xuICAgICAgICAgICAgdGV4dCArPSBjaGlsZFxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0ZXh0XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkVGV4dCA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgdmFyIGNoaWxkID0gdGhpcy5nZXRDaGlsZChuYW1lLCB4bWxucylcbiAgICByZXR1cm4gY2hpbGQgPyBjaGlsZC5nZXRUZXh0KCkgOiBudWxsXG59XG5cbi8qKlxuICogUmV0dXJuIGFsbCBkaXJlY3QgZGVzY2VuZGVudHMgdGhhdCBhcmUgRWxlbWVudHMuXG4gKiBUaGlzIGRpZmZlcnMgZnJvbSBgZ2V0Q2hpbGRyZW5gIGluIHRoYXQgaXQgd2lsbCBleGNsdWRlIHRleHQgbm9kZXMsXG4gKiBwcm9jZXNzaW5nIGluc3RydWN0aW9ucywgZXRjLlxuICovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZEVsZW1lbnRzID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW5CeUZpbHRlcihmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICByZXR1cm4gY2hpbGQgaW5zdGFuY2VvZiBFbGVtZW50XG4gICAgfSlcbn1cblxuLyoqKiBCdWlsZGVyICoqKi9cblxuLyoqIHJldHVybnMgdXBwZXJtb3N0IHBhcmVudCAqL1xuRWxlbWVudC5wcm90b3R5cGUucm9vdCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnBhcmVudClcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50LnJvb3QoKVxuICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIHRoaXNcbn1cbkVsZW1lbnQucHJvdG90eXBlLnRyZWUgPSBFbGVtZW50LnByb3RvdHlwZS5yb290XG5cbi8qKiBqdXN0IHBhcmVudCBvciBpdHNlbGYgKi9cbkVsZW1lbnQucHJvdG90eXBlLnVwID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMucGFyZW50KVxuICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnRcbiAgICBlbHNlXG4gICAgICAgIHJldHVybiB0aGlzXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLl9nZXRFbGVtZW50ID0gZnVuY3Rpb24obmFtZSwgYXR0cnMpIHtcbiAgICB2YXIgZWxlbWVudCA9IG5ldyBFbGVtZW50KG5hbWUsIGF0dHJzKVxuICAgIHJldHVybiBlbGVtZW50XG59XG5cbi8qKiBjcmVhdGUgY2hpbGQgbm9kZSBhbmQgcmV0dXJuIGl0ICovXG5FbGVtZW50LnByb3RvdHlwZS5jID0gZnVuY3Rpb24obmFtZSwgYXR0cnMpIHtcbiAgICByZXR1cm4gdGhpcy5jbm9kZSh0aGlzLl9nZXRFbGVtZW50KG5hbWUsIGF0dHJzKSlcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuY25vZGUgPSBmdW5jdGlvbihjaGlsZCkge1xuICAgIHRoaXMuY2hpbGRyZW4ucHVzaChjaGlsZClcbiAgICBjaGlsZC5wYXJlbnQgPSB0aGlzXG4gICAgcmV0dXJuIGNoaWxkXG59XG5cbi8qKiBhZGQgdGV4dCBub2RlIGFuZCByZXR1cm4gZWxlbWVudCAqL1xuRWxlbWVudC5wcm90b3R5cGUudCA9IGZ1bmN0aW9uKHRleHQpIHtcbiAgICB0aGlzLmNoaWxkcmVuLnB1c2godGV4dClcbiAgICByZXR1cm4gdGhpc1xufVxuXG4vKioqIE1hbmlwdWxhdGlvbiAqKiovXG5cbi8qKlxuICogRWl0aGVyOlxuICogICBlbC5yZW1vdmUoY2hpbGRFbClcbiAqICAgZWwucmVtb3ZlKCdhdXRob3InLCAndXJuOi4uLicpXG4gKi9cbkVsZW1lbnQucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKGVsLCB4bWxucykge1xuICAgIHZhciBmaWx0ZXJcbiAgICBpZiAodHlwZW9mIGVsID09PSAnc3RyaW5nJykge1xuICAgICAgICAvKiAxc3QgcGFyYW1ldGVyIGlzIHRhZyBuYW1lICovXG4gICAgICAgIGZpbHRlciA9IGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gIShjaGlsZC5pcyAmJlxuICAgICAgICAgICAgICAgICBjaGlsZC5pcyhlbCwgeG1sbnMpKVxuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLyogMXN0IHBhcmFtZXRlciBpcyBlbGVtZW50ICovXG4gICAgICAgIGZpbHRlciA9IGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gY2hpbGQgIT09IGVsXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLmNoaWxkcmVuID0gdGhpcy5jaGlsZHJlbi5maWx0ZXIoZmlsdGVyKVxuXG4gICAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBUbyB1c2UgaW4gY2FzZSB5b3Ugd2FudCB0aGUgc2FtZSBYTUwgZGF0YSBmb3Igc2VwYXJhdGUgdXNlcy5cbiAqIFBsZWFzZSByZWZyYWluIGZyb20gdGhpcyBwcmFjdGlzZSB1bmxlc3MgeW91IGtub3cgd2hhdCB5b3UgYXJlXG4gKiBkb2luZy4gQnVpbGRpbmcgWE1MIHdpdGggbHR4IGlzIGVhc3khXG4gKi9cbkVsZW1lbnQucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGNsb25lID0gdGhpcy5fZ2V0RWxlbWVudCh0aGlzLm5hbWUsIHRoaXMuYXR0cnMpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgY2xvbmUuY25vZGUoY2hpbGQuY2xvbmUgPyBjaGlsZC5jbG9uZSgpIDogY2hpbGQpXG4gICAgfVxuICAgIHJldHVybiBjbG9uZVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS50ZXh0ID0gZnVuY3Rpb24odmFsKSB7XG4gICAgaWYgKHZhbCAmJiB0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICB0aGlzLmNoaWxkcmVuWzBdID0gdmFsXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICAgIHJldHVybiB0aGlzLmdldFRleHQoKVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5hdHRyID0gZnVuY3Rpb24oYXR0ciwgdmFsKSB7XG4gICAgaWYgKCgodHlwZW9mIHZhbCAhPT0gJ3VuZGVmaW5lZCcpIHx8ICh2YWwgPT09IG51bGwpKSkge1xuICAgICAgICBpZiAoIXRoaXMuYXR0cnMpIHtcbiAgICAgICAgICAgIHRoaXMuYXR0cnMgPSB7fVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuYXR0cnNbYXR0cl0gPSB2YWxcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYXR0cnNbYXR0cl1cbn1cblxuLyoqKiBTZXJpYWxpemF0aW9uICoqKi9cblxuRWxlbWVudC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgcyA9ICcnXG4gICAgdGhpcy53cml0ZShmdW5jdGlvbihjKSB7XG4gICAgICAgIHMgKz0gY1xuICAgIH0pXG4gICAgcmV0dXJuIHNcbn1cblxuRWxlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbmFtZTogdGhpcy5uYW1lLFxuICAgICAgICBhdHRyczogdGhpcy5hdHRycyxcbiAgICAgICAgY2hpbGRyZW46IHRoaXMuY2hpbGRyZW4ubWFwKGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gY2hpbGQgJiYgY2hpbGQudG9KU09OID8gY2hpbGQudG9KU09OKCkgOiBjaGlsZFxuICAgICAgICB9KVxuICAgIH1cbn1cblxuRWxlbWVudC5wcm90b3R5cGUuX2FkZENoaWxkcmVuID0gZnVuY3Rpb24od3JpdGVyKSB7XG4gICAgd3JpdGVyKCc+JylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICAvKiBTa2lwIG51bGwvdW5kZWZpbmVkICovXG4gICAgICAgIGlmIChjaGlsZCB8fCAoY2hpbGQgPT09IDApKSB7XG4gICAgICAgICAgICBpZiAoY2hpbGQud3JpdGUpIHtcbiAgICAgICAgICAgICAgICBjaGlsZC53cml0ZSh3cml0ZXIpXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjaGlsZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICB3cml0ZXIoZXNjYXBlWG1sVGV4dChjaGlsZCkpXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoaWxkLnRvU3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgd3JpdGVyKGVzY2FwZVhtbFRleHQoY2hpbGQudG9TdHJpbmcoMTApKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICB3cml0ZXIoJzwvJylcbiAgICB3cml0ZXIodGhpcy5uYW1lKVxuICAgIHdyaXRlcignPicpXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24od3JpdGVyKSB7XG4gICAgd3JpdGVyKCc8JylcbiAgICB3cml0ZXIodGhpcy5uYW1lKVxuICAgIGZvciAodmFyIGsgaW4gdGhpcy5hdHRycykge1xuICAgICAgICB2YXIgdiA9IHRoaXMuYXR0cnNba11cbiAgICAgICAgaWYgKHYgfHwgKHYgPT09ICcnKSB8fCAodiA9PT0gMCkpIHtcbiAgICAgICAgICAgIHdyaXRlcignICcpXG4gICAgICAgICAgICB3cml0ZXIoaylcbiAgICAgICAgICAgIHdyaXRlcignPVwiJylcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdiAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICB2ID0gdi50b1N0cmluZygxMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHdyaXRlcihlc2NhcGVYbWwodikpXG4gICAgICAgICAgICB3cml0ZXIoJ1wiJylcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAodGhpcy5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcbiAgICAgICAgd3JpdGVyKCcvPicpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fYWRkQ2hpbGRyZW4od3JpdGVyKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZXNjYXBlWG1sKHMpIHtcbiAgICByZXR1cm4gcy5cbiAgICAgICAgcmVwbGFjZSgvXFwmL2csICcmYW1wOycpLlxuICAgICAgICByZXBsYWNlKC88L2csICcmbHQ7JykuXG4gICAgICAgIHJlcGxhY2UoLz4vZywgJyZndDsnKS5cbiAgICAgICAgcmVwbGFjZSgvXCIvZywgJyZxdW90OycpLlxuICAgICAgICByZXBsYWNlKC9cIi9nLCAnJmFwb3M7Jylcbn1cblxuZnVuY3Rpb24gZXNjYXBlWG1sVGV4dChzKSB7XG4gICAgcmV0dXJuIHMuXG4gICAgICAgIHJlcGxhY2UoL1xcJi9nLCAnJmFtcDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPC9nLCAnJmx0OycpLlxuICAgICAgICByZXBsYWNlKC8+L2csICcmZ3Q7Jylcbn1cblxuZXhwb3J0cy5FbGVtZW50ID0gRWxlbWVudFxuZXhwb3J0cy5lc2NhcGVYbWwgPSBlc2NhcGVYbWxcbiIsIid1c2Ugc3RyaWN0JztcblxuLyogQ2F1c2UgYnJvd3NlcmlmeSB0byBidW5kbGUgU0FYIHBhcnNlcnM6ICovXG52YXIgcGFyc2UgPSByZXF1aXJlKCcuL3BhcnNlJylcblxucGFyc2UuYXZhaWxhYmxlU2F4UGFyc2Vycy5wdXNoKHBhcnNlLmJlc3RTYXhQYXJzZXIgPSByZXF1aXJlKCcuL3NheC9zYXhfbHR4JykpXG5cbi8qIFNISU0gKi9cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9pbmRleCcpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcGFyc2UgPSByZXF1aXJlKCcuL3BhcnNlJylcblxuLyoqXG4gKiBUaGUgb25seSAocmVsZXZhbnQpIGRhdGEgc3RydWN0dXJlXG4gKi9cbmV4cG9ydHMuRWxlbWVudCA9IHJlcXVpcmUoJy4vZG9tLWVsZW1lbnQnKVxuXG4vKipcbiAqIEhlbHBlclxuICovXG5leHBvcnRzLmVzY2FwZVhtbCA9IHJlcXVpcmUoJy4vZWxlbWVudCcpLmVzY2FwZVhtbFxuXG4vKipcbiAqIERPTSBwYXJzZXIgaW50ZXJmYWNlXG4gKi9cbmV4cG9ydHMucGFyc2UgPSBwYXJzZS5wYXJzZVxuZXhwb3J0cy5QYXJzZXIgPSBwYXJzZS5QYXJzZXJcblxuLyoqXG4gKiBTQVggcGFyc2VyIGludGVyZmFjZVxuICovXG5leHBvcnRzLmF2YWlsYWJsZVNheFBhcnNlcnMgPSBwYXJzZS5hdmFpbGFibGVTYXhQYXJzZXJzXG5leHBvcnRzLmJlc3RTYXhQYXJzZXIgPSBwYXJzZS5iZXN0U2F4UGFyc2VyXG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBldmVudHMgPSByZXF1aXJlKCdldmVudHMnKVxuICAsIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBET01FbGVtZW50ID0gcmVxdWlyZSgnLi9kb20tZWxlbWVudCcpXG5cblxuZXhwb3J0cy5hdmFpbGFibGVTYXhQYXJzZXJzID0gW11cbmV4cG9ydHMuYmVzdFNheFBhcnNlciA9IG51bGxcblxudmFyIHNheFBhcnNlcnMgPSBbXG4gICAgJy4vc2F4L3NheF9leHBhdC5qcycsXG4gICAgJy4vc2F4L3NheF9sdHguanMnLFxuICAgIC8qJy4vc2F4X2Vhc3lzYXguanMnLCAnLi9zYXhfbm9kZS14bWwuanMnLCovXG4gICAgJy4vc2F4L3NheF9zYXhqcy5qcydcbl1cblxuc2F4UGFyc2Vycy5mb3JFYWNoKGZ1bmN0aW9uKG1vZE5hbWUpIHtcbiAgICB2YXIgbW9kXG4gICAgdHJ5IHtcbiAgICAgICAgbW9kID0gcmVxdWlyZShtb2ROYW1lKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLyogU2lsZW50bHkgbWlzc2luZyBsaWJyYXJpZXMgZHJvcCBmb3IgZGVidWc6XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZS5zdGFjayB8fCBlKVxuICAgICAgICAgKi9cbiAgICB9XG4gICAgaWYgKG1vZCkge1xuICAgICAgICBleHBvcnRzLmF2YWlsYWJsZVNheFBhcnNlcnMucHVzaChtb2QpXG4gICAgICAgIGlmICghZXhwb3J0cy5iZXN0U2F4UGFyc2VyKSB7XG4gICAgICAgICAgICBleHBvcnRzLmJlc3RTYXhQYXJzZXIgPSBtb2RcbiAgICAgICAgfVxuICAgIH1cbn0pXG5cbmV4cG9ydHMuUGFyc2VyID0gZnVuY3Rpb24oc2F4UGFyc2VyKSB7XG4gICAgZXZlbnRzLkV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG4gICAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgICB2YXIgUGFyc2VyTW9kID0gc2F4UGFyc2VyIHx8IGV4cG9ydHMuYmVzdFNheFBhcnNlclxuICAgIGlmICghUGFyc2VyTW9kKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gU0FYIHBhcnNlciBhdmFpbGFibGUnKVxuICAgIH1cbiAgICB0aGlzLnBhcnNlciA9IG5ldyBQYXJzZXJNb2QoKVxuXG4gICAgdmFyIGVsXG4gICAgdGhpcy5wYXJzZXIuYWRkTGlzdGVuZXIoJ3N0YXJ0RWxlbWVudCcsIGZ1bmN0aW9uKG5hbWUsIGF0dHJzKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IG5ldyBET01FbGVtZW50KG5hbWUsIGF0dHJzKVxuICAgICAgICBpZiAoIWVsKSB7XG4gICAgICAgICAgICBlbCA9IGNoaWxkXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbCA9IGVsLmNub2RlKGNoaWxkKVxuICAgICAgICB9XG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5hZGRMaXN0ZW5lcignZW5kRWxlbWVudCcsIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgLyoganNoaW50IC1XMDM1ICovXG4gICAgICAgIGlmICghZWwpIHtcbiAgICAgICAgICAgIC8qIEVyciAqL1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09IGVsLm5hbWUpIHtcbiAgICAgICAgICAgIGlmIChlbC5wYXJlbnQpIHtcbiAgICAgICAgICAgICAgICBlbCA9IGVsLnBhcmVudFxuICAgICAgICAgICAgfSBlbHNlIGlmICghc2VsZi50cmVlKSB7XG4gICAgICAgICAgICAgICAgc2VsZi50cmVlID0gZWxcbiAgICAgICAgICAgICAgICBlbCA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8qIGpzaGludCArVzAzNSAqL1xuICAgIH0pXG4gICAgdGhpcy5wYXJzZXIuYWRkTGlzdGVuZXIoJ3RleHQnLCBmdW5jdGlvbihzdHIpIHtcbiAgICAgICAgaWYgKGVsKSB7XG4gICAgICAgICAgICBlbC50KHN0cilcbiAgICAgICAgfVxuICAgIH0pXG4gICAgdGhpcy5wYXJzZXIuYWRkTGlzdGVuZXIoJ2Vycm9yJywgZnVuY3Rpb24oZSkge1xuICAgICAgICBzZWxmLmVycm9yID0gZVxuICAgICAgICBzZWxmLmVtaXQoJ2Vycm9yJywgZSlcbiAgICB9KVxufVxuXG51dGlsLmluaGVyaXRzKGV4cG9ydHMuUGFyc2VyLCBldmVudHMuRXZlbnRFbWl0dGVyKVxuXG5leHBvcnRzLlBhcnNlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgdGhpcy5wYXJzZXIud3JpdGUoZGF0YSlcbn1cblxuZXhwb3J0cy5QYXJzZXIucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICB0aGlzLnBhcnNlci5lbmQoZGF0YSlcblxuICAgIGlmICghdGhpcy5lcnJvcikge1xuICAgICAgICBpZiAodGhpcy50cmVlKSB7XG4gICAgICAgICAgICB0aGlzLmVtaXQoJ3RyZWUnLCB0aGlzLnRyZWUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKCdJbmNvbXBsZXRlIGRvY3VtZW50JykpXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbihkYXRhLCBzYXhQYXJzZXIpIHtcbiAgICB2YXIgcCA9IG5ldyBleHBvcnRzLlBhcnNlcihzYXhQYXJzZXIpXG4gICAgdmFyIHJlc3VsdCA9IG51bGxcbiAgICAgICwgZXJyb3IgPSBudWxsXG5cbiAgICBwLm9uKCd0cmVlJywgZnVuY3Rpb24odHJlZSkge1xuICAgICAgICByZXN1bHQgPSB0cmVlXG4gICAgfSlcbiAgICBwLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgZXJyb3IgPSBlXG4gICAgfSlcblxuICAgIHAud3JpdGUoZGF0YSlcbiAgICBwLmVuZCgpXG5cbiAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgdGhyb3cgZXJyb3JcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIGV2ZW50cyA9IHJlcXVpcmUoJ2V2ZW50cycpXG5cbnZhciBTVEFURV9URVhUID0gMCxcbiAgICBTVEFURV9JR05PUkVfVEFHID0gMSxcbiAgICBTVEFURV9UQUdfTkFNRSA9IDIsXG4gICAgU1RBVEVfVEFHID0gMyxcbiAgICBTVEFURV9BVFRSX05BTUUgPSA0LFxuICAgIFNUQVRFX0FUVFJfRVEgPSA1LFxuICAgIFNUQVRFX0FUVFJfUVVPVCA9IDYsXG4gICAgU1RBVEVfQVRUUl9WQUxVRSA9IDdcblxudmFyIFNheEx0eCA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gU2F4THR4KCkge1xuICAgIGV2ZW50cy5FdmVudEVtaXR0ZXIuY2FsbCh0aGlzKVxuXG4gICAgdmFyIHN0YXRlID0gU1RBVEVfVEVYVCwgcmVtYWluZGVyXG4gICAgdmFyIHRhZ05hbWUsIGF0dHJzLCBlbmRUYWcsIHNlbGZDbG9zaW5nLCBhdHRyUXVvdGVcbiAgICB2YXIgcmVjb3JkU3RhcnQgPSAwXG4gICAgdmFyIGF0dHJOYW1lXG5cbiAgICB0aGlzLl9oYW5kbGVUYWdPcGVuaW5nID0gZnVuY3Rpb24oZW5kVGFnLCB0YWdOYW1lLCBhdHRycykge1xuICAgICAgICBpZiAoIWVuZFRhZykge1xuICAgICAgICAgICAgdGhpcy5lbWl0KCdzdGFydEVsZW1lbnQnLCB0YWdOYW1lLCBhdHRycylcbiAgICAgICAgICAgIGlmIChzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgnZW5kRWxlbWVudCcsIHRhZ05hbWUpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2VuZEVsZW1lbnQnLCB0YWdOYW1lKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy53cml0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgLyoganNoaW50IC1XMDcxICovXG4gICAgICAgIC8qIGpzaGludCAtVzA3NCAqL1xuICAgICAgICBpZiAodHlwZW9mIGRhdGEgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBkYXRhID0gZGF0YS50b1N0cmluZygpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHBvcyA9IDBcblxuICAgICAgICAvKiBBbnl0aGluZyBmcm9tIHByZXZpb3VzIHdyaXRlKCk/ICovXG4gICAgICAgIGlmIChyZW1haW5kZXIpIHtcbiAgICAgICAgICAgIGRhdGEgPSByZW1haW5kZXIgKyBkYXRhXG4gICAgICAgICAgICBwb3MgKz0gcmVtYWluZGVyLmxlbmd0aFxuICAgICAgICAgICAgcmVtYWluZGVyID0gbnVsbFxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZW5kUmVjb3JkaW5nKCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiByZWNvcmRTdGFydCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVjb3JkZWQgPSBkYXRhLnNsaWNlKHJlY29yZFN0YXJ0LCBwb3MpXG4gICAgICAgICAgICAgICAgcmVjb3JkU3RhcnQgPSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkZWRcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvcig7IHBvcyA8IGRhdGEubGVuZ3RoOyBwb3MrKykge1xuICAgICAgICAgICAgdmFyIGMgPSBkYXRhLmNoYXJDb2RlQXQocG9zKVxuICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhcInN0YXRlXCIsIHN0YXRlLCBcImNcIiwgYywgZGF0YVtwb3NdKVxuICAgICAgICAgICAgc3dpdGNoKHN0YXRlKSB7XG4gICAgICAgICAgICBjYXNlIFNUQVRFX1RFWFQ6XG4gICAgICAgICAgICAgICAgaWYgKGMgPT09IDYwIC8qIDwgKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRleHQgPSBlbmRSZWNvcmRpbmcoKVxuICAgICAgICAgICAgICAgICAgICBpZiAodGV4dCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KCd0ZXh0JywgdW5lc2NhcGVYbWwodGV4dCkpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9UQUdfTkFNRVxuICAgICAgICAgICAgICAgICAgICByZWNvcmRTdGFydCA9IHBvcyArIDFcbiAgICAgICAgICAgICAgICAgICAgYXR0cnMgPSB7fVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBTVEFURV9UQUdfTkFNRTpcbiAgICAgICAgICAgICAgICBpZiAoYyA9PT0gNDcgLyogLyAqLyAmJiByZWNvcmRTdGFydCA9PT0gcG9zKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gcG9zICsgMVxuICAgICAgICAgICAgICAgICAgICBlbmRUYWcgPSB0cnVlXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjID09PSAzMyAvKiAhICovIHx8IGMgPT09IDYzIC8qID8gKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkU3RhcnQgPSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9JR05PUkVfVEFHXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjIDw9IDMyIHx8IGMgPT09IDQ3IC8qIC8gKi8gfHwgYyA9PT0gNjIgLyogPiAqLykge1xuICAgICAgICAgICAgICAgICAgICB0YWdOYW1lID0gZW5kUmVjb3JkaW5nKClcbiAgICAgICAgICAgICAgICAgICAgcG9zLS1cbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9UQUdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgU1RBVEVfSUdOT1JFX1RBRzpcbiAgICAgICAgICAgICAgICBpZiAoYyA9PT0gNjIgLyogPiAqLykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX1RFWFRcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgU1RBVEVfVEFHOlxuICAgICAgICAgICAgICAgIGlmIChjID09PSA2MiAvKiA+ICovKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2hhbmRsZVRhZ09wZW5pbmcoZW5kVGFnLCB0YWdOYW1lLCBhdHRycylcbiAgICAgICAgICAgICAgICAgICAgdGFnTmFtZSA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICBhdHRycyA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICBlbmRUYWcgPSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgc2VsZkNsb3NpbmcgPSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9URVhUXG4gICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gcG9zICsgMVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PT0gNDcgLyogLyAqLykge1xuICAgICAgICAgICAgICAgICAgICBzZWxmQ2xvc2luZyA9IHRydWVcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGMgPiAzMikge1xuICAgICAgICAgICAgICAgICAgICByZWNvcmRTdGFydCA9IHBvc1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX0FUVFJfTkFNRVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBTVEFURV9BVFRSX05BTUU6XG4gICAgICAgICAgICAgICAgaWYgKGMgPD0gMzIgfHwgYyA9PT0gNjEgLyogPSAqLykge1xuICAgICAgICAgICAgICAgICAgICBhdHRyTmFtZSA9IGVuZFJlY29yZGluZygpXG4gICAgICAgICAgICAgICAgICAgIHBvcy0tXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfQVRUUl9FUVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBTVEFURV9BVFRSX0VROlxuICAgICAgICAgICAgICAgIGlmIChjID09PSA2MSAvKiA9ICovKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfQVRUUl9RVU9UXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlIFNUQVRFX0FUVFJfUVVPVDpcbiAgICAgICAgICAgICAgICBpZiAoYyA9PT0gMzQgLyogXCIgKi8gfHwgYyA9PT0gMzkgLyogJyAqLykge1xuICAgICAgICAgICAgICAgICAgICBhdHRyUXVvdGUgPSBjXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfQVRUUl9WQUxVRVxuICAgICAgICAgICAgICAgICAgICByZWNvcmRTdGFydCA9IHBvcyArIDFcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgU1RBVEVfQVRUUl9WQUxVRTpcbiAgICAgICAgICAgICAgICBpZiAoYyA9PT0gYXR0clF1b3RlKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHVuZXNjYXBlWG1sKGVuZFJlY29yZGluZygpKVxuICAgICAgICAgICAgICAgICAgICBhdHRyc1thdHRyTmFtZV0gPSB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICBhdHRyTmFtZSA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX1RBR1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiByZWNvcmRTdGFydCA9PT0gJ251bWJlcicgJiZcbiAgICAgICAgICAgIHJlY29yZFN0YXJ0IDw9IGRhdGEubGVuZ3RoKSB7XG5cbiAgICAgICAgICAgIHJlbWFpbmRlciA9IGRhdGEuc2xpY2UocmVjb3JkU3RhcnQpXG4gICAgICAgICAgICByZWNvcmRTdGFydCA9IDBcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qdmFyIG9yaWdFbWl0ID0gdGhpcy5lbWl0XG4gICAgdGhpcy5lbWl0ID0gZnVuY3Rpb24oKSB7XG4gICAgY29uc29sZS5sb2coJ2x0eCcsIGFyZ3VtZW50cylcbiAgICBvcmlnRW1pdC5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgfSovXG59XG51dGlsLmluaGVyaXRzKFNheEx0eCwgZXZlbnRzLkV2ZW50RW1pdHRlcilcblxuXG5TYXhMdHgucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICBpZiAoZGF0YSkge1xuICAgICAgICB0aGlzLndyaXRlKGRhdGEpXG4gICAgfVxuXG4gICAgLyogVWgsIHllYWggKi9cbiAgICB0aGlzLndyaXRlID0gZnVuY3Rpb24oKSB7fVxufVxuXG5mdW5jdGlvbiB1bmVzY2FwZVhtbChzKSB7XG4gICAgcmV0dXJuIHMuXG4gICAgICAgIHJlcGxhY2UoL1xcJihhbXB8IzM4KTsvZywgJyYnKS5cbiAgICAgICAgcmVwbGFjZSgvXFwmKGx0fCM2MCk7L2csICc8JykuXG4gICAgICAgIHJlcGxhY2UoL1xcJihndHwjNjIpOy9nLCAnPicpLlxuICAgICAgICByZXBsYWNlKC9cXCYocXVvdHwjMzQpOy9nLCAnXCInKS5cbiAgICAgICAgcmVwbGFjZSgvXFwmKGFwb3N8IzM5KTsvZywgJ1xcJycpLlxuICAgICAgICByZXBsYWNlKC9cXCYobmJzcHwjMTYwKTsvZywgJ1xcbicpXG59XG4iLCIoZnVuY3Rpb24gKF9fZGlybmFtZSl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBTZXNzaW9uID0gcmVxdWlyZSgnLi9saWIvc2Vzc2lvbicpXG4gICwgQ29ubmVjdGlvbiA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykuQ29ubmVjdGlvblxuICAsIEpJRCA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykuSklEXG4gICwgU3RhbnphID0gcmVxdWlyZSAoJ25vZGUteG1wcC1jb3JlJykuU3RhbnphXG4gICwgc2FzbCA9IHJlcXVpcmUoJy4vbGliL3Nhc2wnKVxuICAsIEFub255bW91cyA9IHJlcXVpcmUoJy4vbGliL2F1dGhlbnRpY2F0aW9uL2Fub255bW91cycpXG4gICwgUGxhaW4gPSByZXF1aXJlKCcuL2xpYi9hdXRoZW50aWNhdGlvbi9wbGFpbicpXG4gICwgRGlnZXN0TUQ1ID0gcmVxdWlyZSgnLi9saWIvYXV0aGVudGljYXRpb24vZGlnZXN0bWQ1JylcbiAgLCBYT0F1dGgyID0gcmVxdWlyZSgnLi9saWIvYXV0aGVudGljYXRpb24veG9hdXRoMicpXG4gICwgWEZhY2Vib29rUGxhdGZvcm0gPSByZXF1aXJlKCcuL2xpYi9hdXRoZW50aWNhdGlvbi94ZmFjZWJvb2snKVxuICAsIEV4dGVybmFsID0gcmVxdWlyZSgnLi9saWIvYXV0aGVudGljYXRpb24vZXh0ZXJuYWwnKVxuICAsIGV4ZWMgPSByZXF1aXJlKCdjaGlsZF9wcm9jZXNzJykuZXhlY1xuICAsIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3htcHA6Y2xpZW50JylcbiAgLCBsdHggPSByZXF1aXJlKCdub2RlLXhtcHAtY29yZScpLmx0eFxuXG52YXIgTlNfQ0xJRU5UID0gJ2phYmJlcjpjbGllbnQnXG52YXIgTlNfUkVHSVNURVIgPSAnamFiYmVyOmlxOnJlZ2lzdGVyJ1xudmFyIE5TX1hNUFBfU0FTTCA9ICd1cm46aWV0ZjpwYXJhbXM6eG1sOm5zOnhtcHAtc2FzbCdcbnZhciBOU19YTVBQX0JJTkQgPSAndXJuOmlldGY6cGFyYW1zOnhtbDpuczp4bXBwLWJpbmQnXG52YXIgTlNfWE1QUF9TRVNTSU9OID0gJ3VybjppZXRmOnBhcmFtczp4bWw6bnM6eG1wcC1zZXNzaW9uJ1xuXG52YXIgU1RBVEVfUFJFQVVUSCA9IDBcbiAgLCBTVEFURV9BVVRIID0gMVxuICAsIFNUQVRFX0FVVEhFRCA9IDJcbiAgLCBTVEFURV9CSU5EID0gM1xuICAsIFNUQVRFX1NFU1NJT04gPSA0XG4gICwgU1RBVEVfT05MSU5FID0gNVxuXG52YXIgSVFJRF9TRVNTSU9OID0gJ3Nlc3MnXG4gICwgSVFJRF9CSU5EID0gJ2JpbmQnXG5cbi8qIGpzaGludCBsYXRlZGVmOiBmYWxzZSAqL1xuLyoganNoaW50IC1XMDc5ICovXG4vKiBqc2hpbnQgLVcwMjAgKi9cbnZhciBkZWNvZGU2NCwgZW5jb2RlNjQsIEJ1ZmZlclxuaWYgKHR5cGVvZiBidG9hID09PSAndW5kZWZpbmVkJykge1xuICAgIHZhciBidG9hID0gbnVsbFxuICAgIHZhciBhdG9iID0gbnVsbFxufVxuXG5pZiAodHlwZW9mIGJ0b2EgPT09ICdmdW5jdGlvbicpIHtcbiAgICBkZWNvZGU2NCA9IGZ1bmN0aW9uKGVuY29kZWQpIHtcbiAgICAgICAgcmV0dXJuIGF0b2IoZW5jb2RlZClcbiAgICB9XG59IGVsc2Uge1xuICAgIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlclxuICAgIGRlY29kZTY0ID0gZnVuY3Rpb24oZW5jb2RlZCkge1xuICAgICAgICByZXR1cm4gKG5ldyBCdWZmZXIoZW5jb2RlZCwgJ2Jhc2U2NCcpKS50b1N0cmluZygndXRmOCcpXG4gICAgfVxufVxuaWYgKHR5cGVvZiBhdG9iID09PSAnZnVuY3Rpb24nKSB7XG4gICAgZW5jb2RlNjQgPSBmdW5jdGlvbihkZWNvZGVkKSB7XG4gICAgICAgIHJldHVybiBidG9hKGRlY29kZWQpXG4gICAgfVxufSBlbHNlIHtcbiAgICBCdWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5CdWZmZXJcbiAgICBlbmNvZGU2NCA9IGZ1bmN0aW9uKGRlY29kZWQpIHtcbiAgICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKGRlY29kZWQsICd1dGY4JykpLnRvU3RyaW5nKCdiYXNlNjQnKVxuICAgIH1cbn1cblxuLyoqXG4gKiBwYXJhbXMgb2JqZWN0OlxuICogICBqaWQ6IFN0cmluZyAocmVxdWlyZWQpXG4gKiAgIHBhc3N3b3JkOiBTdHJpbmcgKHJlcXVpcmVkKVxuICogICBob3N0OiBTdHJpbmcgKG9wdGlvbmFsKVxuICogICBwb3J0OiBOdW1iZXIgKG9wdGlvbmFsKVxuICogICByZWNvbm5lY3Q6IEJvb2xlYW4gKG9wdGlvbmFsKVxuICogICBhdXRvc3RhcnQ6IEJvb2xlYW4gKG9wdGlvbmFsKSAtIGlmIHdlIHN0YXJ0IGNvbm5lY3RpbmcgdG8gYSBnaXZlbiBwb3J0XG4gKiAgIHJlZ2lzdGVyOiBCb29sZWFuIChvcHRpb24pIC0gcmVnaXN0ZXIgYWNjb3VudCBiZWZvcmUgYXV0aGVudGljYXRpb25cbiAqICAgbGVnYWN5U1NMOiBCb29sZWFuIChvcHRpb25hbCkgLSBjb25uZWN0IHRvIHRoZSBsZWdhY3kgU1NMIHBvcnQsIHJlcXVpcmVzIGF0IGxlYXN0IHRoZSBob3N0IHRvIGJlIHNwZWNpZmllZFxuICogICBjcmVkZW50aWFsczogRGljdGlvbmFyeSAob3B0aW9uYWwpIC0gVExTIG9yIFNTTCBrZXkgYW5kIGNlcnRpZmljYXRlIGNyZWRlbnRpYWxzXG4gKiAgIGFjdEFzOiBTdHJpbmcgKG9wdGlvbmFsKSAtIGlmIGFkbWluIHVzZXIgYWN0IG9uIGJlaGFsZiBvZiBhbm90aGVyIHVzZXIgKGp1c3QgdXNlcilcbiAqICAgZGlzYWxsb3dUTFM6IEJvb2xlYW4gKG9wdGlvbmFsKSAtIHByZXZlbnQgdXBncmFkaW5nIHRoZSBjb25uZWN0aW9uIHRvIGEgc2VjdXJlIG9uZSB2aWEgVExTXG4gKiAgIHByZWZlcnJlZDogU3RyaW5nIChvcHRpb25hbCkgLSBQcmVmZXJyZWQgU0FTTCBtZWNoYW5pc20gdG8gdXNlXG4gKiAgIGJvc2gudXJsOiBTdHJpbmcgKG9wdGlvbmFsKSAtIEJPU0ggZW5kcG9pbnQgdG8gdXNlXG4gKiAgIGJvc2gucHJlYmluZDogRnVuY3Rpb24oZXJyb3IsIGRhdGEpIChvcHRpb25hbCkgLSBKdXN0IHByZWJpbmQgYSBuZXcgQk9TSCBzZXNzaW9uIGZvciBicm93c2VyIGNsaWVudCB1c2VcbiAqICAgICAgICAgICAgZXJyb3IgU3RyaW5nIC0gUmVzdWx0IG9mIFhNUFAgZXJyb3IuIEV4IDogW0Vycm9yOiBYTVBQIGF1dGhlbnRpY2F0aW9uIGZhaWx1cmVdXG4gKiAgICAgICAgICAgIGRhdGEgT2JqZWN0IC0gUmVzdWx0IG9mIFhNUFAgQk9TSCBjb25uZWN0aW9uLlxuICpcbiAqIEV4YW1wbGVzOlxuICogICB2YXIgY2wgPSBuZXcgeG1wcC5DbGllbnQoe1xuICogICAgICAgamlkOiBcIm1lQGV4YW1wbGUuY29tXCIsXG4gKiAgICAgICBwYXNzd29yZDogXCJzZWNyZXRcIlxuICogICB9KVxuICogICB2YXIgZmFjZWJvb2sgPSBuZXcgeG1wcC5DbGllbnQoe1xuICogICAgICAgamlkOiAnLScgKyBmYlVJRCArICdAY2hhdC5mYWNlYm9vay5jb20nLFxuICogICAgICAgYXBpX2tleTogJzU0MzIxJywgLy8gYXBpIGtleSBvZiB5b3VyIGZhY2Vib29rIGFwcFxuICogICAgICAgYWNjZXNzX3Rva2VuOiAnYWJjZGVmZycsIC8vIHVzZXIgYWNjZXNzIHRva2VuXG4gKiAgICAgICBob3N0OiAnY2hhdC5mYWNlYm9vay5jb20nXG4gKiAgIH0pXG4gKiAgIHZhciBndGFsayA9IG5ldyB4bXBwLkNsaWVudCh7XG4gKiAgICAgICBqaWQ6ICdtZUBnbWFpbC5jb20nLFxuICogICAgICAgb2F1dGgyX3Rva2VuOiAneHh4eC54eHh4eHh4eHh4eCcsIC8vIGZyb20gT0F1dGgyXG4gKiAgICAgICBvYXV0aDJfYXV0aDogJ2h0dHA6Ly93d3cuZ29vZ2xlLmNvbS90YWxrL3Byb3RvY29sL2F1dGgnLFxuICogICAgICAgaG9zdDogJ3RhbGsuZ29vZ2xlLmNvbSdcbiAqICAgfSlcbiAqICAgdmFyIHByZWJpbmQgPSBuZXcgeG1wcC5DbGllbnQoe1xuICogICAgICAgamlkOiBcIm1lQGV4YW1wbGUuY29tXCIsXG4gKiAgICAgICBwYXNzd29yZDogXCJzZWNyZXRcIixcbiAqICAgICAgIGJvc2g6IHtcbiAqICAgICAgICAgICB1cmw6IFwiaHR0cDovL2V4YW1wbGUuY29tL2h0dHAtYmluZFwiLFxuICogICAgICAgICAgIHByZWJpbmQ6IGZ1bmN0aW9uKGVycm9yLCBkYXRhKSB7XG4gKiAgICAgICAgICAgICAgIGlmIChlcnJvcikge31cbiAqICAgICAgICAgICAgICAgcmVzLnNlbmQoeyByaWQ6IGRhdGEucmlkLCBzaWQ6IGRhdGEuc2lkIH0pXG4gKiAgICAgICAgICAgfVxuICogICAgICAgfVxuICogICB9KVxuICpcbiAqIEV4YW1wbGUgU0FTTCBFWFRFUk5BTDpcbiAqXG4gKiB2YXIgbXlDcmVkZW50aWFscyA9IHtcbiAqICAgLy8gVGhlc2UgYXJlIG5lY2Vzc2FyeSBvbmx5IGlmIHVzaW5nIHRoZSBjbGllbnQgY2VydGlmaWNhdGUgYXV0aGVudGljYXRpb25cbiAqICAga2V5OiBmcy5yZWFkRmlsZVN5bmMoJ2tleS5wZW0nKSxcbiAqICAgY2VydDogZnMucmVhZEZpbGVTeW5jKCdjZXJ0LnBlbScpLFxuICogICAvLyBwYXNzcGhyYXNlOiAnb3B0aW9uYWwnXG4gKiB9XG4gKiB2YXIgY2wgPSBuZXcgeG1wcENsaWVudCh7XG4gKiAgICAgamlkOiBcIm1lQGV4YW1wbGUuY29tXCIsXG4gKiAgICAgY3JlZGVudGlhbHM6IG15Q3JlZGVudGlhbHNcbiAqICAgICBwcmVmZXJyZWQ6ICdFWFRFUk5BTCcgLy8gbm90IHJlYWxseSByZXF1aXJlZCwgYnV0IHBvc3NpYmxlXG4gKiB9KVxuICpcbiAqL1xuZnVuY3Rpb24gQ2xpZW50KG9wdGlvbnMpIHtcbiAgICB0aGlzLm9wdGlvbnMgPSB7fVxuICAgIGlmIChvcHRpb25zKSB0aGlzLm9wdGlvbnMgPSBvcHRpb25zXG4gICAgdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcyA9IFtcbiAgICAgICAgWE9BdXRoMiwgWEZhY2Vib29rUGxhdGZvcm0sIEV4dGVybmFsLCBEaWdlc3RNRDUsIFBsYWluLCBBbm9ueW1vdXNcbiAgICBdXG5cbiAgICBpZiAodGhpcy5vcHRpb25zLmF1dG9zdGFydCAhPT0gZmFsc2UpXG4gICAgICAgIHRoaXMuY29ubmVjdCgpXG59XG5cbnV0aWwuaW5oZXJpdHMoQ2xpZW50LCBTZXNzaW9uKVxuXG5DbGllbnQuTlNfQ0xJRU5UID0gTlNfQ0xJRU5UXG5cbkNsaWVudC5wcm90b3R5cGUuY29ubmVjdCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLm9wdGlvbnMuYm9zaCAmJiB0aGlzLm9wdGlvbnMuYm9zaC5wcmViaW5kKSB7XG4gICAgICAgIGRlYnVnKCdsb2FkIGJvc2ggcHJlYmluZCcpXG4gICAgICAgIHZhciBjYiA9IHRoaXMub3B0aW9ucy5ib3NoLnByZWJpbmRcbiAgICAgICAgZGVsZXRlIHRoaXMub3B0aW9ucy5ib3NoLnByZWJpbmRcbiAgICAgICAgdmFyIGNtZCA9ICdub2RlICcgKyBfX2Rpcm5hbWUgK1xuICAgICAgICAgICAgJy9saWIvcHJlYmluZC5qcyAnXG4gICAgICAgIGRlbGV0ZSB0aGlzLm9wdGlvbnMuYm9zaC5wcmViaW5kXG4gICAgICAgIGNtZCArPSBlbmNvZGVVUkkoSlNPTi5zdHJpbmdpZnkodGhpcy5vcHRpb25zKSlcbiAgICAgICAgZXhlYyhcbiAgICAgICAgICAgIGNtZCxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgY2IoZXJyb3IsIG51bGwpXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHIgPSBzdGRvdXQubWF0Y2goL3JpZDorWyAwLTldKi9pKVxuICAgICAgICAgICAgICAgICAgICByID0gKHJbMF0uc3BsaXQoJzonKSlbMV0udHJpbSgpXG4gICAgICAgICAgICAgICAgICAgIHZhciBzID0gc3Rkb3V0Lm1hdGNoKC9zaWQ6K1sgYS16KydcIi1fQS1aKzAtOV0qL2kpXG4gICAgICAgICAgICAgICAgICAgIHMgPSAoc1swXS5zcGxpdCgnOicpKVsxXVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoJ1xcJycsJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgnXFwnJywnJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC50cmltKClcbiAgICAgICAgICAgICAgICAgICAgaWYgKHIgJiYgcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKG51bGwsIHsgcmlkOiByLCBzaWQ6IHMgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYihzdGRlcnIpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5vcHRpb25zLnhtbG5zID0gTlNfQ0xJRU5UXG4gICAgICAgIC8qIGpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgICAgIGRlbGV0ZSB0aGlzLmRpZF9iaW5kXG4gICAgICAgIGRlbGV0ZSB0aGlzLmRpZF9zZXNzaW9uXG5cbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX1BSRUFVVEhcbiAgICAgICAgdGhpcy5vbignZW5kJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfUFJFQVVUSFxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuZGlkX2JpbmRcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmRpZF9zZXNzaW9uXG4gICAgICAgIH0pXG5cbiAgICAgICAgU2Vzc2lvbi5jYWxsKHRoaXMsIHRoaXMub3B0aW9ucylcbiAgICAgICAgdGhpcy5vcHRpb25zLmppZCA9IHRoaXMuamlkXG5cbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLm9uKCdkaXNjb25uZWN0JywgZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9QUkVBVVRIXG4gICAgICAgICAgICBpZiAoIXRoaXMuY29ubmVjdGlvbi5yZWNvbm5lY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHRoaXMuZW1pdCgnZXJyb3InLCBlcnJvcilcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoJ29mZmxpbmUnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuZGlkX2JpbmRcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmRpZF9zZXNzaW9uXG4gICAgICAgIH0uYmluZCh0aGlzKSlcblxuICAgICAgICAvLyBJZiBzZXJ2ZXIgYW5kIGNsaWVudCBoYXZlIG11bHRpcGxlIHBvc3NpYmxlIGF1dGggbWVjaGFuaXNtc1xuICAgICAgICAvLyB3ZSB0cnkgdG8gc2VsZWN0IHRoZSBwcmVmZXJyZWQgb25lXG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMucHJlZmVycmVkKSB7XG4gICAgICAgICAgICB0aGlzLnByZWZlcnJlZFNhc2xNZWNoYW5pc20gPSB0aGlzLm9wdGlvbnMucHJlZmVycmVkXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnByZWZlcnJlZFNhc2xNZWNoYW5pc20gPSAnRElHRVNULU1ENSdcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBtZWNocyA9IHNhc2wuZGV0ZWN0TWVjaGFuaXNtcyh0aGlzLm9wdGlvbnMsIHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMpXG4gICAgICAgIHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMgPSBtZWNoc1xuICAgIH1cbn1cblxuQ2xpZW50LnByb3RvdHlwZS5vblN0YW56YSA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIC8qIEFjdHVhbGx5LCB3ZSBzaG91bGRuJ3Qgd2FpdCBmb3IgPHN0cmVhbTpmZWF0dXJlcy8+IGlmXG4gICAgICAgdGhpcy5zdHJlYW1BdHRycy52ZXJzaW9uIGlzIG1pc3NpbmcsIGJ1dCB3aG8gdXNlcyBwcmUtWE1QUC0xLjBcbiAgICAgICB0aGVzZSBkYXlzIGFueXdheT8gKi9cbiAgICBpZiAoKHRoaXMuc3RhdGUgIT09IFNUQVRFX09OTElORSkgJiYgc3RhbnphLmlzKCdmZWF0dXJlcycpKSB7XG4gICAgICAgIHRoaXMuc3RyZWFtRmVhdHVyZXMgPSBzdGFuemFcbiAgICAgICAgdGhpcy51c2VGZWF0dXJlcygpXG4gICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBTVEFURV9QUkVBVVRIKSB7XG4gICAgICAgIHRoaXMuZW1pdCgnc3RhbnphOnByZWF1dGgnLCBzdGFuemEpXG4gICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBTVEFURV9BVVRIKSB7XG4gICAgICAgIHRoaXMuX2hhbmRsZUF1dGhTdGF0ZShzdGFuemEpXG4gICAgfSBlbHNlIGlmICgodGhpcy5zdGF0ZSA9PT0gU1RBVEVfQklORCkgJiYgc3RhbnphLmlzKCdpcScpICYmIChzdGFuemEuYXR0cnMuaWQgPT09IElRSURfQklORCkpIHtcbiAgICAgICAgdGhpcy5faGFuZGxlQmluZFN0YXRlKHN0YW56YSlcbiAgICB9IGVsc2UgaWYgKCh0aGlzLnN0YXRlID09PSBTVEFURV9TRVNTSU9OKSAmJiAodHJ1ZSA9PT0gc3RhbnphLmlzKCdpcScpKSAmJlxuICAgICAgICAoc3RhbnphLmF0dHJzLmlkID09PSBJUUlEX1NFU1NJT04pKSB7XG4gICAgICAgIHRoaXMuX2hhbmRsZVNlc3Npb25TdGF0ZShzdGFuemEpXG4gICAgfSBlbHNlIGlmIChzdGFuemEubmFtZSA9PT0gJ3N0cmVhbTplcnJvcicpIHtcbiAgICAgICAgaWYgKCF0aGlzLnJlY29ubmVjdClcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCBzdGFuemEpXG4gICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBTVEFURV9PTkxJTkUpIHtcbiAgICAgICAgdGhpcy5lbWl0KCdzdGFuemEnLCBzdGFuemEpXG4gICAgfVxufVxuXG5DbGllbnQucHJvdG90eXBlLl9oYW5kbGVTZXNzaW9uU3RhdGUgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBpZiAoc3RhbnphLmF0dHJzLnR5cGUgPT09ICdyZXN1bHQnKSB7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9BVVRIRURcbiAgICAgICAgLyoganNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICAgICAgdGhpcy5kaWRfc2Vzc2lvbiA9IHRydWVcblxuICAgICAgICAvKiBubyBzdHJlYW0gcmVzdGFydCwgYnV0IG5leHQgZmVhdHVyZSAobW9zdCBwcm9iYWJseVxuICAgICAgICAgICB3ZSdsbCBnbyBvbmxpbmUgbmV4dCkgKi9cbiAgICAgICAgdGhpcy51c2VGZWF0dXJlcygpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsICdDYW5ub3QgYmluZCByZXNvdXJjZScpXG4gICAgfVxufVxuXG5DbGllbnQucHJvdG90eXBlLl9oYW5kbGVCaW5kU3RhdGUgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBpZiAoc3RhbnphLmF0dHJzLnR5cGUgPT09ICdyZXN1bHQnKSB7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9BVVRIRURcbiAgICAgICAgLypqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgICAgICB0aGlzLmRpZF9iaW5kID0gdHJ1ZVxuXG4gICAgICAgIHZhciBiaW5kRWwgPSBzdGFuemEuZ2V0Q2hpbGQoJ2JpbmQnLCBOU19YTVBQX0JJTkQpXG4gICAgICAgIGlmIChiaW5kRWwgJiYgYmluZEVsLmdldENoaWxkKCdqaWQnKSkge1xuICAgICAgICAgICAgdGhpcy5qaWQgPSBuZXcgSklEKGJpbmRFbC5nZXRDaGlsZCgnamlkJykuZ2V0VGV4dCgpKVxuICAgICAgICB9XG5cbiAgICAgICAgLyogbm8gc3RyZWFtIHJlc3RhcnQsIGJ1dCBuZXh0IGZlYXR1cmUgKi9cbiAgICAgICAgdGhpcy51c2VGZWF0dXJlcygpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsICdDYW5ub3QgYmluZCByZXNvdXJjZScpXG4gICAgfVxufVxuXG5DbGllbnQucHJvdG90eXBlLl9oYW5kbGVBdXRoU3RhdGUgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBpZiAoc3RhbnphLmlzKCdjaGFsbGVuZ2UnLCBOU19YTVBQX1NBU0wpKSB7XG4gICAgICAgIHZhciBjaGFsbGVuZ2VNc2cgPSBkZWNvZGU2NChzdGFuemEuZ2V0VGV4dCgpKVxuICAgICAgICB2YXIgcmVzcG9uc2VNc2cgPSBlbmNvZGU2NCh0aGlzLm1lY2guY2hhbGxlbmdlKGNoYWxsZW5nZU1zZykpXG4gICAgICAgIHZhciByZXNwb25zZSA9IG5ldyBTdGFuemEuRWxlbWVudChcbiAgICAgICAgICAgICdyZXNwb25zZScsIHsgeG1sbnM6IE5TX1hNUFBfU0FTTCB9XG4gICAgICAgICkudChyZXNwb25zZU1zZylcbiAgICAgICAgdGhpcy5zZW5kKHJlc3BvbnNlKVxuICAgIH0gZWxzZSBpZiAoc3RhbnphLmlzKCdzdWNjZXNzJywgTlNfWE1QUF9TQVNMKSkge1xuICAgICAgICB0aGlzLm1lY2ggPSBudWxsXG4gICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9BVVRIRURcbiAgICAgICAgdGhpcy5lbWl0KCdhdXRoJylcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgJ1hNUFAgYXV0aGVudGljYXRpb24gZmFpbHVyZScpXG4gICAgfVxufVxuXG5DbGllbnQucHJvdG90eXBlLl9oYW5kbGVQcmVBdXRoU3RhdGUgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnN0YXRlID0gU1RBVEVfQVVUSFxuICAgIHZhciBvZmZlcmVkTWVjaHMgPSB0aGlzLnN0cmVhbUZlYXR1cmVzLlxuICAgICAgICBnZXRDaGlsZCgnbWVjaGFuaXNtcycsIE5TX1hNUFBfU0FTTCkuXG4gICAgICAgIGdldENoaWxkcmVuKCdtZWNoYW5pc20nLCBOU19YTVBQX1NBU0wpLlxuICAgICAgICBtYXAoZnVuY3Rpb24oZWwpIHsgcmV0dXJuIGVsLmdldFRleHQoKSB9KVxuICAgIHRoaXMubWVjaCA9IHNhc2wuc2VsZWN0TWVjaGFuaXNtKFxuICAgICAgICBvZmZlcmVkTWVjaHMsXG4gICAgICAgIHRoaXMucHJlZmVycmVkU2FzbE1lY2hhbmlzbSxcbiAgICAgICAgdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtc1xuICAgIClcbiAgICBpZiAodGhpcy5tZWNoKSB7XG4gICAgICAgIHRoaXMubWVjaC5hdXRoemlkID0gdGhpcy5qaWQuYmFyZSgpLnRvU3RyaW5nKClcbiAgICAgICAgdGhpcy5tZWNoLmF1dGhjaWQgPSB0aGlzLmppZC51c2VyXG4gICAgICAgIHRoaXMubWVjaC5wYXNzd29yZCA9IHRoaXMucGFzc3dvcmRcbiAgICAgICAgLypqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgICAgICB0aGlzLm1lY2guYXBpX2tleSA9IHRoaXMuYXBpX2tleVxuICAgICAgICB0aGlzLm1lY2guYWNjZXNzX3Rva2VuID0gdGhpcy5hY2Nlc3NfdG9rZW5cbiAgICAgICAgdGhpcy5tZWNoLm9hdXRoMl90b2tlbiA9IHRoaXMub2F1dGgyX3Rva2VuXG4gICAgICAgIHRoaXMubWVjaC5vYXV0aDJfYXV0aCA9IHRoaXMub2F1dGgyX2F1dGhcbiAgICAgICAgdGhpcy5tZWNoLnJlYWxtID0gdGhpcy5qaWQuZG9tYWluICAvLyBhbnl0aGluZz9cbiAgICAgICAgaWYgKHRoaXMuYWN0QXMpIHRoaXMubWVjaC5hY3RBcyA9IHRoaXMuYWN0QXMudXNlclxuICAgICAgICB0aGlzLm1lY2guZGlnZXN0X3VyaSA9ICd4bXBwLycgKyB0aGlzLmppZC5kb21haW5cbiAgICAgICAgdmFyIGF1dGhNc2cgPSBlbmNvZGU2NCh0aGlzLm1lY2guYXV0aCgpKVxuICAgICAgICB2YXIgYXR0cnMgPSB0aGlzLm1lY2guYXV0aEF0dHJzKClcbiAgICAgICAgYXR0cnMueG1sbnMgPSBOU19YTVBQX1NBU0xcbiAgICAgICAgYXR0cnMubWVjaGFuaXNtID0gdGhpcy5tZWNoLm5hbWVcbiAgICAgICAgdGhpcy5zZW5kKG5ldyBTdGFuemEuRWxlbWVudCgnYXV0aCcsIGF0dHJzKVxuICAgICAgICAgICAgLnQoYXV0aE1zZykpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsICdObyB1c2FibGUgU0FTTCBtZWNoYW5pc20nKVxuICAgIH1cbn1cblxuLyoqXG4gKiBFaXRoZXIgd2UganVzdCByZWNlaXZlZCA8c3RyZWFtOmZlYXR1cmVzLz4sIG9yIHdlIGp1c3QgZW5hYmxlZCBhXG4gKiBmZWF0dXJlIGFuZCBhcmUgbG9va2luZyBmb3IgdGhlIG5leHQuXG4gKi9cbkNsaWVudC5wcm90b3R5cGUudXNlRmVhdHVyZXMgPSBmdW5jdGlvbigpIHtcbiAgICAvKiBqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIGlmICgodGhpcy5zdGF0ZSA9PT0gU1RBVEVfUFJFQVVUSCkgJiYgdGhpcy5yZWdpc3Rlcikge1xuICAgICAgICBkZWxldGUgdGhpcy5yZWdpc3RlclxuICAgICAgICB0aGlzLmRvUmVnaXN0ZXIoKVxuICAgIH0gZWxzZSBpZiAoKHRoaXMuc3RhdGUgPT09IFNUQVRFX1BSRUFVVEgpICYmXG4gICAgICAgIHRoaXMuc3RyZWFtRmVhdHVyZXMuZ2V0Q2hpbGQoJ21lY2hhbmlzbXMnLCBOU19YTVBQX1NBU0wpKSB7XG4gICAgICAgIHRoaXMuX2hhbmRsZVByZUF1dGhTdGF0ZSgpXG4gICAgfSBlbHNlIGlmICgodGhpcy5zdGF0ZSA9PT0gU1RBVEVfQVVUSEVEKSAmJlxuICAgICAgICAgICAgICAgIXRoaXMuZGlkX2JpbmQgJiZcbiAgICAgICAgICAgICAgIHRoaXMuc3RyZWFtRmVhdHVyZXMuZ2V0Q2hpbGQoJ2JpbmQnLCBOU19YTVBQX0JJTkQpKSB7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9CSU5EXG4gICAgICAgIHZhciBiaW5kRWwgPSBuZXcgU3RhbnphLkVsZW1lbnQoXG4gICAgICAgICAgICAnaXEnLFxuICAgICAgICAgICAgeyB0eXBlOiAnc2V0JywgaWQ6IElRSURfQklORCB9XG4gICAgICAgICkuYygnYmluZCcsIHsgeG1sbnM6IE5TX1hNUFBfQklORCB9KVxuICAgICAgICBpZiAodGhpcy5qaWQucmVzb3VyY2UpXG4gICAgICAgICAgICBiaW5kRWwuYygncmVzb3VyY2UnKS50KHRoaXMuamlkLnJlc291cmNlKVxuICAgICAgICB0aGlzLnNlbmQoYmluZEVsKVxuICAgIH0gZWxzZSBpZiAoKHRoaXMuc3RhdGUgPT09IFNUQVRFX0FVVEhFRCkgJiZcbiAgICAgICAgICAgICAgICF0aGlzLmRpZF9zZXNzaW9uICYmXG4gICAgICAgICAgICAgICB0aGlzLnN0cmVhbUZlYXR1cmVzLmdldENoaWxkKCdzZXNzaW9uJywgTlNfWE1QUF9TRVNTSU9OKSkge1xuICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfU0VTU0lPTlxuICAgICAgICB2YXIgc3RhbnphID0gbmV3IFN0YW56YS5FbGVtZW50KFxuICAgICAgICAgICdpcScsXG4gICAgICAgICAgeyB0eXBlOiAnc2V0JywgdG86IHRoaXMuamlkLmRvbWFpbiwgaWQ6IElRSURfU0VTU0lPTiAgfVxuICAgICAgICApLmMoJ3Nlc3Npb24nLCB7IHhtbG5zOiBOU19YTVBQX1NFU1NJT04gfSlcbiAgICAgICAgdGhpcy5zZW5kKHN0YW56YSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IFNUQVRFX0FVVEhFRCkge1xuICAgICAgICAvKiBPaywgd2UncmUgYXV0aGVudGljYXRlZCBhbmQgYWxsIGZlYXR1cmVzIGhhdmUgYmVlblxuICAgICAgICAgICBwcm9jZXNzZWQgKi9cbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX09OTElORVxuICAgICAgICB0aGlzLmVtaXQoJ29ubGluZScsIHsgamlkOiB0aGlzLmppZCB9KVxuICAgIH1cbn1cblxuQ2xpZW50LnByb3RvdHlwZS5kb1JlZ2lzdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGlkID0gJ3JlZ2lzdGVyJyArIE1hdGguY2VpbChNYXRoLnJhbmRvbSgpICogOTk5OTkpXG4gICAgdmFyIGlxID0gbmV3IFN0YW56YS5FbGVtZW50KFxuICAgICAgICAnaXEnLFxuICAgICAgICB7IHR5cGU6ICdzZXQnLCBpZDogaWQsIHRvOiB0aGlzLmppZC5kb21haW4gfVxuICAgICkuYygncXVlcnknLCB7IHhtbG5zOiBOU19SRUdJU1RFUiB9KVxuICAgIC5jKCd1c2VybmFtZScpLnQodGhpcy5qaWQudXNlcikudXAoKVxuICAgIC5jKCdwYXNzd29yZCcpLnQodGhpcy5wYXNzd29yZClcbiAgICB0aGlzLnNlbmQoaXEpXG5cbiAgICB2YXIgc2VsZiA9IHRoaXNcbiAgICB2YXIgb25SZXBseSA9IGZ1bmN0aW9uKHJlcGx5KSB7XG4gICAgICAgIGlmIChyZXBseS5pcygnaXEnKSAmJiAocmVwbHkuYXR0cnMuaWQgPT09IGlkKSkge1xuICAgICAgICAgICAgc2VsZi5yZW1vdmVMaXN0ZW5lcignc3RhbnphJywgb25SZXBseSlcblxuICAgICAgICAgICAgaWYgKHJlcGx5LmF0dHJzLnR5cGUgPT09ICdyZXN1bHQnKSB7XG4gICAgICAgICAgICAgICAgLyogUmVnaXN0cmF0aW9uIHN1Y2Nlc3NmdWwsIHByb2NlZWQgdG8gYXV0aCAqL1xuICAgICAgICAgICAgICAgIHNlbGYudXNlRmVhdHVyZXMoKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKCdSZWdpc3RyYXRpb24gZXJyb3InKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICB0aGlzLm9uKCdzdGFuemE6cHJlYXV0aCcsIG9uUmVwbHkpXG59XG5cbi8qKlxuICogcmV0dXJucyBhbGwgcmVnaXN0ZXJlZCBzYXNsIG1lY2hhbmlzbXNcbiAqL1xuQ2xpZW50LnByb3RvdHlwZS5nZXRTYXNsTWVjaGFuaXNtcyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zXG59XG5cbi8qKlxuICogcmVtb3ZlcyBhbGwgcmVnaXN0ZXJlZCBzYXNsIG1lY2hhbmlzbXNcbiAqL1xuQ2xpZW50LnByb3RvdHlwZS5jbGVhclNhc2xNZWNoYW5pc20gPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zID0gW11cbn1cblxuLyoqXG4gKiByZWdpc3RlciBhIG5ldyBzYXNsIG1lY2hhbmlzbVxuICovXG5DbGllbnQucHJvdG90eXBlLnJlZ2lzdGVyU2FzbE1lY2hhbmlzbSA9IGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgIC8vIGNoZWNrIGlmIG1ldGhvZCBpcyByZWdpc3RlcmVkXG4gICAgaWYgKHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMuaW5kZXhPZihtZXRob2QpID09PSAtMSApIHtcbiAgICAgICAgdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcy5wdXNoKG1ldGhvZClcbiAgICB9XG59XG5cbi8qKlxuICogdW5yZWdpc3RlciBhbiBleGlzdGluZyBzYXNsIG1lY2hhbmlzbVxuICovXG5DbGllbnQucHJvdG90eXBlLnVucmVnaXN0ZXJTYXNsTWVjaGFuaXNtID0gZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgLy8gY2hlY2sgaWYgbWV0aG9kIGlzIHJlZ2lzdGVyZWRcbiAgICB2YXIgaW5kZXggPSB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zLmluZGV4T2YobWV0aG9kKVxuICAgIGlmIChpbmRleCA+PSAwKSB7XG4gICAgICAgIHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMgPSB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zLnNwbGljZShpbmRleCwgMSlcbiAgICB9XG59XG5cbkNsaWVudC5TQVNMID0gc2FzbFxuQ2xpZW50LkNsaWVudCA9IENsaWVudFxuQ2xpZW50LlN0YW56YSA9IFN0YW56YVxuQ2xpZW50Lmx0eCA9IGx0eFxubW9kdWxlLmV4cG9ydHMgPSBDbGllbnRcbn0pLmNhbGwodGhpcyxcIi8uLi8uLi9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudFwiKSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBNZWNoYW5pc20gPSByZXF1aXJlKCcuL21lY2hhbmlzbScpXG5cbi8qKlxuICogQHNlZSBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0NTA1XG4gKiBAc2VlIGh0dHA6Ly94bXBwLm9yZy9leHRlbnNpb25zL3hlcC0wMTc1Lmh0bWxcbiAqL1xuZnVuY3Rpb24gQW5vbnltb3VzKCkge31cblxudXRpbC5pbmhlcml0cyhBbm9ueW1vdXMsIE1lY2hhbmlzbSlcblxuQW5vbnltb3VzLnByb3RvdHlwZS5uYW1lID0gJ0FOT05ZTU9VUydcblxuQW5vbnltb3VzLnByb3RvdHlwZS5hdXRoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aHppZFxufTtcblxuQW5vbnltb3VzLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0cnVlXG59XG5cbm1vZHVsZS5leHBvcnRzID0gQW5vbnltb3VzIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIGNyeXB0byA9IHJlcXVpcmUoJ2NyeXB0bycpXG4gICwgTWVjaGFuaXNtID0gcmVxdWlyZSgnLi9tZWNoYW5pc20nKVxuXG5cbi8qKlxuICogSGFzaCBhIHN0cmluZ1xuICovXG5mdW5jdGlvbiBtZDUocywgZW5jb2RpbmcpIHtcbiAgICB2YXIgaGFzaCA9IGNyeXB0by5jcmVhdGVIYXNoKCdtZDUnKVxuICAgIGhhc2gudXBkYXRlKHMpXG4gICAgcmV0dXJuIGhhc2guZGlnZXN0KGVuY29kaW5nIHx8ICdiaW5hcnknKVxufVxuZnVuY3Rpb24gbWQ1SGV4KHMpIHtcbiAgICByZXR1cm4gbWQ1KHMsICdoZXgnKVxufVxuXG4vKipcbiAqIFBhcnNlIFNBU0wgc2VyaWFsaXphdGlvblxuICovXG5mdW5jdGlvbiBwYXJzZURpY3Qocykge1xuICAgIHZhciByZXN1bHQgPSB7fVxuICAgIHdoaWxlIChzKSB7XG4gICAgICAgIHZhciBtXG4gICAgICAgIGlmICgobSA9IC9eKC4rPyk9KC4qP1teXFxcXF0pLFxccyooLiopLy5leGVjKHMpKSkge1xuICAgICAgICAgICAgcmVzdWx0W21bMV1dID0gbVsyXS5yZXBsYWNlKC9cXFwiL2csICcnKVxuICAgICAgICAgICAgcyA9IG1bM11cbiAgICAgICAgfSBlbHNlIGlmICgobSA9IC9eKC4rPyk9KC4rPyksXFxzKiguKikvLmV4ZWMocykpKSB7XG4gICAgICAgICAgICByZXN1bHRbbVsxXV0gPSBtWzJdXG4gICAgICAgICAgICBzID0gbVszXVxuICAgICAgICB9IGVsc2UgaWYgKChtID0gL14oLis/KT1cIiguKj9bXlxcXFxdKVwiJC8uZXhlYyhzKSkpIHtcbiAgICAgICAgICAgIHJlc3VsdFttWzFdXSA9IG1bMl1cbiAgICAgICAgICAgIHMgPSBtWzNdXG4gICAgICAgIH0gZWxzZSBpZiAoKG0gPSAvXiguKz8pPSguKz8pJC8uZXhlYyhzKSkpIHtcbiAgICAgICAgICAgIHJlc3VsdFttWzFdXSA9IG1bMl1cbiAgICAgICAgICAgIHMgPSBtWzNdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzID0gbnVsbFxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuLyoqXG4gKiBTQVNMIHNlcmlhbGl6YXRpb25cbiAqL1xuZnVuY3Rpb24gZW5jb2RlRGljdChkaWN0KSB7XG4gICAgdmFyIHMgPSAnJ1xuICAgIGZvciAodmFyIGsgaW4gZGljdCkge1xuICAgICAgICB2YXIgdiA9IGRpY3Rba11cbiAgICAgICAgaWYgKHYpIHMgKz0gJywnICsgayArICc9XCInICsgdiArICdcIidcbiAgICB9XG4gICAgcmV0dXJuIHMuc3Vic3RyKDEpIC8vIHdpdGhvdXQgZmlyc3QgJywnXG59XG5cbi8qKlxuICogUmlnaHQtanVzdGlmeSBhIHN0cmluZyxcbiAqIGVnLiBwYWQgd2l0aCAwc1xuICovXG5mdW5jdGlvbiByanVzdChzLCB0YXJnZXRMZW4sIHBhZGRpbmcpIHtcbiAgICB3aGlsZSAocy5sZW5ndGggPCB0YXJnZXRMZW4pXG4gICAgICAgIHMgPSBwYWRkaW5nICsgc1xuICAgIHJldHVybiBzXG59XG5cbi8qKlxuICogR2VuZXJhdGUgYSBzdHJpbmcgb2YgOCBkaWdpdHNcbiAqIChudW1iZXIgdXNlZCBvbmNlKVxuICovXG5mdW5jdGlvbiBnZW5lcmF0ZU5vbmNlKCkge1xuICAgIHZhciByZXN1bHQgPSAnJ1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgODsgaSsrKVxuICAgICAgICByZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSg0OCArXG4gICAgICAgICAgICBNYXRoLmNlaWwoTWF0aC5yYW5kb20oKSAqIDEwKSlcbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbi8qKlxuICogQHNlZSBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMyODMxXG4gKiBAc2VlIGh0dHA6Ly93aWtpLnhtcHAub3JnL3dlYi9TQVNMYW5kRElHRVNULU1ENVxuICovXG5mdW5jdGlvbiBEaWdlc3RNRDUoKSB7XG4gICAgLypqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIHRoaXMubm9uY2VfY291bnQgPSAwXG4gICAgdGhpcy5jbm9uY2UgPSBnZW5lcmF0ZU5vbmNlKClcbiAgICB0aGlzLmF1dGhjaWQgPSBudWxsXG4gICAgdGhpcy5hY3RBcyA9IG51bGxcbiAgICB0aGlzLnJlYWxtID0gbnVsbFxuICAgIHRoaXMucGFzc3dvcmQgPSBudWxsXG59XG5cbnV0aWwuaW5oZXJpdHMoRGlnZXN0TUQ1LCBNZWNoYW5pc20pXG5cbkRpZ2VzdE1ENS5wcm90b3R5cGUubmFtZSA9ICdESUdFU1QtTUQ1J1xuXG5EaWdlc3RNRDUucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJydcbn1cblxuRGlnZXN0TUQ1LnByb3RvdHlwZS5nZXROQyA9IGZ1bmN0aW9uKCkge1xuICAgIC8qanNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICByZXR1cm4gcmp1c3QodGhpcy5ub25jZV9jb3VudC50b1N0cmluZygpLCA4LCAnMCcpXG59XG5cbkRpZ2VzdE1ENS5wcm90b3R5cGUucmVzcG9uc2VWYWx1ZSA9IGZ1bmN0aW9uKHMpIHtcbiAgICB2YXIgZGljdCA9IHBhcnNlRGljdChzKVxuICAgIGlmIChkaWN0LnJlYWxtKVxuICAgICAgICB0aGlzLnJlYWxtID0gZGljdC5yZWFsbVxuXG4gICAgdmFyIHZhbHVlXG4gICAgLypqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIGlmIChkaWN0Lm5vbmNlICYmIGRpY3QucW9wKSB7XG4gICAgICAgIHRoaXMubm9uY2VfY291bnQrK1xuICAgICAgICB2YXIgYTEgPSBtZDUodGhpcy5hdXRoY2lkICsgJzonICtcbiAgICAgICAgICAgIHRoaXMucmVhbG0gKyAnOicgK1xuICAgICAgICAgICAgdGhpcy5wYXNzd29yZCkgKyAnOicgK1xuICAgICAgICAgICAgZGljdC5ub25jZSArICc6JyArXG4gICAgICAgICAgICB0aGlzLmNub25jZVxuICAgICAgICBpZiAodGhpcy5hY3RBcykgYTEgKz0gJzonICsgdGhpcy5hY3RBc1xuXG4gICAgICAgIHZhciBhMiA9ICdBVVRIRU5USUNBVEU6JyArIHRoaXMuZGlnZXN0X3VyaVxuICAgICAgICBpZiAoKGRpY3QucW9wID09PSAnYXV0aC1pbnQnKSB8fCAoZGljdC5xb3AgPT09ICdhdXRoLWNvbmYnKSlcbiAgICAgICAgICAgIGEyICs9ICc6MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAnXG5cbiAgICAgICAgdmFsdWUgPSBtZDVIZXgobWQ1SGV4KGExKSArICc6JyArXG4gICAgICAgICAgICBkaWN0Lm5vbmNlICsgJzonICtcbiAgICAgICAgICAgIHRoaXMuZ2V0TkMoKSArICc6JyArXG4gICAgICAgICAgICB0aGlzLmNub25jZSArICc6JyArXG4gICAgICAgICAgICBkaWN0LnFvcCArICc6JyArXG4gICAgICAgICAgICBtZDVIZXgoYTIpKVxuICAgIH1cbiAgICByZXR1cm4gdmFsdWVcbn1cblxuRGlnZXN0TUQ1LnByb3RvdHlwZS5jaGFsbGVuZ2UgPSBmdW5jdGlvbihzKSB7XG4gICAgdmFyIGRpY3QgPSBwYXJzZURpY3QocylcbiAgICBpZiAoZGljdC5yZWFsbSlcbiAgICAgICAgdGhpcy5yZWFsbSA9IGRpY3QucmVhbG1cblxuICAgIHZhciByZXNwb25zZVxuICAgIC8qanNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICBpZiAoZGljdC5ub25jZSAmJiBkaWN0LnFvcCkge1xuICAgICAgICB2YXIgcmVzcG9uc2VWYWx1ZSA9IHRoaXMucmVzcG9uc2VWYWx1ZShzKVxuICAgICAgICByZXNwb25zZSA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmF1dGhjaWQsXG4gICAgICAgICAgICByZWFsbTogdGhpcy5yZWFsbSxcbiAgICAgICAgICAgIG5vbmNlOiBkaWN0Lm5vbmNlLFxuICAgICAgICAgICAgY25vbmNlOiB0aGlzLmNub25jZSxcbiAgICAgICAgICAgIG5jOiB0aGlzLmdldE5DKCksXG4gICAgICAgICAgICBxb3A6IGRpY3QucW9wLFxuICAgICAgICAgICAgJ2RpZ2VzdC11cmknOiB0aGlzLmRpZ2VzdF91cmksXG4gICAgICAgICAgICByZXNwb25zZTogcmVzcG9uc2VWYWx1ZSxcbiAgICAgICAgICAgIGNoYXJzZXQ6ICd1dGYtOCdcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5hY3RBcykgcmVzcG9uc2UuYXV0aHppZCA9IHRoaXMuYWN0QXNcbiAgICB9IGVsc2UgaWYgKGRpY3QucnNwYXV0aCkge1xuICAgICAgICByZXR1cm4gJydcbiAgICB9XG4gICAgcmV0dXJuIGVuY29kZURpY3QocmVzcG9uc2UpXG59XG5cbkRpZ2VzdE1ENS5wcm90b3R5cGUuc2VydmVyQ2hhbGxlbmdlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGRpY3QgPSB7fVxuICAgIGRpY3QucmVhbG0gPSAnJ1xuICAgIHRoaXMubm9uY2UgPSBkaWN0Lm5vbmNlID0gZ2VuZXJhdGVOb25jZSgpXG4gICAgZGljdC5xb3AgPSAnYXV0aCdcbiAgICB0aGlzLmNoYXJzZXQgPSBkaWN0LmNoYXJzZXQgPSAndXRmLTgnXG4gICAgZGljdC5hbGdvcml0aG0gPSAnbWQ1LXNlc3MnXG4gICAgcmV0dXJuIGVuY29kZURpY3QoZGljdClcbn1cblxuLy8gVXNlZCBvbiB0aGUgc2VydmVyIHRvIGNoZWNrIGZvciBhdXRoIVxuRGlnZXN0TUQ1LnByb3RvdHlwZS5yZXNwb25zZSA9IGZ1bmN0aW9uKHMpIHtcbiAgICB2YXIgZGljdCA9IHBhcnNlRGljdChzKVxuICAgIHRoaXMuYXV0aGNpZCA9IGRpY3QudXNlcm5hbWVcblxuICAgIGlmIChkaWN0Lm5vbmNlICE9PSB0aGlzLm5vbmNlKSByZXR1cm4gZmFsc2VcbiAgICBpZiAoIWRpY3QuY25vbmNlKSByZXR1cm4gZmFsc2VcblxuICAgIHRoaXMuY25vbmNlID0gZGljdC5jbm9uY2VcbiAgICBpZiAodGhpcy5jaGFyc2V0ICE9PSBkaWN0LmNoYXJzZXQpIHJldHVybiBmYWxzZVxuXG4gICAgdGhpcy5yZXNwb25zZSA9IGRpY3QucmVzcG9uc2VcbiAgICByZXR1cm4gdHJ1ZVxufVxuXG5EaWdlc3RNRDUucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zLnBhc3N3b3JkKSByZXR1cm4gdHJ1ZVxuICAgIHJldHVybiBmYWxzZVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERpZ2VzdE1ENVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIE1lY2hhbmlzbSA9IHJlcXVpcmUoJy4vbWVjaGFuaXNtJylcblxuLyoqXG4gKiBAc2VlIGh0dHA6Ly94bXBwLm9yZy9leHRlbnNpb25zL3hlcC0wMTc4Lmh0bWxcbiAqL1xuZnVuY3Rpb24gRXh0ZXJuYWwoKSB7fVxuXG51dGlsLmluaGVyaXRzKEV4dGVybmFsLCBNZWNoYW5pc20pXG5cbkV4dGVybmFsLnByb3RvdHlwZS5uYW1lID0gJ0VYVEVSTkFMJ1xuXG5FeHRlcm5hbC5wcm90b3R5cGUuYXV0aCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAodGhpcy5hdXRoemlkKVxufVxuXG5FeHRlcm5hbC5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMuY3JlZGVudGlhbHMpIHJldHVybiB0cnVlXG4gICAgcmV0dXJuIGZhbHNlXG59XG5cbm1vZHVsZS5leHBvcnRzID0gRXh0ZXJuYWwiLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogRWFjaCBpbXBsZW1lbnRlZCBtZWNoYW5pc20gb2ZmZXJzIG11bHRpcGxlIG1ldGhvZHNcbiAqIC0gbmFtZSA6IG5hbWUgb2YgdGhlIGF1dGggbWV0aG9kXG4gKiAtIGF1dGggOlxuICogLSBtYXRjaDogY2hlY2tzIGlmIHRoZSBjbGllbnQgaGFzIGVub3VnaCBvcHRpb25zIHRvXG4gKiAgICAgICAgICBvZmZlciB0aGlzIG1lY2hhbmlzIHRvIHhtcHAgc2VydmVyc1xuICogLSBhdXRoU2VydmVyOiB0YWtlcyBhIHN0YW56YSBhbmQgZXh0cmFjdHMgdGhlIGluZm9ybWF0aW9uXG4gKi9cblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcblxuLy8gTWVjaGFuaXNtc1xuZnVuY3Rpb24gTWVjaGFuaXNtKCkge31cblxudXRpbC5pbmhlcml0cyhNZWNoYW5pc20sIEV2ZW50RW1pdHRlcilcblxuTWVjaGFuaXNtLnByb3RvdHlwZS5hdXRoQXR0cnMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4ge31cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBNZWNoYW5pc20iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgTWVjaGFuaXNtID0gcmVxdWlyZSgnLi9tZWNoYW5pc20nKVxuXG5mdW5jdGlvbiBQbGFpbigpIHt9XG5cbnV0aWwuaW5oZXJpdHMoUGxhaW4sIE1lY2hhbmlzbSlcblxuUGxhaW4ucHJvdG90eXBlLm5hbWUgPSAnUExBSU4nXG5cblBsYWluLnByb3RvdHlwZS5hdXRoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aHppZCArICdcXDAnICtcbiAgICAgICAgdGhpcy5hdXRoY2lkICsgJ1xcMCcgK1xuICAgICAgICB0aGlzLnBhc3N3b3JkO1xufVxuXG5QbGFpbi5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMucGFzc3dvcmQpIHJldHVybiB0cnVlXG4gICAgcmV0dXJuIGZhbHNlXG59XG5cbm1vZHVsZS5leHBvcnRzID0gUGxhaW4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgTWVjaGFuaXNtID0gcmVxdWlyZSgnLi9tZWNoYW5pc20nKVxuICAsIHF1ZXJ5c3RyaW5nID0gcmVxdWlyZSgncXVlcnlzdHJpbmcnKVxuXG4vKipcbiAqIEBzZWUgaHR0cHM6Ly9kZXZlbG9wZXJzLmZhY2Vib29rLmNvbS9kb2NzL2NoYXQvI3BsYXRhdXRoXG4gKi9cbnZhciBYRmFjZWJvb2tQbGF0Zm9ybSA9IGZ1bmN0aW9uKCkge31cblxudXRpbC5pbmhlcml0cyhYRmFjZWJvb2tQbGF0Zm9ybSwgTWVjaGFuaXNtKVxuXG5YRmFjZWJvb2tQbGF0Zm9ybS5wcm90b3R5cGUubmFtZSA9ICdYLUZBQ0VCT09LLVBMQVRGT1JNJ1xuWEZhY2Vib29rUGxhdGZvcm0ucHJvdG90eXBlLmhvc3QgPSAnY2hhdC5mYWNlYm9vay5jb20nXG5cblhGYWNlYm9va1BsYXRmb3JtLnByb3RvdHlwZS5hdXRoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICcnXG59XG5cblhGYWNlYm9va1BsYXRmb3JtLnByb3RvdHlwZS5jaGFsbGVuZ2UgPSBmdW5jdGlvbihzKSB7XG4gICAgdmFyIGRpY3QgPSBxdWVyeXN0cmluZy5wYXJzZShzKVxuXG4gICAgLypqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIHZhciByZXNwb25zZSA9IHtcbiAgICAgICAgYXBpX2tleTogdGhpcy5hcGlfa2V5LFxuICAgICAgICBjYWxsX2lkOiBuZXcgRGF0ZSgpLmdldFRpbWUoKSxcbiAgICAgICAgbWV0aG9kOiBkaWN0Lm1ldGhvZCxcbiAgICAgICAgbm9uY2U6IGRpY3Qubm9uY2UsXG4gICAgICAgIGFjY2Vzc190b2tlbjogdGhpcy5hY2Nlc3NfdG9rZW4sXG4gICAgICAgIHY6ICcxLjAnXG4gICAgfVxuXG4gICAgcmV0dXJuIHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeShyZXNwb25zZSlcbn1cblxuWEZhY2Vib29rUGxhdGZvcm0ucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIHZhciBob3N0ID0gWEZhY2Vib29rUGxhdGZvcm0ucHJvdG90eXBlLmhvc3RcbiAgICBpZiAoKG9wdGlvbnMuaG9zdCA9PT0gaG9zdCkgfHxcbiAgICAgICAgKG9wdGlvbnMuamlkICYmIChvcHRpb25zLmppZC5nZXREb21haW4oKSA9PT0gaG9zdCkpKSB7XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICAgIHJldHVybiBmYWxzZVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFhGYWNlYm9va1BsYXRmb3JtIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIE1lY2hhbmlzbSA9IHJlcXVpcmUoJy4vbWVjaGFuaXNtJylcblxuLyoqXG4gKiBAc2VlIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3RhbGsvamVwX2V4dGVuc2lvbnMvb2F1dGhcbiAqL1xuLypqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuZnVuY3Rpb24gWE9BdXRoMigpIHtcbiAgICB0aGlzLm9hdXRoMl9hdXRoID0gbnVsbFxuICAgIHRoaXMuYXV0aHppZCA9IG51bGxcbn1cblxudXRpbC5pbmhlcml0cyhYT0F1dGgyLCBNZWNoYW5pc20pXG5cblhPQXV0aDIucHJvdG90eXBlLm5hbWUgPSAnWC1PQVVUSDInXG5YT0F1dGgyLnByb3RvdHlwZS5OU19HT09HTEVfQVVUSCA9ICdodHRwOi8vd3d3Lmdvb2dsZS5jb20vdGFsay9wcm90b2NvbC9hdXRoJ1xuXG5YT0F1dGgyLnByb3RvdHlwZS5hdXRoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICdcXDAnICsgdGhpcy5hdXRoemlkICsgJ1xcMCcgKyB0aGlzLm9hdXRoMl90b2tlblxufVxuXG5YT0F1dGgyLnByb3RvdHlwZS5hdXRoQXR0cnMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICAnYXV0aDpzZXJ2aWNlJzogJ29hdXRoMicsXG4gICAgICAgICd4bWxuczphdXRoJzogdGhpcy5vYXV0aDJfYXV0aFxuICAgIH1cbn1cblxuWE9BdXRoMi5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgcmV0dXJuIChvcHRpb25zLm9hdXRoMl9hdXRoID09PSBYT0F1dGgyLnByb3RvdHlwZS5OU19HT09HTEVfQVVUSClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBYT0F1dGgyXG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIHJlcXVlc3QgPSByZXF1aXJlKCdyZXF1ZXN0JylcbiAgLCBsdHggPSByZXF1aXJlKCdub2RlLXhtcHAtY29yZScpLmx0eFxuICAsIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgneG1wcDpjbGllbnQ6Ym9zaCcpXG5cbmZ1bmN0aW9uIEJPU0hDb25uZWN0aW9uKG9wdHMpIHtcbiAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICBFdmVudEVtaXR0ZXIuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy5ib3NoVVJMID0gb3B0cy5ib3NoLnVybFxuICAgIHRoaXMuamlkID0gb3B0cy5qaWRcbiAgICB0aGlzLndhaXQgPSBvcHRzLndhaXQ7XG4gICAgdGhpcy54bWxuc0F0dHJzID0ge1xuICAgICAgICB4bWxuczogJ2h0dHA6Ly9qYWJiZXIub3JnL3Byb3RvY29sL2h0dHBiaW5kJyxcbiAgICAgICAgJ3htbG5zOnhtcHAnOiAndXJuOnhtcHA6eGJvc2gnLFxuICAgICAgICAneG1sbnM6c3RyZWFtJzogJ2h0dHA6Ly9ldGhlcnguamFiYmVyLm9yZy9zdHJlYW1zJ1xuICAgIH1cbiAgICBpZiAob3B0cy54bWxucykge1xuICAgICAgICBmb3IgKHZhciBwcmVmaXggaW4gb3B0cy54bWxucykge1xuICAgICAgICAgICAgaWYgKHByZWZpeCkge1xuICAgICAgICAgICAgICAgIHRoaXMueG1sbnNBdHRyc1sneG1sbnM6JyArIHByZWZpeF0gPSBvcHRzLnhtbG5zW3ByZWZpeF1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy54bWxuc0F0dHJzLnhtbG5zID0gb3B0cy54bWxuc1twcmVmaXhdXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5jdXJyZW50UmVxdWVzdHMgPSAwXG4gICAgdGhpcy5xdWV1ZSA9IFtdXG4gICAgdGhpcy5yaWQgPSBNYXRoLmNlaWwoTWF0aC5yYW5kb20oKSAqIDk5OTk5OTk5OTkpXG5cbiAgICB0aGlzLnJlcXVlc3Qoe1xuICAgICAgICAgICAgdG86IHRoaXMuamlkLmRvbWFpbixcbiAgICAgICAgICAgIHZlcjogJzEuNicsXG4gICAgICAgICAgICB3YWl0OiB0aGlzLndhaXQsXG4gICAgICAgICAgICBob2xkOiAnMScsXG4gICAgICAgICAgICBjb250ZW50OiB0aGlzLmNvbnRlbnRUeXBlXG4gICAgICAgIH0sXG4gICAgICAgIFtdLFxuICAgICAgICBmdW5jdGlvbihlcnIsIGJvZHlFbCkge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHRoYXQuZW1pdCgnZXJyb3InLCBlcnIpXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGJvZHlFbCAmJiBib2R5RWwuYXR0cnMpIHtcbiAgICAgICAgICAgICAgICB0aGF0LnNpZCA9IGJvZHlFbC5hdHRycy5zaWRcbiAgICAgICAgICAgICAgICB0aGF0Lm1heFJlcXVlc3RzID0gcGFyc2VJbnQoYm9keUVsLmF0dHJzLnJlcXVlc3RzLCAxMCkgfHwgMlxuICAgICAgICAgICAgICAgIGlmICh0aGF0LnNpZCAmJiAodGhhdC5tYXhSZXF1ZXN0cyA+IDApKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoYXQuZW1pdCgnY29ubmVjdCcpXG4gICAgICAgICAgICAgICAgICAgIHRoYXQucHJvY2Vzc1Jlc3BvbnNlKGJvZHlFbClcbiAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5uZXh0VGljayh0aGF0Lm1heVJlcXVlc3QuYmluZCh0aGF0KSlcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGF0LmVtaXQoJ2Vycm9yJywgJ0ludmFsaWQgcGFyYW1ldGVycycpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxufVxuXG51dGlsLmluaGVyaXRzKEJPU0hDb25uZWN0aW9uLCBFdmVudEVtaXR0ZXIpXG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5jb250ZW50VHlwZSA9ICd0ZXh0L3htbCBjaGFyc2V0PXV0Zi04J1xuXG5CT1NIQ29ubmVjdGlvbi5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIHRoaXMucXVldWUucHVzaChzdGFuemEucm9vdCgpKVxuICAgIHByb2Nlc3MubmV4dFRpY2sodGhpcy5tYXlSZXF1ZXN0LmJpbmQodGhpcykpXG59XG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5wcm9jZXNzUmVzcG9uc2UgPSBmdW5jdGlvbihib2R5RWwpIHtcbiAgICBkZWJ1ZygncHJvY2VzcyBib3NoIHNlcnZlciByZXNwb25zZSAnICsgYm9keUVsLnRvU3RyaW5nKCkpXG4gICAgaWYgKGJvZHlFbCAmJiBib2R5RWwuY2hpbGRyZW4pIHtcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGJvZHlFbC5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGNoaWxkID0gYm9keUVsLmNoaWxkcmVuW2ldXG4gICAgICAgICAgICBpZiAoY2hpbGQubmFtZSAmJiBjaGlsZC5hdHRycyAmJiBjaGlsZC5jaGlsZHJlbilcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoJ3N0YW56YScsIGNoaWxkKVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChib2R5RWwgJiYgKGJvZHlFbC5hdHRycy50eXBlID09PSAndGVybWluYXRlJykpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNodXRkb3duIHx8IGJvZHlFbC5hdHRycy5jb25kaXRpb24pXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICAgICAgICBuZXcgRXJyb3IoYm9keUVsLmF0dHJzLmNvbmRpdGlvbiB8fCAnU2Vzc2lvbiB0ZXJtaW5hdGVkJykpXG4gICAgICAgIHRoaXMuZW1pdCgnZGlzY29ubmVjdCcpXG4gICAgICAgIHRoaXMuZW1pdCgnZW5kJylcbiAgICAgICAgdGhpcy5lbWl0KCdjbG9zZScpXG4gICAgfVxufVxuXG5CT1NIQ29ubmVjdGlvbi5wcm90b3R5cGUubWF5UmVxdWVzdCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjYW5SZXF1ZXN0ID1cbiAgICAgICAgLyogTXVzdCBoYXZlIGEgc2Vzc2lvbiBhbHJlYWR5ICovXG4gICAgICAgIHRoaXMuc2lkICYmXG4gICAgICAgIC8qIFdlIGNhbiBvbmx5IHJlY2VpdmUgd2hlbiBvbmUgcmVxdWVzdCBpcyBpbiBmbGlnaHQgKi9cbiAgICAgICAgKCh0aGlzLmN1cnJlbnRSZXF1ZXN0cyA9PT0gMCkgfHxcbiAgICAgICAgIC8qIElzIHRoZXJlIHNvbWV0aGluZyB0byBzZW5kLCBhbmQgYXJlIHdlIGFsbG93ZWQ/ICovXG4gICAgICAgICAoKCh0aGlzLnF1ZXVlLmxlbmd0aCA+IDApICYmICh0aGlzLmN1cnJlbnRSZXF1ZXN0cyA8IHRoaXMubWF4UmVxdWVzdHMpKSlcbiAgICAgICAgKVxuXG4gICAgaWYgKCFjYW5SZXF1ZXN0KSByZXR1cm5cblxuICAgIHZhciBzdGFuemFzID0gdGhpcy5xdWV1ZVxuICAgIHRoaXMucXVldWUgPSBbXVxuICAgIHRoaXMucmlkKytcbiAgICB0aGlzLnJlcXVlc3Qoe30sIHN0YW56YXMsIGZ1bmN0aW9uKGVyciwgYm9keUVsKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2Rpc2Nvbm5lY3QnKVxuICAgICAgICAgICAgdGhpcy5lbWl0KCdlbmQnKVxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuc2lkXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2Nsb3NlJylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChib2R5RWwpIHRoaXMucHJvY2Vzc1Jlc3BvbnNlKGJvZHlFbClcblxuICAgICAgICAgICAgcHJvY2Vzcy5uZXh0VGljayh0aGlzLm1heVJlcXVlc3QuYmluZCh0aGlzKSlcbiAgICAgICAgfVxuICAgIH0uYmluZCh0aGlzKSlcbn1cblxuQk9TSENvbm5lY3Rpb24ucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uKHN0YW56YXMpIHtcbiAgICBzdGFuemFzID0gc3RhbnphcyB8fCBbXVxuICAgIGlmICh0eXBlb2Ygc3RhbnphcyAhPT0gQXJyYXkpIHN0YW56YXMgPSBbc3Rhbnphc11cblxuICAgIHN0YW56YXMgPSB0aGlzLnF1ZXVlLmNvbmNhdChzdGFuemFzKVxuICAgIHRoaXMuc2h1dGRvd24gPSB0cnVlXG4gICAgdGhpcy5xdWV1ZSA9IFtdXG4gICAgdGhpcy5yaWQrK1xuICAgIHRoaXMucmVxdWVzdCh7IHR5cGU6ICd0ZXJtaW5hdGUnIH0sIHN0YW56YXMsIGZ1bmN0aW9uKGVyciwgYm9keUVsKSB7XG4gICAgICAgIGlmIChib2R5RWwpIHRoaXMucHJvY2Vzc1Jlc3BvbnNlKGJvZHlFbClcblxuICAgICAgICB0aGlzLmVtaXQoJ2Rpc2Nvbm5lY3QnKVxuICAgICAgICB0aGlzLmVtaXQoJ2VuZCcpXG4gICAgICAgIGRlbGV0ZSB0aGlzLnNpZFxuICAgICAgICB0aGlzLmVtaXQoJ2Nsb3NlJylcbiAgICB9LmJpbmQodGhpcykpXG59XG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5tYXhIVFRQUmV0cmllcyA9IDVcblxuQk9TSENvbm5lY3Rpb24ucHJvdG90eXBlLnJlcXVlc3QgPSBmdW5jdGlvbihhdHRycywgY2hpbGRyZW4sIGNiLCByZXRyeSkge1xuICAgIHZhciB0aGF0ID0gdGhpc1xuICAgIHJldHJ5ID0gcmV0cnkgfHwgMFxuXG4gICAgYXR0cnMucmlkID0gdGhpcy5yaWQudG9TdHJpbmcoKVxuICAgIGlmICh0aGlzLnNpZCkgYXR0cnMuc2lkID0gdGhpcy5zaWRcblxuICAgIGZvciAodmFyIGsgaW4gdGhpcy54bWxuc0F0dHJzKSB7XG4gICAgICAgIGF0dHJzW2tdID0gdGhpcy54bWxuc0F0dHJzW2tdXG4gICAgfVxuICAgIHZhciBib3NoRWwgPSBuZXcgbHR4LkVsZW1lbnQoJ2JvZHknLCBhdHRycylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGJvc2hFbC5jbm9kZShjaGlsZHJlbltpXSlcbiAgICB9XG5cbiAgICByZXF1ZXN0KHtcbiAgICAgICAgICAgIHVyaTogdGhpcy5ib3NoVVJMLFxuICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiB0aGlzLmNvbnRlbnRUeXBlIH0sXG4gICAgICAgICAgICBib2R5OiBib3NoRWwudG9TdHJpbmcoKVxuICAgICAgICB9LFxuICAgICAgICBmdW5jdGlvbihlcnIsIHJlcywgYm9keSkge1xuICAgICAgICAgICAgdGhhdC5jdXJyZW50UmVxdWVzdHMtLVxuXG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJldHJ5IDwgdGhhdC5tYXhIVFRQUmV0cmllcykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhhdC5yZXF1ZXN0KGF0dHJzLCBjaGlsZHJlbiwgY2IsIHJldHJ5ICsgMSlcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2IoZXJyKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgocmVzLnN0YXR1c0NvZGUgPCAyMDApIHx8IChyZXMuc3RhdHVzQ29kZSA+PSA0MDApKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiKG5ldyBFcnJvcignSFRUUCBzdGF0dXMgJyArIHJlcy5zdGF0dXNDb2RlKSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGJvZHlFbFxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBib2R5RWwgPSBsdHgucGFyc2UoYm9keSlcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYihlKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYm9keUVsICYmXG4gICAgICAgICAgICAgICAgKGJvZHlFbC5hdHRycy50eXBlID09PSAndGVybWluYXRlJykgJiZcbiAgICAgICAgICAgICAgICBib2R5RWwuYXR0cnMuY29uZGl0aW9uKSB7XG4gICAgICAgICAgICAgICAgY2IobmV3IEVycm9yKGJvZHlFbC5hdHRycy5jb25kaXRpb24pKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChib2R5RWwpIHtcbiAgICAgICAgICAgICAgICBjYihudWxsLCBib2R5RWwpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNiKG5ldyBFcnJvcignbm8gPGJvZHkvPicpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgKVxuICAgIHRoaXMuY3VycmVudFJlcXVlc3RzKytcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBCT1NIQ29ubmVjdGlvblxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciBNZWNoYW5pc20gPSByZXF1aXJlKCcuL2F1dGhlbnRpY2F0aW9uL21lY2hhbmlzbScpXG5cbi8qKlxuICogQXZhaWxhYmxlIG1ldGhvZHMgZm9yIGNsaWVudC1zaWRlIGF1dGhlbnRpY2F0aW9uIChDbGllbnQpXG4gKiBAcGFyYW0gIEFycmF5IG9mZmVyZWRNZWNocyAgbWV0aG9kcyBvZmZlcmVkIGJ5IHNlcnZlclxuICogQHBhcmFtICBBcnJheSBwcmVmZXJyZWRNZWNoIHByZWZlcnJlZCBtZXRob2RzIGJ5IGNsaWVudFxuICogQHBhcmFtICBBcnJheSBhdmFpbGFibGVNZWNoIGF2YWlsYWJsZSBtZXRob2RzIG9uIGNsaWVudFxuICovXG5mdW5jdGlvbiBzZWxlY3RNZWNoYW5pc20ob2ZmZXJlZE1lY2hzLCBwcmVmZXJyZWRNZWNoLCBhdmFpbGFibGVNZWNoKSB7XG4gICAgdmFyIG1lY2hDbGFzc2VzID0gW11cbiAgICB2YXIgYnlOYW1lID0ge31cbiAgICB2YXIgTWVjaFxuICAgIGlmIChBcnJheS5pc0FycmF5KGF2YWlsYWJsZU1lY2gpKSB7XG4gICAgICAgIG1lY2hDbGFzc2VzID0gbWVjaENsYXNzZXMuY29uY2F0KGF2YWlsYWJsZU1lY2gpXG4gICAgfVxuICAgIG1lY2hDbGFzc2VzLmZvckVhY2goZnVuY3Rpb24obWVjaENsYXNzKSB7XG4gICAgICAgIGJ5TmFtZVttZWNoQ2xhc3MucHJvdG90eXBlLm5hbWVdID0gbWVjaENsYXNzXG4gICAgfSlcbiAgICAvKiBBbnkgcHJlZmVycmVkPyAqL1xuICAgIGlmIChieU5hbWVbcHJlZmVycmVkTWVjaF0gJiZcbiAgICAgICAgKG9mZmVyZWRNZWNocy5pbmRleE9mKHByZWZlcnJlZE1lY2gpID49IDApKSB7XG4gICAgICAgIE1lY2ggPSBieU5hbWVbcHJlZmVycmVkTWVjaF1cbiAgICB9XG4gICAgLyogQnkgcHJpb3JpdHkgKi9cbiAgICBtZWNoQ2xhc3Nlcy5mb3JFYWNoKGZ1bmN0aW9uKG1lY2hDbGFzcykge1xuICAgICAgICBpZiAoIU1lY2ggJiZcbiAgICAgICAgICAgIChvZmZlcmVkTWVjaHMuaW5kZXhPZihtZWNoQ2xhc3MucHJvdG90eXBlLm5hbWUpID49IDApKVxuICAgICAgICAgICAgTWVjaCA9IG1lY2hDbGFzc1xuICAgIH0pXG5cbiAgICByZXR1cm4gTWVjaCA/IG5ldyBNZWNoKCkgOiBudWxsXG59XG5cbi8qKlxuICogV2lsbCBkZXRlY3QgdGhlIGF2YWlsYWJsZSBtZWNoYW5pc21zIGJhc2VkIG9uIHRoZSBnaXZlbiBvcHRpb25zXG4gKiBAcGFyYW0gIHtbdHlwZV19IG9wdGlvbnMgY2xpZW50IGNvbmZpZ3VyYXRpb25cbiAqIEBwYXJhbSAgQXJyYXkgYXZhaWxhYmxlTWVjaCBhdmFpbGFibGUgbWV0aG9kcyBvbiBjbGllbnRcbiAqIEByZXR1cm4ge1t0eXBlXX0gICAgICAgICBhdmFpbGFibGUgb3B0aW9uc1xuICovXG5mdW5jdGlvbiBkZXRlY3RNZWNoYW5pc21zKG9wdGlvbnMsIGF2YWlsYWJsZU1lY2gpIHtcbiAgICB2YXIgbWVjaENsYXNzZXMgPSBhdmFpbGFibGVNZWNoID8gYXZhaWxhYmxlTWVjaCA6IFtdXG5cbiAgICB2YXIgZGV0ZWN0ID0gW11cbiAgICBtZWNoQ2xhc3Nlcy5mb3JFYWNoKGZ1bmN0aW9uKG1lY2hDbGFzcykge1xuICAgICAgICB2YXIgbWF0Y2ggPSBtZWNoQ2xhc3MucHJvdG90eXBlLm1hdGNoXG4gICAgICAgIGlmIChtYXRjaChvcHRpb25zKSkgZGV0ZWN0LnB1c2gobWVjaENsYXNzKVxuICAgIH0pXG4gICAgcmV0dXJuIGRldGVjdFxufVxuXG5leHBvcnRzLnNlbGVjdE1lY2hhbmlzbSA9IHNlbGVjdE1lY2hhbmlzbVxuZXhwb3J0cy5kZXRlY3RNZWNoYW5pc21zID0gZGV0ZWN0TWVjaGFuaXNtc1xuZXhwb3J0cy5BYnN0cmFjdE1lY2hhbmlzbSA9IE1lY2hhbmlzbVxuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCB0bHMgPSByZXF1aXJlKCd0bHMnKVxuICAsIGNyeXB0byA9IHJlcXVpcmUoJ2NyeXB0bycpXG4gICwgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgQ29ubmVjdGlvbiA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykuQ29ubmVjdGlvblxuICAsIEpJRCA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykuSklEXG4gICwgU1JWID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5TUlZcbiAgLCBCT1NIQ29ubmVjdGlvbiA9IHJlcXVpcmUoJy4vYm9zaCcpXG4gICwgV1NDb25uZWN0aW9uID0gcmVxdWlyZSgnLi93ZWJzb2NrZXRzJylcbiAgLCBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3htcHA6Y2xpZW50OnNlc3Npb24nKVxuXG5mdW5jdGlvbiBTZXNzaW9uKG9wdHMpIHtcbiAgICBFdmVudEVtaXR0ZXIuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy5zZXRPcHRpb25zKG9wdHMpXG5cbiAgICBpZiAob3B0cy53ZWJzb2NrZXQgJiYgb3B0cy53ZWJzb2NrZXQudXJsKSB7XG4gICAgICAgIGRlYnVnKCdzdGFydCB3ZWJzb2NrZXQgY29ubmVjdGlvbicpXG4gICAgICAgIHRoaXMuX3NldHVwV2Vic29ja2V0Q29ubmVjdGlvbihvcHRzKVxuICAgIH0gZWxzZSBpZiAob3B0cy5ib3NoICYmIG9wdHMuYm9zaC51cmwpIHtcbiAgICAgICAgZGVidWcoJ3N0YXJ0IGJvc2ggY29ubmVjdGlvbicpXG4gICAgICAgIHRoaXMuX3NldHVwQm9zaENvbm5lY3Rpb24ob3B0cylcbiAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1Zygnc3RhcnQgc29ja2V0IGNvbm5lY3Rpb24nKVxuICAgICAgICB0aGlzLl9zZXR1cFNvY2tldENvbm5lY3Rpb24ob3B0cylcbiAgICB9XG59XG5cbnV0aWwuaW5oZXJpdHMoU2Vzc2lvbiwgRXZlbnRFbWl0dGVyKVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fc2V0dXBTb2NrZXRDb25uZWN0aW9uID0gZnVuY3Rpb24ob3B0cykge1xuICAgIHZhciBwYXJhbXMgPSB7XG4gICAgICAgIHhtbG5zOiB7ICcnOiBvcHRzLnhtbG5zIH0sXG4gICAgICAgIHN0cmVhbUF0dHJzOiB7XG4gICAgICAgICAgICB2ZXJzaW9uOiAnMS4wJyxcbiAgICAgICAgICAgIHRvOiB0aGlzLmppZC5kb21haW5cbiAgICAgICAgfSxcbiAgICAgICAgc2VyaWFsaXplZDogb3B0cy5zZXJpYWxpemVkXG4gICAgfVxuICAgIGZvciAodmFyICBrZXkgaW4gb3B0cylcbiAgICAgICAgaWYgKCEoa2V5IGluIHBhcmFtcykpXG4gICAgICAgICAgICBwYXJhbXNba2V5XSA9IG9wdHNba2V5XVxuXG4gICAgdGhpcy5jb25uZWN0aW9uID0gbmV3IENvbm5lY3Rpb24ocGFyYW1zKVxuICAgIHRoaXMuX2FkZENvbm5lY3Rpb25MaXN0ZW5lcnMoKVxuXG4gICAgaWYgKG9wdHMuaG9zdCkge1xuICAgICAgICB0aGlzLl9zb2NrZXRDb25uZWN0aW9uVG9Ib3N0KG9wdHMpXG4gICAgfSBlbHNlIGlmICghU1JWKSB7XG4gICAgICAgIHRocm93ICdDYW5ub3QgbG9hZCBTUlYnXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fcGVyZm9ybVNydkxvb2t1cChvcHRzKVxuICAgIH1cbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuX3NvY2tldENvbm5lY3Rpb25Ub0hvc3QgPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgaWYgKG9wdHMubGVnYWN5U1NMKSB7XG4gICAgICAgIHRoaXMuY29ubmVjdGlvbi5hbGxvd1RMUyA9IGZhbHNlXG4gICAgICAgIHRoaXMuY29ubmVjdGlvbi5jb25uZWN0KHtcbiAgICAgICAgICAgIHNvY2tldDpmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRscy5jb25uZWN0KFxuICAgICAgICAgICAgICAgICAgICBvcHRzLnBvcnQgfHwgNTIyMyxcbiAgICAgICAgICAgICAgICAgICAgb3B0cy5ob3N0LFxuICAgICAgICAgICAgICAgICAgICBvcHRzLmNyZWRlbnRpYWxzIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnNvY2tldC5hdXRob3JpemVkKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgnY29ubmVjdCcsIHRoaXMuc29ja2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCAndW5hdXRob3JpemVkJylcbiAgICAgICAgICAgICAgICAgICAgfS5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChvcHRzLmNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICB0aGlzLmNvbm5lY3Rpb24uY3JlZGVudGlhbHMgPSBjcnlwdG9cbiAgICAgICAgICAgICAgICAuY3JlYXRlQ3JlZGVudGlhbHMob3B0cy5jcmVkZW50aWFscylcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0cy5kaXNhbGxvd1RMUykgdGhpcy5jb25uZWN0aW9uLmFsbG93VExTID0gZmFsc2VcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmxpc3Rlbih7XG4gICAgICAgICAgICBzb2NrZXQ6ZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIC8vIHdhaXQgZm9yIGNvbm5lY3QgZXZlbnQgbGlzdGVuZXJzXG4gICAgICAgICAgICAgICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc29ja2V0LmNvbm5lY3Qob3B0cy5wb3J0IHx8IDUyMjIsIG9wdHMuaG9zdClcbiAgICAgICAgICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgICAgICAgICAgdmFyIHNvY2tldCA9IG9wdHMuc29ja2V0XG4gICAgICAgICAgICAgICAgb3B0cy5zb2NrZXQgPSBudWxsXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvY2tldCAvLyBtYXliZSBjcmVhdGUgbmV3IHNvY2tldFxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH1cbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuX3BlcmZvcm1TcnZMb29rdXAgPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgaWYgKG9wdHMubGVnYWN5U1NMKSB7XG4gICAgICAgIHRocm93ICdMZWdhY3lTU0wgbW9kZSBkb2VzIG5vdCBzdXBwb3J0IEROUyBsb29rdXBzJ1xuICAgIH1cbiAgICBpZiAob3B0cy5jcmVkZW50aWFscylcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmNyZWRlbnRpYWxzID0gY3J5cHRvLmNyZWF0ZUNyZWRlbnRpYWxzKG9wdHMuY3JlZGVudGlhbHMpXG4gICAgaWYgKG9wdHMuZGlzYWxsb3dUTFMpXG4gICAgICAgIHRoaXMuY29ubmVjdGlvbi5hbGxvd1RMUyA9IGZhbHNlXG4gICAgdGhpcy5jb25uZWN0aW9uLmxpc3Rlbih7c29ja2V0OlNSVi5jb25uZWN0KHtcbiAgICAgICAgc29ja2V0OiAgICAgIG9wdHMuc29ja2V0LFxuICAgICAgICBzZXJ2aWNlczogICAgWydfeG1wcC1jbGllbnQuX3RjcCddLFxuICAgICAgICBkb21haW46ICAgICAgdGhpcy5qaWQuZG9tYWluLFxuICAgICAgICBkZWZhdWx0UG9ydDogNTIyMlxuICAgIH0pfSlcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuX3NldHVwQm9zaENvbm5lY3Rpb24gPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgdGhpcy5jb25uZWN0aW9uID0gbmV3IEJPU0hDb25uZWN0aW9uKHtcbiAgICAgICAgamlkOiB0aGlzLmppZCxcbiAgICAgICAgYm9zaDogb3B0cy5ib3NoLFxuICAgICAgICB3YWl0OiB0aGlzLndhaXRcbiAgICB9KVxuICAgIHRoaXMuX2FkZENvbm5lY3Rpb25MaXN0ZW5lcnMoKVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fc2V0dXBXZWJzb2NrZXRDb25uZWN0aW9uID0gZnVuY3Rpb24ob3B0cykge1xuICAgIHRoaXMuY29ubmVjdGlvbiA9IG5ldyBXU0Nvbm5lY3Rpb24oe1xuICAgICAgICBqaWQ6IHRoaXMuamlkLFxuICAgICAgICB3ZWJzb2NrZXQ6IG9wdHMud2Vic29ja2V0XG4gICAgfSlcbiAgICB0aGlzLl9hZGRDb25uZWN0aW9uTGlzdGVuZXJzKClcbiAgICB0aGlzLmNvbm5lY3Rpb24ub24oJ2Nvbm5lY3RlZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICAvLyBDbGllbnRzIHN0YXJ0IDxzdHJlYW06c3RyZWFtPiwgc2VydmVycyByZXBseVxuICAgICAgICBpZiAodGhpcy5jb25uZWN0aW9uLnN0YXJ0U3RyZWFtKVxuICAgICAgICAgICAgdGhpcy5jb25uZWN0aW9uLnN0YXJ0U3RyZWFtKClcbiAgICB9LmJpbmQodGhpcykpXG59XG5cblNlc3Npb24ucHJvdG90eXBlLnNldE9wdGlvbnMgPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgLyoganNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICB0aGlzLmppZCA9ICh0eXBlb2Ygb3B0cy5qaWQgPT09ICdzdHJpbmcnKSA/IG5ldyBKSUQob3B0cy5qaWQpIDogb3B0cy5qaWRcbiAgICB0aGlzLnBhc3N3b3JkID0gb3B0cy5wYXNzd29yZFxuICAgIHRoaXMucHJlZmVycmVkU2FzbE1lY2hhbmlzbSA9IG9wdHMucHJlZmVycmVkU2FzbE1lY2hhbmlzbVxuICAgIHRoaXMuYXBpX2tleSA9IG9wdHMuYXBpX2tleVxuICAgIHRoaXMuYWNjZXNzX3Rva2VuID0gb3B0cy5hY2Nlc3NfdG9rZW5cbiAgICB0aGlzLm9hdXRoMl90b2tlbiA9IG9wdHMub2F1dGgyX3Rva2VuXG4gICAgdGhpcy5vYXV0aDJfYXV0aCA9IG9wdHMub2F1dGgyX2F1dGhcbiAgICB0aGlzLnJlZ2lzdGVyID0gb3B0cy5yZWdpc3RlclxuICAgIHRoaXMud2FpdCA9IG9wdHMud2FpdCB8fCAnMTAnXG4gICAgaWYgKHR5cGVvZiBvcHRzLmFjdEFzID09PSAnc3RyaW5nJykge1xuICAgICAgICB0aGlzLmFjdEFzID0gbmV3IEpJRChvcHRzLmFjdEFzKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYWN0QXMgPSBvcHRzLmFjdEFzXG4gICAgfVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fYWRkQ29ubmVjdGlvbkxpc3RlbmVycyA9IGZ1bmN0aW9uIChjb24pIHtcbiAgICBjb24gPSBjb24gfHwgdGhpcy5jb25uZWN0aW9uXG4gICAgY29uLm9uKCdzdGFuemEnLCB0aGlzLm9uU3RhbnphLmJpbmQodGhpcykpXG4gICAgY29uLm9uKCdkcmFpbicsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdkcmFpbicpKVxuICAgIGNvbi5vbignZW5kJywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2VuZCcpKVxuICAgIGNvbi5vbignY2xvc2UnLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnY2xvc2UnKSlcbiAgICBjb24ub24oJ2Vycm9yJywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2Vycm9yJykpXG4gICAgY29uLm9uKCdjb25uZWN0JywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2Nvbm5lY3QnKSlcbiAgICBjb24ub24oJ3JlY29ubmVjdCcsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdyZWNvbm5lY3QnKSlcbiAgICBjb24ub24oJ2Rpc2Nvbm5lY3QnLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZGlzY29ubmVjdCcpKVxuICAgIGlmIChjb24uc3RhcnRTdHJlYW0pIHtcbiAgICAgICAgY29uLm9uKCdjb25uZWN0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gQ2xpZW50cyBzdGFydCA8c3RyZWFtOnN0cmVhbT4sIHNlcnZlcnMgcmVwbHlcbiAgICAgICAgICAgIGNvbi5zdGFydFN0cmVhbSgpXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMub24oJ2F1dGgnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb24uc3RhcnRTdHJlYW0oKVxuICAgICAgICB9KVxuICAgIH1cbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW9uICYmIHRoaXMuY29ubmVjdGlvbi5wYXVzZSlcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLnBhdXNlKClcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUucmVzdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvbiAmJiB0aGlzLmNvbm5lY3Rpb24ucmVzdW1lKVxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24ucmVzdW1lKClcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb24gPyB0aGlzLmNvbm5lY3Rpb24uc2VuZChzdGFuemEpIDogZmFsc2Vcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvbilcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmVuZCgpXG59XG5cblNlc3Npb24ucHJvdG90eXBlLm9uU3RhbnphID0gZnVuY3Rpb24oKSB7fVxuXG5tb2R1bGUuZXhwb3J0cyA9IFNlc3Npb25cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIikpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIGx0eCA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykubHR4XG4gICwgU3RyZWFtUGFyc2VyID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5TdHJlYW1QYXJzZXJcbiAgLCBXZWJTb2NrZXQgPSByZXF1aXJlKCdmYXllLXdlYnNvY2tldCcpICYmIHJlcXVpcmUoJ2ZheWUtd2Vic29ja2V0JykuQ2xpZW50ID9cbiAgICAgIHJlcXVpcmUoJ2ZheWUtd2Vic29ja2V0JykuQ2xpZW50IDogd2luZG93LldlYlNvY2tldFxuICAsIENvbm5lY3Rpb24gPSByZXF1aXJlKCdub2RlLXhtcHAtY29yZScpLkNvbm5lY3Rpb25cbiAgLCBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3htcHA6Y2xpZW50OndlYnNvY2tldHMnKVxuXG5mdW5jdGlvbiBXU0Nvbm5lY3Rpb24ob3B0cykge1xuICAgIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLnVybCA9IG9wdHMud2Vic29ja2V0LnVybFxuICAgIHRoaXMuamlkID0gb3B0cy5qaWRcbiAgICB0aGlzLnhtbG5zID0ge31cbiAgICB0aGlzLndlYnNvY2tldCA9IG5ldyBXZWJTb2NrZXQodGhpcy51cmwsIFsneG1wcCddKVxuICAgIHRoaXMud2Vic29ja2V0Lm9ub3BlbiA9IHRoaXMub25vcGVuLmJpbmQodGhpcylcbiAgICB0aGlzLndlYnNvY2tldC5vbm1lc3NhZ2UgPSB0aGlzLm9ubWVzc2FnZS5iaW5kKHRoaXMpXG4gICAgdGhpcy53ZWJzb2NrZXQub25jbG9zZSA9IHRoaXMub25jbG9zZS5iaW5kKHRoaXMpXG4gICAgdGhpcy53ZWJzb2NrZXQub25lcnJvciA9IHRoaXMub25lcnJvci5iaW5kKHRoaXMpXG59XG5cbnV0aWwuaW5oZXJpdHMoV1NDb25uZWN0aW9uLCBFdmVudEVtaXR0ZXIpXG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUubWF4U3RhbnphU2l6ZSA9IDY1NTM1XG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLnhtcHBWZXJzaW9uID0gJzEuMCdcblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5vbm9wZW4gPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnN0YXJ0UGFyc2VyKClcbiAgICB0aGlzLmVtaXQoJ2Nvbm5lY3RlZCcpXG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUuc3RhcnRQYXJzZXIgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXNcbiAgICB0aGlzLnBhcnNlciA9IG5ldyBTdHJlYW1QYXJzZXIuU3RyZWFtUGFyc2VyKHRoaXMubWF4U3RhbnphU2l6ZSlcblxuICAgIHRoaXMucGFyc2VyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgICAgIHNlbGYuc3RyZWFtQXR0cnMgPSBhdHRyc1xuICAgICAgICAvKiBXZSBuZWVkIHRob3NlIHhtbG5zIG9mdGVuLCBzdG9yZSB0aGVtIGV4dHJhICovXG4gICAgICAgIHNlbGYuc3RyZWFtTnNBdHRycyA9IHt9XG4gICAgICAgIGZvciAodmFyIGsgaW4gYXR0cnMpIHtcbiAgICAgICAgICAgIGlmICgoayA9PT0gJ3htbG5zJykgfHxcbiAgICAgICAgICAgICAgICAoay5zdWJzdHIoMCwgNikgPT09ICd4bWxuczonKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuc3RyZWFtTnNBdHRyc1trXSA9IGF0dHJzW2tdXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvKiBOb3RpZnkgaW4gY2FzZSB3ZSBkb24ndCB3YWl0IGZvciA8c3RyZWFtOmZlYXR1cmVzLz5cbiAgICAgICAgICAgKENvbXBvbmVudCBvciBub24tMS4wIHN0cmVhbXMpXG4gICAgICAgICAqL1xuICAgICAgICBzZWxmLmVtaXQoJ3N0cmVhbVN0YXJ0JywgYXR0cnMpXG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5vbignc3RhbnphJywgZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgICAgIC8vc2VsZi5vblN0YW56YShzZWxmLmFkZFN0cmVhbU5zKHN0YW56YSkpXG4gICAgICAgIHNlbGYub25TdGFuemEoc3RhbnphKVxuICAgIH0pXG4gICAgdGhpcy5wYXJzZXIub24oJ2Vycm9yJywgdGhpcy5vbmVycm9yLmJpbmQodGhpcykpXG4gICAgdGhpcy5wYXJzZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICBzZWxmLnN0b3BQYXJzZXIoKVxuICAgICAgICBzZWxmLmVuZCgpXG4gICAgfSlcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5zdG9wUGFyc2VyID0gZnVuY3Rpb24oKSB7XG4gICAgLyogTm8gbW9yZSBldmVudHMsIHBsZWFzZSAobWF5IGhhcHBlbiBob3dldmVyKSAqL1xuICAgIGlmICh0aGlzLnBhcnNlcikge1xuICAgICAgICAvKiBHZXQgR0MnZWQgKi9cbiAgICAgICAgZGVsZXRlIHRoaXMucGFyc2VyXG4gICAgfVxufVxuXG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLm9ubWVzc2FnZSA9IGZ1bmN0aW9uKG1zZykge1xuICAgIGRlYnVnKCd3cyBtc2cgPC0tJywgbXNnLmRhdGEpXG4gICAgaWYgKG1zZyAmJiBtc2cuZGF0YSAmJiB0aGlzLnBhcnNlcilcbiAgICAgICAgdGhpcy5wYXJzZXIud3JpdGUobXNnLmRhdGEpXG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUub25TdGFuemEgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBpZiAoc3RhbnphLmlzKCdlcnJvcicsIENvbm5lY3Rpb24uTlNfU1RSRUFNKSkge1xuICAgICAgICAvKiBUT0RPOiBleHRyYWN0IGVycm9yIHRleHQgKi9cbiAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsIHN0YW56YSlcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ3N0YW56YScsIHN0YW56YSlcbiAgICB9XG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUuc3RhcnRTdHJlYW0gPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXR0cnMgPSB7fVxuICAgIGZvcih2YXIgayBpbiB0aGlzLnhtbG5zKSB7XG4gICAgICAgIGlmICh0aGlzLnhtbG5zLmhhc093blByb3BlcnR5KGspKSB7XG4gICAgICAgICAgICBpZiAoIWspIHtcbiAgICAgICAgICAgICAgICBhdHRycy54bWxucyA9IHRoaXMueG1sbnNba11cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXR0cnNbJ3htbG5zOicgKyBrXSA9IHRoaXMueG1sbnNba11cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAodGhpcy54bXBwVmVyc2lvbilcbiAgICAgICAgYXR0cnMudmVyc2lvbiA9IHRoaXMueG1wcFZlcnNpb25cbiAgICBpZiAodGhpcy5zdHJlYW1UbylcbiAgICAgICAgYXR0cnMudG8gPSB0aGlzLnN0cmVhbVRvXG4gICAgaWYgKHRoaXMuc3RyZWFtSWQpXG4gICAgICAgIGF0dHJzLmlkID0gdGhpcy5zdHJlYW1JZFxuICAgIGlmICh0aGlzLmppZClcbiAgICAgICAgYXR0cnMudG8gPSB0aGlzLmppZC5kb21haW5cbiAgICBhdHRycy54bWxucyA9ICdqYWJiZXI6Y2xpZW50J1xuICAgIGF0dHJzWyd4bWxuczpzdHJlYW0nXSA9IENvbm5lY3Rpb24uTlNfU1RSRUFNXG5cbiAgICB2YXIgZWwgPSBuZXcgbHR4LkVsZW1lbnQoJ3N0cmVhbTpzdHJlYW0nLCBhdHRycylcbiAgICAvLyBtYWtlIGl0IG5vbi1lbXB0eSB0byBjdXQgdGhlIGNsb3NpbmcgdGFnXG4gICAgZWwudCgnICcpXG4gICAgdmFyIHMgPSBlbC50b1N0cmluZygpXG4gICAgdGhpcy5zZW5kKHMuc3Vic3RyKDAsIHMuaW5kZXhPZignIDwvc3RyZWFtOnN0cmVhbT4nKSkpXG5cbiAgICB0aGlzLnN0cmVhbU9wZW5lZCA9IHRydWVcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgaWYgKHN0YW56YS5yb290KSBzdGFuemEgPSBzdGFuemEucm9vdCgpXG4gICAgc3RhbnphID0gc3RhbnphLnRvU3RyaW5nKClcbiAgICBkZWJ1Zygnd3Mgc2VuZCAtLT4nLCBzdGFuemEpXG4gICAgdGhpcy53ZWJzb2NrZXQuc2VuZChzdGFuemEpXG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUub25jbG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuZW1pdCgnZGlzY29ubmVjdCcpXG4gICAgdGhpcy5lbWl0KCdjbG9zZScpXG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zZW5kKCc8L3N0cmVhbTpzdHJlYW0+JylcbiAgICB0aGlzLmVtaXQoJ2Rpc2Nvbm5lY3QnKVxuICAgIHRoaXMuZW1pdCgnZW5kJylcbiAgICBpZiAodGhpcy53ZWJzb2NrZXQpXG4gICAgICAgIHRoaXMud2Vic29ja2V0LmNsb3NlKClcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5vbmVycm9yID0gZnVuY3Rpb24oZSkge1xuICAgIHRoaXMuZW1pdCgnZXJyb3InLCBlKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFdTQ29ubmVjdGlvblxuIiwiLy8gQnJvd3NlciBSZXF1ZXN0XG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuXG4vLyBVTUQgSEVBREVSIFNUQVJUIFxuKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICAvLyBBTUQuIFJlZ2lzdGVyIGFzIGFuIGFub255bW91cyBtb2R1bGUuXG4gICAgICAgIGRlZmluZShbXSwgZmFjdG9yeSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgLy8gTm9kZS4gRG9lcyBub3Qgd29yayB3aXRoIHN0cmljdCBDb21tb25KUywgYnV0XG4gICAgICAgIC8vIG9ubHkgQ29tbW9uSlMtbGlrZSBlbnZpcm9tZW50cyB0aGF0IHN1cHBvcnQgbW9kdWxlLmV4cG9ydHMsXG4gICAgICAgIC8vIGxpa2UgTm9kZS5cbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQnJvd3NlciBnbG9iYWxzIChyb290IGlzIHdpbmRvdylcbiAgICAgICAgcm9vdC5yZXR1cm5FeHBvcnRzID0gZmFjdG9yeSgpO1xuICB9XG59KHRoaXMsIGZ1bmN0aW9uICgpIHtcbi8vIFVNRCBIRUFERVIgRU5EXG5cbnZhciBYSFIgPSBYTUxIdHRwUmVxdWVzdFxuaWYgKCFYSFIpIHRocm93IG5ldyBFcnJvcignbWlzc2luZyBYTUxIdHRwUmVxdWVzdCcpXG5yZXF1ZXN0LmxvZyA9IHtcbiAgJ3RyYWNlJzogbm9vcCwgJ2RlYnVnJzogbm9vcCwgJ2luZm8nOiBub29wLCAnd2Fybic6IG5vb3AsICdlcnJvcic6IG5vb3Bcbn1cblxudmFyIERFRkFVTFRfVElNRU9VVCA9IDMgKiA2MCAqIDEwMDAgLy8gMyBtaW51dGVzXG5cbi8vXG4vLyByZXF1ZXN0XG4vL1xuXG5mdW5jdGlvbiByZXF1ZXN0KG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gIC8vIFRoZSBlbnRyeS1wb2ludCB0byB0aGUgQVBJOiBwcmVwIHRoZSBvcHRpb25zIG9iamVjdCBhbmQgcGFzcyB0aGUgcmVhbCB3b3JrIHRvIHJ1bl94aHIuXG4gIGlmKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJylcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhZCBjYWxsYmFjayBnaXZlbjogJyArIGNhbGxiYWNrKVxuXG4gIGlmKCFvcHRpb25zKVxuICAgIHRocm93IG5ldyBFcnJvcignTm8gb3B0aW9ucyBnaXZlbicpXG5cbiAgdmFyIG9wdGlvbnNfb25SZXNwb25zZSA9IG9wdGlvbnMub25SZXNwb25zZTsgLy8gU2F2ZSB0aGlzIGZvciBsYXRlci5cblxuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXG4gICAgb3B0aW9ucyA9IHsndXJpJzpvcHRpb25zfTtcbiAgZWxzZVxuICAgIG9wdGlvbnMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdGlvbnMpKTsgLy8gVXNlIGEgZHVwbGljYXRlIGZvciBtdXRhdGluZy5cblxuICBvcHRpb25zLm9uUmVzcG9uc2UgPSBvcHRpb25zX29uUmVzcG9uc2UgLy8gQW5kIHB1dCBpdCBiYWNrLlxuXG4gIGlmIChvcHRpb25zLnZlcmJvc2UpIHJlcXVlc3QubG9nID0gZ2V0TG9nZ2VyKCk7XG5cbiAgaWYob3B0aW9ucy51cmwpIHtcbiAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJsO1xuICAgIGRlbGV0ZSBvcHRpb25zLnVybDtcbiAgfVxuXG4gIGlmKCFvcHRpb25zLnVyaSAmJiBvcHRpb25zLnVyaSAhPT0gXCJcIilcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLnVyaSBpcyBhIHJlcXVpcmVkIGFyZ3VtZW50XCIpO1xuXG4gIGlmKHR5cGVvZiBvcHRpb25zLnVyaSAhPSBcInN0cmluZ1wiKVxuICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMudXJpIG11c3QgYmUgYSBzdHJpbmdcIik7XG5cbiAgdmFyIHVuc3VwcG9ydGVkX29wdGlvbnMgPSBbJ3Byb3h5JywgJ19yZWRpcmVjdHNGb2xsb3dlZCcsICdtYXhSZWRpcmVjdHMnLCAnZm9sbG93UmVkaXJlY3QnXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHVuc3VwcG9ydGVkX29wdGlvbnMubGVuZ3RoOyBpKyspXG4gICAgaWYob3B0aW9uc1sgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSBdKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy5cIiArIHVuc3VwcG9ydGVkX29wdGlvbnNbaV0gKyBcIiBpcyBub3Qgc3VwcG9ydGVkXCIpXG5cbiAgb3B0aW9ucy5jYWxsYmFjayA9IGNhbGxiYWNrXG4gIG9wdGlvbnMubWV0aG9kID0gb3B0aW9ucy5tZXRob2QgfHwgJ0dFVCc7XG4gIG9wdGlvbnMuaGVhZGVycyA9IG9wdGlvbnMuaGVhZGVycyB8fCB7fTtcbiAgb3B0aW9ucy5ib2R5ICAgID0gb3B0aW9ucy5ib2R5IHx8IG51bGxcbiAgb3B0aW9ucy50aW1lb3V0ID0gb3B0aW9ucy50aW1lb3V0IHx8IHJlcXVlc3QuREVGQVVMVF9USU1FT1VUXG5cbiAgaWYob3B0aW9ucy5oZWFkZXJzLmhvc3QpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiT3B0aW9ucy5oZWFkZXJzLmhvc3QgaXMgbm90IHN1cHBvcnRlZFwiKTtcblxuICBpZihvcHRpb25zLmpzb24pIHtcbiAgICBvcHRpb25zLmhlYWRlcnMuYWNjZXB0ID0gb3B0aW9ucy5oZWFkZXJzLmFjY2VwdCB8fCAnYXBwbGljYXRpb24vanNvbidcbiAgICBpZihvcHRpb25zLm1ldGhvZCAhPT0gJ0dFVCcpXG4gICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gJ2FwcGxpY2F0aW9uL2pzb24nXG5cbiAgICBpZih0eXBlb2Ygb3B0aW9ucy5qc29uICE9PSAnYm9vbGVhbicpXG4gICAgICBvcHRpb25zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXG4gICAgZWxzZSBpZih0eXBlb2Ygb3B0aW9ucy5ib2R5ICE9PSAnc3RyaW5nJylcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuYm9keSlcbiAgfVxuICBcbiAgLy9CRUdJTiBRUyBIYWNrXG4gIHZhciBzZXJpYWxpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgc3RyID0gW107XG4gICAgZm9yKHZhciBwIGluIG9iailcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdKSk7XG4gICAgICB9XG4gICAgcmV0dXJuIHN0ci5qb2luKFwiJlwiKTtcbiAgfVxuICBcbiAgaWYob3B0aW9ucy5xcyl7XG4gICAgdmFyIHFzID0gKHR5cGVvZiBvcHRpb25zLnFzID09ICdzdHJpbmcnKT8gb3B0aW9ucy5xcyA6IHNlcmlhbGl6ZShvcHRpb25zLnFzKTtcbiAgICBpZihvcHRpb25zLnVyaS5pbmRleE9mKCc/JykgIT09IC0xKXsgLy9ubyBnZXQgcGFyYW1zXG4gICAgICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmkrJyYnK3FzO1xuICAgIH1lbHNleyAvL2V4aXN0aW5nIGdldCBwYXJhbXNcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnPycrcXM7XG4gICAgfVxuICB9XG4gIC8vRU5EIFFTIEhhY2tcbiAgXG4gIC8vQkVHSU4gRk9STSBIYWNrXG4gIHZhciBtdWx0aXBhcnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICAvL3RvZG86IHN1cHBvcnQgZmlsZSB0eXBlICh1c2VmdWw/KVxuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICByZXN1bHQuYm91bmRyeSA9ICctLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tJytNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqMTAwMDAwMDAwMCk7XG4gICAgdmFyIGxpbmVzID0gW107XG4gICAgZm9yKHZhciBwIGluIG9iail7XG4gICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goXG4gICAgICAgICAgICAgICAgJy0tJytyZXN1bHQuYm91bmRyeStcIlxcblwiK1xuICAgICAgICAgICAgICAgICdDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCInK3ArJ1wiJytcIlxcblwiK1xuICAgICAgICAgICAgICAgIFwiXFxuXCIrXG4gICAgICAgICAgICAgICAgb2JqW3BdK1wiXFxuXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgbGluZXMucHVzaCggJy0tJytyZXN1bHQuYm91bmRyeSsnLS0nICk7XG4gICAgcmVzdWx0LmJvZHkgPSBsaW5lcy5qb2luKCcnKTtcbiAgICByZXN1bHQubGVuZ3RoID0gcmVzdWx0LmJvZHkubGVuZ3RoO1xuICAgIHJlc3VsdC50eXBlID0gJ211bHRpcGFydC9mb3JtLWRhdGE7IGJvdW5kYXJ5PScrcmVzdWx0LmJvdW5kcnk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICBcbiAgaWYob3B0aW9ucy5mb3JtKXtcbiAgICBpZih0eXBlb2Ygb3B0aW9ucy5mb3JtID09ICdzdHJpbmcnKSB0aHJvdygnZm9ybSBuYW1lIHVuc3VwcG9ydGVkJyk7XG4gICAgaWYob3B0aW9ucy5tZXRob2QgPT09ICdQT1NUJyl7XG4gICAgICAgIHZhciBlbmNvZGluZyA9IChvcHRpb25zLmVuY29kaW5nIHx8ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gZW5jb2Rpbmc7XG4gICAgICAgIHN3aXRjaChlbmNvZGluZyl7XG4gICAgICAgICAgICBjYXNlICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnOlxuICAgICAgICAgICAgICAgIG9wdGlvbnMuYm9keSA9IHNlcmlhbGl6ZShvcHRpb25zLmZvcm0pLnJlcGxhY2UoLyUyMC9nLCBcIitcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdtdWx0aXBhcnQvZm9ybS1kYXRhJzpcbiAgICAgICAgICAgICAgICB2YXIgbXVsdGkgPSBtdWx0aXBhcnQob3B0aW9ucy5mb3JtKTtcbiAgICAgICAgICAgICAgICAvL29wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IG11bHRpLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmJvZHkgPSBtdWx0aS5ib2R5O1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBtdWx0aS50eXBlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdCA6IHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgZW5jb2Rpbmc6JytlbmNvZGluZyk7XG4gICAgICAgIH1cbiAgICB9XG4gIH1cbiAgLy9FTkQgRk9STSBIYWNrXG5cbiAgLy8gSWYgb25SZXNwb25zZSBpcyBib29sZWFuIHRydWUsIGNhbGwgYmFjayBpbW1lZGlhdGVseSB3aGVuIHRoZSByZXNwb25zZSBpcyBrbm93bixcbiAgLy8gbm90IHdoZW4gdGhlIGZ1bGwgcmVxdWVzdCBpcyBjb21wbGV0ZS5cbiAgb3B0aW9ucy5vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlIHx8IG5vb3BcbiAgaWYob3B0aW9ucy5vblJlc3BvbnNlID09PSB0cnVlKSB7XG4gICAgb3B0aW9ucy5vblJlc3BvbnNlID0gY2FsbGJhY2tcbiAgICBvcHRpb25zLmNhbGxiYWNrID0gbm9vcFxuICB9XG5cbiAgLy8gWFhYIEJyb3dzZXJzIGRvIG5vdCBsaWtlIHRoaXMuXG4gIC8vaWYob3B0aW9ucy5ib2R5KVxuICAvLyAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LWxlbmd0aCddID0gb3B0aW9ucy5ib2R5Lmxlbmd0aDtcblxuICAvLyBIVFRQIGJhc2ljIGF1dGhlbnRpY2F0aW9uXG4gIGlmKCFvcHRpb25zLmhlYWRlcnMuYXV0aG9yaXphdGlvbiAmJiBvcHRpb25zLmF1dGgpXG4gICAgb3B0aW9ucy5oZWFkZXJzLmF1dGhvcml6YXRpb24gPSAnQmFzaWMgJyArIGI2NF9lbmMob3B0aW9ucy5hdXRoLnVzZXJuYW1lICsgJzonICsgb3B0aW9ucy5hdXRoLnBhc3N3b3JkKTtcblxuICByZXR1cm4gcnVuX3hocihvcHRpb25zKVxufVxuXG52YXIgcmVxX3NlcSA9IDBcbmZ1bmN0aW9uIHJ1bl94aHIob3B0aW9ucykge1xuICB2YXIgeGhyID0gbmV3IFhIUlxuICAgICwgdGltZWRfb3V0ID0gZmFsc2VcbiAgICAsIGlzX2NvcnMgPSBpc19jcm9zc0RvbWFpbihvcHRpb25zLnVyaSlcbiAgICAsIHN1cHBvcnRzX2NvcnMgPSAoJ3dpdGhDcmVkZW50aWFscycgaW4geGhyKVxuXG4gIHJlcV9zZXEgKz0gMVxuICB4aHIuc2VxX2lkID0gcmVxX3NlcVxuICB4aHIuaWQgPSByZXFfc2VxICsgJzogJyArIG9wdGlvbnMubWV0aG9kICsgJyAnICsgb3B0aW9ucy51cmlcbiAgeGhyLl9pZCA9IHhoci5pZCAvLyBJIGtub3cgSSB3aWxsIHR5cGUgXCJfaWRcIiBmcm9tIGhhYml0IGFsbCB0aGUgdGltZS5cblxuICBpZihpc19jb3JzICYmICFzdXBwb3J0c19jb3JzKSB7XG4gICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdCcm93c2VyIGRvZXMgbm90IHN1cHBvcnQgY3Jvc3Mtb3JpZ2luIHJlcXVlc3Q6ICcgKyBvcHRpb25zLnVyaSlcbiAgICBjb3JzX2Vyci5jb3JzID0gJ3Vuc3VwcG9ydGVkJ1xuICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGNvcnNfZXJyLCB4aHIpXG4gIH1cblxuICB4aHIudGltZW91dFRpbWVyID0gc2V0VGltZW91dCh0b29fbGF0ZSwgb3B0aW9ucy50aW1lb3V0KVxuICBmdW5jdGlvbiB0b29fbGF0ZSgpIHtcbiAgICB0aW1lZF9vdXQgPSB0cnVlXG4gICAgdmFyIGVyID0gbmV3IEVycm9yKCdFVElNRURPVVQnKVxuICAgIGVyLmNvZGUgPSAnRVRJTUVET1VUJ1xuICAgIGVyLmR1cmF0aW9uID0gb3B0aW9ucy50aW1lb3V0XG5cbiAgICByZXF1ZXN0LmxvZy5lcnJvcignVGltZW91dCcsIHsgJ2lkJzp4aHIuX2lkLCAnbWlsbGlzZWNvbmRzJzpvcHRpb25zLnRpbWVvdXQgfSlcbiAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlciwgeGhyKVxuICB9XG5cbiAgLy8gU29tZSBzdGF0ZXMgY2FuIGJlIHNraXBwZWQgb3Zlciwgc28gcmVtZW1iZXIgd2hhdCBpcyBzdGlsbCBpbmNvbXBsZXRlLlxuICB2YXIgZGlkID0geydyZXNwb25zZSc6ZmFsc2UsICdsb2FkaW5nJzpmYWxzZSwgJ2VuZCc6ZmFsc2V9XG5cbiAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IG9uX3N0YXRlX2NoYW5nZVxuICB4aHIub3BlbihvcHRpb25zLm1ldGhvZCwgb3B0aW9ucy51cmksIHRydWUpIC8vIGFzeW5jaHJvbm91c1xuICBpZihpc19jb3JzKVxuICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSAhISBvcHRpb25zLndpdGhDcmVkZW50aWFsc1xuICB4aHIuc2VuZChvcHRpb25zLmJvZHkpXG4gIHJldHVybiB4aHJcblxuICBmdW5jdGlvbiBvbl9zdGF0ZV9jaGFuZ2UoZXZlbnQpIHtcbiAgICBpZih0aW1lZF9vdXQpXG4gICAgICByZXR1cm4gcmVxdWVzdC5sb2cuZGVidWcoJ0lnbm9yaW5nIHRpbWVkIG91dCBzdGF0ZSBjaGFuZ2UnLCB7J3N0YXRlJzp4aHIucmVhZHlTdGF0ZSwgJ2lkJzp4aHIuaWR9KVxuXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1N0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZCwgJ3RpbWVkX291dCc6dGltZWRfb3V0fSlcblxuICAgIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuT1BFTkVEKSB7XG4gICAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVxdWVzdCBzdGFydGVkJywgeydpZCc6eGhyLmlkfSlcbiAgICAgIGZvciAodmFyIGtleSBpbiBvcHRpb25zLmhlYWRlcnMpXG4gICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKGtleSwgb3B0aW9ucy5oZWFkZXJzW2tleV0pXG4gICAgfVxuXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkhFQURFUlNfUkVDRUlWRUQpXG4gICAgICBvbl9yZXNwb25zZSgpXG5cbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuTE9BRElORykge1xuICAgICAgb25fcmVzcG9uc2UoKVxuICAgICAgb25fbG9hZGluZygpXG4gICAgfVxuXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkRPTkUpIHtcbiAgICAgIG9uX3Jlc3BvbnNlKClcbiAgICAgIG9uX2xvYWRpbmcoKVxuICAgICAgb25fZW5kKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbl9yZXNwb25zZSgpIHtcbiAgICBpZihkaWQucmVzcG9uc2UpXG4gICAgICByZXR1cm5cblxuICAgIGRpZC5yZXNwb25zZSA9IHRydWVcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnR290IHJlc3BvbnNlJywgeydpZCc6eGhyLmlkLCAnc3RhdHVzJzp4aHIuc3RhdHVzfSlcbiAgICBjbGVhclRpbWVvdXQoeGhyLnRpbWVvdXRUaW1lcilcbiAgICB4aHIuc3RhdHVzQ29kZSA9IHhoci5zdGF0dXMgLy8gTm9kZSByZXF1ZXN0IGNvbXBhdGliaWxpdHlcblxuICAgIC8vIERldGVjdCBmYWlsZWQgQ09SUyByZXF1ZXN0cy5cbiAgICBpZihpc19jb3JzICYmIHhoci5zdGF0dXNDb2RlID09IDApIHtcbiAgICAgIHZhciBjb3JzX2VyciA9IG5ldyBFcnJvcignQ09SUyByZXF1ZXN0IHJlamVjdGVkOiAnICsgb3B0aW9ucy51cmkpXG4gICAgICBjb3JzX2Vyci5jb3JzID0gJ3JlamVjdGVkJ1xuXG4gICAgICAvLyBEbyBub3QgcHJvY2VzcyB0aGlzIHJlcXVlc3QgZnVydGhlci5cbiAgICAgIGRpZC5sb2FkaW5nID0gdHJ1ZVxuICAgICAgZGlkLmVuZCA9IHRydWVcblxuICAgICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soY29yc19lcnIsIHhocilcbiAgICB9XG5cbiAgICBvcHRpb25zLm9uUmVzcG9uc2UobnVsbCwgeGhyKVxuICB9XG5cbiAgZnVuY3Rpb24gb25fbG9hZGluZygpIHtcbiAgICBpZihkaWQubG9hZGluZylcbiAgICAgIHJldHVyblxuXG4gICAgZGlkLmxvYWRpbmcgPSB0cnVlXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1Jlc3BvbnNlIGJvZHkgbG9hZGluZycsIHsnaWQnOnhoci5pZH0pXG4gICAgLy8gVE9ETzogTWF5YmUgc2ltdWxhdGUgXCJkYXRhXCIgZXZlbnRzIGJ5IHdhdGNoaW5nIHhoci5yZXNwb25zZVRleHRcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uX2VuZCgpIHtcbiAgICBpZihkaWQuZW5kKVxuICAgICAgcmV0dXJuXG5cbiAgICBkaWQuZW5kID0gdHJ1ZVxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXF1ZXN0IGRvbmUnLCB7J2lkJzp4aHIuaWR9KVxuXG4gICAgeGhyLmJvZHkgPSB4aHIucmVzcG9uc2VUZXh0XG4gICAgaWYob3B0aW9ucy5qc29uKSB7XG4gICAgICB0cnkgICAgICAgIHsgeGhyLmJvZHkgPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpIH1cbiAgICAgIGNhdGNoIChlcikgeyByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlciwgeGhyKSAgICAgICAgfVxuICAgIH1cblxuICAgIG9wdGlvbnMuY2FsbGJhY2sobnVsbCwgeGhyLCB4aHIuYm9keSlcbiAgfVxuXG59IC8vIHJlcXVlc3RcblxucmVxdWVzdC53aXRoQ3JlZGVudGlhbHMgPSBmYWxzZTtcbnJlcXVlc3QuREVGQVVMVF9USU1FT1VUID0gREVGQVVMVF9USU1FT1VUO1xuXG4vL1xuLy8gZGVmYXVsdHNcbi8vXG5cbnJlcXVlc3QuZGVmYXVsdHMgPSBmdW5jdGlvbihvcHRpb25zLCByZXF1ZXN0ZXIpIHtcbiAgdmFyIGRlZiA9IGZ1bmN0aW9uIChtZXRob2QpIHtcbiAgICB2YXIgZCA9IGZ1bmN0aW9uIChwYXJhbXMsIGNhbGxiYWNrKSB7XG4gICAgICBpZih0eXBlb2YgcGFyYW1zID09PSAnc3RyaW5nJylcbiAgICAgICAgcGFyYW1zID0geyd1cmknOiBwYXJhbXN9O1xuICAgICAgZWxzZSB7XG4gICAgICAgIHBhcmFtcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocGFyYW1zKSk7XG4gICAgICB9XG4gICAgICBmb3IgKHZhciBpIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKHBhcmFtc1tpXSA9PT0gdW5kZWZpbmVkKSBwYXJhbXNbaV0gPSBvcHRpb25zW2ldXG4gICAgICB9XG4gICAgICByZXR1cm4gbWV0aG9kKHBhcmFtcywgY2FsbGJhY2spXG4gICAgfVxuICAgIHJldHVybiBkXG4gIH1cbiAgdmFyIGRlID0gZGVmKHJlcXVlc3QpXG4gIGRlLmdldCA9IGRlZihyZXF1ZXN0LmdldClcbiAgZGUucG9zdCA9IGRlZihyZXF1ZXN0LnBvc3QpXG4gIGRlLnB1dCA9IGRlZihyZXF1ZXN0LnB1dClcbiAgZGUuaGVhZCA9IGRlZihyZXF1ZXN0LmhlYWQpXG4gIHJldHVybiBkZVxufVxuXG4vL1xuLy8gSFRUUCBtZXRob2Qgc2hvcnRjdXRzXG4vL1xuXG52YXIgc2hvcnRjdXRzID0gWyAnZ2V0JywgJ3B1dCcsICdwb3N0JywgJ2hlYWQnIF07XG5zaG9ydGN1dHMuZm9yRWFjaChmdW5jdGlvbihzaG9ydGN1dCkge1xuICB2YXIgbWV0aG9kID0gc2hvcnRjdXQudG9VcHBlckNhc2UoKTtcbiAgdmFyIGZ1bmMgICA9IHNob3J0Y3V0LnRvTG93ZXJDYXNlKCk7XG5cbiAgcmVxdWVzdFtmdW5jXSA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICBpZih0eXBlb2Ygb3B0cyA9PT0gJ3N0cmluZycpXG4gICAgICBvcHRzID0geydtZXRob2QnOm1ldGhvZCwgJ3VyaSc6b3B0c307XG4gICAgZWxzZSB7XG4gICAgICBvcHRzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcHRzKSk7XG4gICAgICBvcHRzLm1ldGhvZCA9IG1ldGhvZDtcbiAgICB9XG5cbiAgICB2YXIgYXJncyA9IFtvcHRzXS5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmFwcGx5KGFyZ3VtZW50cywgWzFdKSk7XG4gICAgcmV0dXJuIHJlcXVlc3QuYXBwbHkodGhpcywgYXJncyk7XG4gIH1cbn0pXG5cbi8vXG4vLyBDb3VjaERCIHNob3J0Y3V0XG4vL1xuXG5yZXF1ZXN0LmNvdWNoID0gZnVuY3Rpb24ob3B0aW9ucywgY2FsbGJhY2spIHtcbiAgaWYodHlwZW9mIG9wdGlvbnMgPT09ICdzdHJpbmcnKVxuICAgIG9wdGlvbnMgPSB7J3VyaSc6b3B0aW9uc31cblxuICAvLyBKdXN0IHVzZSB0aGUgcmVxdWVzdCBBUEkgdG8gZG8gSlNPTi5cbiAgb3B0aW9ucy5qc29uID0gdHJ1ZVxuICBpZihvcHRpb25zLmJvZHkpXG4gICAgb3B0aW9ucy5qc29uID0gb3B0aW9ucy5ib2R5XG4gIGRlbGV0ZSBvcHRpb25zLmJvZHlcblxuICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IG5vb3BcblxuICB2YXIgeGhyID0gcmVxdWVzdChvcHRpb25zLCBjb3VjaF9oYW5kbGVyKVxuICByZXR1cm4geGhyXG5cbiAgZnVuY3Rpb24gY291Y2hfaGFuZGxlcihlciwgcmVzcCwgYm9keSkge1xuICAgIGlmKGVyKVxuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KVxuXG4gICAgaWYoKHJlc3Auc3RhdHVzQ29kZSA8IDIwMCB8fCByZXNwLnN0YXR1c0NvZGUgPiAyOTkpICYmIGJvZHkuZXJyb3IpIHtcbiAgICAgIC8vIFRoZSBib2R5IGlzIGEgQ291Y2ggSlNPTiBvYmplY3QgaW5kaWNhdGluZyB0aGUgZXJyb3IuXG4gICAgICBlciA9IG5ldyBFcnJvcignQ291Y2hEQiBlcnJvcjogJyArIChib2R5LmVycm9yLnJlYXNvbiB8fCBib2R5LmVycm9yLmVycm9yKSlcbiAgICAgIGZvciAodmFyIGtleSBpbiBib2R5KVxuICAgICAgICBlcltrZXldID0gYm9keVtrZXldXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpO1xuICAgIH1cblxuICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XG4gIH1cbn1cblxuLy9cbi8vIFV0aWxpdHlcbi8vXG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5mdW5jdGlvbiBnZXRMb2dnZXIoKSB7XG4gIHZhciBsb2dnZXIgPSB7fVxuICAgICwgbGV2ZWxzID0gWyd0cmFjZScsICdkZWJ1ZycsICdpbmZvJywgJ3dhcm4nLCAnZXJyb3InXVxuICAgICwgbGV2ZWwsIGlcblxuICBmb3IoaSA9IDA7IGkgPCBsZXZlbHMubGVuZ3RoOyBpKyspIHtcbiAgICBsZXZlbCA9IGxldmVsc1tpXVxuXG4gICAgbG9nZ2VyW2xldmVsXSA9IG5vb3BcbiAgICBpZih0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcgJiYgY29uc29sZSAmJiBjb25zb2xlW2xldmVsXSlcbiAgICAgIGxvZ2dlcltsZXZlbF0gPSBmb3JtYXR0ZWQoY29uc29sZSwgbGV2ZWwpXG4gIH1cblxuICByZXR1cm4gbG9nZ2VyXG59XG5cbmZ1bmN0aW9uIGZvcm1hdHRlZChvYmosIG1ldGhvZCkge1xuICByZXR1cm4gZm9ybWF0dGVkX2xvZ2dlclxuXG4gIGZ1bmN0aW9uIGZvcm1hdHRlZF9sb2dnZXIoc3RyLCBjb250ZXh0KSB7XG4gICAgaWYodHlwZW9mIGNvbnRleHQgPT09ICdvYmplY3QnKVxuICAgICAgc3RyICs9ICcgJyArIEpTT04uc3RyaW5naWZ5KGNvbnRleHQpXG5cbiAgICByZXR1cm4gb2JqW21ldGhvZF0uY2FsbChvYmosIHN0cilcbiAgfVxufVxuXG4vLyBSZXR1cm4gd2hldGhlciBhIFVSTCBpcyBhIGNyb3NzLWRvbWFpbiByZXF1ZXN0LlxuZnVuY3Rpb24gaXNfY3Jvc3NEb21haW4odXJsKSB7XG4gIHZhciBydXJsID0gL14oW1xcd1xcK1xcLlxcLV0rOikoPzpcXC9cXC8oW15cXC8/IzpdKikoPzo6KFxcZCspKT8pPy9cblxuICAvLyBqUXVlcnkgIzgxMzgsIElFIG1heSB0aHJvdyBhbiBleGNlcHRpb24gd2hlbiBhY2Nlc3NpbmdcbiAgLy8gYSBmaWVsZCBmcm9tIHdpbmRvdy5sb2NhdGlvbiBpZiBkb2N1bWVudC5kb21haW4gaGFzIGJlZW4gc2V0XG4gIHZhciBhamF4TG9jYXRpb25cbiAgdHJ5IHsgYWpheExvY2F0aW9uID0gbG9jYXRpb24uaHJlZiB9XG4gIGNhdGNoIChlKSB7XG4gICAgLy8gVXNlIHRoZSBocmVmIGF0dHJpYnV0ZSBvZiBhbiBBIGVsZW1lbnQgc2luY2UgSUUgd2lsbCBtb2RpZnkgaXQgZ2l2ZW4gZG9jdW1lbnQubG9jYXRpb25cbiAgICBhamF4TG9jYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCBcImFcIiApO1xuICAgIGFqYXhMb2NhdGlvbi5ocmVmID0gXCJcIjtcbiAgICBhamF4TG9jYXRpb24gPSBhamF4TG9jYXRpb24uaHJlZjtcbiAgfVxuXG4gIHZhciBhamF4TG9jUGFydHMgPSBydXJsLmV4ZWMoYWpheExvY2F0aW9uLnRvTG93ZXJDYXNlKCkpIHx8IFtdXG4gICAgLCBwYXJ0cyA9IHJ1cmwuZXhlYyh1cmwudG9Mb3dlckNhc2UoKSApXG5cbiAgdmFyIHJlc3VsdCA9ICEhKFxuICAgIHBhcnRzICYmXG4gICAgKCAgcGFydHNbMV0gIT0gYWpheExvY1BhcnRzWzFdXG4gICAgfHwgcGFydHNbMl0gIT0gYWpheExvY1BhcnRzWzJdXG4gICAgfHwgKHBhcnRzWzNdIHx8IChwYXJ0c1sxXSA9PT0gXCJodHRwOlwiID8gODAgOiA0NDMpKSAhPSAoYWpheExvY1BhcnRzWzNdIHx8IChhamF4TG9jUGFydHNbMV0gPT09IFwiaHR0cDpcIiA/IDgwIDogNDQzKSlcbiAgICApXG4gIClcblxuICAvL2NvbnNvbGUuZGVidWcoJ2lzX2Nyb3NzRG9tYWluKCcrdXJsKycpIC0+ICcgKyByZXN1bHQpXG4gIHJldHVybiByZXN1bHRcbn1cblxuLy8gTUlUIExpY2Vuc2UgZnJvbSBodHRwOi8vcGhwanMub3JnL2Z1bmN0aW9ucy9iYXNlNjRfZW5jb2RlOjM1OFxuZnVuY3Rpb24gYjY0X2VuYyAoZGF0YSkge1xuICAgIC8vIEVuY29kZXMgc3RyaW5nIHVzaW5nIE1JTUUgYmFzZTY0IGFsZ29yaXRobVxuICAgIHZhciBiNjQgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89XCI7XG4gICAgdmFyIG8xLCBvMiwgbzMsIGgxLCBoMiwgaDMsIGg0LCBiaXRzLCBpID0gMCwgYWMgPSAwLCBlbmM9XCJcIiwgdG1wX2FyciA9IFtdO1xuXG4gICAgaWYgKCFkYXRhKSB7XG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgIH1cblxuICAgIC8vIGFzc3VtZSB1dGY4IGRhdGFcbiAgICAvLyBkYXRhID0gdGhpcy51dGY4X2VuY29kZShkYXRhKycnKTtcblxuICAgIGRvIHsgLy8gcGFjayB0aHJlZSBvY3RldHMgaW50byBmb3VyIGhleGV0c1xuICAgICAgICBvMSA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xuICAgICAgICBvMiA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xuICAgICAgICBvMyA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xuXG4gICAgICAgIGJpdHMgPSBvMTw8MTYgfCBvMjw8OCB8IG8zO1xuXG4gICAgICAgIGgxID0gYml0cz4+MTggJiAweDNmO1xuICAgICAgICBoMiA9IGJpdHM+PjEyICYgMHgzZjtcbiAgICAgICAgaDMgPSBiaXRzPj42ICYgMHgzZjtcbiAgICAgICAgaDQgPSBiaXRzICYgMHgzZjtcblxuICAgICAgICAvLyB1c2UgaGV4ZXRzIHRvIGluZGV4IGludG8gYjY0LCBhbmQgYXBwZW5kIHJlc3VsdCB0byBlbmNvZGVkIHN0cmluZ1xuICAgICAgICB0bXBfYXJyW2FjKytdID0gYjY0LmNoYXJBdChoMSkgKyBiNjQuY2hhckF0KGgyKSArIGI2NC5jaGFyQXQoaDMpICsgYjY0LmNoYXJBdChoNCk7XG4gICAgfSB3aGlsZSAoaSA8IGRhdGEubGVuZ3RoKTtcblxuICAgIGVuYyA9IHRtcF9hcnIuam9pbignJyk7XG5cbiAgICBzd2l0Y2ggKGRhdGEubGVuZ3RoICUgMykge1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICBlbmMgPSBlbmMuc2xpY2UoMCwgLTIpICsgJz09JztcbiAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgIGVuYyA9IGVuYy5zbGljZSgwLCAtMSkgKyAnPSc7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHJldHVybiBlbmM7XG59XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4vL1VNRCBGT09URVIgU1RBUlRcbn0pKTtcbi8vVU1EIEZPT1RFUiBFTkRcbiIsIlxuLyoqXG4gKiBUaGlzIGlzIHRoZSB3ZWIgYnJvd3NlciBpbXBsZW1lbnRhdGlvbiBvZiBgZGVidWcoKWAuXG4gKlxuICogRXhwb3NlIGBkZWJ1ZygpYCBhcyB0aGUgbW9kdWxlLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vZGVidWcnKTtcbmV4cG9ydHMubG9nID0gbG9nO1xuZXhwb3J0cy5mb3JtYXRBcmdzID0gZm9ybWF0QXJncztcbmV4cG9ydHMuc2F2ZSA9IHNhdmU7XG5leHBvcnRzLmxvYWQgPSBsb2FkO1xuZXhwb3J0cy51c2VDb2xvcnMgPSB1c2VDb2xvcnM7XG5cbi8qKlxuICogQ29sb3JzLlxuICovXG5cbmV4cG9ydHMuY29sb3JzID0gW1xuICAnbGlnaHRzZWFncmVlbicsXG4gICdmb3Jlc3RncmVlbicsXG4gICdnb2xkZW5yb2QnLFxuICAnZG9kZ2VyYmx1ZScsXG4gICdkYXJrb3JjaGlkJyxcbiAgJ2NyaW1zb24nXG5dO1xuXG4vKipcbiAqIEN1cnJlbnRseSBvbmx5IFdlYktpdC1iYXNlZCBXZWIgSW5zcGVjdG9ycywgRmlyZWZveCA+PSB2MzEsXG4gKiBhbmQgdGhlIEZpcmVidWcgZXh0ZW5zaW9uIChhbnkgRmlyZWZveCB2ZXJzaW9uKSBhcmUga25vd25cbiAqIHRvIHN1cHBvcnQgXCIlY1wiIENTUyBjdXN0b21pemF0aW9ucy5cbiAqXG4gKiBUT0RPOiBhZGQgYSBgbG9jYWxTdG9yYWdlYCB2YXJpYWJsZSB0byBleHBsaWNpdGx5IGVuYWJsZS9kaXNhYmxlIGNvbG9yc1xuICovXG5cbmZ1bmN0aW9uIHVzZUNvbG9ycygpIHtcbiAgLy8gaXMgd2Via2l0PyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xNjQ1OTYwNi8zNzY3NzNcbiAgcmV0dXJuICgnV2Via2l0QXBwZWFyYW5jZScgaW4gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlKSB8fFxuICAgIC8vIGlzIGZpcmVidWc/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzM5ODEyMC8zNzY3NzNcbiAgICAod2luZG93LmNvbnNvbGUgJiYgKGNvbnNvbGUuZmlyZWJ1ZyB8fCAoY29uc29sZS5leGNlcHRpb24gJiYgY29uc29sZS50YWJsZSkpKSB8fFxuICAgIC8vIGlzIGZpcmVmb3ggPj0gdjMxP1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvVG9vbHMvV2ViX0NvbnNvbGUjU3R5bGluZ19tZXNzYWdlc1xuICAgIChuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkubWF0Y2goL2ZpcmVmb3hcXC8oXFxkKykvKSAmJiBwYXJzZUludChSZWdFeHAuJDEsIDEwKSA+PSAzMSk7XG59XG5cbi8qKlxuICogTWFwICVqIHRvIGBKU09OLnN0cmluZ2lmeSgpYCwgc2luY2Ugbm8gV2ViIEluc3BlY3RvcnMgZG8gdGhhdCBieSBkZWZhdWx0LlxuICovXG5cbmV4cG9ydHMuZm9ybWF0dGVycy5qID0gZnVuY3Rpb24odikge1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7XG59O1xuXG5cbi8qKlxuICogQ29sb3JpemUgbG9nIGFyZ3VtZW50cyBpZiBlbmFibGVkLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZm9ybWF0QXJncygpIHtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gIHZhciB1c2VDb2xvcnMgPSB0aGlzLnVzZUNvbG9ycztcblxuICBhcmdzWzBdID0gKHVzZUNvbG9ycyA/ICclYycgOiAnJylcbiAgICArIHRoaXMubmFtZXNwYWNlXG4gICAgKyAodXNlQ29sb3JzID8gJyAlYycgOiAnICcpXG4gICAgKyBhcmdzWzBdXG4gICAgKyAodXNlQ29sb3JzID8gJyVjICcgOiAnICcpXG4gICAgKyAnKycgKyBleHBvcnRzLmh1bWFuaXplKHRoaXMuZGlmZik7XG5cbiAgaWYgKCF1c2VDb2xvcnMpIHJldHVybiBhcmdzO1xuXG4gIHZhciBjID0gJ2NvbG9yOiAnICsgdGhpcy5jb2xvcjtcbiAgYXJncyA9IFthcmdzWzBdLCBjLCAnY29sb3I6IGluaGVyaXQnXS5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJncywgMSkpO1xuXG4gIC8vIHRoZSBmaW5hbCBcIiVjXCIgaXMgc29tZXdoYXQgdHJpY2t5LCBiZWNhdXNlIHRoZXJlIGNvdWxkIGJlIG90aGVyXG4gIC8vIGFyZ3VtZW50cyBwYXNzZWQgZWl0aGVyIGJlZm9yZSBvciBhZnRlciB0aGUgJWMsIHNvIHdlIG5lZWQgdG9cbiAgLy8gZmlndXJlIG91dCB0aGUgY29ycmVjdCBpbmRleCB0byBpbnNlcnQgdGhlIENTUyBpbnRvXG4gIHZhciBpbmRleCA9IDA7XG4gIHZhciBsYXN0QyA9IDA7XG4gIGFyZ3NbMF0ucmVwbGFjZSgvJVthLXolXS9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgIGlmICgnJSUnID09PSBtYXRjaCkgcmV0dXJuO1xuICAgIGluZGV4Kys7XG4gICAgaWYgKCclYycgPT09IG1hdGNoKSB7XG4gICAgICAvLyB3ZSBvbmx5IGFyZSBpbnRlcmVzdGVkIGluIHRoZSAqbGFzdCogJWNcbiAgICAgIC8vICh0aGUgdXNlciBtYXkgaGF2ZSBwcm92aWRlZCB0aGVpciBvd24pXG4gICAgICBsYXN0QyA9IGluZGV4O1xuICAgIH1cbiAgfSk7XG5cbiAgYXJncy5zcGxpY2UobGFzdEMsIDAsIGMpO1xuICByZXR1cm4gYXJncztcbn1cblxuLyoqXG4gKiBJbnZva2VzIGBjb25zb2xlLmxvZygpYCB3aGVuIGF2YWlsYWJsZS5cbiAqIE5vLW9wIHdoZW4gYGNvbnNvbGUubG9nYCBpcyBub3QgYSBcImZ1bmN0aW9uXCIuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBsb2coKSB7XG4gIC8vIFRoaXMgaGFja2VyeSBpcyByZXF1aXJlZCBmb3IgSUU4LFxuICAvLyB3aGVyZSB0aGUgYGNvbnNvbGUubG9nYCBmdW5jdGlvbiBkb2Vzbid0IGhhdmUgJ2FwcGx5J1xuICByZXR1cm4gJ29iamVjdCcgPT0gdHlwZW9mIGNvbnNvbGVcbiAgICAmJiAnZnVuY3Rpb24nID09IHR5cGVvZiBjb25zb2xlLmxvZ1xuICAgICYmIEZ1bmN0aW9uLnByb3RvdHlwZS5hcHBseS5jYWxsKGNvbnNvbGUubG9nLCBjb25zb2xlLCBhcmd1bWVudHMpO1xufVxuXG4vKipcbiAqIFNhdmUgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzYXZlKG5hbWVzcGFjZXMpIHtcbiAgdHJ5IHtcbiAgICBpZiAobnVsbCA9PSBuYW1lc3BhY2VzKSB7XG4gICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnZGVidWcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9jYWxTdG9yYWdlLmRlYnVnID0gbmFtZXNwYWNlcztcbiAgICB9XG4gIH0gY2F0Y2goZSkge31cbn1cblxuLyoqXG4gKiBMb2FkIGBuYW1lc3BhY2VzYC5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9IHJldHVybnMgdGhlIHByZXZpb3VzbHkgcGVyc2lzdGVkIGRlYnVnIG1vZGVzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb2FkKCkge1xuICB2YXIgcjtcbiAgdHJ5IHtcbiAgICByID0gbG9jYWxTdG9yYWdlLmRlYnVnO1xuICB9IGNhdGNoKGUpIHt9XG4gIHJldHVybiByO1xufVxuXG4vKipcbiAqIEVuYWJsZSBuYW1lc3BhY2VzIGxpc3RlZCBpbiBgbG9jYWxTdG9yYWdlLmRlYnVnYCBpbml0aWFsbHkuXG4gKi9cblxuZXhwb3J0cy5lbmFibGUobG9hZCgpKTtcbiIsIlxuLyoqXG4gKiBUaGlzIGlzIHRoZSBjb21tb24gbG9naWMgZm9yIGJvdGggdGhlIE5vZGUuanMgYW5kIHdlYiBicm93c2VyXG4gKiBpbXBsZW1lbnRhdGlvbnMgb2YgYGRlYnVnKClgLlxuICpcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBkZWJ1ZztcbmV4cG9ydHMuY29lcmNlID0gY29lcmNlO1xuZXhwb3J0cy5kaXNhYmxlID0gZGlzYWJsZTtcbmV4cG9ydHMuZW5hYmxlID0gZW5hYmxlO1xuZXhwb3J0cy5lbmFibGVkID0gZW5hYmxlZDtcbmV4cG9ydHMuaHVtYW5pemUgPSByZXF1aXJlKCdtcycpO1xuXG4vKipcbiAqIFRoZSBjdXJyZW50bHkgYWN0aXZlIGRlYnVnIG1vZGUgbmFtZXMsIGFuZCBuYW1lcyB0byBza2lwLlxuICovXG5cbmV4cG9ydHMubmFtZXMgPSBbXTtcbmV4cG9ydHMuc2tpcHMgPSBbXTtcblxuLyoqXG4gKiBNYXAgb2Ygc3BlY2lhbCBcIiVuXCIgaGFuZGxpbmcgZnVuY3Rpb25zLCBmb3IgdGhlIGRlYnVnIFwiZm9ybWF0XCIgYXJndW1lbnQuXG4gKlxuICogVmFsaWQga2V5IG5hbWVzIGFyZSBhIHNpbmdsZSwgbG93ZXJjYXNlZCBsZXR0ZXIsIGkuZS4gXCJuXCIuXG4gKi9cblxuZXhwb3J0cy5mb3JtYXR0ZXJzID0ge307XG5cbi8qKlxuICogUHJldmlvdXNseSBhc3NpZ25lZCBjb2xvci5cbiAqL1xuXG52YXIgcHJldkNvbG9yID0gMDtcblxuLyoqXG4gKiBQcmV2aW91cyBsb2cgdGltZXN0YW1wLlxuICovXG5cbnZhciBwcmV2VGltZTtcblxuLyoqXG4gKiBTZWxlY3QgYSBjb2xvci5cbiAqXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzZWxlY3RDb2xvcigpIHtcbiAgcmV0dXJuIGV4cG9ydHMuY29sb3JzW3ByZXZDb2xvcisrICUgZXhwb3J0cy5jb2xvcnMubGVuZ3RoXTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBkZWJ1Z2dlciB3aXRoIHRoZSBnaXZlbiBgbmFtZXNwYWNlYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGVidWcobmFtZXNwYWNlKSB7XG5cbiAgLy8gZGVmaW5lIHRoZSBgZGlzYWJsZWRgIHZlcnNpb25cbiAgZnVuY3Rpb24gZGlzYWJsZWQoKSB7XG4gIH1cbiAgZGlzYWJsZWQuZW5hYmxlZCA9IGZhbHNlO1xuXG4gIC8vIGRlZmluZSB0aGUgYGVuYWJsZWRgIHZlcnNpb25cbiAgZnVuY3Rpb24gZW5hYmxlZCgpIHtcblxuICAgIHZhciBzZWxmID0gZW5hYmxlZDtcblxuICAgIC8vIHNldCBgZGlmZmAgdGltZXN0YW1wXG4gICAgdmFyIGN1cnIgPSArbmV3IERhdGUoKTtcbiAgICB2YXIgbXMgPSBjdXJyIC0gKHByZXZUaW1lIHx8IGN1cnIpO1xuICAgIHNlbGYuZGlmZiA9IG1zO1xuICAgIHNlbGYucHJldiA9IHByZXZUaW1lO1xuICAgIHNlbGYuY3VyciA9IGN1cnI7XG4gICAgcHJldlRpbWUgPSBjdXJyO1xuXG4gICAgLy8gYWRkIHRoZSBgY29sb3JgIGlmIG5vdCBzZXRcbiAgICBpZiAobnVsbCA9PSBzZWxmLnVzZUNvbG9ycykgc2VsZi51c2VDb2xvcnMgPSBleHBvcnRzLnVzZUNvbG9ycygpO1xuICAgIGlmIChudWxsID09IHNlbGYuY29sb3IgJiYgc2VsZi51c2VDb2xvcnMpIHNlbGYuY29sb3IgPSBzZWxlY3RDb2xvcigpO1xuXG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG4gICAgYXJnc1swXSA9IGV4cG9ydHMuY29lcmNlKGFyZ3NbMF0pO1xuXG4gICAgaWYgKCdzdHJpbmcnICE9PSB0eXBlb2YgYXJnc1swXSkge1xuICAgICAgLy8gYW55dGhpbmcgZWxzZSBsZXQncyBpbnNwZWN0IHdpdGggJW9cbiAgICAgIGFyZ3MgPSBbJyVvJ10uY29uY2F0KGFyZ3MpO1xuICAgIH1cblxuICAgIC8vIGFwcGx5IGFueSBgZm9ybWF0dGVyc2AgdHJhbnNmb3JtYXRpb25zXG4gICAgdmFyIGluZGV4ID0gMDtcbiAgICBhcmdzWzBdID0gYXJnc1swXS5yZXBsYWNlKC8lKFthLXolXSkvZywgZnVuY3Rpb24obWF0Y2gsIGZvcm1hdCkge1xuICAgICAgLy8gaWYgd2UgZW5jb3VudGVyIGFuIGVzY2FwZWQgJSB0aGVuIGRvbid0IGluY3JlYXNlIHRoZSBhcnJheSBpbmRleFxuICAgICAgaWYgKG1hdGNoID09PSAnJSUnKSByZXR1cm4gbWF0Y2g7XG4gICAgICBpbmRleCsrO1xuICAgICAgdmFyIGZvcm1hdHRlciA9IGV4cG9ydHMuZm9ybWF0dGVyc1tmb3JtYXRdO1xuICAgICAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiBmb3JtYXR0ZXIpIHtcbiAgICAgICAgdmFyIHZhbCA9IGFyZ3NbaW5kZXhdO1xuICAgICAgICBtYXRjaCA9IGZvcm1hdHRlci5jYWxsKHNlbGYsIHZhbCk7XG5cbiAgICAgICAgLy8gbm93IHdlIG5lZWQgdG8gcmVtb3ZlIGBhcmdzW2luZGV4XWAgc2luY2UgaXQncyBpbmxpbmVkIGluIHRoZSBgZm9ybWF0YFxuICAgICAgICBhcmdzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIGluZGV4LS07XG4gICAgICB9XG4gICAgICByZXR1cm4gbWF0Y2g7XG4gICAgfSk7XG5cbiAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGV4cG9ydHMuZm9ybWF0QXJncykge1xuICAgICAgYXJncyA9IGV4cG9ydHMuZm9ybWF0QXJncy5hcHBseShzZWxmLCBhcmdzKTtcbiAgICB9XG4gICAgdmFyIGxvZ0ZuID0gZW5hYmxlZC5sb2cgfHwgZXhwb3J0cy5sb2cgfHwgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcbiAgICBsb2dGbi5hcHBseShzZWxmLCBhcmdzKTtcbiAgfVxuICBlbmFibGVkLmVuYWJsZWQgPSB0cnVlO1xuXG4gIHZhciBmbiA9IGV4cG9ydHMuZW5hYmxlZChuYW1lc3BhY2UpID8gZW5hYmxlZCA6IGRpc2FibGVkO1xuXG4gIGZuLm5hbWVzcGFjZSA9IG5hbWVzcGFjZTtcblxuICByZXR1cm4gZm47XG59XG5cbi8qKlxuICogRW5hYmxlcyBhIGRlYnVnIG1vZGUgYnkgbmFtZXNwYWNlcy4gVGhpcyBjYW4gaW5jbHVkZSBtb2Rlc1xuICogc2VwYXJhdGVkIGJ5IGEgY29sb24gYW5kIHdpbGRjYXJkcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBlbmFibGUobmFtZXNwYWNlcykge1xuICBleHBvcnRzLnNhdmUobmFtZXNwYWNlcyk7XG5cbiAgdmFyIHNwbGl0ID0gKG5hbWVzcGFjZXMgfHwgJycpLnNwbGl0KC9bXFxzLF0rLyk7XG4gIHZhciBsZW4gPSBzcGxpdC5sZW5ndGg7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIGlmICghc3BsaXRbaV0pIGNvbnRpbnVlOyAvLyBpZ25vcmUgZW1wdHkgc3RyaW5nc1xuICAgIG5hbWVzcGFjZXMgPSBzcGxpdFtpXS5yZXBsYWNlKC9cXCovZywgJy4qPycpO1xuICAgIGlmIChuYW1lc3BhY2VzWzBdID09PSAnLScpIHtcbiAgICAgIGV4cG9ydHMuc2tpcHMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMuc3Vic3RyKDEpICsgJyQnKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGV4cG9ydHMubmFtZXMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMgKyAnJCcpKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBEaXNhYmxlIGRlYnVnIG91dHB1dC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGRpc2FibGUoKSB7XG4gIGV4cG9ydHMuZW5hYmxlKCcnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIG1vZGUgbmFtZSBpcyBlbmFibGVkLCBmYWxzZSBvdGhlcndpc2UuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGVuYWJsZWQobmFtZSkge1xuICB2YXIgaSwgbGVuO1xuICBmb3IgKGkgPSAwLCBsZW4gPSBleHBvcnRzLnNraXBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGV4cG9ydHMuc2tpcHNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICBmb3IgKGkgPSAwLCBsZW4gPSBleHBvcnRzLm5hbWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGV4cG9ydHMubmFtZXNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBDb2VyY2UgYHZhbGAuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gdmFsXG4gKiBAcmV0dXJuIHtNaXhlZH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNvZXJjZSh2YWwpIHtcbiAgaWYgKHZhbCBpbnN0YW5jZW9mIEVycm9yKSByZXR1cm4gdmFsLnN0YWNrIHx8IHZhbC5tZXNzYWdlO1xuICByZXR1cm4gdmFsO1xufVxuIiwiLyoqXG4gKiBIZWxwZXJzLlxuICovXG5cbnZhciBzID0gMTAwMDtcbnZhciBtID0gcyAqIDYwO1xudmFyIGggPSBtICogNjA7XG52YXIgZCA9IGggKiAyNDtcbnZhciB5ID0gZCAqIDM2NS4yNTtcblxuLyoqXG4gKiBQYXJzZSBvciBmb3JtYXQgdGhlIGdpdmVuIGB2YWxgLlxuICpcbiAqIE9wdGlvbnM6XG4gKlxuICogIC0gYGxvbmdgIHZlcmJvc2UgZm9ybWF0dGluZyBbZmFsc2VdXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtTdHJpbmd8TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHZhbCwgb3B0aW9ucyl7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIHZhbCkgcmV0dXJuIHBhcnNlKHZhbCk7XG4gIHJldHVybiBvcHRpb25zLmxvbmdcbiAgICA/IGxvbmcodmFsKVxuICAgIDogc2hvcnQodmFsKTtcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGBzdHJgIGFuZCByZXR1cm4gbWlsbGlzZWNvbmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlKHN0cikge1xuICB2YXIgbWF0Y2ggPSAvXigoPzpcXGQrKT9cXC4/XFxkKykgKihtc3xzZWNvbmRzP3xzfG1pbnV0ZXM/fG18aG91cnM/fGh8ZGF5cz98ZHx5ZWFycz98eSk/JC9pLmV4ZWMoc3RyKTtcbiAgaWYgKCFtYXRjaCkgcmV0dXJuO1xuICB2YXIgbiA9IHBhcnNlRmxvYXQobWF0Y2hbMV0pO1xuICB2YXIgdHlwZSA9IChtYXRjaFsyXSB8fCAnbXMnKS50b0xvd2VyQ2FzZSgpO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICd5ZWFycyc6XG4gICAgY2FzZSAneWVhcic6XG4gICAgY2FzZSAneSc6XG4gICAgICByZXR1cm4gbiAqIHk7XG4gICAgY2FzZSAnZGF5cyc6XG4gICAgY2FzZSAnZGF5JzpcbiAgICBjYXNlICdkJzpcbiAgICAgIHJldHVybiBuICogZDtcbiAgICBjYXNlICdob3Vycyc6XG4gICAgY2FzZSAnaG91cic6XG4gICAgY2FzZSAnaCc6XG4gICAgICByZXR1cm4gbiAqIGg7XG4gICAgY2FzZSAnbWludXRlcyc6XG4gICAgY2FzZSAnbWludXRlJzpcbiAgICBjYXNlICdtJzpcbiAgICAgIHJldHVybiBuICogbTtcbiAgICBjYXNlICdzZWNvbmRzJzpcbiAgICBjYXNlICdzZWNvbmQnOlxuICAgIGNhc2UgJ3MnOlxuICAgICAgcmV0dXJuIG4gKiBzO1xuICAgIGNhc2UgJ21zJzpcbiAgICAgIHJldHVybiBuO1xuICB9XG59XG5cbi8qKlxuICogU2hvcnQgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2hvcnQobXMpIHtcbiAgaWYgKG1zID49IGQpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gZCkgKyAnZCc7XG4gIGlmIChtcyA+PSBoKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGgpICsgJ2gnO1xuICBpZiAobXMgPj0gbSkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBtKSArICdtJztcbiAgaWYgKG1zID49IHMpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gcykgKyAncyc7XG4gIHJldHVybiBtcyArICdtcyc7XG59XG5cbi8qKlxuICogTG9uZyBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb25nKG1zKSB7XG4gIHJldHVybiBwbHVyYWwobXMsIGQsICdkYXknKVxuICAgIHx8IHBsdXJhbChtcywgaCwgJ2hvdXInKVxuICAgIHx8IHBsdXJhbChtcywgbSwgJ21pbnV0ZScpXG4gICAgfHwgcGx1cmFsKG1zLCBzLCAnc2Vjb25kJylcbiAgICB8fCBtcyArICcgbXMnO1xufVxuXG4vKipcbiAqIFBsdXJhbGl6YXRpb24gaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHBsdXJhbChtcywgbiwgbmFtZSkge1xuICBpZiAobXMgPCBuKSByZXR1cm47XG4gIGlmIChtcyA8IG4gKiAxLjUpIHJldHVybiBNYXRoLmZsb29yKG1zIC8gbikgKyAnICcgKyBuYW1lO1xuICByZXR1cm4gTWF0aC5jZWlsKG1zIC8gbikgKyAnICcgKyBuYW1lICsgJ3MnO1xufVxuIiwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJ3V0aWwnKS5fZXh0ZW5kXG5cbmV4cG9ydHMuU3RhbnphID0ge31cbmV4dGVuZChleHBvcnRzLlN0YW56YSwgcmVxdWlyZSgnLi9saWIvc3RhbnphJykpXG5leHBvcnRzLkpJRCA9IHJlcXVpcmUoJy4vbGliL2ppZCcpXG5leHBvcnRzLkNvbm5lY3Rpb24gPSByZXF1aXJlKCcuL2xpYi9jb25uZWN0aW9uJylcbmV4cG9ydHMuU1JWID0gcmVxdWlyZSgnLi9saWIvc3J2JylcbmV4cG9ydHMuU3RyZWFtUGFyc2VyID0gcmVxdWlyZSgnLi9saWIvc3RyZWFtX3BhcnNlcicpXG5leHBvcnRzLmx0eCA9IHJlcXVpcmUoJ2x0eCcpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgbmV0ID0gcmVxdWlyZSgnbmV0JylcbiAgLCBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbiAgLCB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgbHR4ID0gcmVxdWlyZSgnbHR4JylcbiAgLCByZWNvbm5lY3QgPSByZXF1aXJlKCdyZWNvbm5lY3QtY29yZScpXG4gICwgU3RyZWFtUGFyc2VyID0gcmVxdWlyZSgnLi9zdHJlYW1fcGFyc2VyJylcbiAgLCBzdGFydHRscyA9IHJlcXVpcmUoJ3Rscy1jb25uZWN0JylcbiAgLCBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3htcHA6Y29ubmVjdGlvbicpXG4gICwgZXh0ZW5kID0gcmVxdWlyZSgndXRpbCcpLl9leHRlbmRcblxudmFyIE5TX1hNUFBfVExTID0gJ3VybjppZXRmOnBhcmFtczp4bWw6bnM6eG1wcC10bHMnXG52YXIgTlNfU1RSRUFNID0gJ2h0dHA6Ly9ldGhlcnguamFiYmVyLm9yZy9zdHJlYW1zJ1xudmFyIE5TX1hNUFBfU1RSRUFNUyA9ICd1cm46aWV0ZjpwYXJhbXM6eG1sOm5zOnhtcHAtc3RyZWFtcydcblxudmFyIElOSVRJQUxfUkVDT05ORUNUX0RFTEFZID0gIDFlM1xudmFyIE1BWF9SRUNPTk5FQ1RfREVMQVkgICAgID0gMzBlM1xuXG5mdW5jdGlvbiBkZWZhdWx0SW5qZWN0aW9uKGVtaXR0ZXIsIG9wdHMpIHtcbiAgICAvLyBjbG9uZSBvcHRzXG4gICAgdmFyIG9wdGlvbnMgPSBleHRlbmQoe30sIG9wdHMpXG5cbiAgICAvLyBhZGQgY29tcHV0ZWQgb3B0aW9uc1xuICAgIC8qIGpzaGludCAtVzAxNCAqL1xuICAgIG9wdGlvbnMuaW5pdGlhbERlbGF5ID0gKG9wdHMgJiYgKG9wdHMuaW5pdGlhbFJlY29ubmVjdERlbGF5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgIG9wdHMucmVjb25uZWN0RGVsYXkpKSB8fCBJTklUSUFMX1JFQ09OTkVDVF9ERUxBWVxuICAgIG9wdGlvbnMubWF4RGVsYXkgPSAob3B0cyAmJiAgIG9wdHMubWF4UmVjb25uZWN0RGVsYXkpICB8fCBNQVhfUkVDT05ORUNUX0RFTEFZXG4gICAgb3B0aW9ucy5pbW1lZGlhdGUgPSBvcHRzICYmIG9wdHMuc29ja2V0ICYmIHR5cGVvZiBvcHRzLnNvY2tldCAhPT0gJ2Z1bmN0aW9uJ1xuICAgIG9wdGlvbnMudHlwZSA9ICAgICAgb3B0cyAmJiBvcHRzLmRlbGF5VHlwZVxuICAgIG9wdGlvbnMuZW1pdHRlciA9ICAgZW1pdHRlclxuXG4gICAgLy8gcmV0dXJuIGNhbGN1bGF0ZWQgb3B0aW9uc1xuICAgIHJldHVybiBvcHRpb25zXG59XG5cbi8qKlxuIEJhc2UgY2xhc3MgZm9yIGNvbm5lY3Rpb24tYmFzZWQgc3RyZWFtcyAoVENQKS5cbiBUaGUgc29ja2V0IHBhcmFtZXRlciBpcyBvcHRpb25hbCBmb3IgaW5jb21pbmcgY29ubmVjdGlvbnMuXG4qL1xuZnVuY3Rpb24gQ29ubmVjdGlvbihvcHRzKSB7XG4gICAgXG4gICAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcblxuICAgIHRoaXMuc3RyZWFtQXR0cnMgPSAob3B0cyAmJiBvcHRzLnN0cmVhbUF0dHJzKSB8fCB7fVxuICAgIHRoaXMueG1sbnMgPSAob3B0cyAmJiBvcHRzLnhtbG5zKSB8fCB7fVxuICAgIHRoaXMueG1sbnMuc3RyZWFtID0gTlNfU1RSRUFNXG5cbiAgICB0aGlzLnJlamVjdFVuYXV0aG9yaXplZCA9IChvcHRzICYmIG9wdHMucmVqZWN0VW5hdXRob3JpemVkKSA/IHRydWUgOiBmYWxzZVxuICAgIHRoaXMuc2VyaWFsaXplZCA9IChvcHRzICYmIG9wdHMuc2VyaWFsaXplZCkgPyB0cnVlIDogZmFsc2VcbiAgICB0aGlzLnJlcXVlc3RDZXJ0ID0gKG9wdHMgJiYgb3B0cy5yZXF1ZXN0Q2VydCkgPyB0cnVlIDogZmFsc2VcblxuICAgIHRoaXMuc2VydmVybmFtZSA9IChvcHRzICYmIG9wdHMuc2VydmVybmFtZSlcblxuICAgIHRoaXMuX3NldHVwU29ja2V0KGRlZmF1bHRJbmplY3Rpb24odGhpcywgb3B0cykpXG4gICAgdGhpcy5vbmNlKCdyZWNvbm5lY3QnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMucmVjb25uZWN0ID0gb3B0cyAmJiBvcHRzLnJlY29ubmVjdFxuICAgIH0pXG59XG5cbnV0aWwuaW5oZXJpdHMoQ29ubmVjdGlvbiwgRXZlbnRFbWl0dGVyKVxuXG5Db25uZWN0aW9uLnByb3RvdHlwZS5OU19YTVBQX1RMUyA9IE5TX1hNUFBfVExTXG5Db25uZWN0aW9uLk5TX1NUUkVBTSA9IE5TX1NUUkVBTVxuQ29ubmVjdGlvbi5wcm90b3R5cGUuTlNfWE1QUF9TVFJFQU1TID0gTlNfWE1QUF9TVFJFQU1TXG4vLyBEZWZhdWx0c1xuQ29ubmVjdGlvbi5wcm90b3R5cGUuYWxsb3dUTFMgPSB0cnVlXG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLl9zZXR1cFNvY2tldCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgZGVidWcoJ3NldHVwIHNvY2tldCcpXG4gICAgdmFyIHByZXZpb3VzT3B0aW9ucyA9IHt9XG4gICAgdmFyIGluamVjdCA9IHJlY29ubmVjdChmdW5jdGlvbiAob3B0cykge1xuICAgICAgICB2YXIgcHJldmlvdXNTb2NrZXQgPSB0aGlzLnNvY2tldFxuICAgICAgICAvKiBpZiB0aGlzIG9wdHMucHJlc2VydmUgaXMgb25cbiAgICAgICAgICogdGhlIHByZXZpb3VzIG9wdGlvbnMgYXJlIHN0b3JlZCB1bnRpbCBuZXh0IHRpbWUuXG4gICAgICAgICAqIHRoaXMgaXMgbmVlZGVkIHRvIHJlc3RvcmUgZnJvbSBhIHNldFNlY3VyZSBjYWxsLlxuICAgICAgICAgKi9cbiAgICAgICAgaWYgKG9wdHMucHJlc2VydmUgPT09ICdvbicpIHtcbiAgICAgICAgICAgIG9wdHMucHJlc2VydmUgPSBwcmV2aW91c09wdGlvbnNcbiAgICAgICAgICAgIHByZXZpb3VzT3B0aW9ucyA9IG9wdHNcbiAgICAgICAgfSBlbHNlIGlmIChvcHRzLnByZXNlcnZlKSB7XG4gICAgICAgICAgICAvLyBzd2l0Y2ggYmFjayB0byB0aGUgcHJldmVyc2VkIG9wdGlvbnNcbiAgICAgICAgICAgIG9wdHMgPSBwcmV2aW91c09wdGlvbnMgPSBvcHRzLnByZXNlcnZlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBrZWVwIHNvbWUgc3RhdGUgZm9yIGVnIFNSVi5jb25uZWN0XG4gICAgICAgICAgICBvcHRzID0gcHJldmlvdXNPcHRpb25zID0gb3B0cyB8fCBwcmV2aW91c09wdGlvbnNcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2Ygb3B0cy5zb2NrZXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGRlYnVnKCd1c2UgbGF6eSBzb2NrZXQnKVxuICAgICAgICAgICAgLyogbGF6eSBldmFsdWF0aW9uXG4gICAgICAgICAgICAgKiAoY2FuIGJlIHJldHJpZ2dlcmVkIGJ5IGNhbGxpbmcgY29ubmVjdGlvbi5jb25uZWN0KClcbiAgICAgICAgICAgICAqICB3aXRob3V0IGFyZ3VtZW50cyBhZnRlciBhIHByZXZpb3VzXG4gICAgICAgICAgICAgKiAgY29ubmVjdGlvbi5jb25uZWN0KHtzb2NrZXQ6ZnVuY3Rpb24oKSB7IOKApiB9fSkpICovXG4gICAgICAgICAgICB0aGlzLnNvY2tldCA9IG9wdHMuc29ja2V0LmNhbGwodGhpcylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlYnVnKCd1c2Ugc3RhbmRhcmQgc29ja2V0JylcbiAgICAgICAgICAgIC8vIG9ubHkgdXNlIHRoaXMgc29ja2V0IG9uY2VcbiAgICAgICAgICAgIHRoaXMuc29ja2V0ID0gb3B0cy5zb2NrZXRcbiAgICAgICAgICAgIG9wdHMuc29ja2V0ID0gbnVsbFxuICAgICAgICAgICAgaWYgKHRoaXMuc29ja2V0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vbmNlKCdjb25uZWN0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBpbmplY3Qub3B0aW9ucy5pbW1lZGlhdGUgPSBmYWxzZVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zb2NrZXQgPSB0aGlzLnNvY2tldCB8fCBuZXcgbmV0LlNvY2tldCgpXG4gICAgICAgIGlmIChwcmV2aW91c1NvY2tldCAhPT0gdGhpcy5zb2NrZXQpXG4gICAgICAgICAgICB0aGlzLnNldHVwU3RyZWFtKClcbiAgICAgICAgcmV0dXJuIHRoaXMuc29ja2V0XG4gICAgfS5iaW5kKHRoaXMpKVxuXG4gICAgaW5qZWN0KGluamVjdC5vcHRpb25zID0gb3B0aW9ucylcblxuICAgIHRoaXMub24oJ2Nvbm5lY3Rpb24nLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghdGhpcy5wYXJzZXIpXG4gICAgICAgICAgICB0aGlzLnN0YXJ0UGFyc2VyKClcbiAgICB9KVxuICAgIHRoaXMub24oJ2VuZCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcHJldmlvdXNPcHRpb25zID0ge31cbiAgICB9KVxufVxuXG4vKipcbiBVc2VkIGJ5IGJvdGggdGhlIGNvbnN0cnVjdG9yIGFuZCBieSByZWluaXRpYWxpemF0aW9uIGluIHNldFNlY3VyZSgpLlxuKi9cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnNldHVwU3RyZWFtID0gZnVuY3Rpb24oKSB7XG4gICAgZGVidWcoJ3NldHVwIHN0cmVhbScpXG4gICAgdGhpcy5zb2NrZXQub24oJ2VuZCcsIHRoaXMub25FbmQuYmluZCh0aGlzKSlcbiAgICB0aGlzLnNvY2tldC5vbignZGF0YScsIHRoaXMub25EYXRhLmJpbmQodGhpcykpXG4gICAgdGhpcy5zb2NrZXQub24oJ2Nsb3NlJywgdGhpcy5vbkNsb3NlLmJpbmQodGhpcykpXG4gICAgLy8gbGV0IHRoZW0gc25pZmYgdW5wYXJzZWQgWE1MXG4gICAgdGhpcy5zb2NrZXQub24oJ2RhdGEnLCAgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2RhdGEnKSlcbiAgICB0aGlzLnNvY2tldC5vbignZHJhaW4nLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZHJhaW4nKSlcbiAgICAvLyBpZ25vcmUgZXJyb3JzIGFmdGVyIGRpc2Nvbm5lY3RcbiAgICB0aGlzLnNvY2tldC5vbignZXJyb3InLCBmdW5jdGlvbiAoKSB7IH0pXG5cbiAgICBpZiAoIXRoaXMuc29ja2V0LnNlcmlhbGl6ZVN0YW56YSkge1xuICAgICAgICAvKipcbiAgICAgICAgKiBUaGlzIGlzIG9wdGltaXplZCBmb3IgY29udGludW91cyBUQ1Agc3RyZWFtcy4gSWYgeW91ciBcInNvY2tldFwiXG4gICAgICAgICogYWN0dWFsbHkgdHJhbnNwb3J0cyBmcmFtZXMgKFdlYlNvY2tldHMpIGFuZCB5b3UgY2FuJ3QgaGF2ZVxuICAgICAgICAqIHN0YW56YXMgc3BsaXQgYWNyb3NzIHRob3NlLCB1c2U6XG4gICAgICAgICogICAgIGNiKGVsLnRvU3RyaW5nKCkpXG4gICAgICAgICovXG4gICAgICAgIGlmICh0aGlzLnNlcmlhbGl6ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc29ja2V0LnNlcmlhbGl6ZVN0YW56YSA9IGZ1bmN0aW9uKGVsLCBjYikge1xuICAgICAgICAgICAgICAgIC8vIENvbnRpbnVvdXNseSB3cml0ZSBvdXRcbiAgICAgICAgICAgICAgICBlbC53cml0ZShmdW5jdGlvbihzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNiKHMpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc29ja2V0LnNlcmlhbGl6ZVN0YW56YSA9IGZ1bmN0aW9uKGVsLCBjYikge1xuICAgICAgICAgICAgICAgIGNiKGVsLnRvU3RyaW5nKCkpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnBhdXNlID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuc29ja2V0LnBhdXNlKSB0aGlzLnNvY2tldC5wYXVzZSgpXG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnJlc3VtZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnNvY2tldC5yZXN1bWUpIHRoaXMuc29ja2V0LnJlc3VtZSgpXG59XG5cbi8qKiBDbGltYnMgdGhlIHN0YW56YSB1cCBpZiBhIGNoaWxkIHdhcyBwYXNzZWQsXG4gICAgYnV0IHlvdSBjYW4gc2VuZCBzdHJpbmdzIGFuZCBidWZmZXJzIHRvby5cblxuICAgIFJldHVybnMgd2hldGhlciB0aGUgc29ja2V0IGZsdXNoZWQgZGF0YS5cbiovXG5Db25uZWN0aW9uLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgdmFyIGZsdXNoZWQgPSB0cnVlXG4gICAgaWYgKCF0aGlzLnNvY2tldCkge1xuICAgICAgICByZXR1cm4gLy8gRG9oIVxuICAgIH1cbiAgICBpZiAoIXRoaXMuc29ja2V0LndyaXRhYmxlKSB7XG4gICAgICAgIHRoaXMuc29ja2V0LmVuZCgpXG4gICAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGRlYnVnKCdzZW5kOiAnICsgc3RhbnphLnRvU3RyaW5nKCkpXG4gICAgaWYgKHN0YW56YS5yb290KSB7XG4gICAgICAgIHZhciBlbCA9IHRoaXMucm1YbWxucyhzdGFuemEucm9vdCgpKVxuICAgICAgICB0aGlzLnNvY2tldC5zZXJpYWxpemVTdGFuemEoZWwsIGZ1bmN0aW9uKHMpIHtcbiAgICAgICAgICAgIGZsdXNoZWQgPSB0aGlzLndyaXRlKHMpXG4gICAgICAgIH0uYmluZCh0aGlzLnNvY2tldCkpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgZmx1c2hlZCA9IHRoaXMuc29ja2V0LndyaXRlKHN0YW56YSlcbiAgICB9XG4gICAgcmV0dXJuIGZsdXNoZWRcbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuc3RhcnRQYXJzZXIgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXNcbiAgICB0aGlzLnBhcnNlciA9IG5ldyBTdHJlYW1QYXJzZXIuU3RyZWFtUGFyc2VyKHRoaXMubWF4U3RhbnphU2l6ZSlcblxuICAgIHRoaXMucGFyc2VyLm9uKCdzdHJlYW1TdGFydCcsIGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgICAgIC8qIFdlIG5lZWQgdGhvc2UgeG1sbnMgb2Z0ZW4sIHN0b3JlIHRoZW0gZXh0cmEgKi9cbiAgICAgICAgc2VsZi5zdHJlYW1Oc0F0dHJzID0ge31cbiAgICAgICAgZm9yICh2YXIgayBpbiBhdHRycykge1xuICAgICAgICAgICAgaWYgKGsgPT09ICd4bWxucycgfHwgKGsuc3Vic3RyKDAsIDYpID09PSAneG1sbnM6JykpXG4gICAgICAgICAgICAgICAgc2VsZi5zdHJlYW1Oc0F0dHJzW2tdID0gYXR0cnNba11cbiAgICAgICAgfVxuXG4gICAgICAgIC8qIE5vdGlmeSBpbiBjYXNlIHdlIGRvbid0IHdhaXQgZm9yIDxzdHJlYW06ZmVhdHVyZXMvPlxuICAgICAgICAgICAoQ29tcG9uZW50IG9yIG5vbi0xLjAgc3RyZWFtcylcbiAgICAgICAgICovXG4gICAgICAgIHNlbGYuZW1pdCgnc3RyZWFtU3RhcnQnLCBhdHRycylcbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLm9uKCdzdGFuemEnLCBmdW5jdGlvbihzdGFuemEpIHtcbiAgICAgICAgc2VsZi5vblN0YW56YShzZWxmLmFkZFN0cmVhbU5zKHN0YW56YSkpXG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5vbignZXJyb3InLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIHNlbGYuZXJyb3IoZS5jb25kaXRpb24gfHwgJ2ludGVybmFsLXNlcnZlci1lcnJvcicsIGUubWVzc2FnZSlcbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLm9uY2UoJ2VuZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICBzZWxmLnN0b3BQYXJzZXIoKVxuICAgICAgICBpZiAoc2VsZi5yZWNvbm5lY3QpXG4gICAgICAgICAgICBzZWxmLm9uY2UoJ3JlY29ubmVjdCcsIHNlbGYuc3RhcnRQYXJzZXIuYmluZChzZWxmKSlcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgc2VsZi5lbmQoKVxuICAgIH0pXG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnN0b3BQYXJzZXIgPSBmdW5jdGlvbigpIHtcbiAgICAvKiBObyBtb3JlIGV2ZW50cywgcGxlYXNlIChtYXkgaGFwcGVuIGhvd2V2ZXIpICovXG4gICAgaWYgKHRoaXMucGFyc2VyKSB7XG4gICAgICAgIHZhciBwYXJzZXIgPSB0aGlzLnBhcnNlclxuICAgICAgICAvKiBHZXQgR0MnZWQgKi9cbiAgICAgICAgZGVsZXRlIHRoaXMucGFyc2VyXG4gICAgICAgIHBhcnNlci5lbmQoKVxuICAgIH1cbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuc3RhcnRTdHJlYW0gPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXR0cnMgPSB7fVxuICAgIGZvciAodmFyIGsgaW4gdGhpcy54bWxucykge1xuICAgICAgICBpZiAodGhpcy54bWxucy5oYXNPd25Qcm9wZXJ0eShrKSkge1xuICAgICAgICAgICAgaWYgKCFrKVxuICAgICAgICAgICAgICAgIGF0dHJzLnhtbG5zID0gdGhpcy54bWxuc1trXVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGF0dHJzWyd4bWxuczonICsga10gPSB0aGlzLnhtbG5zW2tdXG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChrIGluIHRoaXMuc3RyZWFtQXR0cnMpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RyZWFtQXR0cnMuaGFzT3duUHJvcGVydHkoaykpXG4gICAgICAgICAgICBhdHRyc1trXSA9IHRoaXMuc3RyZWFtQXR0cnNba11cbiAgICB9XG5cbiAgICBpZiAodGhpcy5zdHJlYW1UbykgeyAvLyBpbiBjYXNlIG9mIGEgY29tcG9uZW50IGNvbm5lY3RpbmdcbiAgICAgICAgYXR0cnMudG8gPSB0aGlzLnN0cmVhbVRvXG4gICAgfVxuXG4gICAgdmFyIGVsID0gbmV3IGx0eC5FbGVtZW50KCdzdHJlYW06c3RyZWFtJywgYXR0cnMpXG4gICAgLy8gbWFrZSBpdCBub24tZW1wdHkgdG8gY3V0IHRoZSBjbG9zaW5nIHRhZ1xuICAgIGVsLnQoJyAnKVxuICAgIHZhciBzID0gZWwudG9TdHJpbmcoKVxuICAgIHRoaXMuc2VuZChzLnN1YnN0cigwLCBzLmluZGV4T2YoJyA8L3N0cmVhbTpzdHJlYW0+JykpKVxuXG4gICAgdGhpcy5zdHJlYW1PcGVuZWQgPSB0cnVlXG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLm9uRGF0YSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICBkZWJ1ZygncmVjZWl2ZTogJyArIGRhdGEudG9TdHJpbmcoJ3V0ZjgnKSlcbiAgICBpZiAodGhpcy5wYXJzZXIpXG4gICAgICAgIHRoaXMucGFyc2VyLndyaXRlKGRhdGEpXG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnNldFNlY3VyZSA9IGZ1bmN0aW9uKGNyZWRlbnRpYWxzLCBpc1NlcnZlcikge1xuICAgIC8vIFJlbW92ZSBvbGQgZXZlbnQgbGlzdGVuZXJzXG4gICAgdGhpcy5zb2NrZXQucmVtb3ZlQWxsTGlzdGVuZXJzKCdkYXRhJylcbiAgICAvLyByZXRhaW4gc29ja2V0ICdlbmQnIGxpc3RlbmVycyBiZWNhdXNlIHNzbCBsYXllciBkb2Vzbid0IHN1cHBvcnQgaXRcbiAgICB0aGlzLnNvY2tldC5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2RyYWluJylcbiAgICB0aGlzLnNvY2tldC5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2Nsb3NlJylcbiAgICAvLyByZW1vdmUgaWRsZV90aW1lb3V0XG4gICAgaWYgKHRoaXMuc29ja2V0LmNsZWFyVGltZXIpXG4gICAgICAgIHRoaXMuc29ja2V0LmNsZWFyVGltZXIoKVxuXG4gICAgdmFyIGNsZWFydGV4dCA9IHN0YXJ0dGxzKHtcbiAgICAgICAgc29ja2V0OiB0aGlzLnNvY2tldCxcbiAgICAgICAgcmVqZWN0VW5hdXRob3JpemVkOiB0aGlzLnJlamVjdFVuYXV0aG9yaXplZCxcbiAgICAgICAgY3JlZGVudGlhbHM6IGNyZWRlbnRpYWxzIHx8IHRoaXMuY3JlZGVudGlhbHMsXG4gICAgICAgIHJlcXVlc3RDZXJ0OiB0aGlzLnJlcXVlc3RDZXJ0LFxuICAgICAgICBpc1NlcnZlcjogISFpc1NlcnZlclxuICAgIH0sIGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLmlzU2VjdXJlID0gdHJ1ZVxuICAgICAgICB0aGlzLm9uY2UoJ2Rpc2Nvbm5lY3QnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmlzU2VjdXJlID0gZmFsc2VcbiAgICAgICAgfSlcbiAgICAgICAgY2xlYXJ0ZXh0LmVtaXQoJ2Nvbm5lY3QnLCBjbGVhcnRleHQpXG4gICAgfS5iaW5kKHRoaXMpKVxuICAgIGNsZWFydGV4dC5vbignY2xpZW50RXJyb3InLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZXJyb3InKSlcbiAgICBpZiAoIXRoaXMucmVjb25uZWN0KSB7XG4gICAgICAgIHRoaXMucmVjb25uZWN0ID0gdHJ1ZSAvLyBuZWVkIHRoaXMgc28gc3RvcFBhcnNlciB3b3JrcyBwcm9wZXJseVxuICAgICAgICB0aGlzLm9uY2UoJ3JlY29ubmVjdCcsIGZ1bmN0aW9uICgpIHt0aGlzLnJlY29ubmVjdCA9IGZhbHNlfSlcbiAgICB9XG4gICAgdGhpcy5zdG9wUGFyc2VyKClcbiAgICAvLyBpZiB3ZSByZWNvbm5lY3Qgd2UgbmVlZCB0byBnZXQgYmFjayB0byB0aGUgcHJldmlvdXMgc29ja2V0IGNyZWF0aW9uXG4gICAgdGhpcy5saXN0ZW4oe3NvY2tldDpjbGVhcnRleHQsIHByZXNlcnZlOidvbid9KVxufVxuXG5mdW5jdGlvbiBnZXRBbGxUZXh0KGVsKSB7XG4gICAgcmV0dXJuICFlbC5jaGlsZHJlbiA/IGVsIDogZWwuY2hpbGRyZW4ucmVkdWNlKGZ1bmN0aW9uICh0ZXh0LCBjaGlsZCkge1xuICAgICAgICByZXR1cm4gdGV4dCArIGdldEFsbFRleHQoY2hpbGQpXG4gICAgfSwgJycpXG59XG5cbi8qKlxuICogVGhpcyBpcyBub3QgYW4gZXZlbnQgbGlzdGVuZXIsIGJ1dCB0YWtlcyBjYXJlIG9mIHRoZSBUTFMgaGFuZHNoYWtlXG4gKiBiZWZvcmUgJ3N0YW56YScgZXZlbnRzIGFyZSBlbWl0dGVkIHRvIHRoZSBkZXJpdmVkIGNsYXNzZXMuXG4gKi9cbkNvbm5lY3Rpb24ucHJvdG90eXBlLm9uU3RhbnphID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgaWYgKHN0YW56YS5pcygnZXJyb3InLCBOU19TVFJFQU0pKSB7XG4gICAgICAgIHZhciBlcnJvciA9IG5ldyBFcnJvcignJyArIGdldEFsbFRleHQoc3RhbnphKSlcbiAgICAgICAgZXJyb3Iuc3RhbnphID0gc3RhbnphXG4gICAgICAgIHRoaXMuc29ja2V0LmVtaXQoJ2Vycm9yJywgZXJyb3IpXG4gICAgfSBlbHNlIGlmIChzdGFuemEuaXMoJ2ZlYXR1cmVzJywgdGhpcy5OU19TVFJFQU0pICYmXG4gICAgICAgIHRoaXMuYWxsb3dUTFMgJiZcbiAgICAgICAgIXRoaXMuaXNTZWN1cmUgJiZcbiAgICAgICAgc3RhbnphLmdldENoaWxkKCdzdGFydHRscycsIHRoaXMuTlNfWE1QUF9UTFMpKSB7XG4gICAgICAgIC8qIFNpZ25hbCB3aWxsaW5nbmVzcyB0byBwZXJmb3JtIFRMUyBoYW5kc2hha2UgKi9cbiAgICAgICAgdGhpcy5zZW5kKG5ldyBsdHguRWxlbWVudCgnc3RhcnR0bHMnLCB7IHhtbG5zOiB0aGlzLk5TX1hNUFBfVExTIH0pKVxuICAgIH0gZWxzZSBpZiAodGhpcy5hbGxvd1RMUyAmJlxuICAgICAgICBzdGFuemEuaXMoJ3Byb2NlZWQnLCB0aGlzLk5TX1hNUFBfVExTKSkge1xuICAgICAgICAvKiBTZXJ2ZXIgaXMgd2FpdGluZyBmb3IgVExTIGhhbmRzaGFrZSAqL1xuICAgICAgICB0aGlzLnNldFNlY3VyZSgpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5lbWl0KCdzdGFuemEnLCBzdGFuemEpXG4gICAgfVxufVxuXG4vKipcbiAqIEFkZCBzdHJlYW0geG1sbnMgdG8gYSBzdGFuemFcbiAqXG4gKiBEb2VzIG5vdCBhZGQgb3VyIGRlZmF1bHQgeG1sbnMgYXMgaXQgaXMgZGlmZmVyZW50IGZvclxuICogQzJTL1MyUy9Db21wb25lbnQgY29ubmVjdGlvbnMuXG4gKi9cbkNvbm5lY3Rpb24ucHJvdG90eXBlLmFkZFN0cmVhbU5zID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgZm9yICh2YXIgYXR0ciBpbiB0aGlzLnN0cmVhbU5zQXR0cnMpIHtcbiAgICAgICAgaWYgKCFzdGFuemEuYXR0cnNbYXR0cl0gJiZcbiAgICAgICAgICAgICEoKGF0dHIgPT09ICd4bWxucycpICYmICh0aGlzLnN0cmVhbU5zQXR0cnNbYXR0cl0gPT09IHRoaXMueG1sbnNbJyddKSlcbiAgICAgICAgICAgKSB7XG4gICAgICAgICAgICBzdGFuemEuYXR0cnNbYXR0cl0gPSB0aGlzLnN0cmVhbU5zQXR0cnNbYXR0cl1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3RhbnphXG59XG5cbi8qKlxuICogUmVtb3ZlIHN1cGVyZmx1b3VzIHhtbG5zIHRoYXQgd2VyZSBhbGVhZHkgZGVjbGFyZWQgaW5cbiAqIG91ciA8c3RyZWFtOnN0cmVhbT5cbiAqL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUucm1YbWxucyA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGZvciAodmFyIHByZWZpeCBpbiB0aGlzLnhtbG5zKSB7XG4gICAgICAgIHZhciBhdHRyID0gcHJlZml4ID8gJ3htbG5zOicgKyBwcmVmaXggOiAneG1sbnMnXG4gICAgICAgIGlmIChzdGFuemEuYXR0cnNbYXR0cl0gPT09IHRoaXMueG1sbnNbcHJlZml4XSlcbiAgICAgICAgICAgIGRlbGV0ZSBzdGFuemEuYXR0cnNbYXR0cl1cbiAgICB9XG4gICAgcmV0dXJuIHN0YW56YVxufVxuXG4vKipcbiAqIFhNUFAtc3R5bGUgZW5kIGNvbm5lY3Rpb24gZm9yIHVzZXJcbiAqL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUub25FbmQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5zb2NrZXQgJiYgdGhpcy5zb2NrZXQud3JpdGFibGUpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RyZWFtT3BlbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnNvY2tldC53cml0ZSgnPC9zdHJlYW06c3RyZWFtPicpXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5zdHJlYW1PcGVuZWRcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXRoaXMucmVjb25uZWN0KVxuICAgICAgICB0aGlzLmVtaXQoJ2VuZCcpXG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLm9uQ2xvc2UgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMucmVjb25uZWN0KVxuICAgICAgICB0aGlzLmVtaXQoJ2Nsb3NlJylcbn1cblxuLyoqXG4gKiBFbmQgY29ubmVjdGlvbiB3aXRoIHN0cmVhbSBlcnJvci5cbiAqIEVtaXRzICdlcnJvcicgZXZlbnQgdG9vLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBjb25kaXRpb24gWE1QUCBlcnJvciBjb25kaXRpb24sIHNlZSBSRkMzOTIwIDQuNy4zLiBEZWZpbmVkIENvbmRpdGlvbnNcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IE9wdGlvbmFsIGVycm9yIG1lc3NhZ2VcbiAqL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUuZXJyb3IgPSBmdW5jdGlvbihjb25kaXRpb24sIG1lc3NhZ2UpIHtcbiAgICB0aGlzLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKG1lc3NhZ2UpKVxuXG4gICAgaWYgKCF0aGlzLnNvY2tldCB8fCAhdGhpcy5zb2NrZXQud3JpdGFibGUpIHJldHVyblxuXG4gICAgLyogUkZDIDM5MjAsIDQuNy4xIHN0cmVhbS1sZXZlbCBlcnJvcnMgcnVsZXMgKi9cbiAgICBpZiAoIXRoaXMuc3RyZWFtT3BlbmVkKSB0aGlzLnN0YXJ0U3RyZWFtKClcblxuICAgIHZhciBlcnJvciA9IG5ldyBsdHguRWxlbWVudCgnc3RyZWFtOmVycm9yJylcbiAgICBlcnJvci5jKGNvbmRpdGlvbiwgeyB4bWxuczogTlNfWE1QUF9TVFJFQU1TIH0pXG4gICAgaWYgKG1lc3NhZ2UpIHtcbiAgICAgICAgZXJyb3IuYyggJ3RleHQnLCB7XG4gICAgICAgICAgICB4bWxuczogTlNfWE1QUF9TVFJFQU1TLFxuICAgICAgICAgICAgJ3htbDpsYW5nJzogJ2VuJ1xuICAgICAgICB9KS50KG1lc3NhZ2UpXG4gICAgfVxuXG4gICAgdGhpcy5zZW5kKGVycm9yKVxuICAgIHRoaXMuZW5kKClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDb25uZWN0aW9uXG4iLCJ2YXIgU3RyaW5nUHJlcCA9IHJlcXVpcmUoJ25vZGUtc3RyaW5ncHJlcCcpLlN0cmluZ1ByZXBcbiAgLCB0b1VuaWNvZGUgPSByZXF1aXJlKCdub2RlLXN0cmluZ3ByZXAnKS50b1VuaWNvZGVcblxuXG4vKipcbiAqIEpJRCBpbXBsZW1lbnRzIFxuICogLSBYbXBwIGFkZHJlc3NlcyBhY2NvcmRpbmcgdG8gUkZDNjEyMlxuICogLSBYRVAtMDEwNjogSklEIEVzY2FwaW5nXG4gKlxuICogQHNlZSBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM2MTIyI3NlY3Rpb24tMlxuICogQHNlZSBodHRwOi8veG1wcC5vcmcvZXh0ZW5zaW9ucy94ZXAtMDEwNi5odG1sXG4gKi9cbmZ1bmN0aW9uIEpJRChhLCBiLCBjKSB7XG4gICAgdGhpcy5sb2NhbCA9IG51bGxcbiAgICB0aGlzLmRvbWFpbiA9IG51bGxcbiAgICB0aGlzLnJlc291cmNlID0gbnVsbFxuXG4gICAgaWYgKGEgJiYgKCFiKSAmJiAoIWMpKSB7XG4gICAgICAgIHRoaXMucGFyc2VKSUQoYSlcbiAgICB9IGVsc2UgaWYgKGIpIHtcbiAgICAgICAgdGhpcy5zZXRMb2NhbChhKVxuICAgICAgICB0aGlzLnNldERvbWFpbihiKVxuICAgICAgICB0aGlzLnNldFJlc291cmNlKGMpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBcmd1bWVudCBlcnJvcicpXG4gICAgfVxufVxuXG5KSUQucHJvdG90eXBlLnBhcnNlSklEID0gZnVuY3Rpb24ocykge1xuICAgIGlmIChzLmluZGV4T2YoJ0AnKSA+PSAwKSB7XG4gICAgICAgIHRoaXMuc2V0TG9jYWwocy5zdWJzdHIoMCwgcy5sYXN0SW5kZXhPZignQCcpKSlcbiAgICAgICAgcyA9IHMuc3Vic3RyKHMubGFzdEluZGV4T2YoJ0AnKSArIDEpXG4gICAgfVxuICAgIGlmIChzLmluZGV4T2YoJy8nKSA+PSAwKSB7XG4gICAgICAgIHRoaXMuc2V0UmVzb3VyY2Uocy5zdWJzdHIocy5pbmRleE9mKCcvJykgKyAxKSlcbiAgICAgICAgcyA9IHMuc3Vic3RyKDAsIHMuaW5kZXhPZignLycpKVxuICAgIH1cbiAgICB0aGlzLnNldERvbWFpbihzKVxufVxuXG5KSUQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24odW5lc2NhcGUpIHtcbiAgICB2YXIgcyA9IHRoaXMuZG9tYWluXG4gICAgaWYgKHRoaXMubG9jYWwpIHMgPSB0aGlzLmdldExvY2FsKHVuZXNjYXBlKSArICdAJyArIHNcbiAgICBpZiAodGhpcy5yZXNvdXJjZSkgcyA9IHMgKyAnLycgKyB0aGlzLnJlc291cmNlXG4gICAgcmV0dXJuIHNcbn1cblxuLyoqXG4gKiBDb252ZW5pZW5jZSBtZXRob2QgdG8gZGlzdGluZ3Vpc2ggdXNlcnNcbiAqKi9cbkpJRC5wcm90b3R5cGUuYmFyZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnJlc291cmNlKSB7XG4gICAgICAgIHJldHVybiBuZXcgSklEKHRoaXMubG9jYWwsIHRoaXMuZG9tYWluLCBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxufVxuXG4vKipcbiAqIENvbXBhcmlzb24gZnVuY3Rpb25cbiAqKi9cbkpJRC5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24ob3RoZXIpIHtcbiAgICByZXR1cm4gKHRoaXMubG9jYWwgPT09IG90aGVyLmxvY2FsKSAmJlxuICAgICAgICAodGhpcy5kb21haW4gPT09IG90aGVyLmRvbWFpbikgJiZcbiAgICAgICAgKHRoaXMucmVzb3VyY2UgPT09IG90aGVyLnJlc291cmNlKVxufVxuXG4vKiBEZXByZWNhdGVkLCB1c2Ugc2V0TG9jYWwoKSBbc2VlIFJGQzYxMjJdICovXG5KSUQucHJvdG90eXBlLnNldFVzZXIgPSBmdW5jdGlvbih1c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuc2V0TG9jYWwodXNlcilcbn1cblxuLyoqXG4gKiBTZXR0ZXJzIHRoYXQgZG8gc3RyaW5ncHJlcCBub3JtYWxpemF0aW9uLlxuICoqL1xuSklELnByb3RvdHlwZS5zZXRMb2NhbCA9IGZ1bmN0aW9uKGxvY2FsLCBlc2NhcGUpIHtcbiAgICBlc2NhcGUgPSBlc2NhcGUgfHwgdGhpcy5kZXRlY3RFc2NhcGUobG9jYWwpXG5cbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIGxvY2FsID0gdGhpcy5lc2NhcGVMb2NhbChsb2NhbClcbiAgICB9XG5cbiAgICB0aGlzLmxvY2FsID0gdGhpcy51c2VyID0gbG9jYWwgJiYgdGhpcy5wcmVwKCdub2RlcHJlcCcsIGxvY2FsKVxuICAgIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogaHR0cDovL3htcHAub3JnL3JmY3MvcmZjNjEyMi5odG1sI2FkZHJlc3NpbmctZG9tYWluXG4gKi9cbkpJRC5wcm90b3R5cGUuc2V0RG9tYWluID0gZnVuY3Rpb24oZG9tYWluKSB7XG4gICAgdGhpcy5kb21haW4gPSBkb21haW4gJiZcbiAgICAgICAgdGhpcy5wcmVwKCduYW1lcHJlcCcsIGRvbWFpbi5zcGxpdCgnLicpLm1hcCh0b1VuaWNvZGUpLmpvaW4oJy4nKSlcbiAgICByZXR1cm4gdGhpc1xufVxuXG5KSUQucHJvdG90eXBlLnNldFJlc291cmNlID0gZnVuY3Rpb24ocmVzb3VyY2UpIHtcbiAgICB0aGlzLnJlc291cmNlID0gcmVzb3VyY2UgJiYgdGhpcy5wcmVwKCdyZXNvdXJjZXByZXAnLCByZXNvdXJjZSlcbiAgICByZXR1cm4gdGhpc1xufVxuXG5KSUQucHJvdG90eXBlLmdldExvY2FsID0gZnVuY3Rpb24odW5lc2NhcGUpIHtcbiAgICB1bmVzY2FwZSA9IHVuZXNjYXBlIHx8IGZhbHNlXG4gICAgdmFyIGxvY2FsID0gbnVsbFxuICAgIFxuICAgIGlmICh1bmVzY2FwZSkge1xuICAgICAgICBsb2NhbCA9IHRoaXMudW5lc2NhcGVMb2NhbCh0aGlzLmxvY2FsKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGxvY2FsID0gdGhpcy5sb2NhbFxuICAgIH1cblxuICAgIHJldHVybiBsb2NhbDtcbn1cblxuSklELnByb3RvdHlwZS5wcmVwID0gZnVuY3Rpb24ob3BlcmF0aW9uLCB2YWx1ZSkge1xuICAgIHZhciBwID0gbmV3IFN0cmluZ1ByZXAob3BlcmF0aW9uKVxuICAgIHJldHVybiBwLnByZXBhcmUodmFsdWUpXG59XG5cbi8qIERlcHJlY2F0ZWQsIHVzZSBnZXRMb2NhbCgpIFtzZWUgUkZDNjEyMl0gKi9cbkpJRC5wcm90b3R5cGUuZ2V0VXNlciA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmdldExvY2FsKClcbn1cblxuSklELnByb3RvdHlwZS5nZXREb21haW4gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5kb21haW5cbn1cblxuSklELnByb3RvdHlwZS5nZXRSZXNvdXJjZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnJlc291cmNlXG59XG5cbkpJRC5wcm90b3R5cGUuZGV0ZWN0RXNjYXBlID0gZnVuY3Rpb24gKGxvY2FsKSB7XG4gICAgaWYgKCFsb2NhbCkgcmV0dXJuIGZhbHNlXG5cbiAgICAvLyByZW1vdmUgYWxsIGVzY2FwZWQgc2VjcXVlbmNlc1xuICAgIHZhciB0bXAgPSBsb2NhbC5yZXBsYWNlKC9cXFxcMjAvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMjIvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMjYvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMjcvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMmYvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcM2EvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcM2MvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcM2UvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcNDAvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcNWMvZywgJycpXG5cbiAgICAvLyBkZXRlY3QgaWYgd2UgaGF2ZSB1bmVzY2FwZWQgc2VxdWVuY2VzXG4gICAgdmFyIHNlYXJjaCA9IHRtcC5zZWFyY2goL1xcXFx8IHxcXFwifFxcJnxcXCd8XFwvfDp8PHw+fEAvZyk7XG4gICAgaWYgKHNlYXJjaCA9PT0gLTEpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG59XG5cbi8qKiBcbiAqIEVzY2FwZSB0aGUgbG9jYWwgcGFydCBvZiBhIEpJRC5cbiAqXG4gKiBAc2VlIGh0dHA6Ly94bXBwLm9yZy9leHRlbnNpb25zL3hlcC0wMTA2Lmh0bWxcbiAqIEBwYXJhbSBTdHJpbmcgbG9jYWwgbG9jYWwgcGFydCBvZiBhIGppZFxuICogQHJldHVybiBBbiBlc2NhcGVkIGxvY2FsIHBhcnRcbiAqL1xuSklELnByb3RvdHlwZS5lc2NhcGVMb2NhbCA9IGZ1bmN0aW9uIChsb2NhbCkge1xuICAgIGlmIChsb2NhbCA9PT0gbnVsbCkgcmV0dXJuIG51bGxcblxuICAgIC8qIGpzaGludCAtVzA0NCAqL1xuICAgIHJldHVybiBsb2NhbC5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFw1YycpXG4gICAgICAgIC5yZXBsYWNlKC8gL2csICdcXFxcMjAnKVxuICAgICAgICAucmVwbGFjZSgvXFxcIi9nLCAnXFxcXDIyJylcbiAgICAgICAgLnJlcGxhY2UoL1xcJi9nLCAnXFxcXDI2JylcbiAgICAgICAgLnJlcGxhY2UoL1xcJy9nLCAnXFxcXDI3JylcbiAgICAgICAgLnJlcGxhY2UoL1xcLy9nLCAnXFxcXDJmJylcbiAgICAgICAgLnJlcGxhY2UoLzovZywgJ1xcXFwzYScpXG4gICAgICAgIC5yZXBsYWNlKC88L2csICdcXFxcM2MnKVxuICAgICAgICAucmVwbGFjZSgvPi9nLCAnXFxcXDNlJylcbiAgICAgICAgLnJlcGxhY2UoL0AvZywgJ1xcXFw0MCcpXG4gICAgICAgIC5yZXBsYWNlKC9cXDNhL2csICdcXDVjM2EnKVxuICAgICAgIFxuICAgIFxufVxuXG4vKiogXG4gKiBVbmVzY2FwZSBhIGxvY2FsIHBhcnQgb2YgYSBKSUQuXG4gKlxuICogQHNlZSBodHRwOi8veG1wcC5vcmcvZXh0ZW5zaW9ucy94ZXAtMDEwNi5odG1sXG4gKiBAcGFyYW0gU3RyaW5nIGxvY2FsIGxvY2FsIHBhcnQgb2YgYSBqaWRcbiAqIEByZXR1cm4gdW5lc2NhcGVkIGxvY2FsIHBhcnRcbiAqL1xuSklELnByb3RvdHlwZS51bmVzY2FwZUxvY2FsID0gZnVuY3Rpb24gKGxvY2FsKSB7XG4gICAgaWYgKGxvY2FsID09PSBudWxsKSByZXR1cm4gbnVsbFxuXG4gICAgcmV0dXJuIGxvY2FsLnJlcGxhY2UoL1xcXFwyMC9nLCAnICcpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMjIvZywgJ1xcXCInKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDI2L2csICcmJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwyNy9nLCAnXFwnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwyZi9nLCAnLycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcM2EvZywgJzonKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDNjL2csICc8JylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwzZS9nLCAnPicpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcNDAvZywgJ0AnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDVjL2csICdcXFxcJylcbn1cblxuaWYgKCh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpICYmIChleHBvcnRzICE9PSBudWxsKSkge1xuICAgIG1vZHVsZS5leHBvcnRzID0gSklEXG59IGVsc2UgaWYgKCh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykgJiYgKHdpbmRvdyAhPT0gbnVsbCkpIHtcbiAgICB3aW5kb3cuSklEID0gSklEXG59XG4iLCIndXNlIHN0cmljdCc7XG5cblxudmFyIGRucyA9IHJlcXVpcmUoJ2RucycpXG5cbmZ1bmN0aW9uIGNvbXBhcmVOdW1iZXJzKGEsIGIpIHtcbiAgICBhID0gcGFyc2VJbnQoYSwgMTApXG4gICAgYiA9IHBhcnNlSW50KGIsIDEwKVxuICAgIGlmIChhIDwgYilcbiAgICAgICAgcmV0dXJuIC0xXG4gICAgaWYgKGEgPiBiKVxuICAgICAgICByZXR1cm4gMVxuICAgIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGdyb3VwU3J2UmVjb3JkcyhhZGRycykge1xuICAgIHZhciBncm91cHMgPSB7fSAgLy8gYnkgcHJpb3JpdHlcbiAgICBhZGRycy5mb3JFYWNoKGZ1bmN0aW9uKGFkZHIpIHtcbiAgICAgICAgaWYgKCFncm91cHMuaGFzT3duUHJvcGVydHkoYWRkci5wcmlvcml0eSkpXG4gICAgICAgICAgICBncm91cHNbYWRkci5wcmlvcml0eV0gPSBbXVxuXG4gICAgICAgIGdyb3Vwc1thZGRyLnByaW9yaXR5XS5wdXNoKGFkZHIpXG4gICAgfSlcblxuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIE9iamVjdC5rZXlzKGdyb3Vwcykuc29ydChjb21wYXJlTnVtYmVycykuZm9yRWFjaChmdW5jdGlvbihwcmlvcml0eSkge1xuICAgICAgICB2YXIgZ3JvdXAgPSBncm91cHNbcHJpb3JpdHldXG4gICAgICAgIHZhciB0b3RhbFdlaWdodCA9IDBcbiAgICAgICAgZ3JvdXAuZm9yRWFjaChmdW5jdGlvbihhZGRyKSB7XG4gICAgICAgICAgICB0b3RhbFdlaWdodCArPSBhZGRyLndlaWdodFxuICAgICAgICB9KVxuICAgICAgICB2YXIgdyA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRvdGFsV2VpZ2h0KVxuICAgICAgICB0b3RhbFdlaWdodCA9IDBcbiAgICAgICAgdmFyIGNhbmRpZGF0ZSA9IGdyb3VwWzBdXG4gICAgICAgIGdyb3VwLmZvckVhY2goZnVuY3Rpb24oYWRkcikge1xuICAgICAgICAgICAgdG90YWxXZWlnaHQgKz0gYWRkci53ZWlnaHRcbiAgICAgICAgICAgIGlmICh3IDwgdG90YWxXZWlnaHQpXG4gICAgICAgICAgICAgICAgY2FuZGlkYXRlID0gYWRkclxuICAgICAgICB9KVxuICAgICAgICBpZiAoY2FuZGlkYXRlKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2FuZGlkYXRlKVxuICAgIH0pXG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiByZXNvbHZlU3J2KG5hbWUsIGNiKSB7XG4gICAgZG5zLnJlc29sdmVTcnYobmFtZSwgZnVuY3Rpb24oZXJyLCBhZGRycykge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAvKiBubyBTUlYgcmVjb3JkLCB0cnkgZG9tYWluIGFzIEEgKi9cbiAgICAgICAgICAgIGNiKGVycilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwZW5kaW5nID0gMCwgZXJyb3IsIHJlc3VsdHMgPSBbXVxuICAgICAgICAgICAgdmFyIGNiMSA9IGZ1bmN0aW9uKGUsIGFkZHJzMSkge1xuICAgICAgICAgICAgICAgIGVycm9yID0gZXJyb3IgfHwgZVxuICAgICAgICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmNvbmNhdChhZGRyczEpXG4gICAgICAgICAgICAgICAgcGVuZGluZy0tXG4gICAgICAgICAgICAgICAgaWYgKHBlbmRpbmcgPCAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGNiKHJlc3VsdHMgPyBudWxsIDogZXJyb3IsIHJlc3VsdHMpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGdTUlYgPSBncm91cFNydlJlY29yZHMoYWRkcnMpXG4gICAgICAgICAgICBwZW5kaW5nID0gZ1NSVi5sZW5ndGhcbiAgICAgICAgICAgIGdTUlYuZm9yRWFjaChmdW5jdGlvbihhZGRyKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZUhvc3QoYWRkci5uYW1lLCBmdW5jdGlvbihlLCBhKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhID0gYS5tYXAoZnVuY3Rpb24oYTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBuYW1lOiBhMSwgcG9ydDogYWRkci5wb3J0IH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2IxKGUsIGEpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9KVxufVxuXG4vLyBvbmUgb2YgYm90aCBBICYgQUFBQSwgaW4gY2FzZSBvZiBicm9rZW4gdHVubmVsc1xuZnVuY3Rpb24gcmVzb2x2ZUhvc3QobmFtZSwgY2IpIHtcbiAgICB2YXIgZXJyb3IsIHJlc3VsdHMgPSBbXVxuICAgIHZhciBjYjEgPSBmdW5jdGlvbihlLCBhZGRyKSB7XG4gICAgICAgIGVycm9yID0gZXJyb3IgfHwgZVxuICAgICAgICBpZiAoYWRkcilcbiAgICAgICAgICAgIHJlc3VsdHMucHVzaChhZGRyKVxuXG4gICAgICAgIGNiKChyZXN1bHRzLmxlbmd0aCA+IDApID8gbnVsbCA6IGVycm9yLCByZXN1bHRzKVxuICAgIH1cblxuICAgIGRucy5sb29rdXAobmFtZSwgY2IxKVxufVxuXG4vLyBjb25uZWN0aW9uIGF0dGVtcHRzIHRvIG11bHRpcGxlIGFkZHJlc3NlcyBpbiBhIHJvd1xuZnVuY3Rpb24gdHJ5Q29ubmVjdChjb25uZWN0aW9uLCBhZGRycykge1xuICAgIGNvbm5lY3Rpb24ub24oJ2Nvbm5lY3QnLCBjbGVhbnVwKVxuICAgIGNvbm5lY3Rpb24ub24oJ2Rpc2Nvbm5lY3QnLCBjb25uZWN0TmV4dClcbiAgICByZXR1cm4gY29ubmVjdE5leHQoKVxuXG4gICAgZnVuY3Rpb24gY2xlYW51cCgpIHtcbiAgICAgICAgY29ubmVjdGlvbi5yZW1vdmVMaXN0ZW5lcignY29ubmVjdCcsIGNsZWFudXApXG4gICAgICAgIGNvbm5lY3Rpb24ucmVtb3ZlTGlzdGVuZXIoJ2Rpc2Nvbm5lY3QnLCBjb25uZWN0TmV4dClcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb25uZWN0TmV4dCgpIHtcbiAgICAgICAgdmFyIGFkZHIgPSBhZGRycy5zaGlmdCgpXG4gICAgICAgIGlmIChhZGRyKVxuICAgICAgICAgICAgY29ubmVjdGlvbi5zb2NrZXQuY29ubmVjdChhZGRyLnBvcnQsIGFkZHIubmFtZSlcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgY2xlYW51cCgpXG4gICAgfVxufVxuXG4vLyByZXR1cm5zIGEgbGF6eSBpdGVyYXRvciB3aGljaCBjYW4gYmUgcmVzdGFydGVkIHZpYSBjb25uZWN0aW9uLmNvbm5lY3QoKVxuZXhwb3J0cy5jb25uZWN0ID0gZnVuY3Rpb24gY29ubmVjdChvcHRzKSB7XG4gICAgdmFyIHNlcnZpY2VzID0gb3B0cy5zZXJ2aWNlcy5zbGljZSgpXG4gICAgLy8gbGF6eSBldmFsdWF0aW9uIHRvIGRldGVybWluZSBlbmRwb2ludFxuICAgIGZ1bmN0aW9uIHRyeVNlcnZpY2VzKHJldHJ5KSB7XG4gICAgICAgIC8qIGpzaGludCAtVzA0MCAqL1xuICAgICAgICB2YXIgY29ubmVjdGlvbiA9IHRoaXNcbiAgICAgICAgaWYgKCFjb25uZWN0aW9uLnNvY2tldCAmJiBvcHRzLnNvY2tldCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvcHRzLnNvY2tldCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGNvbm5lY3Rpb24uc29ja2V0ID0gb3B0cy5zb2NrZXQuY2FsbCh0aGlzKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25uZWN0aW9uLnNvY2tldCA9IG9wdHMuc29ja2V0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcHRzLnNvY2tldCA9IG51bGxcbiAgICAgICAgfSBlbHNlIGlmICghcmV0cnkpIHtcbiAgICAgICAgICAgIGNvbm5lY3Rpb24uc29ja2V0ID0gbnVsbFxuICAgICAgICB9XG4gICAgICAgIHZhciBzZXJ2aWNlID0gc2VydmljZXMuc2hpZnQoKVxuICAgICAgICBpZiAoc2VydmljZSkge1xuICAgICAgICAgICAgcmVzb2x2ZVNydihzZXJ2aWNlICsgJy4nICsgb3B0cy5kb21haW4sIGZ1bmN0aW9uKGVycm9yLCBhZGRycykge1xuICAgICAgICAgICAgICAgIGlmIChhZGRycylcbiAgICAgICAgICAgICAgICAgICAgdHJ5Q29ubmVjdChjb25uZWN0aW9uLCBhZGRycylcbiAgICAgICAgICAgICAgICAvLyBjYWxsIHRyeVNlcnZpY2VzIGFnYWluXG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeVNlcnZpY2VzLmNhbGwoY29ubmVjdGlvbiwgJ3JldHJ5JylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzb2x2ZUhvc3Qob3B0cy5kb21haW4sIGZ1bmN0aW9uKGVycm9yLCBhZGRycykge1xuICAgICAgICAgICAgICAgIGlmIChhZGRycyAmJiBhZGRycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZHJzID0gYWRkcnMubWFwKGZ1bmN0aW9uKGFkZHIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG5hbWU6IGFkZHIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3J0OiBvcHRzLmRlZmF1bHRQb3J0IH1cbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgdHJ5Q29ubmVjdChjb25uZWN0aW9uLCBhZGRycylcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbm5lY3Rpb24ucmVjb25uZWN0KSAge1xuICAgICAgICAgICAgICAgICAgICAvLyByZXRyeSBmcm9tIHRoZSBiZWdpbm5pbmdcbiAgICAgICAgICAgICAgICAgICAgc2VydmljZXMgPSBvcHRzLnNlcnZpY2VzLnNsaWNlKClcbiAgICAgICAgICAgICAgICAgICAgLy8gZ2V0IGEgbmV3IHNvY2tldFxuICAgICAgICAgICAgICAgICAgICBjb25uZWN0aW9uLnNvY2tldCA9IG51bGxcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlcnJvciA9IGVycm9yIHx8IG5ldyBFcnJvcignTm8gYWRkcmVzc2VzIHJlc29sdmVkIGZvciAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdHMuZG9tYWluKVxuICAgICAgICAgICAgICAgICAgICBjb25uZWN0aW9uLmVtaXQoJ2Vycm9yJywgZXJyb3IpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29ubmVjdGlvbi5zb2NrZXRcbiAgICB9XG4gICAgcmV0dXJuIHRyeVNlcnZpY2VzXG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgbHR4ID0gcmVxdWlyZSgnbHR4JylcblxuZnVuY3Rpb24gU3RhbnphKG5hbWUsIGF0dHJzKSB7XG4gICAgbHR4LkVsZW1lbnQuY2FsbCh0aGlzLCBuYW1lLCBhdHRycylcbn1cblxudXRpbC5pbmhlcml0cyhTdGFuemEsIGx0eC5FbGVtZW50KVxuXG5TdGFuemEucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGNsb25lID0gbmV3IFN0YW56YSh0aGlzLm5hbWUsIHt9KVxuICAgIGZvciAodmFyIGsgaW4gdGhpcy5hdHRycykge1xuICAgICAgICBpZiAodGhpcy5hdHRycy5oYXNPd25Qcm9wZXJ0eShrKSlcbiAgICAgICAgICAgIGNsb25lLmF0dHJzW2tdID0gdGhpcy5hdHRyc1trXVxuICAgIH1cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBjbG9uZS5jbm9kZShjaGlsZC5jbG9uZSA/IGNoaWxkLmNsb25lKCkgOiBjaGlsZClcbiAgICB9XG4gICAgcmV0dXJuIGNsb25lXG59XG5cbi8qKlxuICogQ29tbW9uIGF0dHJpYnV0ZSBnZXR0ZXJzL3NldHRlcnMgZm9yIGFsbCBzdGFuemFzXG4gKi9cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFN0YW56YS5wcm90b3R5cGUsICdmcm9tJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmF0dHJzLmZyb21cbiAgICB9LFxuXG4gICAgc2V0OiBmdW5jdGlvbihmcm9tKSB7XG4gICAgICAgIHRoaXMuYXR0cnMuZnJvbSA9IGZyb21cbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFN0YW56YS5wcm90b3R5cGUsICd0bycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5hdHRycy50b1xuICAgIH0sXG5cbiAgICBzZXQ6IGZ1bmN0aW9uKHRvKSB7XG4gICAgICAgIHRoaXMuYXR0cnMudG8gPSB0b1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU3RhbnphLnByb3RvdHlwZSwgJ2lkJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmF0dHJzLmlkXG4gICAgfSxcblxuICAgIHNldDogZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgdGhpcy5hdHRycy5pZCA9IGlkXG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTdGFuemEucHJvdG90eXBlLCAndHlwZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5hdHRycy50eXBlXG4gICAgfSxcblxuICAgIHNldDogZnVuY3Rpb24odHlwZSkge1xuICAgICAgICB0aGlzLmF0dHJzLnR5cGUgPSB0eXBlXG4gICAgfVxufSk7XG5cbi8qKlxuICogU3RhbnphIGtpbmRzXG4gKi9cblxuZnVuY3Rpb24gTWVzc2FnZShhdHRycykge1xuICAgIFN0YW56YS5jYWxsKHRoaXMsICdtZXNzYWdlJywgYXR0cnMpXG59XG5cbnV0aWwuaW5oZXJpdHMoTWVzc2FnZSwgU3RhbnphKVxuXG5mdW5jdGlvbiBQcmVzZW5jZShhdHRycykge1xuICAgIFN0YW56YS5jYWxsKHRoaXMsICdwcmVzZW5jZScsIGF0dHJzKVxufVxuXG51dGlsLmluaGVyaXRzKFByZXNlbmNlLCBTdGFuemEpXG5cbmZ1bmN0aW9uIElxKGF0dHJzKSB7XG4gICAgU3RhbnphLmNhbGwodGhpcywgJ2lxJywgYXR0cnMpXG59XG5cbnV0aWwuaW5oZXJpdHMoSXEsIFN0YW56YSlcblxuZXhwb3J0cy5FbGVtZW50ID0gbHR4LkVsZW1lbnRcbmV4cG9ydHMuU3RhbnphID0gU3RhbnphXG5leHBvcnRzLk1lc3NhZ2UgPSBNZXNzYWdlXG5leHBvcnRzLlByZXNlbmNlID0gUHJlc2VuY2VcbmV4cG9ydHMuSXEgPSBJcVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIGx0eCA9IHJlcXVpcmUoJ2x0eCcpXG4gICwgU3RhbnphID0gcmVxdWlyZSgnLi9zdGFuemEnKS5TdGFuemFcblxuLyoqXG4gKiBSZWNvZ25pemVzIDxzdHJlYW06c3RyZWFtPiBhbmQgY29sbGVjdHMgc3RhbnphcyB1c2VkIGZvciBvcmRpbmFyeVxuICogVENQIHN0cmVhbXMgYW5kIFdlYnNvY2tldHMuXG4gKlxuICogQVBJOiB3cml0ZShkYXRhKSAmIGVuZChkYXRhKVxuICogRXZlbnRzOiBzdHJlYW1TdGFydCwgc3RhbnphLCBlbmQsIGVycm9yXG4gKi9cbmZ1bmN0aW9uIFN0cmVhbVBhcnNlcihtYXhTdGFuemFTaXplKSB7XG4gICAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcblxuICAgIHZhciBzZWxmID0gdGhpc1xuICAgIHRoaXMucGFyc2VyID0gbmV3IGx0eC5iZXN0U2F4UGFyc2VyKClcblxuICAgIC8qIENvdW50IHRyYWZmaWMgZm9yIGVudGlyZSBsaWZlLXRpbWUgKi9cbiAgICB0aGlzLmJ5dGVzUGFyc2VkID0gMFxuICAgIHRoaXMubWF4U3RhbnphU2l6ZSA9IG1heFN0YW56YVNpemVcbiAgICAvKiBXaWxsIGJlIHJlc2V0IHVwb24gZmlyc3Qgc3RhbnphLCBidXQgZW5mb3JjZSBtYXhTdGFuemFTaXplIHVudGlsIGl0IGlzIHBhcnNlZCAqL1xuICAgIHRoaXMuYnl0ZXNQYXJzZWRPblN0YW56YUJlZ2luID0gMFxuXG4gICAgdGhpcy5wYXJzZXIub24oJ3N0YXJ0RWxlbWVudCcsIGZ1bmN0aW9uKG5hbWUsIGF0dHJzKSB7XG4gICAgICAgICAgICAvLyBUT0RPOiByZWZ1c2UgYW55dGhpbmcgYnV0IDxzdHJlYW06c3RyZWFtPlxuICAgICAgICAgICAgaWYgKCFzZWxmLmVsZW1lbnQgJiYgKG5hbWUgPT09ICdzdHJlYW06c3RyZWFtJykpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3N0cmVhbVN0YXJ0JywgYXR0cnMpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjaGlsZFxuICAgICAgICAgICAgICAgIGlmICghc2VsZi5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIEEgbmV3IHN0YW56YSAqL1xuICAgICAgICAgICAgICAgICAgICBjaGlsZCA9IG5ldyBTdGFuemEobmFtZSwgYXR0cnMpXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuZWxlbWVudCA9IGNoaWxkXG4gICAgICAgICAgICAgICAgICAgICAgLyogRm9yIG1heFN0YW56YVNpemUgZW5mb3JjZW1lbnQgKi9cbiAgICAgICAgICAgICAgICAgICAgc2VsZi5ieXRlc1BhcnNlZE9uU3RhbnphQmVnaW4gPSBzZWxmLmJ5dGVzUGFyc2VkXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLyogQSBjaGlsZCBlbGVtZW50IG9mIGEgc3RhbnphICovXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkID0gbmV3IGx0eC5FbGVtZW50KG5hbWUsIGF0dHJzKVxuICAgICAgICAgICAgICAgICAgICBzZWxmLmVsZW1lbnQgPSBzZWxmLmVsZW1lbnQuY25vZGUoY2hpbGQpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgKVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ2VuZEVsZW1lbnQnLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgIGlmICghc2VsZi5lbGVtZW50ICYmIChuYW1lID09PSAnc3RyZWFtOnN0cmVhbScpKSB7XG4gICAgICAgICAgICBzZWxmLmVuZCgpXG4gICAgICAgIH0gZWxzZSBpZiAoc2VsZi5lbGVtZW50ICYmIChuYW1lID09PSBzZWxmLmVsZW1lbnQubmFtZSkpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLmVsZW1lbnQucGFyZW50KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5lbGVtZW50ID0gc2VsZi5lbGVtZW50LnBhcmVudFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvKiBTdGFuemEgY29tcGxldGUgKi9cbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3N0YW56YScsIHNlbGYuZWxlbWVudClcbiAgICAgICAgICAgICAgICBkZWxldGUgc2VsZi5lbGVtZW50XG4gICAgICAgICAgICAgICAgLyogbWF4U3RhbnphU2l6ZSBkb2Vzbid0IGFwcGx5IHVudGlsIG5leHQgc3RhcnRFbGVtZW50ICovXG4gICAgICAgICAgICAgICAgZGVsZXRlIHNlbGYuYnl0ZXNQYXJzZWRPblN0YW56YUJlZ2luXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWxmLmVycm9yKCd4bWwtbm90LXdlbGwtZm9ybWVkJywgJ1hNTCBwYXJzZSBlcnJvcicpXG4gICAgICAgIH1cbiAgICB9KVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ3RleHQnLCBmdW5jdGlvbihzdHIpIHtcbiAgICAgICAgaWYgKHNlbGYuZWxlbWVudClcbiAgICAgICAgICAgIHNlbGYuZWxlbWVudC50KHN0cilcbiAgICB9KVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ2VudGl0eURlY2wnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgLyogRW50aXR5IGRlY2xhcmF0aW9ucyBhcmUgZm9yYmlkZGVuIGluIFhNUFAuIFdlIG11c3QgYWJvcnQgdG9cbiAgICAgICAgICogYXZvaWQgYSBiaWxsaW9uIGxhdWdocy5cbiAgICAgICAgICovXG4gICAgICAgIHNlbGYuZXJyb3IoJ3htbC1ub3Qtd2VsbC1mb3JtZWQnLCAnTm8gZW50aXR5IGRlY2xhcmF0aW9ucyBhbGxvd2VkJylcbiAgICAgICAgc2VsZi5lbmQoKVxuICAgIH0pXG5cbiAgICB0aGlzLnBhcnNlci5vbignZXJyb3InLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZXJyb3InKSlcbn1cblxudXRpbC5pbmhlcml0cyhTdHJlYW1QYXJzZXIsIEV2ZW50RW1pdHRlcilcblxuXG4vKiBcbiAqIGhhY2sgZm9yIG1vc3QgdXNlY2FzZXMsIGRvIHdlIGhhdmUgYSBiZXR0ZXIgaWRlYT9cbiAqICAgY2F0Y2ggdGhlIGZvbGxvd2luZzpcbiAqICAgPD94bWwgdmVyc2lvbj1cIjEuMFwiPz5cbiAqICAgPD94bWwgdmVyc2lvbj1cIjEuMFwiIGVuY29kaW5nPVwiVVRGLThcIj8+XG4gKiAgIDw/eG1sIHZlcnNpb249XCIxLjBcIiBlbmNvZGluZz1cIlVURi0xNlwiIHN0YW5kYWxvbmU9XCJ5ZXNcIj8+XG4gKi9cblN0cmVhbVBhcnNlci5wcm90b3R5cGUuY2hlY2tYTUxIZWFkZXIgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgIC8vIGNoZWNrIGZvciB4bWwgdGFnXG4gICAgdmFyIGluZGV4ID0gZGF0YS5pbmRleE9mKCc8P3htbCcpO1xuXG4gICAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgICAgICB2YXIgZW5kID0gZGF0YS5pbmRleE9mKCc/PicpO1xuICAgICAgICBpZiAoaW5kZXggPj0gMCAmJiBlbmQgPj0gMCAmJiBpbmRleCA8IGVuZCsyKSB7XG4gICAgICAgICAgICB2YXIgc2VhcmNoID0gZGF0YS5zdWJzdHJpbmcoaW5kZXgsZW5kKzIpO1xuICAgICAgICAgICAgZGF0YSA9IGRhdGEucmVwbGFjZShzZWFyY2gsICcnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkYXRhO1xufVxuXG5TdHJlYW1QYXJzZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIC8qaWYgKC9ePHN0cmVhbTpzdHJlYW0gW14+XStcXC8+JC8udGVzdChkYXRhKSkge1xuICAgIGRhdGEgPSBkYXRhLnJlcGxhY2UoL1xcLz4kLywgXCI+XCIpXG4gICAgfSovXG4gICAgaWYgKHRoaXMucGFyc2VyKSB7XG4gICAgICAgIFxuICAgICAgICBkYXRhID0gZGF0YS50b1N0cmluZygndXRmOCcpXG4gICAgICAgIGRhdGEgPSB0aGlzLmNoZWNrWE1MSGVhZGVyKGRhdGEpXG5cbiAgICAvKiBJZiBhIG1heFN0YW56YVNpemUgaXMgY29uZmlndXJlZCwgdGhlIGN1cnJlbnQgc3RhbnphIG11c3QgY29uc2lzdCBvbmx5IG9mIHRoaXMgbWFueSBieXRlcyAqL1xuICAgICAgICBpZiAodGhpcy5ieXRlc1BhcnNlZE9uU3RhbnphQmVnaW4gJiYgdGhpcy5tYXhTdGFuemFTaXplICYmXG4gICAgICAgICAgICB0aGlzLmJ5dGVzUGFyc2VkID4gdGhpcy5ieXRlc1BhcnNlZE9uU3RhbnphQmVnaW4gKyB0aGlzLm1heFN0YW56YVNpemUpIHtcblxuICAgICAgICAgICAgdGhpcy5lcnJvcigncG9saWN5LXZpb2xhdGlvbicsICdNYXhpbXVtIHN0YW56YSBzaXplIGV4Y2VlZGVkJylcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHRoaXMuYnl0ZXNQYXJzZWQgKz0gZGF0YS5sZW5ndGhcblxuICAgICAgICB0aGlzLnBhcnNlci53cml0ZShkYXRhKVxuICAgIH1cbn1cblxuU3RyZWFtUGFyc2VyLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgaWYgKGRhdGEpIHtcbiAgICAgICAgdGhpcy53cml0ZShkYXRhKVxuICAgIH1cbiAgICAvKiBHZXQgR0MnZWQgKi9cbiAgICBkZWxldGUgdGhpcy5wYXJzZXJcbiAgICB0aGlzLmVtaXQoJ2VuZCcpXG59XG5cblN0cmVhbVBhcnNlci5wcm90b3R5cGUuZXJyb3IgPSBmdW5jdGlvbihjb25kaXRpb24sIG1lc3NhZ2UpIHtcbiAgICB2YXIgZSA9IG5ldyBFcnJvcihtZXNzYWdlKVxuICAgIGUuY29uZGl0aW9uID0gY29uZGl0aW9uXG4gICAgdGhpcy5lbWl0KCdlcnJvcicsIGUpXG59XG5cbmV4cG9ydHMuU3RyZWFtUGFyc2VyID0gU3RyZWFtUGFyc2VyIiwiXG4vKipcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGRlYnVnO1xuXG4vKipcbiAqIENyZWF0ZSBhIGRlYnVnZ2VyIHdpdGggdGhlIGdpdmVuIGBuYW1lYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7VHlwZX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGVidWcobmFtZSkge1xuICBpZiAoIWRlYnVnLmVuYWJsZWQobmFtZSkpIHJldHVybiBmdW5jdGlvbigpe307XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKGZtdCl7XG4gICAgZm10ID0gY29lcmNlKGZtdCk7XG5cbiAgICB2YXIgY3VyciA9IG5ldyBEYXRlO1xuICAgIHZhciBtcyA9IGN1cnIgLSAoZGVidWdbbmFtZV0gfHwgY3Vycik7XG4gICAgZGVidWdbbmFtZV0gPSBjdXJyO1xuXG4gICAgZm10ID0gbmFtZVxuICAgICAgKyAnICdcbiAgICAgICsgZm10XG4gICAgICArICcgKycgKyBkZWJ1Zy5odW1hbml6ZShtcyk7XG5cbiAgICAvLyBUaGlzIGhhY2tlcnkgaXMgcmVxdWlyZWQgZm9yIElFOFxuICAgIC8vIHdoZXJlIGBjb25zb2xlLmxvZ2AgZG9lc24ndCBoYXZlICdhcHBseSdcbiAgICB3aW5kb3cuY29uc29sZVxuICAgICAgJiYgY29uc29sZS5sb2dcbiAgICAgICYmIEZ1bmN0aW9uLnByb3RvdHlwZS5hcHBseS5jYWxsKGNvbnNvbGUubG9nLCBjb25zb2xlLCBhcmd1bWVudHMpO1xuICB9XG59XG5cbi8qKlxuICogVGhlIGN1cnJlbnRseSBhY3RpdmUgZGVidWcgbW9kZSBuYW1lcy5cbiAqL1xuXG5kZWJ1Zy5uYW1lcyA9IFtdO1xuZGVidWcuc2tpcHMgPSBbXTtcblxuLyoqXG4gKiBFbmFibGVzIGEgZGVidWcgbW9kZSBieSBuYW1lLiBUaGlzIGNhbiBpbmNsdWRlIG1vZGVzXG4gKiBzZXBhcmF0ZWQgYnkgYSBjb2xvbiBhbmQgd2lsZGNhcmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmRlYnVnLmVuYWJsZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgdHJ5IHtcbiAgICBsb2NhbFN0b3JhZ2UuZGVidWcgPSBuYW1lO1xuICB9IGNhdGNoKGUpe31cblxuICB2YXIgc3BsaXQgPSAobmFtZSB8fCAnJykuc3BsaXQoL1tcXHMsXSsvKVxuICAgICwgbGVuID0gc3BsaXQubGVuZ3RoO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBuYW1lID0gc3BsaXRbaV0ucmVwbGFjZSgnKicsICcuKj8nKTtcbiAgICBpZiAobmFtZVswXSA9PT0gJy0nKSB7XG4gICAgICBkZWJ1Zy5za2lwcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZS5zdWJzdHIoMSkgKyAnJCcpKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBkZWJ1Zy5uYW1lcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZSArICckJykpO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBEaXNhYmxlIGRlYnVnIG91dHB1dC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmRlYnVnLmRpc2FibGUgPSBmdW5jdGlvbigpe1xuICBkZWJ1Zy5lbmFibGUoJycpO1xufTtcblxuLyoqXG4gKiBIdW1hbml6ZSB0aGUgZ2l2ZW4gYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbVxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZGVidWcuaHVtYW5pemUgPSBmdW5jdGlvbihtcykge1xuICB2YXIgc2VjID0gMTAwMFxuICAgICwgbWluID0gNjAgKiAxMDAwXG4gICAgLCBob3VyID0gNjAgKiBtaW47XG5cbiAgaWYgKG1zID49IGhvdXIpIHJldHVybiAobXMgLyBob3VyKS50b0ZpeGVkKDEpICsgJ2gnO1xuICBpZiAobXMgPj0gbWluKSByZXR1cm4gKG1zIC8gbWluKS50b0ZpeGVkKDEpICsgJ20nO1xuICBpZiAobXMgPj0gc2VjKSByZXR1cm4gKG1zIC8gc2VjIHwgMCkgKyAncyc7XG4gIHJldHVybiBtcyArICdtcyc7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gbW9kZSBuYW1lIGlzIGVuYWJsZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZGVidWcuZW5hYmxlZCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGRlYnVnLnNraXBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGRlYnVnLnNraXBzW2ldLnRlc3QobmFtZSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGRlYnVnLm5hbWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGRlYnVnLm5hbWVzW2ldLnRlc3QobmFtZSkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG4vKipcbiAqIENvZXJjZSBgdmFsYC5cbiAqL1xuXG5mdW5jdGlvbiBjb2VyY2UodmFsKSB7XG4gIGlmICh2YWwgaW5zdGFuY2VvZiBFcnJvcikgcmV0dXJuIHZhbC5zdGFjayB8fCB2YWwubWVzc2FnZTtcbiAgcmV0dXJuIHZhbDtcbn1cblxuLy8gcGVyc2lzdFxuXG50cnkge1xuICBpZiAod2luZG93LmxvY2FsU3RvcmFnZSkgZGVidWcuZW5hYmxlKGxvY2FsU3RvcmFnZS5kZWJ1Zyk7XG59IGNhdGNoKGUpe31cbiIsImFyZ3VtZW50c1s0XVsyM11bMF0uYXBwbHkoZXhwb3J0cyxhcmd1bWVudHMpIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFRoaXMgY2hlYXAgcmVwbGljYSBvZiBET00vQnVpbGRlciBwdXRzIG1lIHRvIHNoYW1lIDotKVxuICpcbiAqIEF0dHJpYnV0ZXMgYXJlIGluIHRoZSBlbGVtZW50LmF0dHJzIG9iamVjdC4gQ2hpbGRyZW4gaXMgYSBsaXN0IG9mXG4gKiBlaXRoZXIgb3RoZXIgRWxlbWVudHMgb3IgU3RyaW5ncyBmb3IgdGV4dCBjb250ZW50LlxuICoqL1xuZnVuY3Rpb24gRWxlbWVudChuYW1lLCBhdHRycykge1xuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLnBhcmVudCA9IG51bGxcbiAgICB0aGlzLmF0dHJzID0gYXR0cnMgfHwge31cbiAgICB0aGlzLmNoaWxkcmVuID0gW11cbn1cblxuLyoqKiBBY2Nlc3NvcnMgKioqL1xuXG4vKipcbiAqIGlmIChlbGVtZW50LmlzKCdtZXNzYWdlJywgJ2phYmJlcjpjbGllbnQnKSkgLi4uXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5pcyA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgcmV0dXJuICh0aGlzLmdldE5hbWUoKSA9PT0gbmFtZSkgJiZcbiAgICAgICAgKCF4bWxucyB8fCAodGhpcy5nZXROUygpID09PSB4bWxucykpXG59XG5cbi8qIHdpdGhvdXQgcHJlZml4ICovXG5FbGVtZW50LnByb3RvdHlwZS5nZXROYW1lID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMubmFtZS5pbmRleE9mKCc6JykgPj0gMClcbiAgICAgICAgcmV0dXJuIHRoaXMubmFtZS5zdWJzdHIodGhpcy5uYW1lLmluZGV4T2YoJzonKSArIDEpXG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gdGhpcy5uYW1lXG59XG5cbi8qKlxuICogcmV0cmlldmVzIHRoZSBuYW1lc3BhY2Ugb2YgdGhlIGN1cnJlbnQgZWxlbWVudCwgdXB3YXJkcyByZWN1cnNpdmVseVxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0TlMgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5uYW1lLmluZGV4T2YoJzonKSA+PSAwKSB7XG4gICAgICAgIHZhciBwcmVmaXggPSB0aGlzLm5hbWUuc3Vic3RyKDAsIHRoaXMubmFtZS5pbmRleE9mKCc6JykpXG4gICAgICAgIHJldHVybiB0aGlzLmZpbmROUyhwcmVmaXgpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluZE5TKClcbiAgICB9XG59XG5cbi8qKlxuICogZmluZCB0aGUgbmFtZXNwYWNlIHRvIHRoZSBnaXZlbiBwcmVmaXgsIHVwd2FyZHMgcmVjdXJzaXZlbHlcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmZpbmROUyA9IGZ1bmN0aW9uKHByZWZpeCkge1xuICAgIGlmICghcHJlZml4KSB7XG4gICAgICAgIC8qIGRlZmF1bHQgbmFtZXNwYWNlICovXG4gICAgICAgIGlmICh0aGlzLmF0dHJzLnhtbG5zKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnMueG1sbnNcbiAgICAgICAgZWxzZSBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQuZmluZE5TKClcbiAgICB9IGVsc2Uge1xuICAgICAgICAvKiBwcmVmaXhlZCBuYW1lc3BhY2UgKi9cbiAgICAgICAgdmFyIGF0dHIgPSAneG1sbnM6JyArIHByZWZpeFxuICAgICAgICBpZiAodGhpcy5hdHRyc1thdHRyXSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmF0dHJzW2F0dHJdXG4gICAgICAgIGVsc2UgaWYgKHRoaXMucGFyZW50KVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50LmZpbmROUyhwcmVmaXgpXG4gICAgfVxufVxuXG4vKipcbiAqIFJlY3Vyc2l2ZXJseSBnZXRzIGFsbCB4bWxucyBkZWZpbmVkLCBpbiB0aGUgZm9ybSBvZiB7dXJsOnByZWZpeH1cbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldFhtbG5zID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5hbWVzcGFjZXMgPSB7fVxuXG4gICAgaWYgKHRoaXMucGFyZW50KVxuICAgICAgICBuYW1lc3BhY2VzID0gdGhpcy5wYXJlbnQuZ2V0WG1sbnMoKVxuXG4gICAgZm9yICh2YXIgYXR0ciBpbiB0aGlzLmF0dHJzKSB7XG4gICAgICAgIHZhciBtID0gYXR0ci5tYXRjaCgneG1sbnM6PyguKiknKVxuICAgICAgICBpZiAodGhpcy5hdHRycy5oYXNPd25Qcm9wZXJ0eShhdHRyKSAmJiBtKSB7XG4gICAgICAgICAgICBuYW1lc3BhY2VzW3RoaXMuYXR0cnNbYXR0cl1dID0gbVsxXVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBuYW1lc3BhY2VzXG59XG5cblxuLyoqXG4gKiB4bWxucyBjYW4gYmUgbnVsbCwgcmV0dXJucyB0aGUgbWF0Y2hpbmcgYXR0cmlidXRlLlxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0QXR0ciA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgaWYgKCF4bWxucylcbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnNbbmFtZV1cblxuICAgIHZhciBuYW1lc3BhY2VzID0gdGhpcy5nZXRYbWxucygpXG5cbiAgICBpZiAoIW5hbWVzcGFjZXNbeG1sbnNdKVxuICAgICAgICByZXR1cm4gbnVsbFxuXG4gICAgcmV0dXJuIHRoaXMuYXR0cnNbW25hbWVzcGFjZXNbeG1sbnNdLCBuYW1lXS5qb2luKCc6JyldXG59XG5cbi8qKlxuICogeG1sbnMgY2FuIGJlIG51bGxcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRDaGlsZHJlbihuYW1lLCB4bWxucylbMF1cbn1cblxuLyoqXG4gKiB4bWxucyBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRyZW4gPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmIChjaGlsZC5nZXROYW1lICYmXG4gICAgICAgICAgICAoY2hpbGQuZ2V0TmFtZSgpID09PSBuYW1lKSAmJlxuICAgICAgICAgICAgKCF4bWxucyB8fCAoY2hpbGQuZ2V0TlMoKSA9PT0geG1sbnMpKSlcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkKVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbi8qKlxuICogeG1sbnMgYW5kIHJlY3Vyc2l2ZSBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRCeUF0dHIgPSBmdW5jdGlvbihhdHRyLCB2YWwsIHhtbG5zLCByZWN1cnNpdmUpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkJ5QXR0cihhdHRyLCB2YWwsIHhtbG5zLCByZWN1cnNpdmUpWzBdXG59XG5cbi8qKlxuICogeG1sbnMgYW5kIHJlY3Vyc2l2ZSBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRyZW5CeUF0dHIgPSBmdW5jdGlvbihhdHRyLCB2YWwsIHhtbG5zLCByZWN1cnNpdmUpIHtcbiAgICB2YXIgcmVzdWx0ID0gW11cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBpZiAoY2hpbGQuYXR0cnMgJiZcbiAgICAgICAgICAgIChjaGlsZC5hdHRyc1thdHRyXSA9PT0gdmFsKSAmJlxuICAgICAgICAgICAgKCF4bWxucyB8fCAoY2hpbGQuZ2V0TlMoKSA9PT0geG1sbnMpKSlcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkKVxuICAgICAgICBpZiAocmVjdXJzaXZlICYmIGNoaWxkLmdldENoaWxkcmVuQnlBdHRyKSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZC5nZXRDaGlsZHJlbkJ5QXR0cihhdHRyLCB2YWwsIHhtbG5zLCB0cnVlKSlcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVjdXJzaXZlKSByZXN1bHQgPSBbXS5jb25jYXQuYXBwbHkoW10sIHJlc3VsdClcbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkcmVuQnlGaWx0ZXIgPSBmdW5jdGlvbihmaWx0ZXIsIHJlY3Vyc2l2ZSkge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmIChmaWx0ZXIoY2hpbGQpKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQpXG4gICAgICAgIGlmIChyZWN1cnNpdmUgJiYgY2hpbGQuZ2V0Q2hpbGRyZW5CeUZpbHRlcil7XG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZC5nZXRDaGlsZHJlbkJ5RmlsdGVyKGZpbHRlciwgdHJ1ZSkpXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlY3Vyc2l2ZSkge1xuICAgICAgICByZXN1bHQgPSBbXS5jb25jYXQuYXBwbHkoW10sIHJlc3VsdClcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5nZXRUZXh0ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRleHQgPSAnJ1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmICgodHlwZW9mIGNoaWxkID09PSAnc3RyaW5nJykgfHwgKHR5cGVvZiBjaGlsZCA9PT0gJ251bWJlcicpKSB7XG4gICAgICAgICAgICB0ZXh0ICs9IGNoaWxkXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRleHRcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRUZXh0ID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICB2YXIgY2hpbGQgPSB0aGlzLmdldENoaWxkKG5hbWUsIHhtbG5zKVxuICAgIHJldHVybiBjaGlsZCA/IGNoaWxkLmdldFRleHQoKSA6IG51bGxcbn1cblxuLyoqXG4gKiBSZXR1cm4gYWxsIGRpcmVjdCBkZXNjZW5kZW50cyB0aGF0IGFyZSBFbGVtZW50cy5cbiAqIFRoaXMgZGlmZmVycyBmcm9tIGBnZXRDaGlsZHJlbmAgaW4gdGhhdCBpdCB3aWxsIGV4Y2x1ZGUgdGV4dCBub2RlcyxcbiAqIHByb2Nlc3NpbmcgaW5zdHJ1Y3Rpb25zLCBldGMuXG4gKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkRWxlbWVudHMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkJ5RmlsdGVyKGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgIHJldHVybiBjaGlsZCBpbnN0YW5jZW9mIEVsZW1lbnRcbiAgICB9KVxufVxuXG4vKioqIEJ1aWxkZXIgKioqL1xuXG4vKiogcmV0dXJucyB1cHBlcm1vc3QgcGFyZW50ICovXG5FbGVtZW50LnByb3RvdHlwZS5yb290ID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMucGFyZW50KVxuICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQucm9vdCgpXG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gdGhpc1xufVxuRWxlbWVudC5wcm90b3R5cGUudHJlZSA9IEVsZW1lbnQucHJvdG90eXBlLnJvb3RcblxuLyoqIGp1c3QgcGFyZW50IG9yIGl0c2VsZiAqL1xuRWxlbWVudC5wcm90b3R5cGUudXAgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudFxuICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIHRoaXNcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuX2dldEVsZW1lbnQgPSBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgIHZhciBlbGVtZW50ID0gbmV3IEVsZW1lbnQobmFtZSwgYXR0cnMpXG4gICAgcmV0dXJuIGVsZW1lbnRcbn1cblxuLyoqIGNyZWF0ZSBjaGlsZCBub2RlIGFuZCByZXR1cm4gaXQgKi9cbkVsZW1lbnQucHJvdG90eXBlLmMgPSBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgIHJldHVybiB0aGlzLmNub2RlKHRoaXMuX2dldEVsZW1lbnQobmFtZSwgYXR0cnMpKVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5jbm9kZSA9IGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKGNoaWxkKVxuICAgIGNoaWxkLnBhcmVudCA9IHRoaXNcbiAgICByZXR1cm4gY2hpbGRcbn1cblxuLyoqIGFkZCB0ZXh0IG5vZGUgYW5kIHJldHVybiBlbGVtZW50ICovXG5FbGVtZW50LnByb3RvdHlwZS50ID0gZnVuY3Rpb24odGV4dCkge1xuICAgIHRoaXMuY2hpbGRyZW4ucHVzaCh0ZXh0KVxuICAgIHJldHVybiB0aGlzXG59XG5cbi8qKiogTWFuaXB1bGF0aW9uICoqKi9cblxuLyoqXG4gKiBFaXRoZXI6XG4gKiAgIGVsLnJlbW92ZShjaGlsZEVsKVxuICogICBlbC5yZW1vdmUoJ2F1dGhvcicsICd1cm46Li4uJylcbiAqL1xuRWxlbWVudC5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24oZWwsIHhtbG5zKSB7XG4gICAgdmFyIGZpbHRlclxuICAgIGlmICh0eXBlb2YgZWwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8qIDFzdCBwYXJhbWV0ZXIgaXMgdGFnIG5hbWUgKi9cbiAgICAgICAgZmlsdGVyID0gZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgICAgIHJldHVybiAhKGNoaWxkLmlzICYmXG4gICAgICAgICAgICAgICAgIGNoaWxkLmlzKGVsLCB4bWxucykpXG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICAvKiAxc3QgcGFyYW1ldGVyIGlzIGVsZW1lbnQgKi9cbiAgICAgICAgZmlsdGVyID0gZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgICAgIHJldHVybiBjaGlsZCAhPT0gZWxcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuY2hpbGRyZW4gPSB0aGlzLmNoaWxkcmVuLmZpbHRlcihmaWx0ZXIpXG5cbiAgICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIFRvIHVzZSBpbiBjYXNlIHlvdSB3YW50IHRoZSBzYW1lIFhNTCBkYXRhIGZvciBzZXBhcmF0ZSB1c2VzLlxuICogUGxlYXNlIHJlZnJhaW4gZnJvbSB0aGlzIHByYWN0aXNlIHVubGVzcyB5b3Uga25vdyB3aGF0IHlvdSBhcmVcbiAqIGRvaW5nLiBCdWlsZGluZyBYTUwgd2l0aCBsdHggaXMgZWFzeSFcbiAqL1xuRWxlbWVudC5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY2xvbmUgPSB0aGlzLl9nZXRFbGVtZW50KHRoaXMubmFtZSwge30pXG4gICAgZm9yICh2YXIgayBpbiB0aGlzLmF0dHJzKSB7XG4gICAgICAgIGlmICh0aGlzLmF0dHJzLmhhc093blByb3BlcnR5KGspKVxuICAgICAgICAgICAgY2xvbmUuYXR0cnNba10gPSB0aGlzLmF0dHJzW2tdXG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGNsb25lLmNub2RlKGNoaWxkLmNsb25lID8gY2hpbGQuY2xvbmUoKSA6IGNoaWxkKVxuICAgIH1cbiAgICByZXR1cm4gY2xvbmVcbn1cblxuRWxlbWVudC5wcm90b3R5cGUudGV4dCA9IGZ1bmN0aW9uKHZhbCkge1xuICAgIGlmICh2YWwgJiYgdGhpcy5jaGlsZHJlbi5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgdGhpcy5jaGlsZHJlblswXSA9IHZhbFxuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5nZXRUZXh0KClcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuYXR0ciA9IGZ1bmN0aW9uKGF0dHIsIHZhbCkge1xuICAgIGlmICgoKHR5cGVvZiB2YWwgIT09ICd1bmRlZmluZWQnKSB8fCAodmFsID09PSBudWxsKSkpIHtcbiAgICAgICAgaWYgKCF0aGlzLmF0dHJzKSB7XG4gICAgICAgICAgICB0aGlzLmF0dHJzID0ge31cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmF0dHJzW2F0dHJdID0gdmFsXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICAgIHJldHVybiB0aGlzLmF0dHJzW2F0dHJdXG59XG5cbi8qKiogU2VyaWFsaXphdGlvbiAqKiovXG5cbkVsZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHMgPSAnJ1xuICAgIHRoaXMud3JpdGUoZnVuY3Rpb24oYykge1xuICAgICAgICBzICs9IGNcbiAgICB9KVxuICAgIHJldHVybiBzXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6IHRoaXMubmFtZSxcbiAgICAgICAgYXR0cnM6IHRoaXMuYXR0cnMsXG4gICAgICAgIGNoaWxkcmVuOiB0aGlzLmNoaWxkcmVuLm1hcChmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICAgICAgcmV0dXJuIGNoaWxkICYmIGNoaWxkLnRvSlNPTiA/IGNoaWxkLnRvSlNPTigpIDogY2hpbGQ7XG4gICAgICAgIH0pXG4gICAgfVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5fYWRkQ2hpbGRyZW4gPSBmdW5jdGlvbih3cml0ZXIpIHtcbiAgICB3cml0ZXIoJz4nKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIC8qIFNraXAgbnVsbC91bmRlZmluZWQgKi9cbiAgICAgICAgaWYgKGNoaWxkIHx8IChjaGlsZCA9PT0gMCkpIHtcbiAgICAgICAgICAgIGlmIChjaGlsZC53cml0ZSkge1xuICAgICAgICAgICAgICAgIGNoaWxkLndyaXRlKHdyaXRlcilcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNoaWxkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHdyaXRlcihlc2NhcGVYbWxUZXh0KGNoaWxkKSlcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2hpbGQudG9TdHJpbmcpIHtcbiAgICAgICAgICAgICAgICB3cml0ZXIoZXNjYXBlWG1sVGV4dChjaGlsZC50b1N0cmluZygxMCkpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHdyaXRlcignPC8nKVxuICAgIHdyaXRlcih0aGlzLm5hbWUpXG4gICAgd3JpdGVyKCc+Jylcbn1cblxuRWxlbWVudC5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbih3cml0ZXIpIHtcbiAgICB3cml0ZXIoJzwnKVxuICAgIHdyaXRlcih0aGlzLm5hbWUpXG4gICAgZm9yICh2YXIgayBpbiB0aGlzLmF0dHJzKSB7XG4gICAgICAgIHZhciB2ID0gdGhpcy5hdHRyc1trXVxuICAgICAgICBpZiAodiB8fCAodiA9PT0gJycpIHx8ICh2ID09PSAwKSkge1xuICAgICAgICAgICAgd3JpdGVyKCcgJylcbiAgICAgICAgICAgIHdyaXRlcihrKVxuICAgICAgICAgICAgd3JpdGVyKCc9XCInKVxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2ICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHYgPSB2LnRvU3RyaW5nKDEwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd3JpdGVyKGVzY2FwZVhtbCh2KSlcbiAgICAgICAgICAgIHdyaXRlcignXCInKVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB3cml0ZXIoJy8+JylcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9hZGRDaGlsZHJlbih3cml0ZXIpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBlc2NhcGVYbWwocykge1xuICAgIHJldHVybiBzLlxuICAgICAgICByZXBsYWNlKC9cXCYvZywgJyZhbXA7JykuXG4gICAgICAgIHJlcGxhY2UoLzwvZywgJyZsdDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPi9nLCAnJmd0OycpLlxuICAgICAgICByZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JykuXG4gICAgICAgIHJlcGxhY2UoL1wiL2csICcmYXBvczsnKVxufVxuXG5mdW5jdGlvbiBlc2NhcGVYbWxUZXh0KHMpIHtcbiAgICByZXR1cm4gcy5cbiAgICAgICAgcmVwbGFjZSgvXFwmL2csICcmYW1wOycpLlxuICAgICAgICByZXBsYWNlKC88L2csICcmbHQ7JykuXG4gICAgICAgIHJlcGxhY2UoLz4vZywgJyZndDsnKVxufVxuXG5leHBvcnRzLkVsZW1lbnQgPSBFbGVtZW50XG5leHBvcnRzLmVzY2FwZVhtbCA9IGVzY2FwZVhtbFxuIiwiYXJndW1lbnRzWzRdWzI1XVswXS5hcHBseShleHBvcnRzLGFyZ3VtZW50cykiLCJhcmd1bWVudHNbNF1bMjZdWzBdLmFwcGx5KGV4cG9ydHMsYXJndW1lbnRzKSIsImFyZ3VtZW50c1s0XVsyN11bMF0uYXBwbHkoZXhwb3J0cyxhcmd1bWVudHMpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgbG9nID0gcmVxdWlyZSgnZGVidWcnKSgnbm9kZS1zdHJpbmdwcmVwJylcblxuLy8gZnJvbSB1bmljb2RlL3VpZG5hLmhcbnZhciBVSUROQV9BTExPV19VTkFTU0lHTkVEID0gMVxudmFyIFVJRE5BX1VTRV9TVEQzX1JVTEVTID0gMlxuXG50cnkge1xuICAgIHZhciBiaW5kaW5ncyA9IHJlcXVpcmUoJ2JpbmRpbmdzJykoJ25vZGVfc3RyaW5ncHJlcC5ub2RlJylcbn0gY2F0Y2ggKGV4KSB7XG4gICAgY29uc29sZS53YXJuKFxuICAgICAgICAnQ2Fubm90IGxvYWQgU3RyaW5nUHJlcC0nICtcbiAgICAgICAgcmVxdWlyZSgnLi9wYWNrYWdlLmpzb24nKS52ZXJzaW9uICtcbiAgICAgICAgJyBiaW5kaW5ncyAodXNpbmcgZmFsbGJhY2spLiBZb3UgbWF5IG5lZWQgdG8gJyArXG4gICAgICAgICdgbnBtIGluc3RhbGwgbm9kZS1zdHJpbmdwcmVwYCdcbiAgICApXG4gICAgbG9nKGV4KVxufVxuXG52YXIgdG9Vbmljb2RlID0gZnVuY3Rpb24odmFsdWUsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBiaW5kaW5ncy50b1VuaWNvZGUodmFsdWUsXG4gICAgICAgICAgICAob3B0aW9ucy5hbGxvd1VuYXNzaWduZWQgJiYgVUlETkFfQUxMT1dfVU5BU1NJR05FRCkgfCAwKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgfVxufVxuXG52YXIgdG9BU0NJSSA9IGZ1bmN0aW9uKHZhbHVlLCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gYmluZGluZ3MudG9BU0NJSSh2YWx1ZSxcbiAgICAgICAgICAgIChvcHRpb25zLmFsbG93VW5hc3NpZ25lZCAmJiBVSUROQV9BTExPV19VTkFTU0lHTkVEKSB8XG4gICAgICAgICAgICAob3B0aW9ucy51c2VTVEQzUnVsZXMgJiYgVUlETkFfVVNFX1NURDNfUlVMRVMpKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMudGhyb3dJZkVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgfVxuICAgIH1cbn1cblxudmFyIFN0cmluZ1ByZXAgPSBmdW5jdGlvbihvcGVyYXRpb24pIHtcbiAgICB0aGlzLm9wZXJhdGlvbiA9IG9wZXJhdGlvblxuICAgIHRyeSB7XG4gICAgICAgIHRoaXMuc3RyaW5nUHJlcCA9IG5ldyBiaW5kaW5ncy5TdHJpbmdQcmVwKHRoaXMub3BlcmF0aW9uKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhpcy5zdHJpbmdQcmVwID0gbnVsbFxuICAgICAgICBsb2coJ09wZXJhdGlvbiBkb2VzIG5vdCBleGlzdCcsIG9wZXJhdGlvbiwgZSlcbiAgICB9XG59XG5cblN0cmluZ1ByZXAucHJvdG90eXBlLlVOS05PV05fUFJPRklMRV9UWVBFID0gJ1Vua25vd24gcHJvZmlsZSB0eXBlJ1xuU3RyaW5nUHJlcC5wcm90b3R5cGUuVU5IQU5ETEVEX0ZBTExCQUNLID0gJ1VuaGFuZGxlZCBKUyBmYWxsYmFjaydcblN0cmluZ1ByZXAucHJvdG90eXBlLkxJQklDVV9OT1RfQVZBSUxBQkxFID0gJ2xpYmljdSB1bmF2YWlsYWJsZSdcblxuU3RyaW5nUHJlcC5wcm90b3R5cGUudXNlSnNGYWxsYmFja3MgPSB0cnVlXG5cblN0cmluZ1ByZXAucHJvdG90eXBlLnByZXBhcmUgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHRoaXMudmFsdWUgPSB2YWx1ZVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0aGlzLnN0cmluZ1ByZXApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnN0cmluZ1ByZXAucHJlcGFyZSh0aGlzLnZhbHVlKVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge31cbiAgICBpZiAoZmFsc2UgPT09IHRoaXMudXNlSnNGYWxsYmFja3MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMuTElCSUNVX05PVF9BVkFJTEFCTEUpXG4gICAgfVxuICAgIHJldHVybiB0aGlzLmpzRmFsbGJhY2soKVxufVxuXG5TdHJpbmdQcmVwLnByb3RvdHlwZS5pc05hdGl2ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAobnVsbCAhPT0gdGhpcy5zdHJpbmdQcmVwKVxufVxuXG5TdHJpbmdQcmVwLnByb3RvdHlwZS5qc0ZhbGxiYWNrID0gZnVuY3Rpb24oKSB7XG4gICAgc3dpdGNoICh0aGlzLm9wZXJhdGlvbikge1xuICAgICAgICBjYXNlICduYW1lcHJlcCc6XG4gICAgICAgIGNhc2UgJ25vZGVwcmVwJzpcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnZhbHVlLnRvTG93ZXJDYXNlKClcbiAgICAgICAgY2FzZSAncmVzb3VyY2VwcmVwJzpcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnZhbHVlXG4gICAgICAgIGNhc2UgJ25mczRfY3NfcHJlcCc6XG4gICAgICAgIGNhc2UgJ25mczRfY2lzX3ByZXAnOlxuICAgICAgICBjYXNlICduZnM0X21peGVkX3ByZXAgcHJlZml4JzpcbiAgICAgICAgY2FzZSAnbmZzNF9taXhlZF9wcmVwIHN1ZmZpeCc6XG4gICAgICAgIGNhc2UgJ2lzY3NpJzpcbiAgICAgICAgY2FzZSAnbWliJzpcbiAgICAgICAgY2FzZSAnc2FzbHByZXAnOlxuICAgICAgICBjYXNlICd0cmFjZSc6XG4gICAgICAgIGNhc2UgJ2xkYXAnOlxuICAgICAgICBjYXNlICdsZGFwY2knOlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMuVU5IQU5ETEVEX0ZBTExCQUNLKVxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMuVU5LTk9XTl9QUk9GSUxFX1RZUEUpXG4gICAgfVxufVxuXG5TdHJpbmdQcmVwLnByb3RvdHlwZS5kaXNhYmxlSnNGYWxsYmFja3MgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnVzZUpzRmFsbGJhY2tzID0gZmFsc2Vcbn1cblxuU3RyaW5nUHJlcC5wcm90b3R5cGUuZW5hYmxlSnNGYWxsYmFja3MgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnVzZUpzRmFsbGJhY2tzID0gdHJ1ZVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICB0b1VuaWNvZGU6IHRvVW5pY29kZSxcbiAgICB0b0FTQ0lJOiB0b0FTQ0lJLFxuICAgIFN0cmluZ1ByZXA6IFN0cmluZ1ByZXBcbn1cbiIsIihmdW5jdGlvbiAocHJvY2VzcyxfX2ZpbGVuYW1lKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBmcyA9IHJlcXVpcmUoJ2ZzJylcbiAgLCBwYXRoID0gcmVxdWlyZSgncGF0aCcpXG4gICwgam9pbiA9IHBhdGguam9pblxuICAsIGRpcm5hbWUgPSBwYXRoLmRpcm5hbWVcbiAgLCBleGlzdHMgPSBmcy5leGlzdHNTeW5jIHx8IHBhdGguZXhpc3RzU3luY1xuICAsIGRlZmF1bHRzID0ge1xuICAgICAgICBhcnJvdzogcHJvY2Vzcy5lbnYuTk9ERV9CSU5ESU5HU19BUlJPVyB8fCAnIOKGkiAnXG4gICAgICAsIGNvbXBpbGVkOiBwcm9jZXNzLmVudi5OT0RFX0JJTkRJTkdTX0NPTVBJTEVEX0RJUiB8fCAnY29tcGlsZWQnXG4gICAgICAsIHBsYXRmb3JtOiBwcm9jZXNzLnBsYXRmb3JtXG4gICAgICAsIGFyY2g6IHByb2Nlc3MuYXJjaFxuICAgICAgLCB2ZXJzaW9uOiBwcm9jZXNzLnZlcnNpb25zLm5vZGVcbiAgICAgICwgYmluZGluZ3M6ICdiaW5kaW5ncy5ub2RlJ1xuICAgICAgLCB0cnk6IFtcbiAgICAgICAgICAvLyBub2RlLWd5cCdzIGxpbmtlZCB2ZXJzaW9uIGluIHRoZSBcImJ1aWxkXCIgZGlyXG4gICAgICAgICAgWyAnbW9kdWxlX3Jvb3QnLCAnYnVpbGQnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgICAvLyBub2RlLXdhZiBhbmQgZ3lwX2FkZG9uIChhLmsuYSBub2RlLWd5cClcbiAgICAgICAgLCBbICdtb2R1bGVfcm9vdCcsICdidWlsZCcsICdEZWJ1ZycsICdiaW5kaW5ncycgXVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ2J1aWxkJywgJ1JlbGVhc2UnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgICAvLyBEZWJ1ZyBmaWxlcywgZm9yIGRldmVsb3BtZW50IChsZWdhY3kgYmVoYXZpb3IsIHJlbW92ZSBmb3Igbm9kZSB2MC45KVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ291dCcsICdEZWJ1ZycsICdiaW5kaW5ncycgXVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ0RlYnVnJywgJ2JpbmRpbmdzJyBdXG4gICAgICAgICAgLy8gUmVsZWFzZSBmaWxlcywgYnV0IG1hbnVhbGx5IGNvbXBpbGVkIChsZWdhY3kgYmVoYXZpb3IsIHJlbW92ZSBmb3Igbm9kZSB2MC45KVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ291dCcsICdSZWxlYXNlJywgJ2JpbmRpbmdzJyBdXG4gICAgICAgICwgWyAnbW9kdWxlX3Jvb3QnLCAnUmVsZWFzZScsICdiaW5kaW5ncycgXVxuICAgICAgICAgIC8vIExlZ2FjeSBmcm9tIG5vZGUtd2FmLCBub2RlIDw9IDAuNC54XG4gICAgICAgICwgWyAnbW9kdWxlX3Jvb3QnLCAnYnVpbGQnLCAnZGVmYXVsdCcsICdiaW5kaW5ncycgXVxuICAgICAgICAgIC8vIFByb2R1Y3Rpb24gXCJSZWxlYXNlXCIgYnVpbGR0eXBlIGJpbmFyeSAobWVoLi4uKVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ2NvbXBpbGVkJywgJ3ZlcnNpb24nLCAncGxhdGZvcm0nLCAnYXJjaCcsICdiaW5kaW5ncycgXVxuICAgICAgICBdXG4gICAgfVxuXG4vKipcbiAqIFRoZSBtYWluIGBiaW5kaW5ncygpYCBmdW5jdGlvbiBsb2FkcyB0aGUgY29tcGlsZWQgYmluZGluZ3MgZm9yIGEgZ2l2ZW4gbW9kdWxlLlxuICogSXQgdXNlcyBWOCdzIEVycm9yIEFQSSB0byBkZXRlcm1pbmUgdGhlIHBhcmVudCBmaWxlbmFtZSB0aGF0IHRoaXMgZnVuY3Rpb24gaXNcbiAqIGJlaW5nIGludm9rZWQgZnJvbSwgd2hpY2ggaXMgdGhlbiB1c2VkIHRvIGZpbmQgdGhlIHJvb3QgZGlyZWN0b3J5LlxuICovXG5cbmZ1bmN0aW9uIGJpbmRpbmdzIChvcHRzKSB7XG5cbiAgLy8gQXJndW1lbnQgc3VyZ2VyeVxuICBpZiAodHlwZW9mIG9wdHMgPT0gJ3N0cmluZycpIHtcbiAgICBvcHRzID0geyBiaW5kaW5nczogb3B0cyB9XG4gIH0gZWxzZSBpZiAoIW9wdHMpIHtcbiAgICBvcHRzID0ge31cbiAgfVxuICBvcHRzLl9fcHJvdG9fXyA9IGRlZmF1bHRzXG5cbiAgLy8gR2V0IHRoZSBtb2R1bGUgcm9vdFxuICBpZiAoIW9wdHMubW9kdWxlX3Jvb3QpIHtcbiAgICBvcHRzLm1vZHVsZV9yb290ID0gZXhwb3J0cy5nZXRSb290KGV4cG9ydHMuZ2V0RmlsZU5hbWUoKSlcbiAgfVxuXG4gIC8vIEVuc3VyZSB0aGUgZ2l2ZW4gYmluZGluZ3MgbmFtZSBlbmRzIHdpdGggLm5vZGVcbiAgaWYgKHBhdGguZXh0bmFtZShvcHRzLmJpbmRpbmdzKSAhPSAnLm5vZGUnKSB7XG4gICAgb3B0cy5iaW5kaW5ncyArPSAnLm5vZGUnXG4gIH1cblxuICB2YXIgdHJpZXMgPSBbXVxuICAgICwgaSA9IDBcbiAgICAsIGwgPSBvcHRzLnRyeS5sZW5ndGhcbiAgICAsIG5cbiAgICAsIGJcbiAgICAsIGVyclxuXG4gIGZvciAoOyBpPGw7IGkrKykge1xuICAgIG4gPSBqb2luLmFwcGx5KG51bGwsIG9wdHMudHJ5W2ldLm1hcChmdW5jdGlvbiAocCkge1xuICAgICAgcmV0dXJuIG9wdHNbcF0gfHwgcFxuICAgIH0pKVxuICAgIHRyaWVzLnB1c2gobilcbiAgICB0cnkge1xuICAgICAgYiA9IG9wdHMucGF0aCA/IHJlcXVpcmUucmVzb2x2ZShuKSA6IHJlcXVpcmUobilcbiAgICAgIGlmICghb3B0cy5wYXRoKSB7XG4gICAgICAgIGIucGF0aCA9IG5cbiAgICAgIH1cbiAgICAgIHJldHVybiBiXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKCEvbm90IGZpbmQvaS50ZXN0KGUubWVzc2FnZSkpIHtcbiAgICAgICAgdGhyb3cgZVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGVyciA9IG5ldyBFcnJvcignQ291bGQgbm90IGxvY2F0ZSB0aGUgYmluZGluZ3MgZmlsZS4gVHJpZWQ6XFxuJ1xuICAgICsgdHJpZXMubWFwKGZ1bmN0aW9uIChhKSB7IHJldHVybiBvcHRzLmFycm93ICsgYSB9KS5qb2luKCdcXG4nKSlcbiAgZXJyLnRyaWVzID0gdHJpZXNcbiAgdGhyb3cgZXJyXG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPSBiaW5kaW5nc1xuXG5cbi8qKlxuICogR2V0cyB0aGUgZmlsZW5hbWUgb2YgdGhlIEphdmFTY3JpcHQgZmlsZSB0aGF0IGludm9rZXMgdGhpcyBmdW5jdGlvbi5cbiAqIFVzZWQgdG8gaGVscCBmaW5kIHRoZSByb290IGRpcmVjdG9yeSBvZiBhIG1vZHVsZS5cbiAqL1xuXG5leHBvcnRzLmdldEZpbGVOYW1lID0gZnVuY3Rpb24gZ2V0RmlsZU5hbWUgKCkge1xuICB2YXIgb3JpZ1BTVCA9IEVycm9yLnByZXBhcmVTdGFja1RyYWNlXG4gICAgLCBvcmlnU1RMID0gRXJyb3Iuc3RhY2tUcmFjZUxpbWl0XG4gICAgLCBkdW1teSA9IHt9XG4gICAgLCBmaWxlTmFtZVxuXG4gIEVycm9yLnN0YWNrVHJhY2VMaW1pdCA9IDEwXG5cbiAgRXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSBmdW5jdGlvbiAoZSwgc3QpIHtcbiAgICBmb3IgKHZhciBpPTAsIGw9c3QubGVuZ3RoOyBpPGw7IGkrKykge1xuICAgICAgZmlsZU5hbWUgPSBzdFtpXS5nZXRGaWxlTmFtZSgpXG4gICAgICBpZiAoZmlsZU5hbWUgIT09IF9fZmlsZW5hbWUpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gcnVuIHRoZSAncHJlcGFyZVN0YWNrVHJhY2UnIGZ1bmN0aW9uIGFib3ZlXG4gIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKGR1bW15KVxuICBkdW1teS5zdGFja1xuXG4gIC8vIGNsZWFudXBcbiAgRXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSBvcmlnUFNUXG4gIEVycm9yLnN0YWNrVHJhY2VMaW1pdCA9IG9yaWdTVExcblxuICByZXR1cm4gZmlsZU5hbWVcbn1cblxuLyoqXG4gKiBHZXRzIHRoZSByb290IGRpcmVjdG9yeSBvZiBhIG1vZHVsZSwgZ2l2ZW4gYW4gYXJiaXRyYXJ5IGZpbGVuYW1lXG4gKiBzb21ld2hlcmUgaW4gdGhlIG1vZHVsZSB0cmVlLiBUaGUgXCJyb290IGRpcmVjdG9yeVwiIGlzIHRoZSBkaXJlY3RvcnlcbiAqIGNvbnRhaW5pbmcgdGhlIGBwYWNrYWdlLmpzb25gIGZpbGUuXG4gKlxuICogICBJbjogIC9ob21lL25hdGUvbm9kZS1uYXRpdmUtbW9kdWxlL2xpYi9pbmRleC5qc1xuICogICBPdXQ6IC9ob21lL25hdGUvbm9kZS1uYXRpdmUtbW9kdWxlXG4gKi9cblxuZXhwb3J0cy5nZXRSb290ID0gZnVuY3Rpb24gZ2V0Um9vdCAoZmlsZSkge1xuICB2YXIgZGlyID0gZGlybmFtZShmaWxlKVxuICAgICwgcHJldlxuICB3aGlsZSAodHJ1ZSkge1xuICAgIGlmIChkaXIgPT09ICcuJykge1xuICAgICAgLy8gQXZvaWRzIGFuIGluZmluaXRlIGxvb3AgaW4gcmFyZSBjYXNlcywgbGlrZSB0aGUgUkVQTFxuICAgICAgZGlyID0gcHJvY2Vzcy5jd2QoKVxuICAgIH1cbiAgICBpZiAoZXhpc3RzKGpvaW4oZGlyLCAncGFja2FnZS5qc29uJykpIHx8IGV4aXN0cyhqb2luKGRpciwgJ25vZGVfbW9kdWxlcycpKSkge1xuICAgICAgLy8gRm91bmQgdGhlICdwYWNrYWdlLmpzb24nIGZpbGUgb3IgJ25vZGVfbW9kdWxlcycgZGlyOyB3ZSdyZSBkb25lXG4gICAgICByZXR1cm4gZGlyXG4gICAgfVxuICAgIGlmIChwcmV2ID09PSBkaXIpIHtcbiAgICAgIC8vIEdvdCB0byB0aGUgdG9wXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBmaW5kIG1vZHVsZSByb290IGdpdmVuIGZpbGU6IFwiJyArIGZpbGVcbiAgICAgICAgICAgICAgICAgICAgKyAnXCIuIERvIHlvdSBoYXZlIGEgYHBhY2thZ2UuanNvbmAgZmlsZT8gJylcbiAgICB9XG4gICAgLy8gVHJ5IHRoZSBwYXJlbnQgZGlyIG5leHRcbiAgICBwcmV2ID0gZGlyXG4gICAgZGlyID0gam9pbihkaXIsICcuLicpXG4gIH1cbn1cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksXCIvLi4vLi4vbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9ub2RlLXN0cmluZ3ByZXAvbm9kZV9tb2R1bGVzL2JpbmRpbmdzL2JpbmRpbmdzLmpzXCIpIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcIm5hbWVcIjogXCJub2RlLXN0cmluZ3ByZXBcIixcbiAgXCJ2ZXJzaW9uXCI6IFwiMC41LjRcIixcbiAgXCJtYWluXCI6IFwiaW5kZXguanNcIixcbiAgXCJkZXNjcmlwdGlvblwiOiBcIklDVSBTdHJpbmdQcmVwIHByb2ZpbGVzXCIsXG4gIFwia2V5d29yZHNcIjogW1xuICAgIFwidW5pY29kZVwiLFxuICAgIFwic3RyaW5ncHJlcFwiLFxuICAgIFwiaWN1XCJcbiAgXSxcbiAgXCJzY3JpcHRzXCI6IHtcbiAgICBcInRlc3RcIjogXCJncnVudCB0ZXN0XCIsXG4gICAgXCJpbnN0YWxsXCI6IFwibm9kZS1neXAgcmVidWlsZFwiXG4gIH0sXG4gIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICBcIm5hblwiOiBcIn4xLjIuMFwiLFxuICAgIFwiYmluZGluZ3NcIjogXCJ+MS4xLjFcIixcbiAgICBcImRlYnVnXCI6IFwifjIuMC4wXCJcbiAgfSxcbiAgXCJkZXZEZXBlbmRlbmNpZXNcIjoge1xuICAgIFwicHJveHlxdWlyZVwiOiBcIn4wLjUuMlwiLFxuICAgIFwiZ3J1bnQtbW9jaGEtY2xpXCI6IFwifjEuMy4wXCIsXG4gICAgXCJncnVudC1jb250cmliLWpzaGludFwiOiBcIn4wLjcuMlwiLFxuICAgIFwic2hvdWxkXCI6IFwifjIuMS4xXCIsXG4gICAgXCJncnVudFwiOiBcIn4wLjQuMlwiXG4gIH0sXG4gIFwicmVwb3NpdG9yeVwiOiB7XG4gICAgXCJ0eXBlXCI6IFwiZ2l0XCIsXG4gICAgXCJwYXRoXCI6IFwiZ2l0Oi8vZ2l0aHViLmNvbS9ub2RlLXhtcHAvbm9kZS1zdHJpbmdwcmVwLmdpdFwiXG4gIH0sXG4gIFwiaG9tZXBhZ2VcIjogXCJodHRwOi8vZ2l0aHViLmNvbS9ub2RlLXhtcHAvbm9kZS1zdHJpbmdwcmVwXCIsXG4gIFwiYnVnc1wiOiB7XG4gICAgXCJ1cmxcIjogXCJodHRwOi8vZ2l0aHViLmNvbS9ub2RlLXhtcHAvbm9kZS1zdHJpbmdwcmVwL2lzc3Vlc1wiXG4gIH0sXG4gIFwiYXV0aG9yXCI6IHtcbiAgICBcIm5hbWVcIjogXCJMbG95ZCBXYXRraW5cIixcbiAgICBcImVtYWlsXCI6IFwibGxveWRAZXZpbHByb2Zlc3Nvci5jby51a1wiLFxuICAgIFwidXJsXCI6IFwiaHR0cDovL2V2aWxwcm9mZXNzb3IuY28udWtcIlxuICB9LFxuICBcImxpY2Vuc2VzXCI6IFtcbiAgICB7XG4gICAgICBcInR5cGVcIjogXCJNSVRcIlxuICAgIH1cbiAgXSxcbiAgXCJlbmdpbmVzXCI6IHtcbiAgICBcIm5vZGVcIjogXCI+PTAuOFwiXG4gIH0sXG4gIFwiZ3lwZmlsZVwiOiB0cnVlLFxuICBcIl9pZFwiOiBcIm5vZGUtc3RyaW5ncHJlcEAwLjUuNFwiLFxuICBcImRpc3RcIjoge1xuICAgIFwic2hhc3VtXCI6IFwiZGQwM2IzZDhmNmY4MzEzNzc1NGNjMWVhMWE1NTY3NTQ0N2IwYWI5MlwiLFxuICAgIFwidGFyYmFsbFwiOiBcImh0dHA6Ly9yZWdpc3RyeS5ucG1qcy5vcmcvbm9kZS1zdHJpbmdwcmVwLy0vbm9kZS1zdHJpbmdwcmVwLTAuNS40LnRnelwiXG4gIH0sXG4gIFwiX2Zyb21cIjogXCJub2RlLXN0cmluZ3ByZXBAXjAuNS4yXCIsXG4gIFwiX25wbVZlcnNpb25cIjogXCIxLjQuM1wiLFxuICBcIl9ucG1Vc2VyXCI6IHtcbiAgICBcIm5hbWVcIjogXCJsbG95ZHdhdGtpblwiLFxuICAgIFwiZW1haWxcIjogXCJsbG95ZEBldmlscHJvZmVzc29yLmNvLnVrXCJcbiAgfSxcbiAgXCJtYWludGFpbmVyc1wiOiBbXG4gICAge1xuICAgICAgXCJuYW1lXCI6IFwiYXN0cm9cIixcbiAgICAgIFwiZW1haWxcIjogXCJhc3Ryb0BzcGFjZWJveXoubmV0XCJcbiAgICB9LFxuICAgIHtcbiAgICAgIFwibmFtZVwiOiBcImxsb3lkd2F0a2luXCIsXG4gICAgICBcImVtYWlsXCI6IFwibGxveWRAZXZpbHByb2Zlc3Nvci5jby51a1wiXG4gICAgfVxuICBdLFxuICBcImRpcmVjdG9yaWVzXCI6IHt9LFxuICBcIl9zaGFzdW1cIjogXCJkZDAzYjNkOGY2ZjgzMTM3NzU0Y2MxZWExYTU1Njc1NDQ3YjBhYjkyXCIsXG4gIFwiX3Jlc29sdmVkXCI6IFwiaHR0cHM6Ly9yZWdpc3RyeS5ucG1qcy5vcmcvbm9kZS1zdHJpbmdwcmVwLy0vbm9kZS1zdHJpbmdwcmVwLTAuNS40LnRnelwiXG59XG4iLCJ2YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG52YXIgYmFja29mZiA9IHJlcXVpcmUoJ2JhY2tvZmYnKVxudmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fVxuXG5tb2R1bGUuZXhwb3J0cyA9XG5mdW5jdGlvbiAoY3JlYXRlQ29ubmVjdGlvbikge1xuICByZXR1cm4gZnVuY3Rpb24gKG9wdHMsIG9uQ29ubmVjdCkge1xuICAgIG9uQ29ubmVjdCA9ICdmdW5jdGlvbicgPT0gdHlwZW9mIG9wdHMgPyBvcHRzIDogb25Db25uZWN0XG4gICAgb3B0cyA9ICdvYmplY3QnID09IHR5cGVvZiBvcHRzID8gb3B0cyA6IHtpbml0aWFsRGVsYXk6IDFlMywgbWF4RGVsYXk6IDMwZTN9XG4gICAgaWYoIW9uQ29ubmVjdClcbiAgICAgIG9uQ29ubmVjdCA9IG9wdHMub25Db25uZWN0XG5cbiAgICB2YXIgZW1pdHRlciA9IG9wdHMuZW1pdHRlciB8fCBuZXcgRXZlbnRFbWl0dGVyKClcbiAgICBlbWl0dGVyLmNvbm5lY3RlZCA9IGZhbHNlXG4gICAgZW1pdHRlci5yZWNvbm5lY3QgPSB0cnVlXG5cbiAgICBpZihvbkNvbm5lY3QpXG4gICAgICBlbWl0dGVyLm9uKCdjb25uZWN0Jywgb25Db25uZWN0KVxuXG4gICAgdmFyIGJhY2tvZmZNZXRob2QgPSAoYmFja29mZltvcHRzLnR5cGVdIHx8IGJhY2tvZmYuZmlib25hY2NpKSAob3B0cylcblxuICAgIGJhY2tvZmZNZXRob2Qub24oJ2JhY2tvZmYnLCBmdW5jdGlvbiAobiwgZCkge1xuICAgICAgZW1pdHRlci5lbWl0KCdiYWNrb2ZmJywgbiwgZClcbiAgICB9KVxuXG4gICAgdmFyIGFyZ3NcbiAgICB2YXIgY2xlYW51cCA9IG5vb3BcbiAgICBiYWNrb2ZmTWV0aG9kLm9uKCdyZWFkeScsIGF0dGVtcHQpXG4gICAgZnVuY3Rpb24gYXR0ZW1wdCAobiwgZGVsYXkpIHtcbiAgICAgIGlmKCFlbWl0dGVyLnJlY29ubmVjdCkgcmV0dXJuXG5cbiAgICAgIGNsZWFudXAoKVxuICAgICAgZW1pdHRlci5lbWl0KCdyZWNvbm5lY3QnLCBuLCBkZWxheSlcbiAgICAgIHZhciBjb24gPSBjcmVhdGVDb25uZWN0aW9uLmFwcGx5KG51bGwsIGFyZ3MpXG4gICAgICBpZiAoY29uICE9PSBlbWl0dGVyLl9jb25uZWN0aW9uKVxuICAgICAgICBlbWl0dGVyLmVtaXQoJ2Nvbm5lY3Rpb24nLCBjb24pXG4gICAgICBlbWl0dGVyLl9jb25uZWN0aW9uID0gY29uXG5cbiAgICAgIGNsZWFudXAgPSBvbkNsZWFudXBcbiAgICAgIGZ1bmN0aW9uIG9uQ2xlYW51cChlcnIpIHtcbiAgICAgICAgY2xlYW51cCA9IG5vb3BcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdjb25uZWN0JywgY29ubmVjdClcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIG9uRGlzY29ubmVjdClcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9uRGlzY29ubmVjdClcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdlbmQnICAsIG9uRGlzY29ubmVjdClcblxuICAgICAgICAvL2hhY2sgdG8gbWFrZSBodHRwIG5vdCBjcmFzaC5cbiAgICAgICAgLy9IVFRQIElTIFRIRSBXT1JTVCBQUk9UT0NPTC5cbiAgICAgICAgaWYoY29uLmNvbnN0cnVjdG9yLm5hbWUgPT0gJ1JlcXVlc3QnKVxuICAgICAgICAgIGNvbi5vbignZXJyb3InLCBub29wKVxuXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIG9uRGlzY29ubmVjdCAoZXJyKSB7XG4gICAgICAgIGVtaXR0ZXIuY29ubmVjdGVkID0gZmFsc2VcbiAgICAgICAgb25DbGVhbnVwKGVycilcblxuICAgICAgICAvL2VtaXQgZGlzY29ubmVjdCBiZWZvcmUgY2hlY2tpbmcgcmVjb25uZWN0LCBzbyB1c2VyIGhhcyBhIGNoYW5jZSB0byBkZWNpZGUgbm90IHRvLlxuICAgICAgICBlbWl0dGVyLmVtaXQoJ2Rpc2Nvbm5lY3QnLCBlcnIpXG5cbiAgICAgICAgaWYoIWVtaXR0ZXIucmVjb25uZWN0KSByZXR1cm5cbiAgICAgICAgdHJ5IHsgYmFja29mZk1ldGhvZC5iYWNrb2ZmKCkgfSBjYXRjaCAoXykgeyB9XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGNvbm5lY3QoKSB7XG4gICAgICAgIGJhY2tvZmZNZXRob2QucmVzZXQoKVxuICAgICAgICBlbWl0dGVyLmNvbm5lY3RlZCA9IHRydWVcbiAgICAgICAgaWYob25Db25uZWN0KVxuICAgICAgICAgIGNvbi5yZW1vdmVMaXN0ZW5lcignY29ubmVjdCcsIG9uQ29ubmVjdClcbiAgICAgICAgZW1pdHRlci5lbWl0KCdjb25uZWN0JywgY29uKVxuICAgICAgfVxuXG4gICAgICBjb25cbiAgICAgICAgLm9uKCdlcnJvcicsIG9uRGlzY29ubmVjdClcbiAgICAgICAgLm9uKCdjbG9zZScsIG9uRGlzY29ubmVjdClcbiAgICAgICAgLm9uKCdlbmQnICAsIG9uRGlzY29ubmVjdClcblxuICAgICAgaWYob3B0cy5pbW1lZGlhdGUgfHwgY29uLmNvbnN0cnVjdG9yLm5hbWUgPT0gJ1JlcXVlc3QnKSB7XG4gICAgICAgIGVtaXR0ZXIuY29ubmVjdGVkID0gdHJ1ZVxuICAgICAgICBlbWl0dGVyLmVtaXQoJ2Nvbm5lY3QnLCBjb24pXG4gICAgICAgIGNvbi5vbmNlKCdkYXRhJywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIC8vdGhpcyBpcyB0aGUgb25seSB3YXkgdG8ga25vdyBmb3Igc3VyZSB0aGF0IGRhdGEgaXMgY29taW5nLi4uXG4gICAgICAgICAgYmFja29mZk1ldGhvZC5yZXNldCgpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb24ub24oJ2Nvbm5lY3QnLCBjb25uZWN0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGVtaXR0ZXIuY29ubmVjdCA9XG4gICAgZW1pdHRlci5saXN0ZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnJlY29ubmVjdCA9IHRydWVcbiAgICAgIGJhY2tvZmZNZXRob2QucmVzZXQoKVxuICAgICAgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzKVxuICAgICAgYXR0ZW1wdCgwLCAwKVxuICAgICAgcmV0dXJuIGVtaXR0ZXJcbiAgICB9XG5cbiAgICAvL2ZvcmNlIHJlY29ubmVjdGlvblxuXG4gICAgZW1pdHRlci5lbmQgPVxuICAgIGVtaXR0ZXIuZGlzY29ubmVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGVtaXR0ZXIucmVjb25uZWN0ID0gZmFsc2VcblxuICAgICAgaWYoZW1pdHRlci5fY29ubmVjdGlvbilcbiAgICAgICAgZW1pdHRlci5fY29ubmVjdGlvbi5lbmQoKVxuXG4gICAgICBlbWl0dGVyLmVtaXQoJ2Rpc2Nvbm5lY3QnKVxuICAgICAgcmV0dXJuIGVtaXR0ZXJcbiAgICB9XG5cbiAgICByZXR1cm4gZW1pdHRlclxuICB9XG5cbn1cbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciBCYWNrb2ZmID0gcmVxdWlyZSgnLi9saWIvYmFja29mZicpO1xudmFyIEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9saWIvc3RyYXRlZ3kvZXhwb25lbnRpYWwnKTtcbnZhciBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3kgPSByZXF1aXJlKCcuL2xpYi9zdHJhdGVneS9maWJvbmFjY2knKTtcbnZhciBGdW5jdGlvbkNhbGwgPSByZXF1aXJlKCcuL2xpYi9mdW5jdGlvbl9jYWxsLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzLkJhY2tvZmYgPSBCYWNrb2ZmO1xubW9kdWxlLmV4cG9ydHMuRnVuY3Rpb25DYWxsID0gRnVuY3Rpb25DYWxsO1xubW9kdWxlLmV4cG9ydHMuRmlib25hY2NpU3RyYXRlZ3kgPSBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3k7XG5tb2R1bGUuZXhwb3J0cy5FeHBvbmVudGlhbFN0cmF0ZWd5ID0gRXhwb25lbnRpYWxCYWNrb2ZmU3RyYXRlZ3k7XG5cbi8qKlxuICogQ29uc3RydWN0cyBhIEZpYm9uYWNjaSBiYWNrb2ZmLlxuICogQHBhcmFtIG9wdGlvbnMgRmlib25hY2NpIGJhY2tvZmYgc3RyYXRlZ3kgYXJndW1lbnRzLlxuICogQHJldHVybiBUaGUgZmlib25hY2NpIGJhY2tvZmYuXG4gKiBAc2VlIEZpYm9uYWNjaUJhY2tvZmZTdHJhdGVneVxuICovXG5tb2R1bGUuZXhwb3J0cy5maWJvbmFjY2kgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgcmV0dXJuIG5ldyBCYWNrb2ZmKG5ldyBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3kob3B0aW9ucykpO1xufTtcblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGFuIGV4cG9uZW50aWFsIGJhY2tvZmYuXG4gKiBAcGFyYW0gb3B0aW9ucyBFeHBvbmVudGlhbCBzdHJhdGVneSBhcmd1bWVudHMuXG4gKiBAcmV0dXJuIFRoZSBleHBvbmVudGlhbCBiYWNrb2ZmLlxuICogQHNlZSBFeHBvbmVudGlhbEJhY2tvZmZTdHJhdGVneVxuICovXG5tb2R1bGUuZXhwb3J0cy5leHBvbmVudGlhbCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gbmV3IEJhY2tvZmYobmV3IEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5KG9wdGlvbnMpKTtcbn07XG5cbi8qKlxuICogQ29uc3RydWN0cyBhIEZ1bmN0aW9uQ2FsbCBmb3IgdGhlIGdpdmVuIGZ1bmN0aW9uIGFuZCBhcmd1bWVudHMuXG4gKiBAcGFyYW0gZm4gVGhlIGZ1bmN0aW9uIHRvIHdyYXAgaW4gYSBiYWNrb2ZmIGhhbmRsZXIuXG4gKiBAcGFyYW0gdmFyZ3MgVGhlIGZ1bmN0aW9uJ3MgYXJndW1lbnRzICh2YXIgYXJncykuXG4gKiBAcGFyYW0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uJ3MgY2FsbGJhY2suXG4gKiBAcmV0dXJuIFRoZSBGdW5jdGlvbkNhbGwgaW5zdGFuY2UuXG4gKi9cbm1vZHVsZS5leHBvcnRzLmNhbGwgPSBmdW5jdGlvbihmbiwgdmFyZ3MsIGNhbGxiYWNrKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIGZuID0gYXJnc1swXTtcbiAgICB2YXJncyA9IGFyZ3Muc2xpY2UoMSwgYXJncy5sZW5ndGggLSAxKTtcbiAgICBjYWxsYmFjayA9IGFyZ3NbYXJncy5sZW5ndGggLSAxXTtcbiAgICByZXR1cm4gbmV3IEZ1bmN0aW9uQ2FsbChmbiwgdmFyZ3MsIGNhbGxiYWNrKTtcbn07XG4iLCIvKlxuICogQ29weXJpZ2h0IChjKSAyMDEyIE1hdGhpZXUgVHVyY290dGVcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cbiAqL1xuXG52YXIgZXZlbnRzID0gcmVxdWlyZSgnZXZlbnRzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuLyoqXG4gKiBCYWNrb2ZmIGRyaXZlci5cbiAqIEBwYXJhbSBiYWNrb2ZmU3RyYXRlZ3kgQmFja29mZiBkZWxheSBnZW5lcmF0b3Ivc3RyYXRlZ3kuXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gQmFja29mZihiYWNrb2ZmU3RyYXRlZ3kpIHtcbiAgICBldmVudHMuRXZlbnRFbWl0dGVyLmNhbGwodGhpcyk7XG5cbiAgICB0aGlzLmJhY2tvZmZTdHJhdGVneV8gPSBiYWNrb2ZmU3RyYXRlZ3k7XG4gICAgdGhpcy5tYXhOdW1iZXJPZlJldHJ5XyA9IC0xO1xuICAgIHRoaXMuYmFja29mZk51bWJlcl8gPSAwO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG4gICAgdGhpcy50aW1lb3V0SURfID0gLTE7XG5cbiAgICB0aGlzLmhhbmRsZXJzID0ge1xuICAgICAgICBiYWNrb2ZmOiB0aGlzLm9uQmFja29mZl8uYmluZCh0aGlzKVxuICAgIH07XG59XG51dGlsLmluaGVyaXRzKEJhY2tvZmYsIGV2ZW50cy5FdmVudEVtaXR0ZXIpO1xuXG4vKipcbiAqIFNldHMgYSBsaW1pdCwgZ3JlYXRlciB0aGFuIDAsIG9uIHRoZSBtYXhpbXVtIG51bWJlciBvZiBiYWNrb2Zmcy4gQSAnZmFpbCdcbiAqIGV2ZW50IHdpbGwgYmUgZW1pdHRlZCB3aGVuIHRoZSBsaW1pdCBpcyByZWFjaGVkLlxuICogQHBhcmFtIG1heE51bWJlck9mUmV0cnkgVGhlIG1heGltdW0gbnVtYmVyIG9mIGJhY2tvZmZzLlxuICovXG5CYWNrb2ZmLnByb3RvdHlwZS5mYWlsQWZ0ZXIgPSBmdW5jdGlvbihtYXhOdW1iZXJPZlJldHJ5KSB7XG4gICAgaWYgKG1heE51bWJlck9mUmV0cnkgPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTWF4aW11bSBudW1iZXIgb2YgcmV0cnkgbXVzdCBiZSBncmVhdGVyIHRoYW4gMC4gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnQWN0dWFsOiAnICsgbWF4TnVtYmVyT2ZSZXRyeSk7XG4gICAgfVxuXG4gICAgdGhpcy5tYXhOdW1iZXJPZlJldHJ5XyA9IG1heE51bWJlck9mUmV0cnk7XG59O1xuXG4vKipcbiAqIFN0YXJ0cyBhIGJhY2tvZmYgb3BlcmF0aW9uLlxuICogQHBhcmFtIGVyciBPcHRpb25hbCBwYXJhbWF0ZXIgdG8gbGV0IHRoZSBsaXN0ZW5lcnMga25vdyB3aHkgdGhlIGJhY2tvZmZcbiAqICAgICBvcGVyYXRpb24gd2FzIHN0YXJ0ZWQuXG4gKi9cbkJhY2tvZmYucHJvdG90eXBlLmJhY2tvZmYgPSBmdW5jdGlvbihlcnIpIHtcbiAgICBpZiAodGhpcy50aW1lb3V0SURfICE9PSAtMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tvZmYgaW4gcHJvZ3Jlc3MuJyk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuYmFja29mZk51bWJlcl8gPT09IHRoaXMubWF4TnVtYmVyT2ZSZXRyeV8pIHtcbiAgICAgICAgdGhpcy5lbWl0KCdmYWlsJywgZXJyKTtcbiAgICAgICAgdGhpcy5yZXNldCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IHRoaXMuYmFja29mZlN0cmF0ZWd5Xy5uZXh0KCk7XG4gICAgICAgIHRoaXMudGltZW91dElEXyA9IHNldFRpbWVvdXQodGhpcy5oYW5kbGVycy5iYWNrb2ZmLCB0aGlzLmJhY2tvZmZEZWxheV8pO1xuICAgICAgICB0aGlzLmVtaXQoJ2JhY2tvZmYnLCB0aGlzLmJhY2tvZmZOdW1iZXJfLCB0aGlzLmJhY2tvZmZEZWxheV8sIGVycik7XG4gICAgfVxufTtcblxuLyoqXG4gKiBIYW5kbGVzIHRoZSBiYWNrb2ZmIHRpbWVvdXQgY29tcGxldGlvbi5cbiAqIEBwcml2YXRlXG4gKi9cbkJhY2tvZmYucHJvdG90eXBlLm9uQmFja29mZl8gPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnRpbWVvdXRJRF8gPSAtMTtcbiAgICB0aGlzLmVtaXQoJ3JlYWR5JywgdGhpcy5iYWNrb2ZmTnVtYmVyXywgdGhpcy5iYWNrb2ZmRGVsYXlfKTtcbiAgICB0aGlzLmJhY2tvZmZOdW1iZXJfKys7XG59O1xuXG4vKipcbiAqIFN0b3BzIGFueSBiYWNrb2ZmIG9wZXJhdGlvbiBhbmQgcmVzZXRzIHRoZSBiYWNrb2ZmIGRlbGF5IHRvIGl0cyBpbml0YWxcbiAqIHZhbHVlLlxuICovXG5CYWNrb2ZmLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFja29mZk51bWJlcl8gPSAwO1xuICAgIHRoaXMuYmFja29mZlN0cmF0ZWd5Xy5yZXNldCgpO1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXRJRF8pO1xuICAgIHRoaXMudGltZW91dElEXyA9IC0xO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrb2ZmO1xuIiwiLypcbiAqIENvcHlyaWdodCAoYykgMjAxMiBNYXRoaWV1IFR1cmNvdHRlXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG4gKi9cblxudmFyIGV2ZW50cyA9IHJlcXVpcmUoJ2V2ZW50cycpO1xudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbnZhciBCYWNrb2ZmID0gcmVxdWlyZSgnLi9iYWNrb2ZmJyk7XG52YXIgRmlib25hY2NpQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9zdHJhdGVneS9maWJvbmFjY2knKTtcblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIHNwZWNpZmllZCB2YWx1ZSBpcyBhIGZ1bmN0aW9uXG4gKiBAcGFyYW0gdmFsIFZhcmlhYmxlIHRvIHRlc3QuXG4gKiBAcmV0dXJuIFdoZXRoZXIgdmFyaWFibGUgaXMgYSBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gaXNGdW5jdGlvbih2YWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PSAnZnVuY3Rpb24nO1xufVxuXG4vKipcbiAqIE1hbmFnZXMgdGhlIGNhbGxpbmcgb2YgYSBmdW5jdGlvbiBpbiBhIGJhY2tvZmYgbG9vcC5cbiAqIEBwYXJhbSBmbiBGdW5jdGlvbiB0byB3cmFwIGluIGEgYmFja29mZiBoYW5kbGVyLlxuICogQHBhcmFtIGFyZ3MgQXJyYXkgb2YgZnVuY3Rpb24ncyBhcmd1bWVudHMuXG4gKiBAcGFyYW0gY2FsbGJhY2sgRnVuY3Rpb24ncyBjYWxsYmFjay5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBGdW5jdGlvbkNhbGwoZm4sIGFyZ3MsIGNhbGxiYWNrKSB7XG4gICAgZXZlbnRzLkV2ZW50RW1pdHRlci5jYWxsKHRoaXMpO1xuXG4gICAgaWYgKCFpc0Z1bmN0aW9uKGZuKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ZuIHNob3VsZCBiZSBhIGZ1bmN0aW9uLicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ0FjdHVhbDogJyArIHR5cGVvZiBmbik7XG4gICAgfVxuXG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBhIGZ1bmN0aW9uLicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ0FjdHVhbDogJyArIHR5cGVvZiBmbik7XG4gICAgfVxuXG4gICAgdGhpcy5mdW5jdGlvbl8gPSBmbjtcbiAgICB0aGlzLmFyZ3VtZW50c18gPSBhcmdzO1xuICAgIHRoaXMuY2FsbGJhY2tfID0gY2FsbGJhY2s7XG4gICAgdGhpcy5yZXN1bHRzXyA9IFtdO1xuXG4gICAgdGhpcy5iYWNrb2ZmXyA9IG51bGw7XG4gICAgdGhpcy5zdHJhdGVneV8gPSBudWxsO1xuICAgIHRoaXMuZmFpbEFmdGVyXyA9IC0xO1xuXG4gICAgdGhpcy5zdGF0ZV8gPSBGdW5jdGlvbkNhbGwuU3RhdGVfLlBFTkRJTkc7XG59XG51dGlsLmluaGVyaXRzKEZ1bmN0aW9uQ2FsbCwgZXZlbnRzLkV2ZW50RW1pdHRlcik7XG5cbi8qKlxuICogRW51bSBvZiBzdGF0ZXMgaW4gd2hpY2ggdGhlIEZ1bmN0aW9uQ2FsbCBjYW4gYmUuXG4gKiBAcHJpdmF0ZVxuICovXG5GdW5jdGlvbkNhbGwuU3RhdGVfID0ge1xuICAgIFBFTkRJTkc6IDAsXG4gICAgUlVOTklORzogMSxcbiAgICBDT01QTEVURUQ6IDIsXG4gICAgQUJPUlRFRDogM1xufTtcblxuLyoqXG4gKiBAcmV0dXJuIFdoZXRoZXIgdGhlIGNhbGwgaXMgcGVuZGluZy5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5pc1BlbmRpbmcgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0ZV8gPT0gRnVuY3Rpb25DYWxsLlN0YXRlXy5QRU5ESU5HO1xufTtcblxuLyoqXG4gKiBAcmV0dXJuIFdoZXRoZXIgdGhlIGNhbGwgaXMgaW4gcHJvZ3Jlc3MuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuaXNSdW5uaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdGVfID09IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uUlVOTklORztcbn07XG5cbi8qKlxuICogQHJldHVybiBXaGV0aGVyIHRoZSBjYWxsIGlzIGNvbXBsZXRlZC5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5pc0NvbXBsZXRlZCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0YXRlXyA9PSBGdW5jdGlvbkNhbGwuU3RhdGVfLkNPTVBMRVRFRDtcbn07XG5cbi8qKlxuICogQHJldHVybiBXaGV0aGVyIHRoZSBjYWxsIGlzIGFib3J0ZWQuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuaXNBYm9ydGVkID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdGVfID09IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uQUJPUlRFRDtcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgYmFja29mZiBzdHJhdGVneS5cbiAqIEBwYXJhbSBzdHJhdGVneSBUaGUgYmFja29mZiBzdHJhdGVneSB0byB1c2UuXG4gKiBAcmV0dXJuIEl0c2VsZiBmb3IgY2hhaW5pbmcuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuc2V0U3RyYXRlZ3kgPSBmdW5jdGlvbihzdHJhdGVneSkge1xuICAgIGlmICghdGhpcy5pc1BlbmRpbmcoKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Z1bmN0aW9uQ2FsbCBpbiBwcm9ncmVzcy4nKTtcbiAgICB9XG4gICAgdGhpcy5zdHJhdGVneV8gPSBzdHJhdGVneTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmV0dXJucyBhbGwgaW50ZXJtZWRpYXJ5IHJlc3VsdHMgcmV0dXJuZWQgYnkgdGhlIHdyYXBwZWQgZnVuY3Rpb24gc2luY2VcbiAqIHRoZSBpbml0aWFsIGNhbGwuXG4gKiBAcmV0dXJuIEFuIGFycmF5IG9mIGludGVybWVkaWFyeSByZXN1bHRzLlxuICovXG5GdW5jdGlvbkNhbGwucHJvdG90eXBlLmdldFJlc3VsdHMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5yZXN1bHRzXy5jb25jYXQoKTtcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgYmFja29mZiBsaW1pdC5cbiAqIEBwYXJhbSBtYXhOdW1iZXJPZlJldHJ5IFRoZSBtYXhpbXVtIG51bWJlciBvZiBiYWNrb2Zmcy5cbiAqIEByZXR1cm4gSXRzZWxmIGZvciBjaGFpbmluZy5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5mYWlsQWZ0ZXIgPSBmdW5jdGlvbihtYXhOdW1iZXJPZlJldHJ5KSB7XG4gICAgaWYgKCF0aGlzLmlzUGVuZGluZygpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRnVuY3Rpb25DYWxsIGluIHByb2dyZXNzLicpO1xuICAgIH1cbiAgICB0aGlzLmZhaWxBZnRlcl8gPSBtYXhOdW1iZXJPZlJldHJ5O1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBBYm9ydHMgdGhlIGNhbGwuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuYWJvcnQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5pc0NvbXBsZXRlZCgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRnVuY3Rpb25DYWxsIGFscmVhZHkgY29tcGxldGVkLicpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmlzUnVubmluZygpKSB7XG4gICAgICAgIHRoaXMuYmFja29mZl8ucmVzZXQoKTtcbiAgICB9XG5cbiAgICB0aGlzLnN0YXRlXyA9IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uQUJPUlRFRDtcbn07XG5cbi8qKlxuICogSW5pdGlhdGVzIHRoZSBjYWxsIHRvIHRoZSB3cmFwcGVkIGZ1bmN0aW9uLlxuICogQHBhcmFtIGJhY2tvZmZGYWN0b3J5IE9wdGlvbmFsIGZhY3RvcnkgZnVuY3Rpb24gdXNlZCB0byBjcmVhdGUgdGhlIGJhY2tvZmZcbiAqICAgICBpbnN0YW5jZS5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5zdGFydCA9IGZ1bmN0aW9uKGJhY2tvZmZGYWN0b3J5KSB7XG4gICAgaWYgKHRoaXMuaXNBYm9ydGVkKCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGdW5jdGlvbkNhbGwgYWJvcnRlZC4nKTtcbiAgICB9IGVsc2UgaWYgKCF0aGlzLmlzUGVuZGluZygpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRnVuY3Rpb25DYWxsIGFscmVhZHkgc3RhcnRlZC4nKTtcbiAgICB9XG5cbiAgICB2YXIgc3RyYXRlZ3kgPSB0aGlzLnN0cmF0ZWd5XyB8fCBuZXcgRmlib25hY2NpQmFja29mZlN0cmF0ZWd5KCk7XG5cbiAgICB0aGlzLmJhY2tvZmZfID0gYmFja29mZkZhY3RvcnkgP1xuICAgICAgICBiYWNrb2ZmRmFjdG9yeShzdHJhdGVneSkgOlxuICAgICAgICBuZXcgQmFja29mZihzdHJhdGVneSk7XG5cbiAgICB0aGlzLmJhY2tvZmZfLm9uKCdyZWFkeScsIHRoaXMuZG9DYWxsXy5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLmJhY2tvZmZfLm9uKCdmYWlsJywgdGhpcy5kb0NhbGxiYWNrXy5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLmJhY2tvZmZfLm9uKCdiYWNrb2ZmJywgdGhpcy5oYW5kbGVCYWNrb2ZmXy5iaW5kKHRoaXMpKTtcblxuICAgIGlmICh0aGlzLmZhaWxBZnRlcl8gPiAwKSB7XG4gICAgICAgIHRoaXMuYmFja29mZl8uZmFpbEFmdGVyKHRoaXMuZmFpbEFmdGVyXyk7XG4gICAgfVxuXG4gICAgdGhpcy5zdGF0ZV8gPSBGdW5jdGlvbkNhbGwuU3RhdGVfLlJVTk5JTkc7XG4gICAgdGhpcy5kb0NhbGxfKCk7XG59O1xuXG4vKipcbiAqIENhbGxzIHRoZSB3cmFwcGVkIGZ1bmN0aW9uLlxuICogQHByaXZhdGVcbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5kb0NhbGxfID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGV2ZW50QXJncyA9IFsnY2FsbCddLmNvbmNhdCh0aGlzLmFyZ3VtZW50c18pO1xuICAgIGV2ZW50cy5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQuYXBwbHkodGhpcywgZXZlbnRBcmdzKTtcbiAgICB2YXIgY2FsbGJhY2sgPSB0aGlzLmhhbmRsZUZ1bmN0aW9uQ2FsbGJhY2tfLmJpbmQodGhpcyk7XG4gICAgdGhpcy5mdW5jdGlvbl8uYXBwbHkobnVsbCwgdGhpcy5hcmd1bWVudHNfLmNvbmNhdChjYWxsYmFjaykpO1xufTtcblxuLyoqXG4gKiBDYWxscyB0aGUgd3JhcHBlZCBmdW5jdGlvbidzIGNhbGxiYWNrIHdpdGggdGhlIGxhc3QgcmVzdWx0IHJldHVybmVkIGJ5IHRoZVxuICogd3JhcHBlZCBmdW5jdGlvbi5cbiAqIEBwcml2YXRlXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuZG9DYWxsYmFja18gPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IHRoaXMucmVzdWx0c19bdGhpcy5yZXN1bHRzXy5sZW5ndGggLSAxXTtcbiAgICB0aGlzLmNhbGxiYWNrXy5hcHBseShudWxsLCBhcmdzKTtcbn07XG5cbi8qKlxuICogSGFuZGxlcyB3cmFwcGVkIGZ1bmN0aW9uJ3MgY29tcGxldGlvbi4gVGhpcyBtZXRob2QgYWN0cyBhcyBhIHJlcGxhY2VtZW50XG4gKiBmb3IgdGhlIG9yaWdpbmFsIGNhbGxiYWNrIGZ1bmN0aW9uLlxuICogQHByaXZhdGVcbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5oYW5kbGVGdW5jdGlvbkNhbGxiYWNrXyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLmlzQWJvcnRlZCgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgdGhpcy5yZXN1bHRzXy5wdXNoKGFyZ3MpOyAvLyBTYXZlIGNhbGxiYWNrIGFyZ3VtZW50cy5cbiAgICBldmVudHMuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0LmFwcGx5KHRoaXMsIFsnY2FsbGJhY2snXS5jb25jYXQoYXJncykpO1xuXG4gICAgaWYgKGFyZ3NbMF0pIHtcbiAgICAgICAgdGhpcy5iYWNrb2ZmXy5iYWNrb2ZmKGFyZ3NbMF0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc3RhdGVfID0gRnVuY3Rpb25DYWxsLlN0YXRlXy5DT01QTEVURUQ7XG4gICAgICAgIHRoaXMuZG9DYWxsYmFja18oKTtcbiAgICB9XG59O1xuXG4vKipcbiAqIEhhbmRsZXMgYmFja29mZiBldmVudC5cbiAqIEBwYXJhbSBudW1iZXIgQmFja29mZiBudW1iZXIuXG4gKiBAcGFyYW0gZGVsYXkgQmFja29mZiBkZWxheS5cbiAqIEBwYXJhbSBlcnIgVGhlIGVycm9yIHRoYXQgY2F1c2VkIHRoZSBiYWNrb2ZmLlxuICogQHByaXZhdGVcbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5oYW5kbGVCYWNrb2ZmXyA9IGZ1bmN0aW9uKG51bWJlciwgZGVsYXksIGVycikge1xuICAgIHRoaXMuZW1pdCgnYmFja29mZicsIG51bWJlciwgZGVsYXksIGVycik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZ1bmN0aW9uQ2FsbDtcbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG52YXIgQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9zdHJhdGVneScpO1xuXG4vKipcbiAqIEV4cG9uZW50aWFsIGJhY2tvZmYgc3RyYXRlZ3kuXG4gKiBAZXh0ZW5kcyBCYWNrb2ZmU3RyYXRlZ3lcbiAqL1xuZnVuY3Rpb24gRXhwb25lbnRpYWxCYWNrb2ZmU3RyYXRlZ3kob3B0aW9ucykge1xuICAgIEJhY2tvZmZTdHJhdGVneS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG4gICAgdGhpcy5uZXh0QmFja29mZkRlbGF5XyA9IHRoaXMuZ2V0SW5pdGlhbERlbGF5KCk7XG59XG51dGlsLmluaGVyaXRzKEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5LCBCYWNrb2ZmU3RyYXRlZ3kpO1xuXG4vKiogQGluaGVyaXREb2MgKi9cbkV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5uZXh0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IE1hdGgubWluKHRoaXMubmV4dEJhY2tvZmZEZWxheV8sIHRoaXMuZ2V0TWF4RGVsYXkoKSk7XG4gICAgdGhpcy5uZXh0QmFja29mZkRlbGF5XyA9IHRoaXMuYmFja29mZkRlbGF5XyAqIDI7XG4gICAgcmV0dXJuIHRoaXMuYmFja29mZkRlbGF5Xztcbn07XG5cbi8qKiBAaW5oZXJpdERvYyAqL1xuRXhwb25lbnRpYWxCYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLnJlc2V0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG4gICAgdGhpcy5uZXh0QmFja29mZkRlbGF5XyA9IHRoaXMuZ2V0SW5pdGlhbERlbGF5KCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5O1xuIiwiLypcbiAqIENvcHlyaWdodCAoYykgMjAxMiBNYXRoaWV1IFR1cmNvdHRlXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG4gKi9cblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbnZhciBCYWNrb2ZmU3RyYXRlZ3kgPSByZXF1aXJlKCcuL3N0cmF0ZWd5Jyk7XG5cbi8qKlxuICogRmlib25hY2NpIGJhY2tvZmYgc3RyYXRlZ3kuXG4gKiBAZXh0ZW5kcyBCYWNrb2ZmU3RyYXRlZ3lcbiAqL1xuZnVuY3Rpb24gRmlib25hY2NpQmFja29mZlN0cmF0ZWd5KG9wdGlvbnMpIHtcbiAgICBCYWNrb2ZmU3RyYXRlZ3kuY2FsbCh0aGlzLCBvcHRpb25zKTtcbiAgICB0aGlzLmJhY2tvZmZEZWxheV8gPSAwO1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gPSB0aGlzLmdldEluaXRpYWxEZWxheSgpO1xufVxudXRpbC5pbmhlcml0cyhGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3ksIEJhY2tvZmZTdHJhdGVneSk7XG5cbi8qKiBAaW5oZXJpdERvYyAqL1xuRmlib25hY2NpQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5uZXh0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBiYWNrb2ZmRGVsYXkgPSBNYXRoLm1pbih0aGlzLm5leHRCYWNrb2ZmRGVsYXlfLCB0aGlzLmdldE1heERlbGF5KCkpO1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gKz0gdGhpcy5iYWNrb2ZmRGVsYXlfO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IGJhY2tvZmZEZWxheTtcbiAgICByZXR1cm4gYmFja29mZkRlbGF5O1xufTtcblxuLyoqIEBpbmhlcml0RG9jICovXG5GaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLnJlc2V0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gPSB0aGlzLmdldEluaXRpYWxEZWxheSgpO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZpYm9uYWNjaUJhY2tvZmZTdHJhdGVneTtcbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciBldmVudHMgPSByZXF1aXJlKCdldmVudHMnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG5mdW5jdGlvbiBpc0RlZih2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsO1xufVxuXG4vKipcbiAqIEFic3RyYWN0IGNsYXNzIGRlZmluaW5nIHRoZSBza2VsZXRvbiBmb3IgYWxsIGJhY2tvZmYgc3RyYXRlZ2llcy5cbiAqIEBwYXJhbSBvcHRpb25zIEJhY2tvZmYgc3RyYXRlZ3kgb3B0aW9ucy5cbiAqIEBwYXJhbSBvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IgVGhlIHJhbmRvbWlzYXRpb24gZmFjdG9yLCBtdXN0IGJlIGJldHdlZW5cbiAqIDAgYW5kIDEuXG4gKiBAcGFyYW0gb3B0aW9ucy5pbml0aWFsRGVsYXkgVGhlIGJhY2tvZmYgaW5pdGlhbCBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICogQHBhcmFtIG9wdGlvbnMubWF4RGVsYXkgVGhlIGJhY2tvZmYgbWF4aW1hbCBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIEJhY2tvZmZTdHJhdGVneShvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICBpZiAoaXNEZWYob3B0aW9ucy5pbml0aWFsRGVsYXkpICYmIG9wdGlvbnMuaW5pdGlhbERlbGF5IDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBpbml0aWFsIHRpbWVvdXQgbXVzdCBiZSBncmVhdGVyIHRoYW4gMC4nKTtcbiAgICB9IGVsc2UgaWYgKGlzRGVmKG9wdGlvbnMubWF4RGVsYXkpICYmIG9wdGlvbnMubWF4RGVsYXkgPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIG1heGltYWwgdGltZW91dCBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwLicpO1xuICAgIH1cblxuICAgIHRoaXMuaW5pdGlhbERlbGF5XyA9IG9wdGlvbnMuaW5pdGlhbERlbGF5IHx8IDEwMDtcbiAgICB0aGlzLm1heERlbGF5XyA9IG9wdGlvbnMubWF4RGVsYXkgfHwgMTAwMDA7XG5cbiAgICBpZiAodGhpcy5tYXhEZWxheV8gPD0gdGhpcy5pbml0aWFsRGVsYXlfKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIG1heGltYWwgYmFja29mZiBkZWxheSBtdXN0IGJlICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ2dyZWF0ZXIgdGhhbiB0aGUgaW5pdGlhbCBiYWNrb2ZmIGRlbGF5LicpO1xuICAgIH1cblxuICAgIGlmIChpc0RlZihvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IpICYmXG4gICAgICAgIChvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IgPCAwIHx8IG9wdGlvbnMucmFuZG9taXNhdGlvbkZhY3RvciA+IDEpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIHJhbmRvbWlzYXRpb24gZmFjdG9yIG11c3QgYmUgYmV0d2VlbiAwIGFuZCAxLicpO1xuICAgIH1cblxuICAgIHRoaXMucmFuZG9taXNhdGlvbkZhY3Rvcl8gPSBvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IgfHwgMDtcbn1cblxuLyoqXG4gKiBSZXRyaWV2ZXMgdGhlIG1heGltYWwgYmFja29mZiBkZWxheS5cbiAqIEByZXR1cm4gVGhlIG1heGltYWwgYmFja29mZiBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICovXG5CYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLmdldE1heERlbGF5ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMubWF4RGVsYXlfO1xufTtcblxuLyoqXG4gKiBSZXRyaWV2ZXMgdGhlIGluaXRpYWwgYmFja29mZiBkZWxheS5cbiAqIEByZXR1cm4gVGhlIGluaXRpYWwgYmFja29mZiBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICovXG5CYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLmdldEluaXRpYWxEZWxheSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmluaXRpYWxEZWxheV87XG59O1xuXG4vKipcbiAqIFRlbXBsYXRlIG1ldGhvZCB0aGF0IGNvbXB1dGVzIHRoZSBuZXh0IGJhY2tvZmYgZGVsYXkuXG4gKiBAcmV0dXJuIFRoZSBiYWNrb2ZmIGRlbGF5LCBpbiBtaWxsaXNlY29uZHMuXG4gKi9cbkJhY2tvZmZTdHJhdGVneS5wcm90b3R5cGUubmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBiYWNrb2ZmRGVsYXkgPSB0aGlzLm5leHRfKCk7XG4gICAgdmFyIHJhbmRvbWlzYXRpb25NdWx0aXBsZSA9IDEgKyBNYXRoLnJhbmRvbSgpICogdGhpcy5yYW5kb21pc2F0aW9uRmFjdG9yXztcbiAgICB2YXIgcmFuZG9taXplZERlbGF5ID0gTWF0aC5yb3VuZChiYWNrb2ZmRGVsYXkgKiByYW5kb21pc2F0aW9uTXVsdGlwbGUpO1xuICAgIHJldHVybiByYW5kb21pemVkRGVsYXk7XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBuZXh0IGJhY2tvZmYgZGVsYXkuXG4gKiBAcmV0dXJuIFRoZSBiYWNrb2ZmIGRlbGF5LCBpbiBtaWxsaXNlY29uZHMuXG4gKiBAcHJvdGVjdGVkXG4gKi9cbkJhY2tvZmZTdHJhdGVneS5wcm90b3R5cGUubmV4dF8gPSBmdW5jdGlvbigpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tvZmZTdHJhdGVneS5uZXh0XygpIHVuaW1wbGVtZW50ZWQuJyk7XG59O1xuXG4vKipcbiAqIFRlbXBsYXRlIG1ldGhvZCB0aGF0IHJlc2V0cyB0aGUgYmFja29mZiBkZWxheSB0byBpdHMgaW5pdGlhbCB2YWx1ZS5cbiAqL1xuQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMucmVzZXRfKCk7XG59O1xuXG4vKipcbiAqIFJlc2V0cyB0aGUgYmFja29mZiBkZWxheSB0byBpdHMgaW5pdGlhbCB2YWx1ZS5cbiAqIEBwcm90ZWN0ZWRcbiAqL1xuQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5yZXNldF8gPSBmdW5jdGlvbigpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tvZmZTdHJhdGVneS5yZXNldF8oKSB1bmltcGxlbWVudGVkLicpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrb2ZmU3RyYXRlZ3k7XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNvbm5lY3Q7XG5jb25uZWN0LmNvbm5lY3QgPSBjb25uZWN0O1xuXG4vKiB0aGlzIHdob2xlIGZpbGUgb25seSBleGlzdHMgYmVjYXVzZSB0bHMuc3RhcnRcbiAqIGRvZW5zJ3QgZXhpc3RzIGFuZCB0bHMuY29ubmVjdCBjYW5ub3Qgc3RhcnQgc2VydmVyXG4gKiBjb25uZWN0aW9uc1xuICpcbiAqIGNvcGllZCBmcm9tIF90bHNfd3JhcC5qc1xuICovXG5cbi8vIFRhcmdldCBBUEk6XG4vL1xuLy8gIHZhciBzID0gcmVxdWlyZSgnbmV0JykuY3JlYXRlU3RyZWFtKDI1LCAnc210cC5leGFtcGxlLmNvbScpXG4vLyAgcy5vbignY29ubmVjdCcsIGZ1bmN0aW9uKCkge1xuLy8gICByZXF1aXJlKCd0bHMtY29ubmVjdCcpKHMsIHtjcmVkZW50aWFsczpjcmVkcywgaXNTZXJ2ZXI6ZmFsc2V9LCBmdW5jdGlvbigpIHtcbi8vICAgICAgaWYgKCFzLmF1dGhvcml6ZWQpIHtcbi8vICAgICAgICBzLmRlc3Ryb3koKVxuLy8gICAgICAgIHJldHVyblxuLy8gICAgICB9XG4vL1xuLy8gICAgICBzLmVuZChcImhlbGxvIHdvcmxkXFxuXCIpXG4vLyAgICB9KVxuLy8gIH0pXG5cbnZhciBuZXQgPSByZXF1aXJlKCduZXQnKVxudmFyIHRscyA9IHJlcXVpcmUoJ3RscycpXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxudmFyIGFzc2VydCA9IHJlcXVpcmUoJ2Fzc2VydCcpXG52YXIgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJylcblxuLy8gUmV0dXJucyBhbiBhcnJheSBbb3B0aW9uc10gb3IgW29wdGlvbnMsIGNiXVxuLy8gSXQgaXMgdGhlIHNhbWUgYXMgdGhlIGFyZ3VtZW50IG9mIFNvY2tldC5wcm90b3R5cGUuY29ubmVjdCgpLlxuZnVuY3Rpb24gX19ub3JtYWxpemVDb25uZWN0QXJncyhhcmdzKSB7XG4gIHZhciBvcHRpb25zID0ge307XG5cbiAgaWYgKHR5cGVvZihhcmdzWzBdKSA9PSAnb2JqZWN0Jykge1xuICAgIC8vIGNvbm5lY3Qob3B0aW9ucywgW2NiXSlcbiAgICBvcHRpb25zID0gYXJnc1swXTtcbiAgfSBlbHNlIGlmIChpc1BpcGVOYW1lKGFyZ3NbMF0pKSB7XG4gICAgLy8gY29ubmVjdChwYXRoLCBbY2JdKTtcbiAgICBvcHRpb25zLnBhdGggPSBhcmdzWzBdO1xuICB9IGVsc2Uge1xuICAgIC8vIGNvbm5lY3QocG9ydCwgW2hvc3RdLCBbY2JdKVxuICAgIG9wdGlvbnMucG9ydCA9IGFyZ3NbMF07XG4gICAgaWYgKHR5cGVvZihhcmdzWzFdKSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIG9wdGlvbnMuaG9zdCA9IGFyZ3NbMV07XG4gICAgfVxuICB9XG5cbiAgdmFyIGNiID0gYXJnc1thcmdzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4gdHlwZW9mKGNiKSA9PT0gJ2Z1bmN0aW9uJyA/IFtvcHRpb25zLCBjYl0gOiBbb3B0aW9uc107XG59XG5cbmZ1bmN0aW9uIF9fY2hlY2tTZXJ2ZXJJZGVudGl0eShob3N0LCBjZXJ0KSB7XG4gIC8vIENyZWF0ZSByZWdleHAgdG8gbXVjaCBob3N0bmFtZXNcbiAgZnVuY3Rpb24gcmVnZXhwaWZ5KGhvc3QsIHdpbGRjYXJkcykge1xuICAgIC8vIEFkZCB0cmFpbGluZyBkb3QgKG1ha2UgaG9zdG5hbWVzIHVuaWZvcm0pXG4gICAgaWYgKCEvXFwuJC8udGVzdChob3N0KSkgaG9zdCArPSAnLic7XG5cbiAgICAvLyBUaGUgc2FtZSBhcHBsaWVzIHRvIGhvc3RuYW1lIHdpdGggbW9yZSB0aGFuIG9uZSB3aWxkY2FyZCxcbiAgICAvLyBpZiBob3N0bmFtZSBoYXMgd2lsZGNhcmQgd2hlbiB3aWxkY2FyZHMgYXJlIG5vdCBhbGxvd2VkLFxuICAgIC8vIG9yIGlmIHRoZXJlIGFyZSBsZXNzIHRoYW4gdHdvIGRvdHMgYWZ0ZXIgd2lsZGNhcmQgKGkuZS4gKi5jb20gb3IgKmQuY29tKVxuICAgIC8vXG4gICAgLy8gYWxzb1xuICAgIC8vXG4gICAgLy8gXCJUaGUgY2xpZW50IFNIT1VMRCBOT1QgYXR0ZW1wdCB0byBtYXRjaCBhIHByZXNlbnRlZCBpZGVudGlmaWVyIGluXG4gICAgLy8gd2hpY2ggdGhlIHdpbGRjYXJkIGNoYXJhY3RlciBjb21wcmlzZXMgYSBsYWJlbCBvdGhlciB0aGFuIHRoZVxuICAgIC8vIGxlZnQtbW9zdCBsYWJlbCAoZS5nLiwgZG8gbm90IG1hdGNoIGJhci4qLmV4YW1wbGUubmV0KS5cIlxuICAgIC8vIFJGQzYxMjVcbiAgICBpZiAoIXdpbGRjYXJkcyAmJiAvXFwqLy50ZXN0KGhvc3QpIHx8IC9bXFwuXFwqXS4qXFwqLy50ZXN0KGhvc3QpIHx8XG4gICAgICAgIC9cXCovLnRlc3QoaG9zdCkgJiYgIS9cXCouKlxcLi4rXFwuLisvLnRlc3QoaG9zdCkpIHtcbiAgICAgIHJldHVybiAvJC4vO1xuICAgIH1cblxuICAgIC8vIFJlcGxhY2Ugd2lsZGNhcmQgY2hhcnMgd2l0aCByZWdleHAncyB3aWxkY2FyZCBhbmRcbiAgICAvLyBlc2NhcGUgYWxsIGNoYXJhY3RlcnMgdGhhdCBoYXZlIHNwZWNpYWwgbWVhbmluZyBpbiByZWdleHBzXG4gICAgLy8gKGkuZS4gJy4nLCAnWycsICd7JywgJyonLCBhbmQgb3RoZXJzKVxuICAgIHZhciByZSA9IGhvc3QucmVwbGFjZShcbiAgICAgICAgL1xcKihbYS16MC05XFxcXC1fXFwuXSl8W1xcLixcXC1cXFxcXFxeXFwkKz8qXFxbXFxdXFwoXFwpOiFcXHx7fV0vZyxcbiAgICAgICAgZnVuY3Rpb24oYWxsLCBzdWIpIHtcbiAgICAgICAgICBpZiAoc3ViKSByZXR1cm4gJ1thLXowLTlcXFxcLV9dKicgKyAoc3ViID09PSAnLScgPyAnXFxcXC0nIDogc3ViKTtcbiAgICAgICAgICByZXR1cm4gJ1xcXFwnICsgYWxsO1xuICAgICAgICB9KTtcblxuICAgIHJldHVybiBuZXcgUmVnRXhwKCdeJyArIHJlICsgJyQnLCAnaScpO1xuICB9XG5cbiAgdmFyIGRuc05hbWVzID0gW10sXG4gICAgICB1cmlOYW1lcyA9IFtdLFxuICAgICAgaXBzID0gW10sXG4gICAgICBtYXRjaENOID0gdHJ1ZSxcbiAgICAgIHZhbGlkID0gZmFsc2U7XG5cbiAgLy8gVGhlcmUncmUgc2V2ZXJhbCBuYW1lcyB0byBwZXJmb3JtIGNoZWNrIGFnYWluc3Q6XG4gIC8vIENOIGFuZCBhbHRuYW1lcyBpbiBjZXJ0aWZpY2F0ZSBleHRlbnNpb25cbiAgLy8gKEROUyBuYW1lcywgSVAgYWRkcmVzc2VzLCBhbmQgVVJJcylcbiAgLy9cbiAgLy8gV2FsayB0aHJvdWdoIGFsdG5hbWVzIGFuZCBnZW5lcmF0ZSBsaXN0cyBvZiB0aG9zZSBuYW1lc1xuICBpZiAoY2VydC5zdWJqZWN0YWx0bmFtZSkge1xuICAgIGNlcnQuc3ViamVjdGFsdG5hbWUuc3BsaXQoLywgL2cpLmZvckVhY2goZnVuY3Rpb24oYWx0bmFtZSkge1xuICAgICAgaWYgKC9eRE5TOi8udGVzdChhbHRuYW1lKSkge1xuICAgICAgICBkbnNOYW1lcy5wdXNoKGFsdG5hbWUuc2xpY2UoNCkpO1xuICAgICAgfSBlbHNlIGlmICgvXklQIEFkZHJlc3M6Ly50ZXN0KGFsdG5hbWUpKSB7XG4gICAgICAgIGlwcy5wdXNoKGFsdG5hbWUuc2xpY2UoMTEpKTtcbiAgICAgIH0gZWxzZSBpZiAoL15VUkk6Ly50ZXN0KGFsdG5hbWUpKSB7XG4gICAgICAgIHZhciB1cmkgPSB1cmwucGFyc2UoYWx0bmFtZS5zbGljZSg0KSk7XG4gICAgICAgIGlmICh1cmkpIHVyaU5hbWVzLnB1c2godXJpLmhvc3RuYW1lKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIElmIGhvc3RuYW1lIGlzIGFuIElQIGFkZHJlc3MsIGl0IHNob3VsZCBiZSBwcmVzZW50IGluIHRoZSBsaXN0IG9mIElQXG4gIC8vIGFkZHJlc3Nlcy5cbiAgaWYgKG5ldC5pc0lQKGhvc3QpKSB7XG4gICAgdmFsaWQgPSBpcHMuc29tZShmdW5jdGlvbihpcCkge1xuICAgICAgcmV0dXJuIGlwID09PSBob3N0O1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFRyYW5zZm9ybSBob3N0bmFtZSB0byBjYW5vbmljYWwgZm9ybVxuICAgIGlmICghL1xcLiQvLnRlc3QoaG9zdCkpIGhvc3QgKz0gJy4nO1xuXG4gICAgLy8gT3RoZXJ3aXNlIGNoZWNrIGFsbCBETlMvVVJJIHJlY29yZHMgZnJvbSBjZXJ0aWZpY2F0ZVxuICAgIC8vICh3aXRoIGFsbG93ZWQgd2lsZGNhcmRzKVxuICAgIGRuc05hbWVzID0gZG5zTmFtZXMubWFwKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHJldHVybiByZWdleHBpZnkobmFtZSwgdHJ1ZSk7XG4gICAgfSk7XG5cbiAgICAvLyBXaWxkY2FyZHMgYWluJ3QgYWxsb3dlZCBpbiBVUkkgbmFtZXNcbiAgICB1cmlOYW1lcyA9IHVyaU5hbWVzLm1hcChmdW5jdGlvbihuYW1lKSB7XG4gICAgICByZXR1cm4gcmVnZXhwaWZ5KG5hbWUsIGZhbHNlKTtcbiAgICB9KTtcblxuICAgIGRuc05hbWVzID0gZG5zTmFtZXMuY29uY2F0KHVyaU5hbWVzKTtcblxuICAgIGlmIChkbnNOYW1lcy5sZW5ndGggPiAwKSBtYXRjaENOID0gZmFsc2U7XG5cblxuICAgIC8vIE1hdGNoIGFnYWluc3QgQ29tbW9uIE5hbWUgKENOKSBvbmx5IGlmIG5vIHN1cHBvcnRlZCBpZGVudGlmaWVycyBhcmVcbiAgICAvLyBwcmVzZW50LlxuICAgIC8vXG4gICAgLy8gXCJBcyBub3RlZCwgYSBjbGllbnQgTVVTVCBOT1Qgc2VlayBhIG1hdGNoIGZvciBhIHJlZmVyZW5jZSBpZGVudGlmaWVyXG4gICAgLy8gIG9mIENOLUlEIGlmIHRoZSBwcmVzZW50ZWQgaWRlbnRpZmllcnMgaW5jbHVkZSBhIEROUy1JRCwgU1JWLUlELFxuICAgIC8vICBVUkktSUQsIG9yIGFueSBhcHBsaWNhdGlvbi1zcGVjaWZpYyBpZGVudGlmaWVyIHR5cGVzIHN1cHBvcnRlZCBieSB0aGVcbiAgICAvLyAgY2xpZW50LlwiXG4gICAgLy8gUkZDNjEyNVxuICAgIGlmIChtYXRjaENOKSB7XG4gICAgICB2YXIgY29tbW9uTmFtZXMgPSBjZXJ0LnN1YmplY3QuQ047XG4gICAgICBpZiAodXRpbC5pc0FycmF5KGNvbW1vbk5hbWVzKSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgayA9IGNvbW1vbk5hbWVzLmxlbmd0aDsgaSA8IGs7ICsraSkge1xuICAgICAgICAgIGRuc05hbWVzLnB1c2gocmVnZXhwaWZ5KGNvbW1vbk5hbWVzW2ldLCB0cnVlKSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRuc05hbWVzLnB1c2gocmVnZXhwaWZ5KGNvbW1vbk5hbWVzLCB0cnVlKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFsaWQgPSBkbnNOYW1lcy5zb21lKGZ1bmN0aW9uKHJlKSB7XG4gICAgICByZXR1cm4gcmUudGVzdChob3N0KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB2YWxpZDtcbn07XG5cbi8vIFRhcmdldCBBUEk6XG4vL1xuLy8gIHZhciBzID0gdGxzLmNvbm5lY3Qoe3BvcnQ6IDgwMDAsIGhvc3Q6IFwiZ29vZ2xlLmNvbVwifSwgZnVuY3Rpb24oKSB7XG4vLyAgICBpZiAoIXMuYXV0aG9yaXplZCkge1xuLy8gICAgICBzLmRlc3Ryb3koKTtcbi8vICAgICAgcmV0dXJuO1xuLy8gICAgfVxuLy9cbi8vICAgIC8vIHMuc29ja2V0O1xuLy9cbi8vICAgIHMuZW5kKFwiaGVsbG8gd29ybGRcXG5cIik7XG4vLyAgfSk7XG4vL1xuLy9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUNvbm5lY3RBcmdzKGxpc3RBcmdzKSB7XG4gIHZhciBhcmdzID0gX19ub3JtYWxpemVDb25uZWN0QXJncyhsaXN0QXJncyk7XG4gIHZhciBvcHRpb25zID0gYXJnc1swXTtcbiAgdmFyIGNiID0gYXJnc1sxXTtcblxuICBpZiAodHlwZW9mKGxpc3RBcmdzWzFdKSA9PT0gJ29iamVjdCcpIHtcbiAgICBvcHRpb25zID0gdXRpbC5fZXh0ZW5kKG9wdGlvbnMsIGxpc3RBcmdzWzFdKTtcbiAgfSBlbHNlIGlmICh0eXBlb2YobGlzdEFyZ3NbMl0pID09PSAnb2JqZWN0Jykge1xuICAgIG9wdGlvbnMgPSB1dGlsLl9leHRlbmQob3B0aW9ucywgbGlzdEFyZ3NbMl0pO1xuICB9XG5cbiAgcmV0dXJuIChjYikgPyBbb3B0aW9ucywgY2JdIDogW29wdGlvbnNdO1xufVxuXG5mdW5jdGlvbiBsZWdhY3lDb25uZWN0KGhvc3RuYW1lLCBvcHRpb25zLCBOUE4sIGNyZWRlbnRpYWxzKSB7XG4gIGFzc2VydChvcHRpb25zLnNvY2tldCk7XG4gIHZhciBwYWlyID0gdGxzLmNyZWF0ZVNlY3VyZVBhaXIoY3JlZGVudGlhbHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgISFvcHRpb25zLmlzU2VydmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICEhb3B0aW9ucy5yZXF1ZXN0Q2VydCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhIW9wdGlvbnMucmVqZWN0VW5hdXRob3JpemVkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE5QTlByb3RvY29sczogTlBOLk5QTlByb3RvY29scyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlcnZlcm5hbWU6IGhvc3RuYW1lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gIGxlZ2FjeVBpcGUocGFpciwgb3B0aW9ucy5zb2NrZXQpO1xuICBwYWlyLmNsZWFydGV4dC5fY29udHJvbFJlbGVhc2VkID0gdHJ1ZTtcbiAgcGFpci5vbignZXJyb3InLCBmdW5jdGlvbihlcnIpIHtcbiAgICBwYWlyLmNsZWFydGV4dC5lbWl0KCdlcnJvcicsIGVycik7XG4gIH0pO1xuXG4gIHJldHVybiBwYWlyO1xufVxuXG5mdW5jdGlvbiBjb25uZWN0KC8qIFtwb3J0LCBob3N0XSwgb3B0aW9ucywgY2IgKi8pIHtcbiAgdmFyIGFyZ3MgPSBub3JtYWxpemVDb25uZWN0QXJncyhhcmd1bWVudHMpO1xuICB2YXIgb3B0aW9ucyA9IGFyZ3NbMF07XG4gIHZhciBjYiA9IGFyZ3NbMV07XG5cbiAgdmFyIGRlZmF1bHRzID0ge1xuICAgIHJlamVjdFVuYXV0aG9yaXplZDogJzAnICE9PSBwcm9jZXNzLmVudi5OT0RFX1RMU19SRUpFQ1RfVU5BVVRIT1JJWkVELFxuICAgIHJlcXVlc3RDZXJ0OiB0cnVlLFxuICAgIGlzU2VydmVyOiBmYWxzZVxuICB9O1xuICBvcHRpb25zID0gdXRpbC5fZXh0ZW5kKGRlZmF1bHRzLCBvcHRpb25zIHx8IHt9KTtcblxuICB2YXIgaG9zdG5hbWUgPSBvcHRpb25zLnNlcnZlcm5hbWUgfHxcbiAgICAgICAgICAgICAgICAgb3B0aW9ucy5ob3N0IHx8XG4gICAgICAgICAgICAgICAgIG9wdGlvbnMuc29ja2V0ICYmIG9wdGlvbnMuc29ja2V0Ll9ob3N0IHx8XG4gICAgICAgICAgICAgICAgICcxMjcuMC4wLjEnLFxuICAgICAgTlBOID0ge30sXG4gICAgICBjcmVkZW50aWFscyA9IG9wdGlvbnMuY3JlZGVudGlhbHMgfHwgY3J5cHRvLmNyZWF0ZUNyZWRlbnRpYWxzKG9wdGlvbnMpO1xuICBpZiAodGxzLmNvbnZlcnROUE5Qcm90b2NvbHMpXG4gICAgdGxzLmNvbnZlcnROUE5Qcm90b2NvbHMob3B0aW9ucy5OUE5Qcm90b2NvbHMsIE5QTik7XG5cbiAgLy8gV3JhcHBpbmcgVExTIHNvY2tldCBpbnNpZGUgYW5vdGhlciBUTFMgc29ja2V0IHdhcyByZXF1ZXN0ZWQgLVxuICAvLyBjcmVhdGUgbGVnYWN5IHNlY3VyZSBwYWlyXG4gIHZhciBzb2NrZXQ7XG4gIHZhciBsZWdhY3k7XG4gIHZhciByZXN1bHQ7XG4gIGlmICh0eXBlb2YgdGxzLlRMU1NvY2tldCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBsZWdhY3kgPSB0cnVlO1xuICAgIHNvY2tldCA9IGxlZ2FjeUNvbm5lY3QoaG9zdG5hbWUsIG9wdGlvbnMsIE5QTiwgY3JlZGVudGlhbHMpO1xuICAgIHJlc3VsdCA9IHNvY2tldC5jbGVhcnRleHQ7XG4gIH0gZWxzZSB7XG4gICAgbGVnYWN5ID0gZmFsc2U7XG4gICAgc29ja2V0ID0gbmV3IHRscy5UTFNTb2NrZXQob3B0aW9ucy5zb2NrZXQsIHtcbiAgICAgIGNyZWRlbnRpYWxzOiBjcmVkZW50aWFscyxcbiAgICAgIGlzU2VydmVyOiAhIW9wdGlvbnMuaXNTZXJ2ZXIsXG4gICAgICByZXF1ZXN0Q2VydDogISFvcHRpb25zLnJlcXVlc3RDZXJ0LFxuICAgICAgcmVqZWN0VW5hdXRob3JpemVkOiAhIW9wdGlvbnMucmVqZWN0VW5hdXRob3JpemVkLFxuICAgICAgTlBOUHJvdG9jb2xzOiBOUE4uTlBOUHJvdG9jb2xzXG4gICAgfSk7XG4gICAgcmVzdWx0ID0gc29ja2V0O1xuICB9XG5cbiAgaWYgKHNvY2tldC5faGFuZGxlICYmICFzb2NrZXQuX2Nvbm5lY3RpbmcpIHtcbiAgICBvbkhhbmRsZSgpO1xuICB9IGVsc2Uge1xuICAgIC8vIE5vdCBldmVuIHN0YXJ0ZWQgY29ubmVjdGluZyB5ZXQgKG9yIHByb2JhYmx5IHJlc29sdmluZyBkbnMgYWRkcmVzcyksXG4gICAgLy8gY2F0Y2ggc29ja2V0IGVycm9ycyBhbmQgYXNzaWduIGhhbmRsZS5cbiAgICBpZiAoIWxlZ2FjeSAmJiBvcHRpb25zLnNvY2tldCkge1xuICAgICAgb3B0aW9ucy5zb2NrZXQub25jZSgnY29ubmVjdCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICBhc3NlcnQob3B0aW9ucy5zb2NrZXQuX2hhbmRsZSk7XG4gICAgICAgIHNvY2tldC5faGFuZGxlID0gb3B0aW9ucy5zb2NrZXQuX2hhbmRsZTtcbiAgICAgICAgc29ja2V0Ll9oYW5kbGUub3duZXIgPSBzb2NrZXQ7XG5cbiAgICAgICAgc29ja2V0LmVtaXQoJ2Nvbm5lY3QnKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBzb2NrZXQub25jZSgnY29ubmVjdCcsIG9uSGFuZGxlKTtcbiAgfVxuXG4gIGlmIChjYilcbiAgICByZXN1bHQub25jZSgnc2VjdXJlQ29ubmVjdCcsIGNiKTtcblxuICBpZiAoIW9wdGlvbnMuc29ja2V0KSB7XG4gICAgYXNzZXJ0KCFsZWdhY3kpO1xuICAgIHZhciBjb25uZWN0X29wdDtcbiAgICBpZiAob3B0aW9ucy5wYXRoICYmICFvcHRpb25zLnBvcnQpIHtcbiAgICAgIGNvbm5lY3Rfb3B0ID0geyBwYXRoOiBvcHRpb25zLnBhdGggfTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29ubmVjdF9vcHQgPSB7XG4gICAgICAgIHBvcnQ6IG9wdGlvbnMucG9ydCxcbiAgICAgICAgaG9zdDogb3B0aW9ucy5ob3N0LFxuICAgICAgICBsb2NhbEFkZHJlc3M6IG9wdGlvbnMubG9jYWxBZGRyZXNzXG4gICAgICB9O1xuICAgIH1cbiAgICBzb2NrZXQuY29ubmVjdChjb25uZWN0X29wdCk7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xuXG4gIGZ1bmN0aW9uIG9uSGFuZGxlKCkge1xuICAgIGlmICghbGVnYWN5KVxuICAgICAgc29ja2V0Ll9yZWxlYXNlQ29udHJvbCgpO1xuXG4gICAgaWYgKG9wdGlvbnMuc2Vzc2lvbilcbiAgICAgIHNvY2tldC5zZXRTZXNzaW9uKG9wdGlvbnMuc2Vzc2lvbik7XG5cbiAgICBpZiAoIWxlZ2FjeSkge1xuICAgICAgaWYgKG9wdGlvbnMuc2VydmVybmFtZSlcbiAgICAgICAgc29ja2V0LnNldFNlcnZlcm5hbWUob3B0aW9ucy5zZXJ2ZXJuYW1lKTtcblxuICAgICAgaWYgKCFvcHRpb25zLmlzU2VydmVyKVxuICAgICAgICBzb2NrZXQuX3N0YXJ0KCk7XG4gICAgfVxuICAgIHNvY2tldC5vbignc2VjdXJlJywgZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgc3NsID0gc29ja2V0Ll9zc2wgfHwgc29ja2V0LnNzbDtcbiAgICAgIHZhciB2ZXJpZnlFcnJvciA9IHNzbC52ZXJpZnlFcnJvcigpO1xuXG4gICAgICAvLyBWZXJpZnkgdGhhdCBzZXJ2ZXIncyBpZGVudGl0eSBtYXRjaGVzIGl0J3MgY2VydGlmaWNhdGUncyBuYW1lc1xuICAgICAgaWYgKCF2ZXJpZnlFcnJvcikge1xuICAgICAgICB2YXIgY2VydCA9IHJlc3VsdC5nZXRQZWVyQ2VydGlmaWNhdGUoKTtcbiAgICAgICAgdmFyIHZhbGlkQ2VydCA9IF9fY2hlY2tTZXJ2ZXJJZGVudGl0eShob3N0bmFtZSwgY2VydCk7XG4gICAgICAgIGlmICghdmFsaWRDZXJ0KSB7XG4gICAgICAgICAgdmVyaWZ5RXJyb3IgPSBuZXcgRXJyb3IoJ0hvc3RuYW1lL0lQIGRvZXNuXFwndCBtYXRjaCBjZXJ0aWZpY2F0ZVxcJ3MgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2FsdG5hbWVzJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHZlcmlmeUVycm9yKSB7XG4gICAgICAgIHJlc3VsdC5hdXRob3JpemVkID0gZmFsc2U7XG4gICAgICAgIHJlc3VsdC5hdXRob3JpemF0aW9uRXJyb3IgPSB2ZXJpZnlFcnJvci5tZXNzYWdlO1xuXG4gICAgICAgIGlmIChvcHRpb25zLnJlamVjdFVuYXV0aG9yaXplZCkge1xuICAgICAgICAgIHJlc3VsdC5lbWl0KCdlcnJvcicsIHZlcmlmeUVycm9yKTtcbiAgICAgICAgICByZXN1bHQuZGVzdHJveSgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHQuZW1pdCgnc2VjdXJlQ29ubmVjdCcpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQuYXV0aG9yaXplZCA9IHRydWU7XG4gICAgICAgIHJlc3VsdC5lbWl0KCdzZWN1cmVDb25uZWN0Jyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFVuY29yayBpbmNvbWluZyBkYXRhXG4gICAgICByZXN1bHQucmVtb3ZlTGlzdGVuZXIoJ2VuZCcsIG9uSGFuZ1VwKTtcbiAgICB9KTtcblxuICAgIGZ1bmN0aW9uIG9uSGFuZ1VwKCkge1xuICAgICAgLy8gTk9URTogVGhpcyBsb2dpYyBpcyBzaGFyZWQgd2l0aCBfaHR0cF9jbGllbnQuanNcbiAgICAgIGlmICghc29ja2V0Ll9oYWRFcnJvcikge1xuICAgICAgICBzb2NrZXQuX2hhZEVycm9yID0gdHJ1ZTtcbiAgICAgICAgdmFyIGVycm9yID0gbmV3IEVycm9yKCdzb2NrZXQgaGFuZyB1cCcpO1xuICAgICAgICBlcnJvci5jb2RlID0gJ0VDT05OUkVTRVQnO1xuICAgICAgICBzb2NrZXQuZGVzdHJveSgpO1xuICAgICAgICBzb2NrZXQuZW1pdCgnZXJyb3InLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdC5vbmNlKCdlbmQnLCBvbkhhbmdVcCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGxlZ2FjeVBpcGUocGFpciwgc29ja2V0KSB7XG4gIHBhaXIuZW5jcnlwdGVkLnBpcGUoc29ja2V0KTtcbiAgc29ja2V0LnBpcGUocGFpci5lbmNyeXB0ZWQpO1xuXG4gIHBhaXIuZW5jcnlwdGVkLm9uKCdjbG9zZScsIGZ1bmN0aW9uKCkge1xuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAvLyBFbmNyeXB0ZWQgc2hvdWxkIGJlIHVucGlwZWQgZnJvbSBzb2NrZXQgdG8gcHJldmVudCBwb3NzaWJsZVxuICAgICAgLy8gd3JpdGUgYWZ0ZXIgZGVzdHJveS5cbiAgICAgIGlmIChwYWlyLmVuY3J5cHRlZC51bnBpcGUpXG4gICAgICAgIHBhaXIuZW5jcnlwdGVkLnVucGlwZShzb2NrZXQpO1xuICAgICAgc29ja2V0LmRlc3Ryb3lTb29uKCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHBhaXIuZmQgPSBzb2NrZXQuZmQ7XG4gIHBhaXIuX2hhbmRsZSA9IHNvY2tldC5faGFuZGxlO1xuICB2YXIgY2xlYXJ0ZXh0ID0gcGFpci5jbGVhcnRleHQ7XG4gIGNsZWFydGV4dC5zb2NrZXQgPSBzb2NrZXQ7XG4gIGNsZWFydGV4dC5lbmNyeXB0ZWQgPSBwYWlyLmVuY3J5cHRlZDtcbiAgY2xlYXJ0ZXh0LmF1dGhvcml6ZWQgPSBmYWxzZTtcblxuICAvLyBjeWNsZSB0aGUgZGF0YSB3aGVuZXZlciB0aGUgc29ja2V0IGRyYWlucywgc28gdGhhdFxuICAvLyB3ZSBjYW4gcHVsbCBzb21lIG1vcmUgaW50byBpdC4gIG5vcm1hbGx5IHRoaXMgd291bGRcbiAgLy8gYmUgaGFuZGxlZCBieSB0aGUgZmFjdCB0aGF0IHBpcGUoKSB0cmlnZ2VycyByZWFkKCkgY2FsbHNcbiAgLy8gb24gd3JpdGFibGUuZHJhaW4sIGJ1dCBDcnlwdG9TdHJlYW1zIGFyZSBhIGJpdCBtb3JlXG4gIC8vIGNvbXBsaWNhdGVkLiAgU2luY2UgdGhlIGVuY3J5cHRlZCBzaWRlIGFjdHVhbGx5IGdldHNcbiAgLy8gaXRzIGRhdGEgZnJvbSB0aGUgY2xlYXJ0ZXh0IHNpZGUsIHdlIGhhdmUgdG8gZ2l2ZSBpdCBhXG4gIC8vIGxpZ2h0IGtpY2sgdG8gZ2V0IGluIG1vdGlvbiBhZ2Fpbi5cbiAgc29ja2V0Lm9uKCdkcmFpbicsIGZ1bmN0aW9uKCkge1xuICAgIGlmIChwYWlyLmVuY3J5cHRlZC5fcGVuZGluZyAmJiBwYWlyLmVuY3J5cHRlZC5fd3JpdGVQZW5kaW5nKVxuICAgICAgcGFpci5lbmNyeXB0ZWQuX3dyaXRlUGVuZGluZygpO1xuICAgIGlmIChwYWlyLmNsZWFydGV4dC5fcGVuZGluZyAmJiBwYWlyLmNsZWFydGV4dC5fd3JpdGVQZW5kaW5nKVxuICAgICAgcGFpci5jbGVhcnRleHQuX3dyaXRlUGVuZGluZygpO1xuICAgIGlmIChwYWlyLmVuY3J5cHRlZC5yZWFkKVxuICAgICAgcGFpci5lbmNyeXB0ZWQucmVhZCgwKTtcbiAgICBpZiAocGFpci5jbGVhcnRleHQucmVhZClcbiAgICAgIHBhaXIuY2xlYXJ0ZXh0LnJlYWQoMCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIG9uZXJyb3IoZSkge1xuICAgIGlmIChjbGVhcnRleHQuX2NvbnRyb2xSZWxlYXNlZCkge1xuICAgICAgY2xlYXJ0ZXh0LmVtaXQoJ2Vycm9yJywgZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gb25jbG9zZSgpIHtcbiAgICBzb2NrZXQucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgb25lcnJvcik7XG4gICAgc29ja2V0LnJlbW92ZUxpc3RlbmVyKCd0aW1lb3V0Jywgb250aW1lb3V0KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9udGltZW91dCgpIHtcbiAgICBjbGVhcnRleHQuZW1pdCgndGltZW91dCcpO1xuICB9XG5cbiAgc29ja2V0Lm9uKCdlcnJvcicsIG9uZXJyb3IpO1xuICBzb2NrZXQub24oJ2Nsb3NlJywgb25jbG9zZSk7XG4gIHNvY2tldC5vbigndGltZW91dCcsIG9udGltZW91dCk7XG5cbiAgcmV0dXJuIGNsZWFydGV4dDtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpKSJdfQ==