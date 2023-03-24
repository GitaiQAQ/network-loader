//            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
//                    Version 2, December 2004

// Copyright (C) 2004 Sam Hocevar <sam@hocevar.net>

// Everyone is permitted to copy and distribute verbatim or modified
// copies of this license document, and changing it is allowed as long
// as the name is changed.

//            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
//   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

//  0. You just DO WHAT THE FUCK YOU WANT TO.

const noop = () => {};

const LOG_LEVELS = {
  debug: 0,
  trace: 1,
  log: 2,
  info: 3,
  warn: 4,
  error: 5,
};

type LOG_LEVEL = keyof typeof LOG_LEVELS;

const ENV_VAR_NODE_LOG = "NODE_LOG";

const DEFAULT_NODE_LOG: LOG_LEVEL = "info";

const ENV_NODE_LOG =
  process.env[ENV_VAR_NODE_LOG] || (DEFAULT_NODE_LOG as LOG_LEVEL);

const mapValues = (
  obj: Record<string, any>,
  fn: (value: any, key: string) => any
) => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, fn(value, key)])
  );
};

export const getLogger = (...prefix: any[]) => {
  return mapValues(LOG_LEVELS, (level, type) => {
    // @ts-ignore
    if (level >= LOG_LEVELS[ENV_NODE_LOG]) {
      // @ts-ignore
      return console[type].bind(console, ...prefix);
    }
    return noop;
  }) as Pick<Console, keyof typeof LOG_LEVELS>;
};

export const logger = getLogger("[default]");
