# Typescript Remote Execution

"rtex" is a TypeScript tool for efficient remote execution and dependency management. With "rtex", developers can run TypeScript code and automatically load dependencies from remote CDNs that are cached for future use to achieve fast and efficient execution. The tool supports the latest TypeScript capabilities and is available to use globally with @esbuild-kit/esm-loader. Its name is derived from "remote execution" and "TypeScript", shortened to the unique and memorable name, "rtex".


## How to use?

### ESM

```shell
$ npx rtex ./examples/esm/zx.mjs
$ echo "world"
world
```

### TS

```shell
$ npx rtex ./examples/ts/ng-cli.ts
$ ... <command>
━━━ acl ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ... acl:checker [--unit #0] [--pre] [--all] [--exit-code]
    check whether the ACL has been applied.

You can also print more details about any of these commands by calling them with 
the `-h,--help` flag right after the command name.
```
