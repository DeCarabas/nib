import { h, Component, render } from "https://unpkg.com/preact@latest?module";
import { useRef } from "https://unpkg.com/preact@latest/hooks/dist/hooks.module.js?module";
import { Storage } from "./storage.js";
import { WikiView, WikiEditor } from "./wiki.js";
import { icon } from "./icons.js";

class ContentPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      history: [[]],
      focus: { columnIndex: 0, cardIndex: 0 },
      documents: {}
    };
    this.nextKey = 0;
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
      this.setState({
        focus: {
          cardIndex: Math.max(0, focusCard - 1),
          columnIndex: focusColumn
        }
      });
    }
  }

  navigate(columnIndex, cardIndex, target, action) {
    // console.log("Navigate:", columnIndex, cardIndex, target, action);
    const newHistory = this.state.history.slice();
    const column = newHistory[columnIndex];
    // TODO: Don't insert if the target is already in the column.
    newHistory[columnIndex] = column
      .slice(0, cardIndex + 1)
      .concat(
        [{ slug: target, action, key: this.nextKey }],
        column.slice(cardIndex + 1)
      );
    this.nextKey += 1;

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
      column.map(({ slug, action, key }, cardIndex) => {
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
        return h(
          "div",
          { key, ref, style: { gridColumnStart: columnIndex + 1 } },
          h(Card, {
            focused,
            slug,
            action,
            document: this.state.documents[slug],
            onClose: () => this.close(columnIndex, cardIndex),
            onNavigate: (target, action) =>
              this.navigate(columnIndex, cardIndex, target, action),
            onSave: newContent => this.save(slug, newContent)
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

const HANDLERS = {
  wiki: {
    description: "A wiki document",
    initialContent: "*There's nothing here yet!*",
    view: WikiView,
    edit: WikiEditor
  }
};

function canEdit(document) {
  return (
    document &&
    document.content &&
    HANDLERS[document.content.contentType] &&
    HANDLERS[document.content.contentType]["edit"]
  );
}

function Card({
  focused,
  slug,
  action,
  document,
  onClose,
  onNavigate,
  onSave
}) {
  return h(
    CardBox,
    {
      focused,
      onClose,
      onEdit:
        action !== "edit" && canEdit(document)
          ? () => onNavigate(slug, "edit")
          : null
    },
    h(CardContent, { slug, action, document, onNavigate, onSave })
  );
}

function CardBox({ focused, onClose, onEdit, children }) {
  return h(
    "div",
    { className: "card-box-container hide-child" },
    h(
      "div",
      { className: "gc1 pt3 pl1 child pointer" },
      h(
        "div",
        { className: "pointer", onClick: _ => onClose() },
        h(icon, { name: "x-square" })
      ),
      onEdit
        ? h(
            "div",
            { className: "pointer", onClick: _ => onEdit() },
            h(icon, { name: "edit" })
          )
        : null
    ),
    h(
      "div",
      {
        className:
          "gc2 pa3 ma2 ba w6 relative" + (focused ? "" : " b--light-gray")
      },
      children
    )
  );
}

function CardContent({ slug, action, document, onNavigate, onSave }) {
  const { state, content } = document;

  switch (state) {
    case "loading":
      return h("i", null, "Loading...");

    case "error":
      return h(ErrorContent, { message: "An Error Has Occurred: " + content });

    case "loaded": {
      const handlerProps = { slug, document, onNavigate, onSave };
      if (content.contentType === undefined) {
        return h(MissingDocumentHandler, handlerProps);
      }

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
          return h(handler, handlerProps);
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

function MissingDocumentHandler({ slug, document, onNavigate, onSave }) {
  const contentTypeRef = useRef(null);
  return h(
    "div",
    null,
    h("h1", { className: "f3 lh-title" }, slug),
    h("p", null, "There is nothing here yet. What kind of thing should it be?"),
    h(
      "div",
      null,
      h(
        "select",
        { className: "w5", ref: contentTypeRef },
        Object.keys(HANDLERS).map(key =>
          h("option", { value: key, key }, HANDLERS[key].description)
        )
      ),
      h(
        "span",
        {
          className: "dib tc ba ma1 pa1 w4 pointer",
          onClick: _ => {
            const contentType = contentTypeRef.current.value;
            const content = HANDLERS[contentType].initialContent;
            onSave({ contentType, content });
          }
        },
        "Create It!"
      )
    )
  );
}

const store = new Storage("."); // TODO This sucks
render(
  h(ContentPage, { initialDocument: "index", store }),
  document.getElementById("root")
);
