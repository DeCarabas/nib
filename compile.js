(function(global) {
  var nodeType = global.nodeType;

  // TODO: Should do much, much better.

  // JS generation
  // TODO: Should I make a tree form for the JS? Or is that just dumb? It would
  //       allow me to pretty-print the results of compilation, which will make
  //       debugging that much easier. (Also maybe the source map?)

  function escapeIdentifier(value) {
    // TODO: Escape identifiers
    return value;
  }

  function jsString(text) {
    return "'" + text.replace("'", "\\'") + "'";
  }

  function jsLiteral(token) {
    return token.value; // TODO: Better
  }

  function jsThrow(value) {
    return "throw "+ value;
  }

  function jsInvoke(func, args) {
    // func is the function expression to invoke; rest of the args are the
    // args to the function.
    var result = "(" + func + ")(";
    if (args) {
      result += args.join();
    }
    result += ")";

    return result;
  }

  function jsFunction(args, statements, name) {
    // args is an array of parameter names, statements is list of statements, name is optional name.
    var result = "function " + (name || "") + " (" + (args || []).join() + "){";

    var i;
    for (i = 0; i < statements.length; i++) {
      result += statements[i] + ";";
    }
    result += "}";

    return result;
  }

  function jsVar(name, value) {
    var result = "var " + name;
    if (value) { result += " = " + value; }
    return result;
  }

  function jsReturn(expr) {
    return "return (" + expr + ")";
  }

  function jsObject() {
    // arguments are fields of the object.
    var argsArray = Array.prototype.slice.call(arguments, 0);
    return "{" + argsArray.join() + "}";
  }

  function jsField(name, value) {
    return name + ":" + value;
  }

  function jsFalse() {
    return 'false';
  }

  function jsUndefined() {
    return 'undefined';
  }

  function jsIf(condition, thenBranch, elseBranch) {
    var result = 'if (' + condition + '){' + thenBranch.join(';') + '}';
    if (elseBranch) {
      result += ' else {' + elseBranch.join(';') + '}';
    }
  }

  function jsAssign(lval, rval) {
    return lval + ' = ' + rval;
  }

  function jsId(val) {
    return escapeIdentifier(val);
  }

  function jsTripleEq(left, right) {
    return "(" + left + " === " + right + ")";
  }

  function jsAdd(left, right) {
    return "(" + left + " + " + right + ")";
  }

  function jsSub(left, right) {
    return "(" + left + " - " + right + ")";
  }

  function jsMul(left, right) {
    return "(" + left + " * " + right + ")";
  }

  function jsDiv(left, right) {
    return "(" + left + " / " + right + ")";
  }

  function jsDot(left, right) {
    return left + "." + right;
  }

  function jsLessThan(left, right) {
    return "(" + left + " < " + right + ")";
  }


  // AST -> JS conversion

  function compileThrowLiteral(value) {
    return jsInvoke(jsFunction([], [ jsThrow(jsString(value) ])));
  }

  function compileEvalOnceProperty(expression) {
    return jsInvoke(
      jsFunction([], [
        jsVar('__m_v', jsUndefined()),
        jsReturn(
          jsObject(
            jsField('enumerable', jsFalse()),
            jsField('get', jsFunction([], [
              jsIf(
                jsTripleEq(jsId('__m_v'), jsUndefined()),
                [
                  jsAssign(jsId('__m_v'), compileExpression(expression))
                ]),
              jsReturn(jsId('__m_v'))]))))
        ]));
  }

  function compileRecordObject(fields) {
    // fields: [{name: token, expr: node}]
    return jsInvoke(
      jsDot(jsId('Object'), jsId('create')),
      [
        jsDot(jsId('Object'), jsId('prototype')),
        jsObject(fields.map(function convertField(f) {
          return jsField(f.name.value, compileEvalOnceProperty(f.expr));
        }))
      ]);
  }

  function compileApply(node) {
    // TODO: Functions really need to handle currying; this does not do that.
    return jsInvoke(
      compileExpression(node.fn),
      [ compileExpression(node.arg) ]
    );
  }

  function getScopeName(scope) {
    return '__scope_' + scope.scopeId;
  }

  function compileScopeReference(scope) {
    return jsId(getScopeName(scope));
  }

  function compileIdentifier(node) {
    var binding = node.binding;
    if (binding) {
      if (binding.node.type === nodeType.letBinding) {
        // This is special-- we're a member on an object that was created.
        // We need to find the variable assocaited with the scope that was
        // created and then '.' the value from the id off of it.
        return jsDot(compileScopeReference(binding.scope), jsId(node.value.value));
      } else {
        // Other bindings (e.g., parameter bindings) use standard javascript
        // binding to make this work.
        return jsId(node.value.value);
      }
    } else {
      // Was unable to bind for some reason; just pretend it works.
      return jsId(node.value.value);
    }
  }

  function compileLiteral(node) {
    return jsLiteral(node.value);
  }

  function compileParen(node) {
    return compileExpression(node.children[0]);
  }

  function compileLet(node) {
    // Invoking an anonymous object for scoping purposes...
    return jsInvoke(
      jsFunction([],[
        // Declare a record-value variable that will be accessed by both the
        // expressions in the bindings and body of the let.
        jsVar(getScopeName(node.scope), compileRecordObject(
          node.bindings.map(function (b) {
            return { name: b.decl, expr: b.expr };
          }))),

        // Return the result of the body.
        jsReturn(compileExpression(node.expr))
      ]));
  }

  function compileFn(node) {
    return jsFunction(
      node.params.map(function(p) { return jsId(p.id); }),
      [
        jsIf(
          jsLessThan(jsDot(jsId('arguments'), jsId('count')), jsLiteral(node.params.length)),
          [
            jsVar('__capturedArgs', jsInvoke(jsId('Array.prototype.slice.call'), [
              jsId('arguments'), '0'
            ])),
            jsReturn(jsFunction(
              [],
              [
                jsVar('__newArgs', jsInvoke(jsId('Array.prototype.slice.call'), [
                  jsId('arguments'), '0'
                ])),
                jsInvoke(jsId('__f_full.call'),[
                  jsInvoke(jsId('__capturedArgs.concat'),[ jsId('__newArgs') ])
                ])
              ],
              '__f_curried'))
          ]
        ),
        jsReturn(compileExpression(node.body))
      ],
      '__f_full'
    );
  }

  function compileNotImpl(node) {
    return compileThrowLiteral("Not Implemented");
  }

  function compileBinaryOperator(node) {
    // tokenType: plus minus multiply divide
    // Only numbers right now, so there's no need for complex handling of things...
    var left = compileExpression(node.children[0]);
    var right = compileExpression(node.children[1]);

    switch(node.op.value){
      case "+":  return jsAdd(left, right);
      case "-":  return jsSub(left, right);
      case "*":  return jsMul(left, right);
      case "/":  return jsDiv(left, right);
      default:   return compileThrowLiteral("Uncompilable operator: " + node.op.value);
    }
  }

  function compileSyntaxError(node) {
    return compileThrowLiteral("Syntax error");
  }

  function compileExpression(node) {
    switch(node.type) {
      case nodeType.apply:          return compileApply(node);
      case nodeType.identifier:     return compileIdentifier(node);
      case nodeType.literal:        return compileLiteral(node);
      case nodeType.paren:          return compileParen(node);
      case nodeType.let:            return compileLet(node);
      case nodeType.fn:             return compileFn(node);
      case nodeType.notimpl:        return compileNotImpl(node);
      case nodeType.binaryOperator: return compileBinaryOperator(node);
      case nodeType.syntaxError:    return compileSyntaxError(node);
      default:                      return compileThrowLiteral("Unsupported node");
    }
  }

  global.compile = compileExpression;
})(this);
