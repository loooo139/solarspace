const { packager } = require("@electron/packager");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function electronCacheRoots() {
  if (process.platform === "darwin") return [path.join(os.homedir(), "Library", "Caches", "electron")];
  if (process.platform === "win32") return [path.join(os.homedir(), "AppData", "Local", "electron", "Cache")];
  return [path.join(os.homedir(), ".cache", "electron")];
}

async function findCachedElectronZip(version, platform, arch) {
  // Only reuse the cache for the host target; cross-target builds download their own runtime.
  if (platform !== process.platform || arch !== process.arch) return undefined;
  const archive = `electron-v${version}-${platform}-${arch}.zip`;
  for (const cacheRoot of electronCacheRoots()) {
    try {
      for (const entry of await fs.readdir(cacheRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(cacheRoot, entry.name, archive);
        try { await fs.access(candidate); return path.dirname(candidate); } catch {}
      }
    } catch {}
  }
  return undefined;
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const platform = arg("platform", process.platform);
  const arch = arg("arch", process.arch);
  if (!["darwin", "win32", "linux"].includes(platform)) throw new Error(`Unsupported platform: ${platform}`);
  if (!["arm64", "x64"].includes(arch)) throw new Error(`Unsupported arch: ${arch}`);

  const appVersion = require(path.join(projectRoot, "package.json")).version;
  const icon = platform === "win32"
    ? path.join(projectRoot, "assets/app-icon.ico")
    : path.join(projectRoot, "assets/app-icon.icns");

  const options = {
    dir: projectRoot,
    out: path.join(projectRoot, "release"),
    name: "SolarSpace",
    appBundleId: "com.solarspace.desktop",
    icon,
    appVersion,
    platform,
    arch,
    asar: true,
    overwrite: true,
    prune: true,
    ignore: [
      /^\/src(?:\/|$)/,
      /^\/scripts(?:\/|$)/,
      /^\/tests(?:\/|$)/,
      /^\/docs(?:\/|$)/,
      /^\/release(?:\/|$)/,
      /^\/\.git(?:\/|$)/,
      /^\/\.github(?:\/|$)/,
    ],
    win32metadata: {
      CompanyName: "SolarSpace contributors",
      FileDescription: "SOLARSPACE · 光伏数据台",
      ProductName: "SOLARSPACE",
    },
  };
  const electronZipDir = await findCachedElectronZip(require("electron/package.json").version, platform, arch);
  if (electronZipDir) options.electronZipDir = electronZipDir;

  const appPaths = await packager(options);
  for (const appPath of appPaths) console.log(`Created ${appPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
