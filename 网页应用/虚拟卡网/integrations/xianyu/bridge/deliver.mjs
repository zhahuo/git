import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createLogger } from "./lib/logger.mjs";
import { createState } from "./lib/state.mjs";
import { createSender } from "./lib/sender.mjs";
import { createCardClient } from "./lib/card-client.mjs";
import { handleEvent } from "./lib/bridge.mjs";
import { loadSettings, loadMapping, BRIDGE_ROOT } from "./lib/config.mjs";

function parseArgs(argv) {
  const args = {};
  const keys = new Set([
    "event",
    "event-file",
    "settings",
    "mapping",
    "runtime-dir",
    "log-dir",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    if (keys.has(key)) {
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function resolveDir(dir) {
  return path.isAbsolute(dir) ? dir : path.join(BRIDGE_ROOT, dir);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  let event;
  if (args.event) {
    event = JSON.parse(args.event);
  } else if (args["event-file"]) {
    event = JSON.parse(fs.readFileSync(args["event-file"], "utf8"));
  } else {
    throw new Error("请通过 --event '{}' 或 --event-file path.json 传入触发事件");
  }

  const settings = loadSettings({ settingsPath: args.settings });
  if (args["runtime-dir"]) settings.runtimeDir = args["runtime-dir"];
  if (args["log-dir"]) settings.logDir = args["log-dir"];
  const mapping = loadMapping({ mappingPath: args.mapping });
  const logger = createLogger({ dir: resolveDir(settings.logDir), name: "bridge" });
  const state = createState({
    dir: resolveDir(settings.runtimeDir),
    file: settings.stateFile,
  });
  try {
    const cardClient = createCardClient(settings, logger);
    const sender = createSender(settings, logger);
    const delivery = await handleEvent(event, {
      config: settings,
      state,
      logger,
      mapping,
      cardClient,
      sender,
    });
    console.log(JSON.stringify(delivery, null, 2));
    return delivery;
  } finally {
    state.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((delivery) => {
      const okStatuses = new Set([
        "sent",
        "already_delivered",
        "already_claimed",
        "business_error",
        "mapping_missing",
      ]);
      process.exit(okStatuses.has(delivery.status) ? 0 : 1);
    })
    .catch((err) => {
      console.error("[bridge] 执行失败:", err.message);
      process.exit(2);
    });
}
