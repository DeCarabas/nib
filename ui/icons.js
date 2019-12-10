import "https://unpkg.com/feather-icons@4.24.1/dist/feather.js?module";
import { h } from "https://unpkg.com/preact@latest?module";

export function icon({ name, attrs }) {
  return h("div", {
    dangerouslySetInnerHTML: {
      __html: feather.icons[name].toSvg(attrs)
    }
  });
}
