(function(global) {

  var nodeType = global.nodeType;
  var walkTree = global.walkTree;

  function createSymbolTable(parent, node) {
    return {
      parent: parent,
      node: node,
      table: {},
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
      table.table[node.params[i].id.value] = node.params[i];
    }
    return newTable;
  }

  function bindLet(table, node) {
    var newTable = createSymbolTable(table, node);

    for (var i = 0; i < node.bindings.length; i++) {
      table.table[node.bindings[i].decl.value] = node.bindings[i];
    }

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
