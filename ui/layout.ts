import { h, VNode } from "./extern/preact.10.1.1/preact";
import { useState, useRef, useEffect } from "./extern/preact.10.1.1/hooks";
import { icon } from "./icons";

/**
 * Compute the offset of an element relative to the page.
 * @param elem The element to get the offset of.
 */
function offset(elem: Element) {
  let x: number = 0;
  let y: number = 0;
  while (elem && elem instanceof HTMLElement) {
    x += elem.offsetLeft;
    y += elem.offsetTop;
    elem = elem.offsetParent;
  }
  return { x, y };
}

interface DraggableCardProps {
  title: string;
  initialLeft: number;
  initialTop: number;
  onClose: () => void;
  onEdit: () => void;
  children: VNode<any>[];
}

export function DraggableCard({
  title,
  initialLeft,
  initialTop,
  onClose,
  onEdit,
  children
}: DraggableCardProps) {
  // This implementation based on http://dotyl.ink/l/5qt2k53uqa and
  // http://jsfiddle.net/Af9Jt/2/
  const [pos, setPos] = useState({ x: initialLeft, y: initialTop });
  const [dragging, setDragging] = useState(false);
  const [rel, setRel] = useState({ x: NaN, y: NaN });
  const ref = useRef<SVGElement>(null);

  const className = "drag-card ba bg-white";
  const style = { position: "absolute", left: pos.x, top: pos.y };
  const onMouseDown = (evt: MouseEvent) => {
    if (evt.button === 0) {
      const pos = offset(ref.current);
      setDragging(true);
      setRel({ x: evt.pageX - pos.x, y: evt.pageY - pos.y });

      evt.stopPropagation();
      evt.preventDefault();
    }
  };
  const onMouseUp = (evt: MouseEvent) => {
    setDragging(false);
    evt.stopPropagation();
    evt.preventDefault();
  };
  const onMouseMove = (evt: MouseEvent) => {
    if (dragging) {
      setPos({ x: evt.pageX - rel.x, y: evt.pageY - rel.y });
      evt.stopPropagation();
      evt.preventDefault();
    }
  };

  useEffect(() => {
    if (dragging) {
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      return () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
    }
  }, [dragging]);

  return h(
    "div",
    { className, style },
    h(
      "div",
      {
        class: "drag-title",
        ref,
        onMouseDown,
        onMouseUp,
        onMouseMove
      },
      title
    ),
    h("div", { class: "drag-content" }, children)
  );
}
