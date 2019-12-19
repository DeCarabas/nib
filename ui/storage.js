(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Storage {
        constructor(path) {
            this.root = path + "/.data";
        }
        getDocument(name, callback) {
            fetch("/image/local/content/" + name)
                .then(resp => {
                if (resp.status === 200) {
                    resp.json().then(data => callback(null, data));
                }
                else if (resp.status === 404) {
                    callback(null, { content: null });
                }
                else {
                    callback(resp.statusText, null);
                }
            })
                .catch(reason => callback(reason, null));
        }
        setDocument(name, contentType, content, callback) {
            fetch("/image/local/content/" + name, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                redirect: "follow",
                body: JSON.stringify({ contentType, content })
            })
                .then(resp => callback(resp.status === 200 ? null : resp.statusText))
                .catch(reason => callback(reason));
        }
    }
    exports.Storage = Storage;
});
//# sourceMappingURL=storage.js.map