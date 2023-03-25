import { Command, Option, runExit } from "https://unpkg.com/clipanion@3.2.0-rc.9/lib/advanced/index.mjs";

class HelloCommand extends Command {
  static paths = [[`hello`]];

  hello: string = Option.String();

  async execute() {
    process.stdout.write(this.hello);
    process.stdout.write('world');
  }
}

runExit([HelloCommand]);