import { mkdirSync, readFile, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fetch } from "./fetch";
import { NODE_NETWORK_IMPORT_CACHE_DIR } from "./constants";
import { getLogger } from "./logger";

import { isBuiltin } from "module";

const logger = getLogger("[resolve]");

type ModuleFormat = "module";

type Resolved = {
  url: string;
  format?: ModuleFormat | undefined;
  shortCircuit?: boolean;
};

export type Context = {
  conditions: string[];
  parentURL: string | undefined;
};

type ImportMaps = {
  imports: Record<string, string>;
  scopes: Record<string, Record<string, string>>;
};

type LockFile = ImportMaps["scopes"];

const { importMaps, lockFile } = (function () {
  const cwd = process.cwd();
  let importMaps: ImportMaps["scopes"] = {};
  try {
    const { imports, scopes } = JSON.parse(
      readFileSync(join(cwd, "import_map.json")).toString()
    );

    importMaps = Object.fromEntries([
      [undefined, imports],
      ...Object.entries(scopes || {}).map(([prefix, importMap]) => [
        prefix,
        { ...(imports || {}), ...(importMap || {}) },
      ]),
      ["", imports],
    ]);
  } catch (e) {
    logger.debug("read import_map file failed.", e);
  }

  let lockFile: LockFile = {};
  try {
    mkdirSync(NODE_NETWORK_IMPORT_CACHE_DIR);
    lockFile = JSON.parse(
      readFileSync(
        join(NODE_NETWORK_IMPORT_CACHE_DIR, "rx-lock.json")
      ).toString()
    );
  } catch (e) {
    logger.debug("read lockfile failed.", e);
  }

  return { importMaps, lockFile };
})();

export async function resolve(
  specifier: string,
  context: Context,
  defaultResolve
): Promise<Resolved> {
  const { parentURL = "." } = context;
  const currentScopeCacheMap = (lockFile[parentURL] =
    lockFile[parentURL] || {});
  logger.log("start resolve", specifier, "from", parentURL);

  if (currentScopeCacheMap[specifier]) {
    logger.log("resolved", currentScopeCacheMap[specifier], "of", specifier);
    return { url: currentScopeCacheMap[specifier], shortCircuit: true };
  }

  const mappedSpecifier =
    Object.entries(importMaps).filter(([prefix]) =>
      ("" + parentURL).startsWith(prefix)
    )?.[0]?.[1]?.[specifier] || specifier;
  logger.debug("mapped", specifier, "to", mappedSpecifier);

  // Ignore built-in module and clear the context object if an error of type
  // ERR_NETWORK_IMPORT_DISALLOWED occurs, indicating that network requests are
  // not allowed for dynamic module imports.
  if (specifier.startsWith("node:") || isBuiltin(mappedSpecifier)) {
    logger.log("resolved", mappedSpecifier, "of", specifier);
    currentScopeCacheMap[specifier] = mappedSpecifier;
    return { url: mappedSpecifier, shortCircuit: true };
  }

  let resolvedURL;
  try {
    resolvedURL = shouldBeTreatedAsRelativeOrAbsolutePath(mappedSpecifier)
      ? new URL(mappedSpecifier, new URL(parentURL)).href
      : new URL(mappedSpecifier).href;
  } catch (e) {
    if (e.code === "ERR_INVALID_URL") {
      resolvedURL = new URL(`/${mappedSpecifier}`, new URL(parentURL)).href;
    } else {
      throw e;
    }
  }

  if (!resolvedURL.startsWith("https://")) {
    logger.log("resolved", resolvedURL, "of", specifier);
    return { url: resolvedURL, shortCircuit: true };
  }

  // Now we have a remote module name with the protocol prefix https://,
  // because using http:// is not a secure practice. Let it crash.
  if (resolvedURL.startsWith("https://")) {
    // To improve performance, it is recommended to use caching to minimize repeat requests.
    if (currentScopeCacheMap[specifier]) {
      const url = currentScopeCacheMap[specifier];
      logger.log("resolved", url, "of", specifier);
      return { url, shortCircuit: true };
    }

    const { status, url } = await fetch(new URL(resolvedURL), {
      method: "head",
    });
    if (status === 200) {
      logger.log("resolved", url, "of", specifier);
      currentScopeCacheMap[specifier] = url;
      return { url, shortCircuit: true };
    }
  }

  return { url: resolvedURL, shortCircuit: true };
}

function isBareSpecifier(specifier) {
  return specifier[0] && specifier[0] !== "/" && specifier[0] !== ".";
}

function isRelativeSpecifier(specifier) {
  if (specifier[0] === ".") {
    if (specifier.length === 1 || specifier[1] === "/") return true;
    if (specifier[1] === ".") {
      if (specifier.length === 2 || specifier[2] === "/") return true;
    }
  }
  return false;
}

function shouldBeTreatedAsRelativeOrAbsolutePath(specifier) {
  if (specifier === "") return false;
  if (specifier[0] === "/") return true;
  return isRelativeSpecifier(specifier);
}

process.on("exit", () => {
  writeFileSync(
    join(NODE_NETWORK_IMPORT_CACHE_DIR, "rx-lock.json"),
    JSON.stringify(lockFile, undefined, 2)
  );
});
