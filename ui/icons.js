(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./extern/preact.10.1.1/preact"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const preact_1 = require("./extern/preact.10.1.1/preact");
    function icon({ name }) {
        return preact_1.h("img", { src: `icons/${name}.svg`, className: "feather" });
    }
    exports.icon = icon;
});
