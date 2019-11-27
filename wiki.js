const md = require("markdown-it")();
const react = require("react");

const e = react.createElement;
const { useEffect, useState, useRef } = react;

// Configure markdown renderer to do the right thing to links.
const NIB_SCHEME = "nib://";
const defaultRenderLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  // Check to see if the target of this link is a local wiki thing or what.
  // Note that I don't really think this is correct, but it migh be close...
  const token = tokens[idx];
  const aIndex = token.attrIndex("href");
  let href = aIndex >= 0 ? token.attrs[aIndex][1] : "";
  if (!href) {
    // if target is empty then actually we need to be looking at the next tokens
    // until we have a link_close I guess?
    for (let i = idx + 1; i < tokens.length; i++) {
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

  return defaultRenderLinkOpen(tokens, idx, options, env, self);
};

function WikiCard({ slug, store, onNavigate }) {
  const [mode, setMode] = useState("loading");
  const [content, setContent] = useState(undefined);

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

  return e(
    "div",
    null,
    e("h1", null, slug),
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

function WikiContents({ mode, content, onNavigate, onEdit, onSave, onCancel }) {
  switch (mode) {
    case "loading":
      return e("div", null, "Loading...");
    case "error":
      return e("div", null, "An error occurred, sorry.");
    case "loaded":
      return e(WikiElement, { content, onNavigate, onEdit });
    case "editing":
      return e(WikiEditor, { content, onSave, onCancel });
    case "saving":
      return e("div", null, "Saving, please wait...");
  }
}

function WikiEditor({ content, onSave, onCancel }) {
  const [text, setText] = useState(content || "");

  return e(
    "form",
    null,
    e("textarea", {
      rows: 22,
      cols: 80,
      value: text,
      onChange: e => setText(e.target.value)
    }),
    e(
      "div",
      null,
      e("button", { onClick: () => onSave(text) }, "Save"),
      e("button", { onClick: onCancel }, "Cancel")
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
    null,
    e("div", {
      dangerouslySetInnerHTML: {
        __html: md.render(content || "*Nothing here yet!*")
      },
      ref: contentElementRef
    }),
    e(
      "a",
      {
        onClick: onEdit,
        style: { color: "blue", textDecoration: "underline", cursor: "pointer" }
      },
      "click here to edit this"
    )
  );
}

module.exports = { WikiCard };
