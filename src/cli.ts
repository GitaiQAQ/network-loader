#!/usr/bin/env node

if (
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module
) {
  cli();
} else if (typeof require !== "undefined") {
  require('./suppress-warnings');
}

export * from './loader';

async function cli() {
  const { spawn } = await import("child_process");

  const [command, _shimScript, ...args] = process.argv;

  let hasTsSupport = false;
  try {
    require.resolve('@esbuild-kit/esm-loader');
    hasTsSupport = true;
  }catch(e) {}

  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} ${[
    `-r ${_shimScript}`,
    `--es-module-specifier-resolution=node`,
    `--experimental-network-imports`,
    hasTsSupport ? `--loader=@esbuild-kit/esm-loader` : '',
    `--loader=${_shimScript}`,
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
}
