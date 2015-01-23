(function(global) {
  // TODO: Should do much, much better.

  // JS generation
  function escapeIdentifier(identifier) {
    // TODO: Escape identifiers
    // return identifier;
  }

  function jsInvoke(options) {
    // fnexp
    // args
  }

  function jsFunction(options) {
    // args
    // body
    // name?
  }

  function jsLiteral(options) {
    // value
  }

  function jsThrow(options) {
    // text
  }

  function jsAdd(left, right) {
  }

  function jsSub(left, right) {
  }

  function jsMul(left, right) {
  }

  function jsDiv(left, right) {
  }

  // AST -> JS conversion

  function compileApply(node) {
    return jsInvoke({
      fnexp: compileExpression(node.fn),
      args: [ compileExpression(node.arg) ]
    });
  }

  function compileIdentifier(node) {
    return escapeIdentifier(node.value.value);
  }

  function compileLiteral(node) {
    // TODO: Really translate literals.
    return jsLiteral({ value: node.value.value });
  }

  function compileParen(node) {
    return compileExpression(node.children[0]);
  }

  function compileLet(node) {
    return jsInvoke({
      fnexp: jsFunction({ 
        args: node.bindings.map(function(b) { return escapeIdentifier(b.decl.value); }),
        body: compileExpression(node.expr)
      }),
      args: node.bindings.map(function(b) { return compileExpression(b.expr); })
    });
  }

  function compileFn(node) {
    return jsFunction({
      args: node.params.map(function(p) { return escapeIdentifier(p); }),
      body: compileExpression(node.body)
    });
  }

  function compileNotImpl(node) {
    return jsThrow({ text: "Not Implemented" });
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
      default:   return jsThrow({ text: "Uncompilable operator: " + node.op.value });
    }
  }

  function compileSyntaxError(node) {
    return jsThrow({ text: "Syntax error" });
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
      default:                      return jsThrow({ text: "Unsupported node" });
    }
  }

  global.compile = compileExpression;
})(this);
