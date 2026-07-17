import { register } from "node:module";
import { verifySealedTransformerInstallationV6 } from "./sealed-transform-launcher.mjs";

if (!process.env.QGEN_V6_TRANSFORM_CAPTURE_PATH) {
  throw new Error("sealed transform capture path is absent");
}
// This plain-JavaScript preload runs before any authority TypeScript is
// transformed, so even a direct exact-register invocation cannot skip the
// complete package and implementation byte verification.
verifySealedTransformerInstallationV6();
register(new URL("./tsx-transform-capture-loader.mjs", import.meta.url), {
  parentURL: import.meta.url,
  data: {},
});
