// @ts-expect-error TypeScript does not implement the import bytes proposal yet
import bytes from "./files/bytes.bin" with { type: "bytes" };
// @ts-expect-error TypeScript does not implement the import text proposal yet
import text from "./files/hello.txt" with { type: "text" };
// @ts-expect-error `.json` imported as text (file type is ignored)
import jsonAsText from "./files/data.json" with { type: "text" /* } */ };
// @ts-expect-error `.txt` imported as bytes (file type is ignored)
export { default as textAsBytes } from "./files/hello.txt" with { type: "bytes" };

export { bytes, text, jsonAsText };

export async function dynamic(): Promise<{ bytes: Uint8Array; text: string }> {
  // @ts-expect-error TypeScript does not implement the import bytes proposal yet
  const { default: dynamicBytes } = await import("./files/dynamic.txt", {
    with: { type: "bytes" },
  });
  // @ts-expect-error TypeScript does not implement the import text proposal yet
  const { default: dynamicText } = await import("./files/dynamic.txt", { with: { type: "text" } });
  return { bytes: dynamicBytes, text: dynamicText };
}
