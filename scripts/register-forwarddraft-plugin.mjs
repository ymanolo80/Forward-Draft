import { readFile, writeFile } from "node:fs/promises";

const configPath = new URL("../ios/App/App/capacitor.config.json", import.meta.url);
const pluginClass = "ForwardDraftFilePlugin";

const config = JSON.parse(await readFile(configPath, "utf8"));
const classList = Array.isArray(config.packageClassList) ? config.packageClassList : [];

if (!classList.includes(pluginClass)) {
  config.packageClassList = [...classList, pluginClass];
  await writeFile(configPath, `${JSON.stringify(config, null, "\t")}\n`);
}
