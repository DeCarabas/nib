(function(global) {
  var nodeType = global.nodeType;

  // TODO: Should do much, much better.
  // JS generation
  function escapeIdentifier(token) {
    // TODO: Escape identifiers
    return token.value;
  }

  function makeString(text) {
    return "'" + text.replace("'", "\\'") + "'";
  }

  function jsInvoke(fnexp, args) {
    return "((" + fnexp + ")(" + args.join() + "))";
  }

  function jsFunction(args, body, name) {
    return "function "+(name||"")+"("+args.join()+"){"+body+"}";
  }

  function jsLiteral(token) {
    return token.value; // TODO: Better
  }

  function jsThrow(text) {
    return "throw "+ makeString(text);
  }

  function jsAdd(left, right) {
    return "(" + left + "+" + right + ")";
  }

  function jsSub(left, right) {
    return "(" + left + "-" + right + ")";
  }

  function jsMul(left, right) {
    return "(" + left + "*" + right + ")";
  }

  function jsDiv(left, right) {
    return "(" + left + "/" + right + ")";
  }

  // AST -> JS conversion

  function compileApply(node) {
    return jsInvoke(
      compileExpression(node.fn),
      [ compileExpression(node.arg) ]
    );
  }

  function compileIdentifier(node) {
    return escapeIdentifier(node.value);
  }

  function compileLiteral(node) {
    return jsLiteral(node.value);
  }

  function compileParen(node) {
    return compileExpression(node.children[0]);
  }

  function compileLet(node) {
    return jsInvoke(
      jsFunction(
        node.bindings.map(function(b) { return escapeIdentifier(b.decl); }),
        compileExpression(node.expr)
      ),
      node.bindings.map(function(b) { return compileExpression(b.expr); })
    );
  }

  function compileFn(node) {
    return jsFunction(
      node.params.map(function(p) { return escapeIdentifier(p); }),
      compileExpression(node.body)
    );
  }

  function compileNotImpl(node) {
    return jsThrow("Not Implemented");
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
      default:   return jsThrow("Uncompilable operator: " + node.op.value);
    }
  }

  function compileSyntaxError(node) {
    return jsThrow("Syntax error");
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
      default:                      return jsThrow("Unsupported node");
    }
  }

  global.compile = compileExpression;
})(this);
