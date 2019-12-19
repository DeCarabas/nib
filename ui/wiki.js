(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./extern/preact.10.1.1/preact", "./extern/preact.10.1.1/hooks", "./extern/marked.0.8.0/marked", "./extern/codemirror.5.49.2/lib/codemirror", "./extern/codemirror.5.49.2/mode/markdown/markdown"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const preact_1 = require("./extern/preact.10.1.1/preact");
    const hooks_1 = require("./extern/preact.10.1.1/hooks");
    const marked_1 = require("./extern/marked.0.8.0/marked");
    const CodeMirror = require("./extern/codemirror.5.49.2/lib/codemirror");
    require("./extern/codemirror.5.49.2/mode/markdown/markdown");
    const NIB_SCHEME = "nib://";
    function CodeMirrorEditor({ value, onChange }) {
        const ref = hooks_1.useRef(null);
        const codeMirror = hooks_1.useRef({ value, cm: null, elt: null });
        // Make sure our codeMirror is bound to the appropriate element.
        hooks_1.useEffect(() => {
            const { elt } = codeMirror.current;
            if (ref.current !== elt) {
                if (ref.current) {
                    const cm = CodeMirror(ref.current, {
                        value: value,
                        lineWrapping: true,
                        mode: "markdown"
                    });
                    cm.on("changes", (_, changes) => {
                        if (codeMirror.current.cm === cm) {
                            const newValue = cm.getValue();
                            codeMirror.current.value = newValue;
                            if (changes.some(c => c.origin[0] === "+")) {
                                onChange(newValue);
                            }
                        }
                    });
                    codeMirror.current = { elt: ref.current, cm, value };
                }
                else {
                    codeMirror.current = { elt: null, cm: null, value };
                }
            }
        });
        // Keep our codeMirror up to date with the incoming value; if the incoming
        // value changes then we need to replace the text.
        hooks_1.useEffect(() => {
            const { cm, value: lastValue } = codeMirror.current;
            if (cm && lastValue != value) {
                const cursor = cm.getCursor();
                cm.setValue(value);
                cm.setCursor(cursor);
                codeMirror.current.value = value;
            }
        });
        return preact_1.h("div", { ref });
    }
    function WikiEditor({ slug, document, onSave }) {
        const { content: { content } } = document;
        const [text, setText] = hooks_1.useState(content || "");
        const [newSlug, setNewSlug] = hooks_1.useState(slug);
        return preact_1.h("div", { className: "wiki-editor-container" }, preact_1.h("input", {
            className: "gr1",
            value: newSlug,
            onChange: (e) => setNewSlug(e.target.value)
        }), preact_1.h("div", { className: "gr2" }, preact_1.h(CodeMirrorEditor, {
            value: text,
            onChange: e => setText(e)
        })), preact_1.h("div", { className: "gr3" }, preact_1.h("button", {
            type: "button",
            onClick: () => onSave({ contentType: "wiki", content: text })
        }, "Save")));
    }
    exports.WikiEditor = WikiEditor;
    function MarkdownView({ markdown }) {
        const options = {
            headerIds: false,
            silent: false
        };
        const html = marked_1.parser(marked_1.lexer(markdown, options), options);
        return preact_1.h("div", { dangerouslySetInnerHTML: { __html: html } });
    }
    function WikiView({ slug, document, onNavigate }) {
        const { content: { content } } = document;
        const contentElementRef = hooks_1.useRef(null);
        hooks_1.useEffect(() => {
            if (contentElementRef.current) {
                const onClick = (evt) => {
                    evt.preventDefault();
                    const href = evt.target.href;
                    if (href.startsWith(NIB_SCHEME)) {
                        onNavigate(href.substring(NIB_SCHEME.length), "view");
                    }
                };
                const elem = contentElementRef.current.base;
                for (let link of elem.getElementsByTagName("a")) {
                    link.onclick = onClick;
                }
            }
        });
        return preact_1.h("div", null, preact_1.h(MarkdownView, {
            markdown: content || "*Nothing here yet!*",
            ref: contentElementRef
        }));
    }
    exports.WikiView = WikiView;
});
//# sourceMappingURL=wiki.js.map