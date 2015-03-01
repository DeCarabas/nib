(function(global) {
  global.nib = (global.nib || {});
  global.nib.runtime = {

    // This function wraps another function and adds auto-curry support to
    // it, so if the function is called with too few parameters, we return a
    // function accepts the remaining parameters.
    //
    addCurrySupport: function addCurrySupport(f) {
      return function curriedFunction() {
        if (arguments.length < f.length) {
          var capturedArgs = Array.prototype.slice.call(arguments, 0);
          return Function.prototype.bind.apply(curriedFunction, [null].concat(capturedArgs));
        }

        return f.apply(null, arguments);
      };
    }

  };
})(this);
