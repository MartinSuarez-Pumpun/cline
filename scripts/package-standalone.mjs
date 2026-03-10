#!/usr/bin/env node

import archiver from "archiver"
import { execSync } from "child_process"
import fs, { createWriteStream } from "fs"
import { cp } from "fs/promises"
import fsExtra from "fs-extra"
import { glob } from "glob"
import https from "https"
import minimatch from "minimatch"
import os from "os"
import path from "path"
import { pipeline } from "stream/promises"
import * as tar from "tar"
import { rmrf } from "./file-utils.mjs"

const NODE_DIST_BASE = "https://nodejs.org/dist"

// This should match the node version packaged with the JetBrains plugin.
const TARGET_NODE_VERSION = "22.15.0"

const TARGET_NODE_BINARIES = {
	"win-x64": {
		url: `${NODE_DIST_BASE}/v${TARGET_NODE_VERSION}/win-x64/node.exe`,
		file: "node.exe",
		extract: false,
	},
	"darwin-x64": {
		url: `${NODE_DIST_BASE}/v${TARGET_NODE_VERSION}/node-v${TARGET_NODE_VERSION}-darwin-x64.tar.gz`,
		file: "node",
		extract: true,
		extractPath: `node-v${TARGET_NODE_VERSION}-darwin-x64/bin/node`,
	},
	"darwin-arm64": {
		url: `${NODE_DIST_BASE}/v${TARGET_NODE_VERSION}/node-v${TARGET_NODE_VERSION}-darwin-arm64.tar.gz`,
		file: "node",
		extract: true,
		extractPath: `node-v${TARGET_NODE_VERSION}-darwin-arm64/bin/node`,
	},
	"linux-x64": {
		url: `${NODE_DIST_BASE}/v${TARGET_NODE_VERSION}/node-v${TARGET_NODE_VERSION}-linux-x64.tar.gz`,
		file: "node",
		extract: true,
		extractPath: `node-v${TARGET_NODE_VERSION}-linux-x64/bin/node`,
	},
}

const BUILD_DIR = "dist-standalone"
const BINARIES_DIR = `${BUILD_DIR}/binaries`
const RUNTIME_DEPS_DIR = "standalone/runtime-files"
const IS_DEBUG_BUILD = process.env.IS_DEBUG_BUILD === "true"

const TARGET_PLATFORMS = [
	{ platform: "win32", arch: "x64", targetDir: "win-x64" },
	{ platform: "darwin", arch: "x64", targetDir: "darwin-x64" },
	{ platform: "darwin", arch: "arm64", targetDir: "darwin-arm64" },
	{ platform: "linux", arch: "x64", targetDir: "linux-x64" },
]
const SUPPORTED_BINARY_MODULES = ["better-sqlite3"]

const UNIVERSAL_BUILD = !process.argv.includes("-s")
const IS_VERBOSE = process.argv.includes("-v") || process.argv.includes("--verbose")

async function downloadNodeBinaries() {
	console.log(`Downloading Node.js v${TARGET_NODE_VERSION} for all platforms...`)
	for (const { targetDir } of TARGET_PLATFORMS) {
		const { url, file, extract, extractPath } = TARGET_NODE_BINARIES[targetDir]
		const destDir = path.join(BINARIES_DIR, targetDir)
		const destFile = path.join(destDir, file)
		fs.mkdirSync(destDir, { recursive: true })

		if (fs.existsSync(destFile)) {
			console.log(`  ${targetDir}: already exists, skipping`)
			continue
		}

		console.log(`  ${targetDir}: downloading ${url}`)

		if (!extract) {
			await downloadFile(url, destFile)
		} else {
			const tmpTar = path.join(destDir, "_node.tar.gz")
			await downloadFile(url, tmpTar)
			console.log(`  ${targetDir}: extracting...`)
			await tar.extract({
				file: tmpTar,
				cwd: destDir,
				filter: (p) => p === extractPath,
				strip: extractPath.split("/").length - 1,
			})
			fs.renameSync(path.join(destDir, path.basename(extractPath)), destFile)
			fs.rmSync(tmpTar)
		}

		if (file === "node") fs.chmodSync(destFile, 0o755)
		console.log(`  ${targetDir}: done`)
	}
}

