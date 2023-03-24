// TODO: espkg.com
import { Command, Option, runExit } from "https://unpkg.com/clipanion@3.2.0-rc.9/lib/advanced/index.mjs";

class HelloCommand extends Command {
  static paths = [[`hello`]];

  rest = Option.Proxy();

  async execute() {
    process.stdout.write('hello');
    // await $`echo "world"`;
  }
}

runExit([HelloCommand]);