declare module "*.svg?react" {
  import type { FunctionComponent, JSX } from "preact";
  const component: FunctionComponent<JSX.SVGAttributes<SVGSVGElement>>;
  export default component;
}
