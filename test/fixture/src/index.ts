import internal from "#internal";

export function test(): string {
  return "test bundled: " + internal;
}

export default "default export";
