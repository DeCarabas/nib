const react = require("react");
const reactDom = require("react-dom");
const storage = require("./storage");
const wiki = require("./wiki");

const e = react.createElement;

const store = new storage.Storage("."); // TODO This sucks

reactDom.render(
  e(wiki.WikiCard, { slug: "index", store }),
  document.getElementById("root")
);
