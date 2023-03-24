#!/usr/bin/env node

const childProcess = require("child_process");

const args = process.argv.slice(2);

function register() {
  childProcess.spawn(
    args[0],
    [
      "-r",
      "./dist/suppress-experimental-warnings.js",
      "--es-module-specifier-resolution=node",
      "--experimental-network-imports",
      "--loader=./dist/network-module-loader.js",
    ].concat(args.slice(1)),
    {
      stdio: "inherit",
    }
  );
}

register();
