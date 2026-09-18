import { readFile, writeFile, mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(path.join(tmpdir(), "herbads-queue-sql-"));
const file = path.join(directory, "transaction.sql");
try {
  const migration = process.argv.includes("--with-schema")
    ? (await readFile("supabase/migrations/20260918135918_add_batch_upload_queue.sql", "utf8")) +
      "\n" +
      (await readFile("supabase/migrations/20260918141559_reconcile_interrupted_batch_upload_controls.sql", "utf8"))
    : "";
  const tests = await readFile("tests/batch-upload-queue.sql", "utf8");
  await writeFile(file, `begin;\n${migration}\n${tests}\nrollback;\n`);
  const command = `npx supabase db query --linked --file "${file}"`;
  const result = spawnSync(command, { shell: true, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await unlink(file).catch(() => {});
  await rmdir(directory);
}
