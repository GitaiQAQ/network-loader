import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join, dirname, resolve as _resolve } from "path";
import { createHash } from "crypto";

import { NODE_NETWORK_IMPORT_CACHE_DIR } from "./constants";
import { fetch } from "./fetch";
import { logger, getLogger } from "./logger";

const resolverLogger = getLogger("[resolve]");
const loaderLogger = getLogger("[load]");

type ModuleFormat = "module";

type Resolved = {
  url: string;
  format?: ModuleFormat | undefined;
  shortCircuit?: boolean;
};

type Context = {
  conditions: string[];
  parentURL: string | undefined;
};

export const sha1 = (str) => createHash("sha1").update(str).digest("hex");

function normalize(url) {
  const { origin } = new URL(url);
  const pathname = url.substring(origin.length);
  return join(
    NODE_NETWORK_IMPORT_CACHE_DIR,
    origin.replace(/[@:\/]+/g, "+"),
    sha1(pathname)
  );
}

// const cachedImportMap = new Map();
const cacheForHead = new Map();
// based 2.29s user 0.50s system 32% cpu 8.569 total
// cached 1.33s user 0.28s system 20% cpu 8.012 total

// const isExternalPkgName = (name: string) => {
//     return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name);
// }

import { isBuiltin } from "module";

let importMaps = { imports: {}, scopes: {} };

function readImportMap() {
  const { imports, scopes } = require(join(process.cwd(), 'import_map.json'));

  importMaps = Object.fromEntries([
    [undefined, imports],
    ...Object.entries(scopes || {}).map(([prefix, importMap]) => [
      prefix,
      { ...(imports || {}), ...(importMap || {}) },
    ]),
    ["", imports],
  ]);

  logger.debug("buildin importMap", importMaps);
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

// https://packup.deno.dev/guides/registry-cdn/
// https://generator.jspm.io/#62JgYGBkDM0rySzJSU1hqKpwMNcz0jMEAD0gdcgXAA
export const resolve = async (
  specifier,
  context,
  defaultResolve
): Promise<Resolved> => {
  resolverLogger.log("start resolve", specifier, "from", context.parentURL);
  if (defaultResolve.parentURL === undefined) {
    readImportMap();
  }

  specifier =
    Object.entries(importMaps).filter(([prefix]) =>
      ("" + context.parentURL).startsWith(prefix)
    )?.[0]?.[1]?.[specifier] || specifier;
  resolverLogger.debug("map", "to", specifier);

  // Ignore built-in module and clear the context object if an error of type
  // ERR_NETWORK_IMPORT_DISALLOWED occurs, indicating that network requests are
  // not allowed for dynamic module imports.
  if (specifier.startsWith("node:") || isBuiltin(specifier)) {
    return { url: specifier, shortCircuit: true };
  }

  resolverLogger.log("default", "of", specifier);

  let resolvedURL;
  try {
    resolvedURL = shouldBeTreatedAsRelativeOrAbsolutePath(specifier)
      ? new URL(specifier, new URL(context.parentURL)).href
      : new URL(specifier).href;
  } catch (e) {
    if (e.code === "ERR_INVALID_URL") {
      resolvedURL = shouldBeTreatedAsRelativeOrAbsolutePath(`/${specifier}`)
        ? new URL(`/${specifier}`, new URL(context.parentURL)).href
        : new URL(`/${specifier}`).href;
    } else {
      throw e;
    }
  }

  resolverLogger.log("resolved", resolvedURL, "of", specifier);

  // Now we have a remote module name with the protocol prefix https://,
  // because using http:// is not a secure practice. Let it crash.
  if (resolvedURL.startsWith("https://")) {
    // To improve performance, it is recommended to use caching to minimize repeat requests.
    if (cacheForHead.has(resolvedURL)) {
      const { url, ...rest } = cacheForHead.get(resolvedURL);
      resolverLogger.debug("redirect to", url, "from cache of", resolvedURL);
      return { url, ...rest };
    }

    const { status, url } = await fetch(new URL(resolvedURL), {
      method: "head",
    });
    if (status === 200) {
      // update cache
      cacheForHead.set(resolvedURL, { url, shortCircuit: true });
      resolverLogger.debug("redirect to", url, "from network of", resolvedURL);
      return cacheForHead.get(resolvedURL);
    }
  }

  return { url: resolvedURL, shortCircuit: true };
};

export const load = async (url, context, defaultLoad) => {
  loaderLogger.log("load", url, "of", context.parentURL);
  if (url.startsWith("https://")) {
    const cacheFileName = normalize(url);
    if (cacheFileName && existsSync(cacheFileName)) {
      const { format, responseURL } = JSON.parse(
        readFileSync(cacheFileName + ".meta.json", { encoding: "utf-8" })
      );
      loaderLogger.debug("load", url, format, responseURL);
      return {
        format,
        responseURL,
        source: readFileSync(cacheFileName),
        shortCircuit: true,
      };
    }

    let { format, source } = await defaultLoad(url, context, defaultLoad).catch(
      (e) => loaderLogger.error("defaultLoad", e)
    );
    let responseURL: string | undefined = undefined;
    if (
      !/export /.test(source) &&
      !/export\{/.test(source) &&
      !/import /.test(source)
    ) {
      format = "commonjs";
      responseURL =
        format === "commonjs" ? `file://${_resolve(cacheFileName)}` : undefined;
    }

    if (!format) {
      loaderLogger.log(
        "invalid source format",
        format,
        "of",
        url,
        "in",
        cacheFileName
      );
    }

    mkdirSync(dirname(cacheFileName), { recursive: true });
    writeFileSync(cacheFileName, source);
    writeFileSync(
      cacheFileName + ".meta.json",
      JSON.stringify(
        {
          ...context,
          format,
          url,
          responseURL,
        },
        undefined,
        2
      )
    );

    return { format, source, responseURL };
  }
  return defaultLoad(url, context, defaultLoad);
};
