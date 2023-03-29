import "https://esm.sh/dotenv";

import { merge as merge1 } from "https://unpkg.com/lodash-es/lodash.js";
import { merge as merge2 } from "https://unpkg.com/lodash-es@4.17.21/lodash.js";
import merge3 from "https://unpkg.com/lodash-es@4.17.21/merge.js";

import { strict } from "node:assert";

strict.equal(merge1, merge2);
strict.equal(merge2, merge3);
