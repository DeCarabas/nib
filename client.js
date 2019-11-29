const react = require("react");
const reactDom = require("react-dom");
const storage = require("./storage");
const wiki = require("./wiki");

const { useEffect, useRef, useState } = react;
const e = react.createElement;

function ContentPage({ initialDocument, store }) {
  const [history, setHistory] = useState(["index"]);
  const cardRefs = useRef([]);

  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, history.length);
    if (cardRefs.current) {
      const focus = cardRefs.current[history.length - 1];
      if (focus) {
        const rect = focus.getBoundingClientRect();
        window.scrollTo({
          left: Math.max(0, rect.left - 10),
          top: Math.max(0, rect.top - 10),
          behavior: "smooth"
        });
      }
    }
  });

  // Rebuild the grid. As history becomes more sophisticated so will this.
  const columns = history.map(_ => "auto").join(" ");
  const cards = history.map((slug, i) =>
    e(
      "div",
      {
        key: i.toString(),
        style: { gridColumnStart: i + 1 },
        ref: el => (cardRefs.current[i] = el)
      },
      e(Card, {
        slug,
        store,
        onNavigate: x => {
          const newHistory = history.slice(0, i + 1);
          newHistory.push(x);
          setHistory(newHistory);
        }
      })
    )
  );

  return e(
    "div",
    {
      style: { display: "grid", gridTemplateColumns: columns },
      overflow: "scroll"
    },
    cards
  );
}

function Card({ slug, store, onNavigate }) {
  return e(
    "div",
    { className: "ba pa3 ma2 w6 relative" },
    e(wiki.WikiCard, { slug, store, onNavigate })
  );
}

const store = new storage.Storage("."); // TODO This sucks
reactDom.render(
  e(ContentPage, { initialDocument: "index", store }),
  document.getElementById("root")
);
