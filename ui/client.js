(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./extern/preact.10.1.1/preact", "./extern/preact.10.1.1/hooks", "./storage", "./wiki", "./icons"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const preact_1 = require("./extern/preact.10.1.1/preact");
    const hooks_1 = require("./extern/preact.10.1.1/hooks");
    const storage_1 = require("./storage");
    const wiki_1 = require("./wiki");
    const icons_1 = require("./icons");
    class ContentPage extends preact_1.Component {
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
                .concat([{ slug: target, action, key: this.nextKey }], column.slice(cardIndex + 1));
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
            this.props.store.setDocument(slug, content.contentType, content.content, err => {
                if (err) {
                    // TODO: REPORT
                    console.log(err);
                }
                else {
                    const documents = Object.assign({}, this.state.documents, {
                        [slug]: { state: "loaded", content }
                    });
                    this.setState({ documents });
                }
            });
        }
        render() {
            const { columnIndex: focusColumn, cardIndex: focusCard } = this.state.focus;
            const columns = this.state.history.map(_ => "auto").join(" ");
            const cards = this.state.history.map((column, columnIndex) => column.map(({ slug, action, key }, cardIndex) => {
                // If this is the focused card then when we get the ref we scroll to
                // the correct position.
                const focused = columnIndex === focusColumn && cardIndex == focusCard;
                const ref = focused
                    ? (el) => {
                        if (el) {
                            const rect = el.getBoundingClientRect();
                            window.requestAnimationFrame(() => window.scrollTo({
                                top: Math.max(0, rect.top - 10),
                                left: Math.max(0, rect.left - 10),
                                behavior: "smooth"
                            }));
                        }
                    }
                    : null;
                return preact_1.h("div", { key, ref, style: { gridColumnStart: columnIndex + 1 } }, preact_1.h(Card, {
                    focused,
                    slug,
                    action,
                    document: this.state.documents[slug],
                    onClose: () => this.close(columnIndex, cardIndex),
                    onNavigate: (target, action) => this.navigate(columnIndex, cardIndex, target, action),
                    onSave: (newContent) => this.save(slug, newContent)
                }));
            }));
            return preact_1.h("div", {
                style: { display: "grid", gridTemplateColumns: columns },
                overflow: "scroll"
            }, cards);
        }
    }
    const HANDLERS = {
        wiki: {
            description: "A wiki document",
            initialContent: "*There's nothing here yet!*",
            actions: {
                view: wiki_1.WikiView,
                edit: wiki_1.WikiEditor
            }
        }
    };
    function canEdit(document) {
        return (document &&
            document.content &&
            HANDLERS[document.content.contentType] &&
            HANDLERS[document.content.contentType].actions["edit"]);
    }
    function Card({ focused, slug, action, document, onClose, onNavigate, onSave }) {
        return preact_1.h(CardBox, {
            focused,
            onClose,
            onEdit: action !== "edit" && canEdit(document)
                ? () => onNavigate(slug, "edit")
                : null
        }, preact_1.h(CardContent, { slug, action, document, onNavigate, onSave }));
    }
    function CardBox({ focused, onClose, onEdit, children }) {
        return preact_1.h("div", { className: "card-box-container hide-child" }, preact_1.h("div", { className: "gc1 pt3 pl1 child pointer" }, preact_1.h("div", { className: "pointer", onClick: () => onClose() }, preact_1.h(icons_1.icon, { name: "x-square" })), onEdit
            ? preact_1.h("div", { className: "pointer", onClick: () => onEdit() }, preact_1.h(icons_1.icon, { name: "edit" }))
            : null), preact_1.h("div", {
            className: "gc2 pa3 ma2 ba w6 relative" + (focused ? "" : " b--light-gray")
        }, children));
    }
    function CardContent({ slug, action, document, onNavigate, onSave }) {
        const { state, content } = document;
        switch (state) {
            case "loading":
                return preact_1.h("i", null, "Loading...");
            case "error":
                return preact_1.h(ErrorContent, { message: "An Error Has Occurred: " + content });
            case "loaded": {
                const handlerProps = { slug, document, onNavigate, onSave };
                if (content.contentType === undefined) {
                    return preact_1.h(MissingDocumentHandler, handlerProps);
                }
                const typeHandlers = HANDLERS[content.contentType];
                if (!typeHandlers) {
                    return preact_1.h(ErrorContent, {
                        message: `I don't know how to handle ${content.contentType} content. :(`
                    });
                }
                else {
                    const handler = typeHandlers.actions[action];
                    if (!handler) {
                        return preact_1.h(ErrorContent, {
                            message: `I don't know how to ${action} a ${content.contentType} :(`
                        });
                    }
                    else {
                        return preact_1.h(handler, handlerProps);
                    }
                }
            }
            default:
                return preact_1.h(ErrorContent, { message: `I don't understand state ${state}` });
        }
    }
    function ErrorContent({ message }) {
        return preact_1.h("i", null, message);
    }
    function MissingDocumentHandler({ slug, onSave }) {
        const contentTypeRef = hooks_1.useRef(null);
        return preact_1.h("div", null, preact_1.h("h1", { className: "f3 lh-title" }, slug), preact_1.h("p", null, "There is nothing here yet. What kind of thing should it be?"), preact_1.h("div", null, preact_1.h("select", { className: "w5", ref: contentTypeRef }, Object.keys(HANDLERS).map(key => preact_1.h("option", { value: key, key }, HANDLERS[key].description))), preact_1.h("span", {
            className: "dib tc ba ma1 pa1 w4 pointer",
            onClick: () => {
                const contentType = contentTypeRef.current.value;
                const content = HANDLERS[contentType].initialContent;
                onSave({ contentType, content });
            }
        }, "Create It!")));
    }
    const store = new storage_1.Storage("."); // TODO This sucks
    preact_1.render(preact_1.h(ContentPage, { initialDocument: "index", store }), document.getElementById("root"));
});
//# sourceMappingURL=client.js.map