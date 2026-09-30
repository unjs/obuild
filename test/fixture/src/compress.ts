import { request } from "undici";
import { defu } from "defu";

export async function get(url: string): Promise<string> {
  const res = await request(url);
  return JSON.stringify(defu({ status: res.statusCode }, { body: await res.body.text() }));
}
