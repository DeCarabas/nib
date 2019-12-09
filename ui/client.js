import "https://unpkg.com/feather-icons@4.24.1/dist/feather.js?module";
import { h, Component, render } from "https://unpkg.com/preact@latest?module";
import { Storage } from "./storage.js";
import { WikiView, WikiEditor } from "./wiki.js";

class ContentPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      history: [[]],
      focus: { columnIndex: 0, cardIndex: 0 },
      documents: {}
    };
  }

  componentDidMount() {
    this.navigate(0, -1, this.props.initialDocument, "view");
  }

  close(columnIndex, cardIndex) {
    const newHistory = this.state.history.slice();
    const column = newHistory[columnIndex];
    newHistory[columnIndex] = column
      .slice(0, cardIndex)
      .concat(column.slice(cardIndex + 1));
    this.setState({ history: newHistory });

    const { cardIndex: focusCard, columnIndex: focusColumn } = this.state.focus;

    if (cardIndex === focusCard && columnIndex === focusColumn) {
      this.setState({ focus: { cardIndex: Math.max(0, focusCard - 1) } });
    }
  }

  navigate(columnIndex, cardIndex, target, action) {
    const newHistory = this.state.history.slice();
    const column = newHistory[columnIndex];
    // TODO: Don't insert if the target is already in the column.
    newHistory[columnIndex] = column
      .slice(0, cardIndex + 1)
      .concat([{ slug: target, action }], column.slice(cardIndex + 1));

    this.setState({
      history: newHistory,
      focus: { columnIndex, cardIndex: cardIndex + 1 }
    });
    this.load(target);
  }

  load(slug) {
    if (!(slug in this.state.documents)) {
      const documents = Object.assign({}, this.state.documents, {
        [slug]: { state: "loading", content: undefined }
      });
      this.setState({ documents });

      this.props.store.getDocument(slug, (err, content) => {
        const documents = Object.assign({}, this.state.documents, {
          [slug]: {
            state: err ? "error" : "loaded",
            content: err || content
          }
        });
        this.setState({ documents });
      });
    }
  }

  save(slug, content) {
    this.props.store.setDocument(
      slug,
      content.contentType,
      content.content,
      err => {
        if (err) {
          // TODO: REPORT
          console.log(err);
        } else {
          const documents = Object.assign({}, this.state.documents, {
            [slug]: { state: "loaded", content }
          });
          this.setState({ documents });
        }
      }
    );
  }

  render() {
    const { columnIndex: focusColumn, cardIndex: focusCard } = this.state.focus;
    const columns = this.state.history.map(_ => "auto").join(" ");
    const cards = this.state.history.map((column, columnIndex) =>
      column.map(({ slug, action }, cardIndex) => {
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
        const document = this.state.documents[slug];
        return h(
          "div",
          {
            key,
            ref,
            style: { gridColumnStart: columnIndex + 1 }
          },
          h(
            CardBox,
            { key, focused, onClose: () => this.close(columnIndex, cardIndex) },
            h(Card, {
              slug,
              action,
              document,
              onNavigate: (target, action) =>
                this.navigate(columnIndex, cardIndex, target, action),
              onSave: newContent => this.save(slug, newContent)
            })
          )
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

function CardBox({ focused, onClose, children }) {
  return h(
    "div",
    {
      className: "pa3 ma2 ba w6 relative" + (focused ? "" : " b--light-gray"),
      style: {
        display: "grid",
        gridTemplateRows: "auto 1fr"
      }
    },
    h(
      "div",
      { style: { gridRowStart: 1 } },
      h(
        "a",
        {
          onClick: () => onClose(),
          style: { cursor: "pointer" }
        },
        h("div", {
          dangerouslySetInnerHTML: {
            __html: feather.icons["x-circle"].toSvg()
          }
        })
      )
    ),
    h("div", { style: { gridRowStart: 2 } }, children)
  );
}

const HANDLERS = {
  wiki: {
    view: WikiView,
    edit: WikiEditor
  }
};

function Card({ slug, action, document, onNavigate, onSave }) {
  const { state, content } = document;

  switch (state) {
    case "loading":
      return h("i", null, "Loading...");

    case "error":
      return h(ErrorContent, { message: "An Error Has Occurred: " + content });

    case "loaded": {
      const typeHandlers = HANDLERS[content.contentType];
      if (!typeHandlers) {
        return h(ErrorContent, {
          message: `I don't know how to handle ${content.contentType} content. :(`
        });
      } else {
        const handler = typeHandlers[action];
        if (!handler) {
          return h(ErrorContent, {
            message: `I don't know how to ${action} a ${content.contentType} :(`
          });
        } else {
          return h(handler, { slug, document, onNavigate, onSave });
        }
      }
    }

    default:
      return h(ErrorContent, { message: `I don't understand state ${state}` });
  }
}

function ErrorContent({ message }) {
  return h("i", null, message);
}

const store = new Storage("."); // TODO This sucks
render(
  h(ContentPage, { initialDocument: "index", store }),
  document.getElementById("root")
);
