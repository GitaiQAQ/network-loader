#!/usr/bin/env node

import { resolve } from "path";

import { spawn } from "child_process";

const [command, _shimScript, ...args] = process.argv;

process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} ${[
  `-r ${resolve(_shimScript, "../suppress-warnings.js")}`,
  `--es-module-specifier-resolution=node`,
  `--experimental-network-imports`,
  `--loader=@esbuild-kit/esm-loader`,
  `--loader=${resolve(_shimScript, "../cache-loader.js")}`,
].join(" ")}`;

const proc = spawn(command, args, { stdio: "inherit" });

proc.on("exit", function (code, signal) {
  process.on("exit", function () {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exitCode = code || undefined;
    }
  });
});

process.on("SIGINT", () => proc.kill("SIGINT"));
