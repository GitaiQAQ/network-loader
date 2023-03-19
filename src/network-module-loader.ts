import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join, dirname, resolve as _resolve, isAbsolute } from "path";
import { createHash } from "crypto";

import { fetch } from "./fetch";

type ModuleFormat = "module";

type Resolved = {
  url: string;
  format: ModuleFormat | undefined;
};

type Context = {
  conditions: string[];
  parentURL: string | undefined;
};

const NODE_NETWORK_IMPORT_CACHE_DIR =
  process.env["NODE_NETWORK_IMPORT_CACHE_DIR"] || ".cache";

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

const cacheForHead = new Map();
// based 2.29s user 0.50s system 32% cpu 8.569 total
// cached 1.33s user 0.28s system 20% cpu 8.012 total

// const isExternalPkgName = (name: string) => {
//     return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name);
// }

const isRelative = (name: string) => name.startsWith(".");
const isUnpkg = (url?: string) => url?.startsWith("https://unpkg.com/");

import { isBuiltin } from "module";

export const resolve = async (
  specifier,
  context,
  defaultResolve
): Promise<Resolved> => {
  if (specifier.startsWith("node:") || isBuiltin(specifier)) {
    // ignore buildin module
    context.parentURL = undefined;
  } else if (!isRelative(specifier) && isUnpkg(context?.parentURL)) {
    if (specifier.startsWith("#")) {
      // unpkg external module
      specifier = specifier.substring(1);
    }
    specifier = "https://unpkg.com/" + specifier;
  }
  const { url, ...rest } = await defaultResolve(
    specifier,
    context,
    defaultResolve
  );
  if (url.startsWith("https://")) {
    if (cacheForHead.has(url)) {
      return { ...cacheForHead.get(url), shortCircuit: true };
    }
    const resp = await fetch(new URL(url), { method: "head" });
    if (resp.status === 200) {
      // TODO: cache redirected urls
      cacheForHead.set(url, { url: resp.url, specifier });
      return { url: resp.url, specifier, shortCircuit: true } as any;
    }
  }
  return { url, ...rest };
};

export const load = async (url, context, defaultLoad) => {
  console.log("load", url, context.parentURL);
  if (url.startsWith("https://")) {
    const cacheFileName = normalize(url);
    if (cacheFileName && existsSync(cacheFileName)) {
      const { format, responseURL } = JSON.parse(
        readFileSync(cacheFileName + ".meta.json", { encoding: "utf-8" })
      );
      console.log("load", url, format, responseURL);
      return {
        format,
        responseURL,
        source: readFileSync(cacheFileName),
        shortCircuit: true,
      };
    }

    let { format, source } = await defaultLoad(url, context, defaultLoad);
    let responseURL: string | undefined = undefined;
    if (!/export /.test(source) && !/export\{/.test(source) && !/import /.test(source)) {
      format = "commonjs";
      responseURL =
        format === "commonjs" ? `file://${_resolve(cacheFileName)}` : undefined;
    }

    if (!format) {
      console.log(
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
