import { dirname, join } from "node:path";
import { getLogger } from "./logger";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as _resolve } from "node:path";
import { NODE_NETWORK_IMPORT_CACHE_DIR } from "./constants";
import { createHash } from "node:crypto";
import { Context } from "./resolve";

const logger = getLogger("[ load ]");

export async function load(url: string, context: Context, defaultLoad) {
  logger.log("load", url, "of", context.parentURL);
  if (url.startsWith("https://")) {
    const cacheFileName = normalize(url);
    if (cacheFileName && existsSync(cacheFileName)) {
      const { format, responseURL } = JSON.parse(
        readFileSync(cacheFileName + ".meta.json", { encoding: "utf-8" })
      );
      logger.debug("load", url, format, responseURL);
      return {
        format,
        responseURL,
        source: readFileSync(cacheFileName),
        shortCircuit: true,
      };
    }

    let { format, source } = await defaultLoad(url, context, defaultLoad).catch(
      (e) => logger.error("defaultLoad", e)
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
      logger.log(
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
}

function sha1(str: string) {
  return createHash("sha1").update(str).digest("hex");
}

function normalize(url) {
  const { origin } = new URL(url);
  const pathname = url.substring(origin.length);
  return join(
    NODE_NETWORK_IMPORT_CACHE_DIR,
    origin.replace(/[@:\/]+/g, "+"),
    sha1(pathname)
  );
}
