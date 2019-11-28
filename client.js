const react = require("react");
const reactDom = require("react-dom");
const storage = require("./storage");
const wiki = require("./wiki");

const { useState } = react;
const e = react.createElement;

function ContentPage({ initialDocument, store }) {
  const [root, setRoot] = useState("index");

  return e(Card, {
    key: root,
    slug: root,
    store,
    onNavigate: setRoot
  });
}

function Card({ slug, store, onNavigate }) {
  return e(
    "div",
    { className: "ba pa3 ma2 mw6 relative" },
    e(wiki.WikiCard, { slug, store, onNavigate })
  );
}

const store = new storage.Storage("."); // TODO This sucks
reactDom.render(
  e(ContentPage, { initialDocument: "index", store }),
  document.getElementById("root")
);
