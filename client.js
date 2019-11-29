const react = require("react");
const reactDom = require("react-dom");
const storage = require("./storage");
const wiki = require("./wiki");

const e = react.createElement;

class ContentPage extends react.Component {
  constructor(props) {
    super(props);
    this.state = {
      history: [[props.initialDocument]],
      focus: { columnIndex: 0, cardIndex: 0 }
    };
    this.cardRefs = [[]];
  }

  navigate(columnIndex, cardIndex, target) {
    const newHistory = this.state.history.slice();
    const column = newHistory[columnIndex];
    // TODO: Don't insert if the target is already in the column.
    newHistory[columnIndex] = column
      .slice(0, cardIndex + 1)
      .concat([target], column.slice(cardIndex + 1));

    this.setState({
      history: newHistory,
      focus: { columnIndex, cardIndex: cardIndex + 1 }
    });
  }

  render() {
    const columns = this.state.history.map(_ => "auto").join(" ");
    const cards = this.state.history.map((column, columnIndex) =>
      column.map((slug, cardIndex) => {
        const key = columnIndex.toString() + ":" + cardIndex.toString();
        return e(
          "div",
          {
            key,
            style: { gridColumnStart: columnIndex + 1 },
            ref: el => (this.cardRefs[columnIndex][cardIndex] = el)
          },
          e(Card, {
            key,
            slug,
            store,
            onNavigate: slug => this.navigate(columnIndex, cardIndex, slug)
          })
        );
      })
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
