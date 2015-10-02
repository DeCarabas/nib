(function(global) {
  "use strict";

  var tokenType = global.tokenType;
  var tokenTypeName = global.tokenTypeName;

  // Parser. This is a 'Pratt Parser', inspired by
  // http://journal.stuffwithstuff.com/2011/03/19/pratt-parsers-expression-parsing-made-easy/
  //
  // A note on error recovery: the token stream object exposes a method
  // called 'resync' which scans ahead to the next instance of a given token,
  // or to eof if no such token can be found, and returns an array of all of
  // the tokens between the current point and the resync token. The general
  // pattern for recovering from parse errors, then, is to:
  //
  //   - Put a try/catch around whatever you were parsing.
  //
  //   - Inside the try/catch, use token_stream.read() to demand a particular
  //     token type at a particular spot.
  //
  //   - When you catch an exception that has '.syntaxError', use
  //     token_stream.resync() to advance to the resync token. Assign the
  //     return value of resync() to the .syntaxError.value member, so that
  //     the text can be captured in the syntax error.
  //
  //   - Replace the node you were supposed to be parsing into with the
  //     syntax error node.
  //
  //   - Use token_stream.read() to consume the resync token.
  //
  var nodeType = {
    apply: 1,identifier: 2,literal: 3, paren: 4,
    let: 100, fn: 101, fnArg: 102, letBinding: 103, record: 104, recordField: 105,
    notimpl: 200,
    binaryOperator: 1000, unaryOperator: 1001,
    syntaxError: 9000
  };
  function nodeTypeName(type) {
    var keys = Object.keys(nodeType);
    for (var i = 0, len = keys.length; i < len; i++) {
      if (type === nodeType[keys[i]]) {
        return keys[i];
      }
    }
    return "<unknown>";
  }

  // Prefix expressions
  function parseIdentifier(token_stream, token) {
    return { type: nodeType.identifier, value: token };
  }

  function parseLiteral(token_stream, token) {
    return { type: nodeType.literal, value: token };
  }

  function parseError(token_stream, token) {
    return { type: nodeType.syntaxError, error: token.error, errorToken: token, value: [ token ] };
  }

  function parseRecord(token_stream, token) {
    var bindings = [], resync_start;
    try {
      while (token_stream.peek().type !== tokenType.closeCurly) {
        resync_start = token_stream.resyncStart();
        var id = token_stream.read(tokenType.identifier);
        var equals = token_stream.read(tokenType.equals);
        var val = parseExpression(token_stream, precedence.record);
        token_stream.read(tokenType.semicolon);

        bindings.push({type: nodeType.recordField, decl: id, expr: val, equals: equals, children: [ val ] });
      }
    } catch(e) {
      if (!e.syntaxError) { throw e; }
      e.syntaxError.value = token_stream.resync(resync_start, tokenType.closeCurly);
      bindings.push(e.syntaxError);
    }

    var close = token_stream.read(tokenType.closeCurly);
    return { type: nodeType.record, open: token, close: close, children: bindings };
  }

  function parseFn(token_stream, token) {
    var params = [], resync_start;
    try {
      while (token_stream.peek().type !== tokenType.arrow) {
        resync_start = token_stream.resyncStart();
        var id = token_stream.read(tokenType.identifier);
        params.push({ type: nodeType.fnArg, id: id });
      }
    } catch(e) {
      if (!e.syntaxError) { throw e; }
      e.syntaxError.value = token_stream.resync(resync_start, tokenType.arrow);
      params.push(e.syntaxError);
    }

    var arrow = token_stream.read(tokenType.arrow);
    var body = parseExpression(token_stream, precedence.fn);
    return { type: nodeType.fn, params: params, arrow: arrow, body: body, children: [ body ] };
  }

  function parseLet(token_stream, token) {
    // Token is already let.
    var bindings = [], resync_start;
    try {
      do {
        if (token_stream.peek().type === tokenType.semicolon) { token_stream.read(); }
        if (token_stream.peek().type === tokenType.inKeyword) { break; }

        resync_start = token_stream.resyncStart();

        var id = token_stream.read(tokenType.identifier);
        var equals = token_stream.read(tokenType.equals);
        var val = parseExpression(token_stream, precedence.let);

        bindings.push({ type: nodeType.letBinding, decl: id, expr: val, equals: equals, children: [ val ] });
      } while(token_stream.peek().type !== tokenType.inKeyword);
    } catch(e) {
      if (!e.syntaxError) { throw e; }
      e.syntaxError.value = token_stream.resync(resync_start, tokenType.inKeyword);
      bindings.push(e.syntaxError);
    }

    var in_ = token_stream.read(tokenType.inKeyword);
    var expr = parseExpression(token_stream, precedence.let);

    var children = bindings.concat(expr);
    return { type: nodeType.let, let: token, bindings: bindings, in_: in_, expr: expr, children: children };
  }

  function parseNotImpl(token_stream, token) {
    return { type: nodeType.notimpl, token: token };
  }

  function parseParenthetical(token_stream, token) {
    var expr = parseExpression(token_stream, 0);
    token_stream.read(tokenType.closeParen); // TODO: Resync point here, on close paren?
    return { type: nodeType.paren, children: [ expr ] };
  }

  function parseUnaryOperator(precedence) {
      return function parseUnaryImpl(token_stream, token) {
        var expr = parseExpression(token_stream, precedence);
        return { type: nodeType.unaryOperator, op: token, children: [ expr ] };
      };
  }

  // Infix expressions
  function parseBinaryOperator(precedence) {
    return {
      precedence: precedence,
      parse: function(token_stream, left, token) {
        var right = parseExpression(token_stream, precedence);
        return { type: nodeType.binaryOperator, children: [ left, right ], op: token };
      }
    };
  }

  function parseApply(token_stream, left, token) {
    // This is kinda like parseExpression, 'cept the token has already
    // been read for us and we know it's a prefix of something. 'left',
    // as provided by the caller, is the expression that resolves to the
    // function.
    //
    var rest = prefix_table[token.type](token_stream, token);
    rest = parseInfix(token_stream, precedence.apply, rest);

    return { type : nodeType.apply, fn: left, arg: rest, children: [left, rest] };
  }

  // Parser tables. (The core of the Pratt Parser.)
  function parser_table(table) {
    return table.reduce(function (p, c) { p[c.token] = c.parser; }, {});
  }

  // N.B.: Stealing precedence from F#, which has a syntax I admire.
  var precedence = {
    meta:     1,
    let:      2,
    record:   3,
    fn:       4,
    add:      5,
    multiply: 6,
    apply:    7
  };

  var prefix_tokens = [
    { token: tokenType.identifier,    parser: parseIdentifier },
    { token: tokenType.numberLiteral, parser: parseLiteral },
    { token: tokenType.fnKeyword,     parser: parseFn },
    { token: tokenType.letKeyword,    parser: parseLet },
    { token: tokenType.openCurly,     parser: parseRecord },
    { token: tokenType.ellipsis,      parser: parseNotImpl },
    { token: tokenType.openParen,     parser: parseParenthetical },
    { token: tokenType.plus,          parser: parseUnaryOperator(precedence.add) },
    { token: tokenType.minus,         parser: parseUnaryOperator(precedence.add) },
    { token: tokenType.error,         parser: parseError }
  ];

  var infix_tokens = [
    { token: tokenType.plus,     parser: parseBinaryOperator(precedence.add) },
    { token: tokenType.minus,    parser: parseBinaryOperator(precedence.add) },
    { token: tokenType.multiply, parser: parseBinaryOperator(precedence.multiply) },
    { token: tokenType.divide,   parser: parseBinaryOperator(precedence.multiply) },
    { token: tokenType.meta,     parser: parseBinaryOperator(precedence.meta) }
  ];

  // The prefix table is generated by creating a map from the token
  // field to the parser field.
  //
  var prefix_table = prefix_tokens.reduce(function (p,c) { p[c.token] = c.parser; return p; }, {});

  // The infix table is a map of the infix_tokens table, from the token
  // field to the parser field. In addition, for every token in the
  // prefix_tokens table that is not also in the infix_tokens table, a
  // row is added that recognizes the token as infix application.
  //
  var infix_table = (function() {
    var apply_tokens = prefix_tokens.reduce(function (p,c) {
      p[c.token] = { precedence: precedence.apply, parse: parseApply };
      return p;
    }, {});

    return infix_tokens.reduce(
      function (p,c) { p[c.token] = c.parser; return p; },
      Object.create(apply_tokens));
  })();

  function nextPrecedence(token_stream) {
    var infix = infix_table[token_stream.peek().type];
    if (infix) { return infix.precedence; }
    return 0;
  }

  function parseInfix(token_stream, precedence, left) {
    while (precedence < nextPrecedence(token_stream)) {
      var resync_start = token_stream.resyncStart();
      var token = token_stream.read();
      left = infix_table[token.type].parse(token_stream, left, token, resync_start);
    }

    return left;
  }

  function parseExpression(token_stream, precedence) {
    var resync_start = token_stream.resyncStart();
    var token = token_stream.read();
    try {
      var left = prefix_table[token.type](token_stream, token, resync_start);

      return parseInfix(token_stream, precedence, left);
    } catch(e) {
      // Note that in general this will halt parsing; if you want to continue
      // after one of these errors then modify your parse routine to catch
      // syntax errors and resynchronize on some other token.
      if (!e.syntaxError) { throw e; }
      return e.syntaxError;
    }
  }

  function parse(tokens) {
    var index = 0;

    function skipWhitespace() {
      while(tokens[index].type === tokenType.whitespace) {
        index++;
      }
    }

    var token_stream = {
      read: function read(type) {
        skipWhitespace();
        var token = tokens[index];
        if (type && token.type !== type) {
          throw {
            syntaxError: {
              type: nodeType.syntaxError,
              error: "Parse error: expected " + tokenTypeName(type) + " but got " + token.value,
              errorToken: token,
              value: [ token ]
            }
          };
        }
        if (token.type != tokenType.eof) { index++; }
        return token;
      },
      resync: function resync(start, type) {
        while(tokens[index].type != type && tokens[index].type != tokenType.eof) {
          index++;
        }
        return tokens.slice(start, index);
      },
      resyncStart: function resyncStart() {
        return index;
      },
      peek: function peek() { skipWhitespace(); return tokens[index]; },
    };

    return parseExpression(token_stream, 0);
  }

  function nodeName(node) {
    var name = nodeTypeName(node.type);
    if (node.params) {
      name = node.params.reduce(function (p,c) { return p + " " + c.id.value; }, name);
    }
    if (node.op) { name += " " + node.op.value; }
    if (node.decl) { name += " " + node.decl.value + "="; }
    if (node.value) { name += ' (' + node.value.value + ')'; }
    return name;
  }

  function walkTree(node, pre, post) {
    if (pre) { pre(node); }
    if (node.children) {
      var i = 0;
      for (i = 0; i < node.children.length; i++) {
        walkTree(node.children[i], pre, post);
      }
    }
    if (post) { post(node); }
  }

  function dumpTree(t) {
    walkTree(t, function pre(node) {
      var name = nodeName(node);
      if (node.children) {
        console.group(name);
      } else {
        console.log(name);
      }
    }, function post(node) {
      if (node.children) {
        console.groupEnd(nodeName(node));
      }
    });
  }

  global.nodeType = nodeType;
  global.parse = parse;
  global.walkTree = walkTree;
  global.dumpTree = dumpTree;
})(this);
