(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./extern/preact.10.1.1/preact", "./extern/preact.10.1.1/hooks", "./wiki", "./icons", "./layout"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const preact_1 = require("./extern/preact.10.1.1/preact");
    const hooks_1 = require("./extern/preact.10.1.1/hooks");
    const wiki_1 = require("./wiki");
    const icons_1 = require("./icons");
    const layout_1 = require("./layout");
    class ContentPage extends preact_1.Component {
        constructor(props) {
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
        close(columnIndex, cardIndex) {
            var _a;
            const victim = (this.state.history[columnIndex] || [])[cardIndex];
            const newHistory = this.state.history.slice();
            const column = newHistory[columnIndex];
            const cardHeight = ((_a = victim) === null || _a === void 0 ? void 0 : _a.height) || 0;
            newHistory[columnIndex] = column
                .slice(0, cardIndex)
                .concat(column
                .slice(cardIndex + 1)
                .map(c => Object.assign({}, c, { start: c.start - cardHeight })));
            this.setState({
                history: newHistory,
                focus: this.state.focus.filter(key => { var _a; return key !== ((_a = victim) === null || _a === void 0 ? void 0 : _a.key); })
            });
        }
        navigate(columnIndex, cardIndex, target, action, position) {
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
            }
            else if (position == "right") {
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
            const cards = this.state.history.map((column, columnIndex) => column.map(({ slug, action, key, start, height }, cardIndex) => {
                // If this is the focused card then when we get the ref we scroll to
                // the correct position.
                const focused = key == this.state.focus[this.state.focus.length - 1];
                const ref = focused
                    ? (el) => { var _a; return (_a = el) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: "smooth" }); }
                    : null;
                return preact_1.h("div", { key, ref, style: { gridColumnStart: columnIndex + 1 } }, preact_1.h(Card, {
                    focused,
                    slug,
                    action,
                    document: this.state.documents[slug],
                    onClose: () => this.close(columnIndex, cardIndex),
                    onNavigate: (target, action, position) => this.navigate(columnIndex, cardIndex, target, action, position),
                    onSave: (newContent) => this.save(slug, newContent)
                }));
            }));
            return preact_1.h("div", {
                style: {
                    display: "grid",
                    gridAutoColumns: "auto",
                    gridAutoRows: "minmax(2rem, auto)"
                },
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
                ? () => onNavigate(slug, "edit", "right")
                : null
        }, preact_1.h(CardContent, { slug, action, document, onNavigate, onSave }));
    }
    function CardBox({ focused, onClose, onEdit, children }) {
        return preact_1.h("div", { className: "card-box-container hide-child h-100" }, preact_1.h("div", { className: "gc1 pt3 pl1 child pointer" }, preact_1.h("div", { className: "pointer", onClick: () => onClose() }, preact_1.h(icons_1.icon, { name: "x-square" })), onEdit
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
    // const store = new Storage("."); // TODO This sucks
    // render(
    //   h(ContentPage, { initialDocument: "index", store }),
    //   document.getElementById("root")
    // );
    preact_1.render(preact_1.h("div", { style: { position: "relative", height: "100%" } }, preact_1.h(layout_1.DraggableCard, { title: "what", initialLeft: 0, initialTop: 0 }, preact_1.h("div", null, "WHAT UP")), preact_1.h(layout_1.DraggableCard, { title: "this", initialLeft: 100, initialTop: 100 }, preact_1.h("div", null, "DOG"))), document.getElementById("root"));
});
//# sourceMappingURL=client.js.map