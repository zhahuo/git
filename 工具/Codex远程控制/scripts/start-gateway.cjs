'use strict';

const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const root = path.resolve(__dirname, "..");

function runNode(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...(args || [])], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

// 直接用 Node 完成 gateway 编译，避免运行时再依赖 pnpm。
runNode(path.join(root, "scripts", "sync-app-version.cjs"));
fs.rmSync(path.join(root, "gateway", "dist"), { recursive: true, force: true });
const tscPath = require.resolve("typescript/bin/tsc", { paths: [root] });
runNode(tscPath, ["-p", path.join(root, "gateway", "tsconfig.json")]);

const child = spawn(process.execPath, [path.join(root, "gateway", "dev", "run-gateway.cjs")], {
  cwd: root,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code === null ? 1 : code);
});
