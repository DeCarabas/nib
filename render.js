// Structured renderer
(function(global) {
  "use strict";

  var nodeType = global.nodeType;
  var tokenType = global.tokenType;

  function createDiv(className) {
    var result = document.createElement("div");
    result.classList.add(className);
    return result;
  }

  function renderTextElement(className, value) {
    var div = createDiv(className);
    div.innerText = value;
    return div;
  }

  function renderKeyword(value) { return renderTextElement("keyword", value); }
  function renderOperator(value) { return renderTextElement("operator", value); }

  function renderIdentifierToken(token) {
    if (token.quoted) {
      return '\u00AB' + token.value + '\u00BB';
    } else {
      return token.value;
    }
  }

  function renderBinding(node) {
    var binding = createDiv("binding");
    binding.appendChild(renderTextElement("variable", renderIdentifierToken(node.decl)));
    binding.appendChild(renderOperator("="));
    binding.appendChild(renderNode("value", node.expr));
    return binding;
  }

  function renderLetExpression(node) {
    var bindings = createDiv("bindings");
    for(var i = 0; i < node.bindings.length; i++) {
      renderNodeInto(bindings,node.bindings[i]);
    }

    var expr = createDiv("expr");
    expr.appendChild(renderKeyword("in"));
    expr.appendChild(renderNode("letIn", node.expr));

    var letexp = createDiv("letExpression");
    letexp.appendChild(renderKeyword("let"));
    letexp.appendChild(bindings);
    letexp.appendChild(expr);
    return letexp;
  }

  function renderFnExpression(node) {
    var fnexp = createDiv("fnExpression");
    fnexp.appendChild(renderKeyword("fn")); // For extra nerdy do \u03BB
    for (var i = 0; i < node.params.length; i++) {
      fnexp.appendChild(renderTextElement("decl", node.params[i].id.value));
    }
    fnexp.appendChild(renderKeyword("\u21d2")); // "=>"
    fnexp.appendChild(renderNode("body", node.body));
    return fnexp;
  }

  function renderParenthetical(node) {
    var parexp = createDiv("parenExpression");
    parexp.appendChild(renderTextElement("paren", "("));
    parexp.appendChild(renderNode("parenValue", node.children[0]));
    parexp.appendChild(renderTextElement("paren", ")"));
    return parexp;
  }

  function renderRecordField(node) {
    var field  = createDiv("recordField");
    field.appendChild(renderTextElement("fieldName", renderIdentifierToken(node.decl)));
    field.appendChild(renderNode("fieldValue", node.expr));
    return field;
  }

  function renderRecord(node) {
    var record = createDiv("recordExpression");
    for(var i = 0; i < node.children.length; i++) {
      renderNodeInto(record, node.children[i]);
    }
    return record;
  }

  function renderApplyExpression(node) {
    var applyexp = createDiv("applyExpression");
    applyexp.appendChild(renderNode("fn", node.fn));
    applyexp.appendChild(renderNode("arg", node.arg));
    return applyexp;
  }

  function renderIdentifierExpression(node) {
    var idexp = renderTextElement("identifierExpression", renderIdentifierToken(node.value));
    if (node.bind_error) {
      idexp.classList.add("bindError");
      idexp.title = node.bind_error;
    }
    return idexp;
  }

  function renderLiteralExpression(node) {
    return renderTextElement("literalExpression", node.value.value);
  }

  function renderSyntaxError(node) {
    var element = createDiv("syntaxErrorBlock");

    // Sometimes the error token is not contained in the error text, and so
    // we need to highlight the whole thing.
    var errorTokenInRange = node.value.indexOf(node.errorToken) >= 0;

    for(var i = 0; i < node.value.length; i++) {
      var tokenClass = ((node.value[i] === node.errorToken) || (!errorTokenInRange))
        ? "syntaxError"
        : "syntaxErrorToken";
      element.appendChild(renderTextElement(tokenClass, node.value[i].value));
    }
    if (node.error) {
      element.title = node.error;
    }
    return element;
  }

  function renderMeta(node) {
    var metaexp = createDiv("metaExpression");
    metaexp.appendChild(renderNode("exprBody", node.children[0]));
    metaexp.appendChild(renderOperator("^^"));
    metaexp.appendChild(renderNode("metaRecord", node.children[1]));
    return metaexp;
  }

  function renderBinaryOperatorExpression(node) {
    if (node.op.type === tokenType.meta) {
      return renderMeta(node);
    } else {
      var binopexp = createDiv("binaryExpression");
      binopexp.appendChild(renderNode("left", node.children[0]));
      binopexp.appendChild(renderOperator(node.op.value));
      binopexp.appendChild(renderNode("right", node.children[1]));
      return binopexp;
    }
  }

  function renderNotImpl(node) {
    return renderTextElement("notImplExpression", "\u2026");
  }

  function renderNode(name, node) {
    var container = createDiv(name);
    renderNodeInto(container, node);
    return container;
  }

  function renderNodeInto(container, node) {
    switch(node.type) {
    case nodeType.let: container.appendChild(renderLetExpression(node)); break;
    case nodeType.fn: container.appendChild(renderFnExpression(node)); break;
    case nodeType.apply: container.appendChild(renderApplyExpression(node)); break;
    case nodeType.identifier: container.appendChild(renderIdentifierExpression(node)); break;
    case nodeType.letBinding: container.appendChild(renderBinding(node)); break;
    case nodeType.literal: container.appendChild(renderLiteralExpression(node)); break;
    case nodeType.binaryOperator: container.appendChild(renderBinaryOperatorExpression(node)); break;
    case nodeType.notimpl: container.appendChild(renderNotImpl(node)); break;
    case nodeType.paren: container.appendChild(renderParenthetical(node)); break;
    case nodeType.record: container.appendChild(renderRecord(node)); break;
    case nodeType.recordField: container.appendChild(renderRecordField(node)); break;
    case nodeType.syntaxError: container.appendChild(renderSyntaxError(node)); break;
    default: throw new Error("Missing handler for node type");
    }
    container._node = node;
  }

  global.renderNode = renderNode;
})(this);
