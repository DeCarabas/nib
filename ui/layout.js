(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./extern/preact.10.1.1/preact", "./extern/preact.10.1.1/hooks"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const preact_1 = require("./extern/preact.10.1.1/preact");
    const hooks_1 = require("./extern/preact.10.1.1/hooks");
    /**
     * Compute the offset of an element relative to the page.
     * @param elem The element to get the offset of.
     */
    function offset(elem) {
        let x = 0;
        let y = 0;
        while (elem && elem instanceof HTMLElement) {
            x += elem.offsetLeft;
            y += elem.offsetTop;
            elem = elem.offsetParent;
        }
        return { x, y };
    }
    function DraggableCard({ title, initialLeft, initialTop, onClose, onEdit, children }) {
        // This implementation based on http://dotyl.ink/l/5qt2k53uqa and
        // http://jsfiddle.net/Af9Jt/2/
        const [pos, setPos] = hooks_1.useState({ x: initialLeft, y: initialTop });
        const [dragging, setDragging] = hooks_1.useState(false);
        const [rel, setRel] = hooks_1.useState({ x: NaN, y: NaN });
        const ref = hooks_1.useRef(null);
        const className = "drag-card ba bg-white";
        const style = { position: "absolute", left: pos.x, top: pos.y };
        const onMouseDown = (evt) => {
            if (evt.button === 0) {
                const pos = offset(ref.current);
                setDragging(true);
                setRel({ x: evt.pageX - pos.x, y: evt.pageY - pos.y });
                evt.stopPropagation();
                evt.preventDefault();
            }
        };
        const onMouseUp = (evt) => {
            setDragging(false);
            evt.stopPropagation();
            evt.preventDefault();
        };
        const onMouseMove = (evt) => {
            if (dragging) {
                setPos({ x: evt.pageX - rel.x, y: evt.pageY - rel.y });
                evt.stopPropagation();
                evt.preventDefault();
            }
        };
        hooks_1.useEffect(() => {
            if (dragging) {
                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
                return () => {
                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                };
            }
            else {
                return null;
            }
        }, [dragging]);
        return preact_1.h("div", { className, style }, preact_1.h("div", {
            class: "drag-title",
            ref,
            onMouseDown,
            onMouseUp,
            onMouseMove
        }, title), preact_1.h("div", { class: "drag-content" }, children));
    }
    exports.DraggableCard = DraggableCard;
});
//# sourceMappingURL=layout.js.map