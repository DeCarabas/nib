(function(global) {
  "use strict";

  global.nib = (global.nib || {});
  global.nib.runtime = {

    // addCurrySupport wraps another function and adds auto-curry support to
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
    },

    // defineProperty takes a function that returns a value, and wraps it
    // in an object property descriptor that evaluates the function exactly
    // once, and caches the result. The resulting property descriptor can be
    // passed to Object.create or Object.defineProperty or something like
    // that.
    //
    defineProperty: function defineProperty(valueFunction) {
      var cachedValue;
      return {
        configurable: false,
        enumerable: false,
        get: function getOnceProp() {
          if (cachedValue === undefined) {
             cachedValue = valueFunction();
          }
          return cachedValue;
        }
      };
    },

    // addMeta associates metadata with the provided value. The metadata
    // will be available under the '__meta' property, and like other parts
    // of the system will be evaluated lazily and exactly once.
    //
    addMeta: function addMeta(value, metaFunc)
    {
      Object.defineProperty(value, '__meta', global.nib.runtime.defineProperty(metaFunc));
      return value;
    }
  };
})(this);
