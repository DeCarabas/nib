import "https://unpkg.com/feather-icons@4.24.1/dist/feather.js?module";
import "https://unpkg.com/markdown-it@10.0.0/dist/markdown-it.js";
import { h } from "https://unpkg.com/preact@latest?module";
import {
  useState,
  useEffect,
  useRef
} from "https://unpkg.com/preact@latest/hooks/dist/hooks.module.js?module";

const md = window.markdownit();

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
const NIB_SCHEME = "nib://";
function renderWikiLinkHTML(tokens, id, _options, _env) {
  const { target, text } = tokens[id].meta;
  return '<a href="' + NIB_SCHEME + target + '">' + text + "</a>";
}
md.renderer.rules["wiki-link"] = renderWikiLinkHTML;

// Configure markdown renderer to add the right classes to stuff.
function processLink(token, index, tokens) {
  token.attrPush(["target", "_blank"]); // Open in new window.
  return token;
}

function addClass(token, className) {
  const aIndex = token.attrIndex("class");
  if (aIndex >= 0) {
    token.attrs[aIndex][1] += " " + className;
  } else {
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
        return processLink(token, index, tokens);
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

export function WikiCard({ slug, store, onNavigate }) {
  const [mode, setMode] = useState("loading");
  const [content, setContent] = useState(undefined);
  const [height, setHeight] = useState(undefined);
  const contentRef = useRef(null);

  if (mode === "loading") {
    store.getDocument(slug, (error, result) => {
      if (error) {
        setMode("error");
      } else {
        const { content } = result;
        setContent(content);
        setMode("loaded");
      }
    });
  }

  useEffect(() => {
    const maybeSetHeight = _ => {
      if (mode === "loaded" && contentRef.current) {
        const contentElement = contentRef.current;
        const contentHeight = contentElement.getBoundingClientRect().height;
        if (contentHeight && contentHeight !== height) {
          setHeight(contentHeight);
        }
      }
    };

    maybeSetHeight(null);
    window.addEventListener("resize", maybeSetHeight);
    return () => {
      window.removeEventListener("resize", maybeSetHeight);
    };
  }, [mode, content]);

  const outerStyle = {
    // We capture the height in "loaded", but fix the height in editing.
    // If we accidentally set the height when the mode is "loaded" then rounding
    // errors cause us to not converge. :P (104 is a magic number where we don't
    // want the default height, measured by experiment.)
    height: mode === "editing" && height >= 104 ? height : undefined,

    // This causes the reported height of the box to match the actual content
    // height, that is, the box stretches to accomodate the margins of the inner
    // content. (See "margin collapse".)
    overflow: "auto"
  };

  return h(
    "div",
    { ref: contentRef, style: outerStyle },
    h(WikiContents, {
      slug,
      mode,
      content,
      onNavigate,
      onEdit: () => setMode("editing"),
      onSave: newContent => {
        setMode("saving");
        store.setDocument(slug, "wiki", newContent, error => {
          if (error) {
            setMode("error");
          } else {
            setMode("loaded");
            setContent(newContent);
          }
        });
      },
      onCancel: () => setMode("loaded")
    })
  );
}

function WikiContents({
  slug,
  mode,
  content,
  onNavigate,
  onEdit,
  onSave,
  onCancel
}) {
  switch (mode) {
    case "loading":
      return h("div", null, "Loading...");
    case "error":
      return h("div", null, "An error occurred, sorry.");
    case "loaded":
      return h(WikiElement, { content, onNavigate, onEdit });
    case "editing":
      return h(WikiEditor, {
        slug,
        content,
        onSave,
        onCancel
      });
    case "saving":
      return h("div", null, "Saving, please wait...");
  }
}

function WikiEditor({ slug, content, onSave, onCancel }) {
  const [text, setText] = useState(content || "");
  const [newSlug, setNewSlug] = useState(slug);

  return h(
    "div",
    {
      style: {
        display: "grid",
        gridTemplateRows: "1rem auto 2rem",
        gridRowGap: "0.5rem",
        height: "100%"
      }
    },
    h("input", {
      style: { gridRow: 1 },
      value: newSlug,
      onChange: e => setNewSlug(e.target.value)
    }),
    h(
      "div",
      { style: { gridRow: 2 } },
      h("textarea", {
        className: "w-100 h-100",
        value: text,
        onChange: e => setText(e.target.value)
      })
    ),
    h(
      "div",
      { style: { gridRow: 3 } },
      h("button", { onClick: () => onSave(text) }, "Save"),
      h("button", { onClick: onCancel }, "Cancel")
    )
  );
}

function WikiElement({ content, onNavigate, onEdit }) {
  const contentElementRef = useRef(null);
  useEffect(() => {
    if (contentElementRef.current) {
      function onClick(evt) {
        evt.preventDefault();
        const href = evt.target.href;
        if (href.startsWith(NIB_SCHEME)) {
          onNavigate(href.substring(NIB_SCHEME.length));
        }
      }

      for (let link of contentElementRef.current.getElementsByTagName("a")) {
        link.onclick = onClick;
      }
    }
  });

  return h(
    "div",
    { className: "sans-serif" },
    h("div", {
      dangerouslySetInnerHTML: {
        __html: md.render(content || "*Nothing here yet!*")
      },
      ref: contentElementRef
    }),
    h(
      "div",
      { className: "absolute top-1 right-1" },
      h(
        "a",
        {
          onClick: onEdit,
          style: { cursor: "pointer" }
        },
        h("div", {
          dangerouslySetInnerHTML: {
            __html: feather.icons["edit"].toSvg()
          }
        })
      )
    )
  );
}
