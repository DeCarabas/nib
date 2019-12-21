import {
  h,
  Component,
  render,
  ComponentType,
  ComponentChildren
} from "./extern/preact.10.1.1/preact";

import { useRef } from "./extern/preact.10.1.1/hooks";
import { Storage } from "./storage";
import { WikiView, WikiEditor } from "./wiki";
import { icon } from "./icons";
import {
  NavigatePosition,
  NavigateCallback,
  SaveCallback,
  CloseCallback,
  NibDocument,
  NibDocumentContent,
  HandlerProps
} from "./types";
import { DraggableCard } from "./layout";

interface ContentPageProps {
  initialDocument: string;
  store: Storage;
}

interface HistoryEntry {
  slug: string;
  action: string;
  key: number;
  start: number;
  height: number;
}

interface ContentPageState {
  history: HistoryEntry[][];
  focus: number[];
  documents: { [key: string]: NibDocument };
}

class ContentPage extends Component<ContentPageProps, ContentPageState> {
  nextKey: number;

  constructor(props: ContentPageProps) {
    super(props);
    this.state = {
      history: [[]],
      focus: [],
      documents: {}
    };
    this.nextKey = 0;
  }

  componentDidMount() {
    this.navigate(0, -1, this.props.initialDocument, "view", "below");
  }

  close(columnIndex: number, cardIndex: number) {
    const victim = (this.state.history[columnIndex] || [])[cardIndex];

    const newHistory = this.state.history.slice();
    const column = newHistory[columnIndex];
    const cardHeight = victim?.height || 0;
    newHistory[columnIndex] = column
      .slice(0, cardIndex)
      .concat(
        column
          .slice(cardIndex + 1)
          .map(c => Object.assign({}, c, { start: c.start - cardHeight }))
      );
    this.setState({
      history: newHistory,
      focus: this.state.focus.filter(key => key !== victim?.key)
    });
  }

  navigate(
    columnIndex: number,
    cardIndex: number,
    target: string,
    action: string,
    position: NavigatePosition
  ) {
    const height = 4;

    // console.log("Navigate:", columnIndex, cardIndex, target, action);
    const history = this.state.history;
    const targetCard = (history[columnIndex] || [])[cardIndex];

    if (position == "below") {
      const column = history[columnIndex] || [];
      const start = targetCard ? targetCard.start + targetCard.height : 0;
      const nc = { slug: target, action, key: this.nextKey, start, height };
      const newColumn = [
        ...column.slice(0, cardIndex + 1),
        nc,
        ...column
          .slice(cardIndex + 1)
          .map(c => Object.assign({}, c, { start: c.start + height }))
      ];
      this.nextKey += 1;

      const newHistory = [
        ...history.slice(0, Math.max(columnIndex - 1, 0)),
        newColumn,
        ...history.slice(columnIndex + 1)
      ];
      this.setState({
        history: newHistory,
        focus: [...this.state.focus, nc.key]
      });
    } else if (position == "right") {
      const column = history[columnIndex + 1] || [];
      const start = targetCard ? targetCard.start : 0;

      const index = column.findIndex(c => c.start >= start);
      const targetIndex = index >= 0 ? index : column.length;

      const nc = { slug: target, action, key: this.nextKey, start, height };
      const newColumn = [
        ...column.slice(0, targetIndex),
        nc,
        ...column
          .slice(targetIndex)
          .map(c => Object.assign({}, c, { start: c.start + height }))
      ];
      this.nextKey += 1;

      const newHistory = [
        ...history.slice(0, columnIndex + 1),
        newColumn,
        ...history.slice(columnIndex + 2)
      ];
      this.setState({
        history: newHistory,
        focus: [...this.state.focus, nc.key]
      });
    }

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
    const cards = this.state.history.map((column, columnIndex) =>
      column.map(({ slug, action, key, start, height }, cardIndex) => {
        // If this is the focused card then when we get the ref we scroll to
        // the correct position.
        const focused = key == this.state.focus[this.state.focus.length - 1];
        const ref = focused
          ? (el: Element) => el?.scrollIntoView({ behavior: "smooth" })
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
            onNavigate: (
              target: string,
              action: string,
              position: NavigatePosition
            ) =>
              this.navigate(columnIndex, cardIndex, target, action, position),
            onSave: (newContent: NibDocumentContent) =>
              this.save(slug, newContent)
          })
        );
      })
    );

    return h(
      "div",
      {
        style: {
          display: "grid",
          gridAutoColumns: "auto",
          gridAutoRows: "minmax(2rem, auto)"
        },
        overflow: "scroll"
      },
      cards
    );
  }
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
          ? () => onNavigate(slug, "edit", "right")
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
    { className: "card-box-container hide-child h-100" },
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

// const store = new Storage("."); // TODO This sucks
// render(
//   h(ContentPage, { initialDocument: "index", store }),
//   document.getElementById("root")
// );

render(
  h(
    "div",
    { style: { position: "relative", height: "100%" } },
    h(
      DraggableCard,
      { title: "what", initialLeft: 0, initialTop: 0 },
      h("div", null, "WHAT UP")
    ),
    h(
      DraggableCard,
      { title: "this", initialLeft: 100, initialTop: 100 },
      h("div", null, "DOG")
    )
  ),
  document.getElementById("root")
);
