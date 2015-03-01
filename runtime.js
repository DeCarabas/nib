(function(global) {
  "use strict";

  global.nib = (global.nib || {});
  global.nib.runtime = {

    // This function wraps another function and adds auto-curry support to
    // it, so if the function is called with too few parameters, we return a
    // function accepts the remaining parameters.
    //
    addCurrySupport: function addCurrySupport(f) {
      var curried = function curriedFunction() {
        if (arguments.length < f.length) {
          var capturedArgs = Array.prototype.slice.call(arguments, 0);
          var result = Function.prototype.bind.apply(curriedFunction, [null].concat(capturedArgs));
          result.toString = function() { return "(" + f.toString() + ")(" + capturedArgs.toString() + ")"; };
          return result;
        }

        return f.apply(null, arguments);
      };
      curried.toString = function() { return f.toString(); };
      return curried;
    }

  };
})(this);