async function downloadFile(url, dest) {
	await new Promise((resolve, reject) => {
		const follow = (u) =>
			https
				.get(u, (res) => {
					if (res.statusCode === 301 || res.statusCode === 302) {
						follow(res.headers.location)
					} else if (res.statusCode !== 200) {
						reject(new Error(`HTTP ${res.statusCode} for ${u}`))
					} else {
						pipeline(res, createWriteStream(dest)).then(resolve).catch(reject)
					}
				})
				.on("error", reject)
		follow(url)
	})
}

async function copyWebviewBuild() {
	const src = path.resolve("webview-ui/build")
	const dest = path.join(BUILD_DIR, "extension/webview-ui/build")
	if (!fs.existsSync(src)) {
		throw new Error(`webview-ui/build no existe. Ejecuta: cd webview-ui && npm run build`)
	}
	fsExtra.copySync(src, dest)
	console.log("✅ Copiado webview-ui/build a standalone/extension/webview-ui/build")
}

async function main() {
	await installNodeDependencies()
	if (UNIVERSAL_BUILD) {
		console.log("Building universal package for all platforms...")
		await downloadNodeBinaries() // ← añadir
		await packageAllBinaryDeps()
	} else {
		console.log(`Building package for ${os.platform()}-${os.arch()}...`)
		await downloadNodeBinaries() // ← añadir
	}
	await copyWebviewBuild()
	await zipDistribution()
}

async function installNodeDependencies() {
	// Clean modules from any previous builds
	await rmrf(path.join(BUILD_DIR, "node_modules"))
	await rmrf(path.join(BINARIES_DIR))

	await cpr(RUNTIME_DEPS_DIR, BUILD_DIR)

	console.log("Running npm install in distribution directory...")
	execSync("npm install", { stdio: "inherit", cwd: BUILD_DIR })

	// Move the vscode directory into node_modules.
	// It can't be installed using npm because it will create a symlink which cannot be unzipped correctly on windows.
	fs.renameSync(`${BUILD_DIR}/vscode`, `${BUILD_DIR}/node_modules/vscode`)
}

/**
 * Downloads prebuilt binaries for each platform for the modules that include binaries. It uses `npx prebuild-install`
 * to download the binary.
 *
 * The modules are downloaded to dist-standalone/binaries/{os}-{platform}/.
 * When cline-core is installed, the installer should use the correct module for the current platform.
 */
async function packageAllBinaryDeps() {
	// Check for native .node modules.
	const allNativeModules = await glob("**/*.node", { cwd: path.join(BUILD_DIR, "node_modules"), nodir: true })
	const isAllowed = (path) => SUPPORTED_BINARY_MODULES.some((allowed) => path.includes(allowed))
	const blocked = allNativeModules.filter((x) => !isAllowed(x))

	if (blocked.length > 0) {
		console.error(`Error: Native node modules cannot be included in the standalone distribution:\n\n${blocked.join("\n")}`)
		console.error(
			"\nThese modules must support prebuilt-install and be added to the supported list in scripts/package-standalone.mjs",
		)
		process.exit(1)
	}

	for (const module of SUPPORTED_BINARY_MODULES) {
		console.log(`Installing binaries for ${module}...`)
		const src = path.join(BUILD_DIR, "node_modules", module)
		if (!fs.existsSync(src)) {
			console.warn(`Warning: Trying to install binaries for the module '${module}', but it is not being used by cline.`)
			continue
		}

		for (const { platform, arch, targetDir } of TARGET_PLATFORMS) {
			const binaryDir = `${BINARIES_DIR}/${targetDir}/node_modules`
			fs.mkdirSync(binaryDir, { recursive: true })

			// Copy the module from the build dir
			const dest = path.join(binaryDir, module)
			await cpr(src, dest)

			// Download the binary libs
			const v = IS_VERBOSE ? "--verbose" : ""
			const cmd = `npx prebuild-install --platform=${platform} --arch=${arch} --target=${TARGET_NODE_VERSION} ${v}`
			log_verbose(`${module}: ${cmd}`)
			execSync(cmd, { cwd: dest, stdio: "inherit" })
			log_verbose("")
		}
		// Remove the original module with the host platform binaries installed directly into node_modules.
		log_verbose(`Cleaning up host version of ${module}`)
		await rmrf(src)
		log_verbose("")
	}
}

async function zipDistribution() {
	// Zip per-platform
	for (const { targetDir } of TARGET_PLATFORMS) {
		const zipPath = path.join(BUILD_DIR, `standalone-${targetDir}.zip`)
		await createZip(zipPath, targetDir)
	}
}

