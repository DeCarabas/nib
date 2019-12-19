import { h } from "./extern/preact.10.1.1/preact";

export interface IconProperties {
  name: string;
}

export function icon({ name }: IconProperties) {
  return h("img", { src: `icons/${name}.svg`, className: "feather" });
}
