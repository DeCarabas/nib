import { h, Component, render } from "https://unpkg.com/preact@latest?module";
import { Storage } from "./storage.js";
import { WikiCard } from "./wiki.js";

class ContentPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      history: [[props.initialDocument]],
      focus: { columnIndex: 0, cardIndex: 0 }
    };
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
    const { columnIndex: focusColumn, cardIndex: focusCard } = this.state.focus;
    const columns = this.state.history.map(_ => "auto").join(" ");
    const cards = this.state.history.map((column, columnIndex) =>
      column.map((slug, cardIndex) => {
        // If this is the focused card then when we get the ref we scroll to
        // the correct position.
        const focused = columnIndex === focusColumn && cardIndex == focusCard;
        const ref = focused
          ? el => {
              if (el) {
                const rect = el.getBoundingClientRect();
                window.requestAnimationFrame(() =>
                  window.scrollTo({
                    top: Math.max(0, rect.top - 10),
                    left: Math.max(0, rect.left - 10),
                    behavior: "smooth"
                  })
                );
              }
            }
          : null;
        const key = columnIndex.toString() + ":" + cardIndex.toString();
        return h(
          "div",
          {
            key,
            ref,
            style: { gridColumnStart: columnIndex + 1 }
          },
          h(Card, {
            key,
            slug,
            store,
            focused,
            onNavigate: slug => this.navigate(columnIndex, cardIndex, slug)
          })
        );
      })
    );

    return h(
      "div",
      {
        style: { display: "grid", gridTemplateColumns: columns },
        overflow: "scroll"
      },
      cards
    );
  }
}

function Card({ focused, slug, store, onNavigate }) {
  return h(
    "div",
    { className: "pa3 ma2 ba w6 relative" + (focused ? "" : " b--light-gray") },
    h(WikiCard, { slug, store, onNavigate })
  );
}

const store = new Storage("."); // TODO This sucks
render(
  h(ContentPage, { initialDocument: "index", store }),
  document.getElementById("root")
);
