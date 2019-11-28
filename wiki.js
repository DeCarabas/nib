const md = require("markdown-it")();
const react = require("react");
const feather = require("feather-icons");

const e = react.createElement;
const { useEffect, useState, useRef } = react;

// Configure markdown renderer to do the right thing to links.
const NIB_SCHEME = "nib://";
function processLink(token, index, tokens) {
  const aIndex = token.attrIndex("href");
  let href = aIndex >= 0 ? token.attrs[aIndex][1] : "";
  if (!href) {
    // if target is empty then actually we need to be looking at the next tokens
    // until we have a link_close I guess?
    for (let i = index + 1; i < tokens.length; i++) {
      if (tokens[i].type != "text") {
        break;
      }
      href += tokens[i].content + " ";
    }
    href = href.trim();
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    token.attrPush(["target", "_blank"]); // Open in new window.
  } else {
    href = NIB_SCHEME + href;
    if (aIndex >= 0) {
      token.attrs[aIndex][1] = href;
    } else {
      token.attrPush(["href", href]);
    }
  }
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

function WikiCard({ slug, store, onNavigate }) {
  const [mode, setMode] = useState("loading");
  const [content, setContent] = useState(undefined);
  const [height, setHeight] = useState(undefined);
  const contentRef = useRef(null);

  if (mode === "loading") {
    store.getDocument(slug, (error, result) => {
      if (error) {
        setMode("error");
      } else {
        setContent(result);
        setMode("loaded");
      }
    });
  }

  useEffect(() => {
    function maybeSetHeight(_) {
      if (mode === "loaded" && contentRef.current) {
        const contentElement = contentRef.current;
        const contentHeight = contentElement.getBoundingClientRect().height;
        if (contentHeight && contentHeight !== height) {
          setHeight(contentHeight);
          console.log("height:", contentHeight);
        }
      }
    }

    maybeSetHeight(null);
    window.addEventListener("resize", maybeSetHeight);
    return () => window.removeEventListener("resize", maybeSetHeight);
  });

  const outerStyle = {
    // We capture the height in "loaded", but fix the height in editing.
    // If we accidentally set the height when the mode is "loaded" then rounding
    // errors cause us to not converge. :P
    height: mode === "editing" ? height : undefined,

    // This causes the reported height of the box to match the actual content
    // height, that is, the box stretches to accomodate the margins of the inner
    // content. (See "margin collapse".)
    overflow: "auto"
  };

  return e(
    "div",
    { ref: contentRef, style: outerStyle },
    e(WikiContents, {
      mode,
      content,
      onNavigate,
      onEdit: () => setMode("editing"),
      onSave: newContent => {
        setMode("saving");
        store.setDocument(slug, newContent, error => {
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
  mode,
  content,
  editHeight,
  onNavigate,
  onEdit,
  onSave,
  onCancel
}) {
  switch (mode) {
    case "loading":
      return e("div", null, "Loading...");
    case "error":
      return e("div", null, "An error occurred, sorry.");
    case "loaded":
      return e(WikiElement, { content, onNavigate, onEdit });
    case "editing":
      return e(WikiEditor, { height: editHeight, content, onSave, onCancel });
    case "saving":
      return e("div", null, "Saving, please wait...");
  }
}

function WikiEditor({ content, onSave, onCancel }) {
  const [text, setText] = useState(content || "");

  return e(
    "div",
    null,
    e(
      "form",
      null,
      e(
        "div",
        {
          className: "absolute top-1 bottom-2 left-1 right-1"
        },
        e("textarea", {
          className: "w-100 h-100",
          value: text,
          onChange: e => setText(e.target.value)
        })
      ),
      e(
        "div",
        { className: "absolute bottom-0 right-0" },
        e("button", { onClick: () => onSave(text) }, "Save"),
        e("button", { onClick: onCancel }, "Cancel")
      )
    )
  );
}

function WikiElement({ content, onNavigate, onEdit }) {
  const contentElementRef = useRef(null);
  useEffect(() => {
    if (contentElementRef.current) {
      function onClick(evt) {
        evt.preventDefault();
        console.log("Clicked yo:", evt.target);
        const href = evt.target.href;
        if (href.startsWith(NIB_SCHEME)) {
          onNavigate(href.substring(NIB_SCHEME.length));
        }
      }

      for (let link of contentElementRef.current.getElementsByTagName("a")) {
        console.log(link);
        link.addEventListener("click", onClick);
      }
    }
  });

  return e(
    "div",
    { className: "sans-serif" },
    e("div", {
      dangerouslySetInnerHTML: {
        __html: md.render(content || "*Nothing here yet!*")
      },
      ref: contentElementRef
    }),
    e(
      "div",
      { className: "absolute top-1 right-1" },
      e(
        "a",
        {
          onClick: onEdit,
          style: { cursor: "pointer" }
        },
        e("div", {
          dangerouslySetInnerHTML: {
            __html: feather.icons["edit"].toSvg()
          }
        })
      )
    )
  );
}

module.exports = { WikiCard };
