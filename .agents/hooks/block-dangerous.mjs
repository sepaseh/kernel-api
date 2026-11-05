import fs from "node:fs";
import process from "node:process";

// This optional guard matches a limited set of textual patterns. It is not a
// complete safety boundary and does not prove that a command is authorized.
const block = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

let input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  block("Safety hook received invalid JSON; command blocked.");
}

if (input === null || typeof input !== "object" || Array.isArray(input))
  block("Safety hook received a non-object payload; command blocked.");
const toolInput = Object.hasOwn(input, "tool_input") ? input.tool_input : input;
if (
  toolInput === null ||
  typeof toolInput !== "object" ||
  Array.isArray(toolInput)
)
  block("Safety hook received invalid tool input; command blocked.");
let command;
let content;
let filePath;
try {
  command = String(toolInput.command ?? "");
  content = String(toolInput.content ?? "");
  filePath = String(toolInput.file_path ?? "");
} catch {
  block("Safety hook received invalid text fields; command blocked.");
}

const gitCommand =
  /(?:^|[;&|()\s])git(?:\s+-[^\s;&|()]+(?:\s+(?:"[^"]*"|'[^']*'|[^-\s;&|()]+))?)*\s+(push|reset|clean|branch)(?=\s|$)([^;&|()\r\n]*)/g;
const forcePush =
  /(?:^|\s)(?:--force(?:-with-lease)?(?:=[^\s]+)?|-[A-Za-z]*[fF][A-Za-z]*)(?=\s|$)/;
const forceClean = /(?:^|\s)(?:--force|-[A-Za-z]*f[A-Za-z]*)(?=\s|$)/;
const deleteBranch = /(?:^|\s)(?:--delete|-[A-Za-z]*D[A-Za-z]*)(?=\s|$)/;
const directMainPush =
  /(?:^|\s)(["']?)(?:origin|upstream)\1\s+(?:\S+\s+)*\+?(?:[^:\s]*:)?(?:refs\/heads\/)?(?:main|master)(?=\s|$)/;
const environmentExposure =
  /\b(?:printenv|export -p)\b|echo.*(?:TOKEN|API_KEY|SECRET|PASSWORD|CREDENTIAL)|(?:^|[;&|()\s])env(?=\s*(?:$|[;&|()]|\d*[<>]))/i;
const productionHost = (hostname) =>
  /production|mainnet/i.test(hostname) ||
  hostname.toLowerCase() === "api.etherscan.io";
const productionEndpoint = (text) => {
  const urls = text.match(/https?:\/\/[^\s"'`<>|;&()]+/gi) ?? [];
  return urls.some((url) => {
    try {
      return productionHost(new URL(url).hostname);
    } catch {
      return false;
    }
  });
};
const bareNetworkEndpoint = (text) => {
  if (!/(?:^|[;&|()\s])(?:curl|wget)(?:\s|$)/i.test(text)) return false;
  const hosts = text.matchAll(
    /(?:^|[()\s"'`])((?:[a-z0-9-]+\.)+[a-z0-9-]+)(?=[:/()\s?#&"'`]|$)/gi,
  );
  return [...hosts].some((match) => productionHost(match[1]));
};
const sensitiveFile =
  /(?:^|[/\\])\.env(?:\.|$)|\.(?:pem|p12|key)$|credentials\.|secret\.|keystore/i;

for (const [, operation, args] of command.matchAll(gitCommand)) {
  if (
    (operation === "push" && forcePush.test(args)) ||
    (operation === "reset" && /(?:^|\s)--hard(?=\s|$)/.test(args)) ||
    (operation === "clean" && forceClean.test(args)) ||
    (operation === "branch" && deleteBranch.test(args))
  )
    block("Dangerous git command blocked. Ask the user first.");
  if (operation === "push" && directMainPush.test(args))
    block("Direct push to main/master blocked. Ask the user first.");
}
if (sensitiveFile.test(filePath))
  block("Editing secret or credential files is blocked. Ask the user first.");
if (environmentExposure.test(command))
  block("Environment variable exposure blocked.");
if (
  productionEndpoint(command) ||
  productionEndpoint(content) ||
  bareNetworkEndpoint(command)
)
  block("Production endpoint detected. Ask the user first.");
