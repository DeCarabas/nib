(function(global) {
  "use strict";

  var tokenType = global.tokenType;
  var tokenTypeName = global.tokenTypeName;

  // Parser. This is a 'Pratt Parser', inspired by
  // http://journal.stuffwithstuff.com/2011/03/19/pratt-parsers-expression-parsing-made-easy/
  //
  // A note on error recovery: for error recovery, use the parseWithResync
  // function exposed by the token stream:
  //
  //    var result = token_stream.parseWithResync(<< resync token type >>, function() {
  //      << parsing logic here >>
  //      return << parsed node >>;
  //    });
  //    << consume resync token here >>
  //
  // What this will do is resynchronize the token stream on the next token of
  // the specified type if a parse error occurs. parseWithResync will either
  // return the result of the parsing function, if successful, or a syntax
  // error node, if an error occurred. Either way, your code should expect
  // the current token in the token stream to be the resync token after
  // parseWithResync returns.
  //
  // Note that, if the token stream was unable to resynchronize on your
  // resync token, then it will let the syntax error exception escape, and
  // hope that some other, higher-level parseWithResync function catches it.
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

  function parseRecordField(token_stream) {
    var binding = token_stream.parseWithResync(
      tokenType.semicolon,
      function parseRecordFieldInternal() {
        var id = token_stream.read(tokenType.identifier);
        var equals = token_stream.read(tokenType.equals);
        var val = parseExpression(token_stream, precedence.record);

        return { type: nodeType.recordField, decl: id, expr: val, equals: equals, children: [ val ] };
      });
    token_stream.read(tokenType.semicolon);
    return binding;
  }

  function parseRecord(token_stream, token) {
    var bindings = [];
    while (token_stream.peek().type !== tokenType.closeCurly) {
      var binding = token_stream.parseWithResync(
        tokenType.closeCurly,
        function doParseRecordField() { return parseRecordField(token_stream); });
      bindings.push(binding);
    }

    var close = token_stream.read(tokenType.closeCurly);
    return { type: nodeType.record, open: token, close: close, children: bindings };
  }

  function parseFn(token_stream, token) {
    var params = [];
    while (token_stream.peek().type !== tokenType.arrow) {
      var p = token_stream.parseWithResync(
        tokenType.arrow,
        function parseFnArg() {
          var id = token_stream.read(tokenType.identifier);
          return { type: nodeType.fnArg, id: id };
        });
      params.push(p);
    }

    var arrow = token_stream.read(tokenType.arrow);
    var body = parseExpression(token_stream, precedence.fn);
    return { type: nodeType.fn, params: params, arrow: arrow, body: body, children: [ body ] };
  }

  function parseLetBinding(token_stream) {
    var binding = token_stream.parseWithResync(
      tokenType.semicolon,
      function() {
        var id = token_stream.read(tokenType.identifier);
        var equals = token_stream.read(tokenType.equals);
        var val = parseExpression(token_stream, precedence.let);

        return { type: nodeType.letBinding, decl: id, expr: val, equals: equals, children: [ val ] };
      });

    if (token_stream.peek().type !== tokenType.inKeyword) {
      token_stream.read(tokenType.semicolon);
    }

    return binding;
  }

  function parseLet(token_stream, token) {
    // Token is already let.
    var bindings = [];
    while(token_stream.peek().type !== tokenType.inKeyword) {
      var binding = token_stream.parseWithResync(
        tokenType.inKeyword,
        function() {
          return parseLetBinding(token_stream);
        });
      bindings.push(binding);
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
    var expr = token_stream.parseWithResync(
      tokenType.closeParen,
      function() {
        return parseExpression(token_stream, 0);
      });
    token_stream.read(tokenType.closeParen);
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
    var pfx = prefix_table[token.type];
    if (!pfx) {
      token_stream.throwSyntaxError("Cannot parse '" + token.value + "' as an expression", token);
    }
    var rest = pfx(token_stream, token);
    rest = parseInfix(token_stream, precedence.apply, rest);

    return { type : nodeType.apply, fn: left, arg: rest, children: [left, rest] };
  }

  // Parser tables. (The core of the Pratt Parser.)
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

  // The prefix table is generated by creating a map from the token field to
  // the parser field.
  //
  var prefix_table = prefix_tokens.reduce(function (p,c) { p[c.token] = c.parser; return p; }, {});

  // The infix table is a map of the infix_tokens table, from the token field
  // to the parser field. In addition, for every token in the prefix_tokens
  // table that is not also in the infix_tokens table, a row is added that
  // recognizes the token as infix application.
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
      var token = token_stream.read();
      left = infix_table[token.type].parse(token_stream, left, token);
    }

    return left;
  }

  function parseExpression(token_stream, precedence) {
    var token = token_stream.read();
    var pfx = prefix_table[token.type];
    if (!pfx) {
      token_stream.throwSyntaxError("Cannot parse '" + token.value + "' as an expression", token);
    }
    var left = pfx(token_stream, token);

    return parseInfix(token_stream, precedence, left);
  }

  function parse(tokens) {
    var index = 0;

    // Initial resync state is to look for EOF, starting at the first token.
    var resyncTokens = [tokenType.eof];
    var resyncPositions = [0];

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
          this.throwSyntaxError(
            "Parse error: expected " + tokenTypeName(type) + " but got " + token.value,
            token);
        }
        if (token.type != tokenType.eof) { index++; }
        return token;
      },
      pushResync: function pushResync(tokenType) {
        resyncTokens.push(tokenType);
        resyncPositions.push(index);
      },
      popResync: function popResync() {
        resyncTokens.pop();
        resyncPositions.pop();
      },
      parseWithResync: function parseWithResync(resyncTokenType, parseFunction) {
        try {
          this.pushResync(resyncTokenType);
          var result = parseFunction(this);
          this.popResync();
          return result;
        } catch (e) {
          if (!e.syntaxError) { throw e; }
          if (this.peek().type !== resyncTokenType) { throw e; }
          return e.syntaxError;
        }
      },
      peek: function peek() { skipWhitespace(); return tokens[index]; },
      throwSyntaxError: function throwSyntaxError(message, token) {
        // Resync by advancing to the first token that is anywhere in our
        // resync stack...
        do {
          if (resyncTokens.indexOf(tokens[index].type) >= 0) { break; }
          index++;
        } while(index < tokens.length);

        // Pop the resync stack down to the matching resync token, and record
        // the starting token position of the resync point.
        while(resyncTokens.pop() !== tokens[index].type) { resyncPositions.pop(); }
        var resyncPosition = resyncPositions.pop();

        // Gather the tokens that are part of the error.
        var errorTokens = tokens.slice(resyncPosition, index);

        // And throw the exception!
        throw {
          syntaxError: {
            type: nodeType.syntaxError,
            error: message,
            errorToken: token,
            value: errorTokens
          }
        };
      }
    };

    try {
      return parseExpression(token_stream, 0);
    } catch(e) {
      if (!e.syntaxError) { throw e; }
      return e.syntaxError;
    }
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
