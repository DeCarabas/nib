import { h } from "./extern/preact.10.1.1/preact";
import { useState, useEffect, useRef } from "./extern/preact.10.1.1/hooks";
import * as MarkdownIt from "./extern/markdown-it.10.0.0/markdown-it";
import * as CodeMirror from "./extern/codemirror.5.49.2/lib/codemirror";
import "./extern/codemirror.5.49.2/mode/markdown/markdown";
import StateInline = require("./extern/markdown-it.10.0.0/lib/rules_inline/state_inline");
import Token = require("./extern/markdown-it.10.0.0/lib/token");
import { HandlerProps } from "./types";

const NIB_SCHEME = "nib://";

const md = new MarkdownIt();

// Handle wikimedia-style links.
function parseWikiLink(state: StateInline, silent: boolean) {
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
    const [target, text] =
      pipeIndex >= 0
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
function renderWikiLinkHTML(
  tokens: Token[],
  id: number,
  _options: any,
  _env: any
) {
  const { target, text } = tokens[id].meta;
  return '<a href="' + NIB_SCHEME + target + '">' + text + "</a>";
}
md.renderer.rules["wiki-link"] = renderWikiLinkHTML;

// Configure markdown renderer to add the right classes to stuff.
function processLink(token: Token): Token {
  token.attrPush(["target", "_blank"]); // Open in new window.
  return token;
}

function addClass(token: Token, className: string) {
  const aIndex = token.attrIndex("class");
  if (aIndex >= 0) {
    token.attrs[aIndex][1] += " " + className;
  } else {
    token.attrPush(["class", className]);
  }
  return token;
}

// Style text correctly with tachyons? This sucks kinda...
function processTokens(tokens: Token[]): Token[] {
  return tokens.map((token: Token, index: number, tokens: Token[]) => {
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
md.renderer.render = (tokens, options, env) =>
  defaultRender(processTokens(tokens), options, env);

interface CodeMirrorEditorProps {
  value: string;
  onChange: (newValue: string) => void;
}

function CodeMirrorEditor({ value, onChange }: CodeMirrorEditorProps) {
  const ref = useRef(null);
  const codeMirror = useRef({ value, cm: null, elt: null });

  // Make sure our codeMirror is bound to the appropriate element.
  useEffect(() => {
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
      } else {
        codeMirror.current = { elt: null, cm: null, value };
      }
    }
  });

  // Keep our codeMirror up to date with the incoming value; if the incoming
  // value changes then we need to replace the text.
  useEffect(() => {
    const { cm, value: lastValue } = codeMirror.current;
    if (cm && lastValue != value) {
      const cursor = cm.getCursor();
      cm.setValue(value);
      cm.setCursor(cursor);

      codeMirror.current.value = value;
    }
  });

  return h("div", { ref });
}

export function WikiEditor({ slug, document, onSave }: HandlerProps) {
  const {
    content: { content }
  } = document;

  const [text, setText] = useState(content || "");
  const [newSlug, setNewSlug] = useState(slug);

  return h(
    "div",
    { className: "wiki-editor-container" },
    h("input", {
      className: "gr1",
      value: newSlug,
      onChange: (e: any) => setNewSlug(e.target.value)
    }),
    h(
      "div",
      { className: "gr2" },
      h(CodeMirrorEditor, {
        value: text,
        onChange: e => setText(e)
      })
    ),
    h(
      "div",
      { className: "gr3" },
      h(
        "button",
        {
          type: "button",
          onClick: () => onSave({ contentType: "wiki", content: text })
        },
        "Save"
      )
    )
  );
}

interface MarkdownViewProperties {
  markdown: string;
}

function MarkdownView({ markdown }: MarkdownViewProperties) {
  const html = md.render(markdown);
  return h("div", { dangerouslySetInnerHTML: { __html: html } });
}

export function WikiView({ slug, document, onNavigate }: HandlerProps) {
  const {
    content: { content }
  } = document;

  const contentElementRef = useRef(null);
  useEffect(() => {
    if (contentElementRef.current) {
      const onClick = (evt: any) => {
        evt.preventDefault();
        const href = evt.target.href;
        if (href.startsWith(NIB_SCHEME)) {
          onNavigate(href.substring(NIB_SCHEME.length), "view", "below");
        }
      };

      const elem = contentElementRef.current.base;
      for (let link of elem.getElementsByTagName("a")) {
        link.onclick = onClick;
      }
    }
  });

  return h(
    "div",
    null,
    h(MarkdownView, {
      markdown: content || "*Nothing here yet!*",
      ref: contentElementRef
    })
  );
}
