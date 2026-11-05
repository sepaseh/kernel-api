import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { before, test } from "node:test";

import { LocalFileStorage } from "../src/infrastructure/storage/local.ts";
import {
  collectionRoot as root,
  readBrunoBlock,
  readCollectionJson as read,
  requireCollectionGroups,
} from "./collection.test-support.mjs";

before(() => requireCollectionGroups("files"));

test("file examples follow published local contracts", async () => {
  const uploaded = await read("files/upload/201.json");
  const storage = new LocalFileStorage({
    baseUrl: "http://localhost:3000",
    localStoragePath: "synthetic-not-used",
  });
  assert.equal(
    uploaded.url,
    storage.url("local-public", `${uploaded.id}/logo.svg`, uploaded.visibility),
  );
  const uploadRequest = await readFile(
    path.join(root, "files/upload/index.bru"),
    "utf8",
  );
  assert.match(uploadRequest, /body: multipartForm/);
  const uploadBody = await readBrunoBlock(
    "files/upload/index.bru",
    "body:multipart-form",
  );
  assert.match(uploadBody, /file: @file\(\)/);
});
