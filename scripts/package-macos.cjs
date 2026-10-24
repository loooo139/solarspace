const { packager } = require("@electron/packager");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

async function findCachedElectronZip(version) {
  const cacheRoot = path.join(os.homedir(), "Library", "Caches", "electron");
  const archive = `electron-v${version}-darwin-arm64.zip`;
  try {
    for (const entry of await fs.readdir(cacheRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(cacheRoot, entry.name, archive);
      try { await fs.access(candidate); return path.dirname(candidate); } catch {}
    }
  } catch {}
  return undefined;
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const output = path.join(projectRoot, "release");
  const appVersion = require(path.join(projectRoot, "package.json")).version;
  const options = {
    dir: projectRoot,
    out: output,
    name: "SolarSpace",
    appBundleId: "com.solarspace.desktop",
    icon: path.join(projectRoot, "assets/app-icon.icns"),
    appVersion,
    platform: "darwin",
    arch: "arm64",
    overwrite: true,
    prune: true,
    ignore: [/^\/src(?:\/|$)/, /^\/scripts(?:\/|$)/, /^\/release(?:\/|$)/, /^\/\.git(?:\/|$)/],
  };
  const electronZipDir = await findCachedElectronZip(require("electron/package.json").version);
  if (electronZipDir) options.electronZipDir = electronZipDir;
  await packager(options);
  console.log(`Created ${path.join(output, "SolarSpace-darwin-arm64", "SolarSpace.app")}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
