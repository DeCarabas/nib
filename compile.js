(function(global) {
  var nodeType = global.nodeType;

  // TODO: Should do much, much better.

  // Pretty-printing.
  function createPrettyPrinter() {
    return {
      indent: 0,
      buffer: '',
      isIndented: false,

      clear: function() {
        this.buffer = '';
        this.indent = 0;
      },

      _writeNewLine: function() {
        this.buffer += '\n';
        this.isIndented = false;
      },

      _writeValue: function(value) {
        var parts = value.toString().split('\n');
        for(var i = 0; i < parts.length; i++) {
          if (i != 0) { this._writeNewLine(); }
          if (!this.isIndented && (parts[i].length > 0)) { 
            for (var j = 0; j < this.indent; j++) {
              this.buffer += '  ';
            }
            this.isIndented = true;
          }
          this.buffer += parts[i];
        }
      },

      write: function() {
        for(var i = 0; i < arguments.length; i++) {
          var value = arguments[i];
          if (typeof(value) === "function") {
            value(this);
          } else if (Array.isArray(value)) {
            this.write.apply(this, value);
          } else {
            this._writeValue(value);
          }
        }        
      },

      writeLine: function() {
        this.write.apply(this, arguments);
        this._writeNewLine();
      },

      withIndent: function(f) {
        this.indent++; 
        try {
          f(); 
        } finally {
          this.indent--;
        }
      }
    };
  }

  // JS generation
  function escapeIdentifier(value) {
    // TODO: Escape identifiers
    return value;
  }

  function jsString(text) {
    return function writeString(writer) {
      writer.write("'" + text.replace("'", "\\'") + "'");
    };
  }

  function jsNumber(val) {
    return function writeNumber(writer) {
      writer.write(val); // TODO: Better
    };
  }

  function jsThrow(value) {
    return function writeThrow(writer) {
      writer.write("throw ", value);
    };
  }

  function jsInvoke(func, args) {
    // func is the function expression to invoke; rest of the args are the
    // args to the function.
    return function writeInvoke(writer) {
      writer.write("(", func, ")(");
      if (args && args.length) {
        writer.withIndent(function() {
          for(var i = 0; i < args.length; i++) {
            if (i != 0) { writer.write(", "); }
            writer.write(args[i]);
          }
        });
      }
      writer.write(")");
    };
  }

  function jsFunction(args, statements, name) {
    // args is an array of parameter names, statements is list of statements,
    // name is optional name.
    return function writeFunction(writer) {
      writer.write("function ", (name || ""), "(");
      (args || []).forEach(function (a, i) {
        if (i != 0) { writer.write(", "); }
        writer.write(a);
      });
      writer.writeLine("){");
      writer.withIndent(function (){
        (statements || []).forEach(function (s) {
          writer.writeLine(s, ";");
        });
      });
      writer.write("}");
    };
  }

  function jsVar(name, value) {
    return function writeVar(writer) {
      writer.write("var " + name);
      if (value) { writer.write(" = ", value); }
    };
  }

  function jsReturn(expr) {
    return function writeReturn(writer) {
      writer.write("return (", expr, ")");
    };
  }

  function jsObject(fields) {
    return function writeObject(writer) {
      writer.writeLine("{");
      writer.withIndent(function() {
        fields.forEach(function(a, i){
          if (i != 0) { writer.writeLine(","); }
          writer.write(a);
        });
        writer.writeLine();
      });
      writer.write("}");
    };
  }

  function jsField(name, value) {
    return function writeField(writer) {
      writer.write(name, ": ", value);
    };
  }

  function _jsLiteral(value) {
    return function() {
      return function writeFalse(writer) {
        writer.write(value);
      };
    };
  }

  var jsFalse     = _jsLiteral('false');
  var jsUndefined = _jsLiteral('undefined');
  var jsNull      = _jsLiteral('null');

  function jsIf(condition, thenBranch, elseBranch) {
    return function writeIf(writer) {
      writer.writeLine('if (', condition, ') {');
      writer.withIndent(function() {
        (thenBranch || []).forEach(function(s) {
          writer.writeLine(s, ";");
        });
      });
      writer.write("}");
      if (elseBranch) {
        writer.writeLine(" else {");
        writer.withIndent(function() {
          elseBranch.forEach(function(s) {
            writer.writeLine(s, ";");
          });
        });
      }
    };
  }

  function jsAssign(lval, rval) {
    return function writeAssign(writer) {
      writer.write(lval, ' = ', rval);
    };
  }

  function jsDot(left, right) {
    return function writeDiv(writer) {
      writer.write(left, ".", right);
    };
  }

  function jsId(val) {
    return function writeId(writer) {
      writer.write(escapeIdentifier(val));
    };
  }

  function _jsBinOp(op) {
    return function(left, right) {
      return function(writer) {
        writer.write("(", left, " ", op, " ", right, ")");
      };
    };
  };

  var jsTripleEq = _jsBinOp("===");
  var jsAdd      = _jsBinOp("+");
  var jsSub      = _jsBinOp("-");
  var jsMul      = _jsBinOp("*");
  var jsDiv      = _jsBinOp("/");
  var jsLessThan = _jsBinOp("<");

  // AST -> JS conversion

  function compileThrowLiteral(value) {
    return jsInvoke(jsFunction([], [ jsThrow(jsString(value)) ]));
  }

  function compileEvalOnceProperty(expression) {
    return jsInvoke(
      jsFunction([], [
        jsVar('__m_v', jsUndefined()),
        jsReturn(
          jsObject([
            jsField('enumerable', jsFalse()),
            jsField('get', jsFunction([], [
              jsIf(
                jsTripleEq(jsId('__m_v'), jsUndefined()),
                [
                  jsAssign(jsId('__m_v'), compileExpression(expression))
                ]),
              jsReturn(jsId('__m_v'))]))
          ]))
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
    return jsNumber(node.value.value);
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

  // This function wraps another function and adds auto-curry support to it,
  // so if the function is called with too few parameters, we return a
  // function accepts the remaining parameters.
  //
  function supportCurry(f) {
    return function curriedFunction() {
      if (arguments.length < f.length) {
        var capturedArgs = Array.prototype.slice.call(arguments, 0);
        return Function.prototype.bind.apply(curriedFunction, [null].concat(capturedArgs));
      }

      return f.apply(null, arguments);
    };
  }

  function compileFn(node) {
    return jsInvoke(
      jsId('nib.runtime.addCurrySupport'),
      [
        jsFunction(
          node.params.map(function(p) { return jsId(p.id.value); }),
          [ jsReturn(compileExpression(node.body)) ])
      ]);
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

  function compile(node) {
    var writer = createPrettyPrinter();
    writer.write(compileExpression(node));
    return writer.buffer;
  }

  global.compile = compile;
})(this);
