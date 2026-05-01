import internal from "#internal";
import { defu } from "defu";

export function test(): string {
  return "test bundled: " + internal + JSON.stringify(defu({}, {}));
}

export default "default export";