async function createZip(zipPath, platformDir) {
	const output = fs.createWriteStream(zipPath)
	const startTime = Date.now()
	const archive = archiver("zip", { zlib: { level: 6 } })

	await new Promise((resolve, reject) => {
		output.on("close", () => {
			const duration = ((Date.now() - startTime) / 1000).toFixed(2)
			console.log(`Created ${zipPath} (${(archive.pointer() / 1024 / 1024).toFixed(1)} MB) in ${duration}s`)
			resolve()
		})
		archive.on("error", reject)
		archive.pipe(output)

		// Archivos base (sin binaries/)
		archive.glob("**/*", {
			cwd: BUILD_DIR,
			ignore: ["standalone-*.zip", "binaries/**"],
		})

		// Solo los binaries de esta plataforma
		const platformBinaries = path.join(BINARIES_DIR, platformDir)
		if (fs.existsSync(platformBinaries)) {
			archive.directory(platformBinaries, `binaries/${platformDir}`)
		}

		archive.finalize()
	})
}

/**
 * This is based on https://github.com/microsoft/vscode-vsce/blob/fafad8a63e9cf31179f918eb7a4eeb376834c904/src/package.ts#L1695
 * because the .vscodeignore format is not compatible with the `ignore` npm module.
 */
function createIsIgnored(standaloneIgnores) {
	const MinimatchOptions = { dot: true }
	const defaultIgnore = [
		".vscodeignore",
		"package-lock.json",
		"npm-debug.log",
		"yarn.lock",
		"yarn-error.log",
		"npm-shrinkwrap.json",
		".editorconfig",
		".npmrc",
		".yarnrc",
		".gitattributes",
		"*.todo",
		"tslint.yaml",
		".eslintrc*",
		".babelrc*",
		".prettierrc*",
		"biome.json*",
		".cz-config.js",
		".commitlintrc*",
		"webpack.config.js",
		"ISSUE_TEMPLATE.md",
		"CONTRIBUTING.md",
		"PULL_REQUEST_TEMPLATE.md",
		"CODE_OF_CONDUCT.md",
		".github",
		".travis.yml",
		"appveyor.yml",
		"**/.git",
		"**/.git/**",
		"**/*.vsix",
		"**/.DS_Store",
		"**/*.vsixmanifest",
		"**/.vscode-test/**",
		"**/.vscode-test-web/**",
	]

	const rawIgnore = fs.readFileSync(".vscodeignore", "utf8")

	// Parse raw ignore by splitting output into lines and filtering out empty lines and comments
	const parsedIgnore = rawIgnore
		.split(/[\n\r]/)
		.map((s) => s.trim())
		.filter((s) => !!s)
		.filter((i) => !/^\s*#/.test(i))

	// Add '/**' to possible folder names
	const expandedIgnore = [
		...parsedIgnore,
		...parsedIgnore.filter((i) => !/(^|\/)[^/]*\*[^/]*$/.test(i)).map((i) => (/\/$/.test(i) ? `${i}**` : `${i}/**`)),
	]

	// Combine with default ignore list
	// Also ignore the dist directory- the build directory for the extension.
	let allIgnore = [...defaultIgnore, ...expandedIgnore, ...standaloneIgnores]

	// Map files need to be included in the debug build. Remove .map ignores when IS_DEBUG_BUILD is set
	if (IS_DEBUG_BUILD) {
		allIgnore = allIgnore.filter((pattern) => !pattern.endsWith(".map"))
		console.log("Debug build: Including .map files in package")
	}

	// Split into ignore and negate list
	const [ignore, negate] = allIgnore.reduce(
		(r, e) => (!/^\s*!/.test(e) ? [[...r[0], e], r[1]] : [r[0], [...r[1], e]]),
		[[], []],
	)

	function isIgnored(f) {
		return (
			ignore.some((i) => minimatch(f, i, MinimatchOptions)) &&
			!negate.some((i) => minimatch(f, i.substr(1), MinimatchOptions))
		)
	}
	return isIgnored
}

/* cp -r */
async function cpr(source, dest) {
	log_verbose(`Copying ${source} -> ${dest}`)
	await cp(source, dest, {
		recursive: true,
		preserveTimestamps: true,
		dereference: false, // preserve symlinks instead of following them
	})
}

function log_verbose(...args) {
	if (IS_VERBOSE) {
		console.log(...args)
	}
}

await main()
