import { isIP } from "node:net";

export const isLoopbackHost = (hostname: string) => {
  const host =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  if (isIP(host) === 4) return host.startsWith("127.");
  if (isIP(host) === 6) return new URL(`http://[${host}]`).hostname === "[::1]";
  return host.toLowerCase() === "localhost";
};

export const assertStorageBucket = (bucket: string) => {
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    /\.\.|\.-|-\./.test(bucket)
  )
    throw new Error("Invalid object storage bucket.");
};

export const assertObjectKey = (objectKey: string) => {
  const hasControl = [...objectKey].some((character) => {
    const code = character.codePointAt(0) ?? -1;
    return code < 32 || code === 127;
  });
  if (
    objectKey.includes("\\") ||
    hasControl ||
    Buffer.byteLength(objectKey) > 1024 ||
    objectKey.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid object storage object key.");
};

export const normalizedPublicBaseUrl = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid public object storage URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    (url.protocol === "http:" && !isLoopbackHost(url.hostname)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Public object storage URLs require HTTPS without credentials, query or fragment.",
    );
  const href = url.href;
  let end = href.length;
  while (href[end - 1] === "/") end -= 1;
  return href.slice(0, end);
};

export const publicObjectUrl = (
  baseUrl: string,
  bucket: string,
  objectKey: string,
) => {
  assertStorageBucket(bucket);
  assertObjectKey(objectKey);
  return `${normalizedPublicBaseUrl(baseUrl)}/${bucket}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
};
