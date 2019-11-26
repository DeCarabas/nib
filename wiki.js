const md = require("markdown-it")();
const react = require("react");

const e = react.createElement;
const { useState } = react;

function WikiCard({ slug, store }) {
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

function WikiContents({ mode, content, onEdit, onSave, onCancel }) {
  switch (mode) {
    case "loading":
      return e("div", null, "Loading...");
    case "error":
      return e("div", null, "An error occurred, sorry.");
    case "loaded":
      return e(WikiElement, { content, onEdit });
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

function WikiElement({ content, onEdit }) {
  return e(
    "div",
    null,
    e("div", {
      dangerouslySetInnerHTML: {
        __html: md.render(content || "*Nothing here yet!*")
      }
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
