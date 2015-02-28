(function(global) {

  var nodeType = global.nodeType;
  var walkTree = global.walkTree;

  var bindType = {
    letBinding: 1,
    paramBinding: 2
  }

  var symbolId = 0;

  function genId() {
    return symbolId++;
  }

  function createSymbolTable(parent, node) {
    return {
      scopeId: genId(),
      parent: parent,
      node: node,
      table: {},
      addBinding: function addBinding(id, node) {
        this.table[id] = { scope: this, node: node };
      },
      lookup: function lookup(id) {
        return this.table[id] || (this.parent
          ? this.parent.lookup(id)
          : null);
      }
    };
  }

  function bindIdentifier(table, node) {
    var binding = table.lookup(node.value.value);
    if (!binding) {
      node.bind_error = "Cannot find the definition of [" + node.value.value + "].";
    } else {
      node.binding = binding;
    }
  }

  function bindFn(table, node) {
    var newTable = createSymbolTable(table, node);
    for (var i = 0; i < node.params.length; i++) {
      var p = node.params[i];
      newTable.addBinding(p.id.value, p);
    }
    node.scope = newTable;
    return newTable;
  }

  function bindLet(table, node) {
    var newTable = createSymbolTable(table, node);
    for (var i = 0; i < node.bindings.length; i++) {
      var b = node.bindings[i];
      newTable.addBinding(b.decl.value, b);
    }
    node.scope = newTable;
    return newTable;
  }

  function bindTree(tree, globalTable) {
    var table = createSymbolTable(globalTable);

    walkTree(tree,
      function bindNodePre(node) {
        switch(node.type) {
        case nodeType.identifier: bindIdentifier(table, node); break;
        case nodeType.fn: table = bindFn(table, node); break;
        case nodeType.let: table = bindLet(table, node); break;
        }
      },
      function bindNodePost(node) {
        if (table.node === node) {
          table = table.parent;
        }
      });
  }

  global.bindTree = bindTree;

})(this);
