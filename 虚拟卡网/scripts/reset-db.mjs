import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "data");
for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  if (/^app\.db(-wal|-shm)?$/.test(name)) {
    fs.rmSync(path.join(dir, name), { force: true });
  }
}
console.log("已删除本地演示数据库，下次启动时自动重建并写入种子数据。");
