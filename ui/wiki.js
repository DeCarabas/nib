(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./extern/preact.10.1.1/preact", "./extern/preact.10.1.1/hooks", "./extern/markdown-it.10.0.0/markdown-it", "./extern/codemirror.5.49.2/lib/codemirror", "./extern/codemirror.5.49.2/mode/markdown/markdown"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const preact_1 = require("./extern/preact.10.1.1/preact");
    const hooks_1 = require("./extern/preact.10.1.1/hooks");
    const MarkdownIt = require("./extern/markdown-it.10.0.0/markdown-it");
    const CodeMirror = require("./extern/codemirror.5.49.2/lib/codemirror");
    require("./extern/codemirror.5.49.2/mode/markdown/markdown");
    const NIB_SCHEME = "nib://";
    const md = new MarkdownIt();
    // Handle wikimedia-style links.
    function parseWikiLink(state, silent) {
        const source = state.src;
        let pos = state.pos;
        let matched = false;
        if (source[pos] === "[" && source[pos + 1] === "[") {
            // scan forward until we find the close...
            pos += 2;
            while (pos < source.length) {
                if (source[pos] === "]" && source[pos + 1] === "]") {
                    matched = true;
                    break;
                }
                // exit out early if we see something wierd
                if (source[pos] === "[") {
                    break;
                }
                pos += 1;
            }
        }
        if (!matched) {
            return false;
        }
        const start = state.pos + 2;
        const end = pos;
        if (!silent) {
            const match = source.slice(start, end).trim();
            const pipeIndex = match.indexOf("|");
            const [target, text] = pipeIndex >= 0
                ? [match.slice(0, pipeIndex).trim(), match.slice(pipeIndex + 1).trim()]
                : [match, match];
            const token = state.push("wiki-link", "a", 0);
            token.meta = { target, text };
        }
        state.pos = end + 2;
        return true;
    }
    md.inline.ruler.push("wikiLinks", parseWikiLink);
    // Render wikimedia style links.
    function renderWikiLinkHTML(tokens, id, _options, _env) {
        const { target, text } = tokens[id].meta;
        return '<a href="' + NIB_SCHEME + target + '">' + text + "</a>";
    }
    md.renderer.rules["wiki-link"] = renderWikiLinkHTML;
    // Configure markdown renderer to add the right classes to stuff.
    function processLink(token) {
        token.attrPush(["target", "_blank"]); // Open in new window.
        return token;
    }
    function addClass(token, className) {
        const aIndex = token.attrIndex("class");
        if (aIndex >= 0) {
            token.attrs[aIndex][1] += " " + className;
        }
        else {
            token.attrPush(["class", className]);
        }
        return token;
    }
    // Style text correctly with tachyons? This sucks kinda...
    function processTokens(tokens) {
        return tokens.map((token, index, tokens) => {
            // console.log(token);
            if (token.children) {
                token.children = processTokens(token.children);
            }
            switch (token.type) {
                case "link_open":
                    return processLink(token);
                case "heading_open":
                    switch (token.tag) {
                        case "h1":
                            return addClass(token, "f2 lh-solid");
                        case "h2":
                            return addClass(token, "f3 lh-solid");
                        case "h3":
                            return addClass(token, "f4 lh-solid");
                        case "h4":
                            return addClass(token, "f5 lh-solid");
                        case "h5":
                        case "h6":
                            return addClass(token, "f6 lh-solid");
                    }
                    return token;
                case "paragraph_open":
                    return addClass(token, "measure lh-copy");
                default:
                    return token;
            }
        });
    }
    const defaultRender = md.renderer.render.bind(md.renderer);
    md.renderer.render = (tokens, options, env) => defaultRender(processTokens(tokens), options, env);
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
        const html = md.render(markdown);
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