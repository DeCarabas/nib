import {
  h,
  Component,
  render,
  ComponentType,
  ComponentChildren
} from "./extern/preact.10.1.1/preact";

import { useRef } from "./extern/preact.10.1.1/hooks";
import { Storage } from "./storage";
import { WikiView, WikiEditor, NibDocument, NibDocumentContent } from "./wiki";
import { icon } from "./icons";

interface ContentPageProps {
  initialDocument: string;
  store: Storage;
}

interface HistoryEntry {
  slug: string;
  action: string;
  key: number;
}

interface ContentPageState {
  history: HistoryEntry[][];
  focus: { columnIndex: number; cardIndex: number };
  documents: { [key: string]: NibDocument };
}

class ContentPage extends Component<ContentPageProps, ContentPageState> {
  nextKey: number;

  constructor(props: ContentPageProps) {
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

  close(columnIndex: number, cardIndex: number) {
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

  navigate(
    columnIndex: number,
    cardIndex: number,
    target: string,
    action: string
  ) {
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

  load(slug: string) {
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

  save(slug: string, content: NibDocumentContent) {
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
          ? (el: any) => {
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
            onNavigate: (target: string, action: string) =>
              this.navigate(columnIndex, cardIndex, target, action),
            onSave: (newContent: NibDocumentContent) =>
              this.save(slug, newContent)
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

type CloseCallback = () => void;
type NavigateCallback = (target: string, action: string) => void;
type SaveCallback = (newContent: NibDocumentContent) => void;

interface HandlerProps {
  slug: string;
  document: NibDocument;
  onNavigate: NavigateCallback;
  onSave: SaveCallback;
}

interface Handler {
  description: string;
  initialContent: string;
  actions: {
    [action: string]: ComponentType<HandlerProps>;
  };
}

const HANDLERS: { [contentType: string]: Handler } = {
  wiki: {
    description: "A wiki document",
    initialContent: "*There's nothing here yet!*",
    actions: {
      view: WikiView,
      edit: WikiEditor
    }
  }
};

function canEdit(document: NibDocument) {
  return (
    document &&
    document.content &&
    HANDLERS[document.content.contentType] &&
    HANDLERS[document.content.contentType].actions["edit"]
  );
}

interface CardProps {
  focused: boolean;
  slug: string;
  action: string;
  document: NibDocument;
  onClose: CloseCallback;
  onNavigate: NavigateCallback;
  onSave: SaveCallback;
}

function Card({
  focused,
  slug,
  action,
  document,
  onClose,
  onNavigate,
  onSave
}: CardProps) {
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

interface CardBoxProps {
  focused: boolean;
  onClose: () => void;
  onEdit: () => void;
  children: ComponentChildren[];
}

function CardBox({ focused, onClose, onEdit, children }: CardBoxProps) {
  return h(
    "div",
    { className: "card-box-container hide-child" },
    h(
      "div",
      { className: "gc1 pt3 pl1 child pointer" },
      h(
        "div",
        { className: "pointer", onClick: () => onClose() },
        h(icon, { name: "x-square" })
      ),
      onEdit
        ? h(
            "div",
            { className: "pointer", onClick: () => onEdit() },
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

interface CardContentProps {
  slug: string;
  action: string;
  document: NibDocument;
  onNavigate: NavigateCallback;
  onSave: SaveCallback;
}

function CardContent({
  slug,
  action,
  document,
  onNavigate,
  onSave
}: CardContentProps) {
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
        const handler = typeHandlers.actions[action];
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

interface ErrorContentProps {
  message: string;
}

function ErrorContent({ message }: ErrorContentProps) {
  return h("i", null, message);
}

function MissingDocumentHandler({ slug, onSave }: HandlerProps) {
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
          onClick: () => {
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
