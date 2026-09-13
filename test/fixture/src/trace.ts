import { defu } from "defu";
import { join } from "pathe";

export function traced(): string {
  return join("a", "b") + JSON.stringify(defu({}, {}));
}
