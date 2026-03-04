import { getPromptsDirectoriesForScan, type PromptsScanDirectory } from "@core/storage/disk"
import type { PromptCommandInfo } from "@shared/slashCommands"
import { fileExistsAtPath, isDirectory } from "@utils/fs"
import * as fs from "fs/promises"
import * as path from "path"
import { Logger } from "@/shared/services/Logger"
import { parseYamlFrontmatter } from "./frontmatter"

/**
 * File extension for prompt command files.
 * Supports both `.prompt.md` (preferred, like Copilot) and `.md` fallback.
 */
const PROMPT_EXTENSION = ".prompt.md"
const MD_EXTENSION = ".md"

/**
 * Scan a directory for .prompt.md files and parse their metadata.
 */
async function scanPromptsDirectory(dirPath: string, source: "project" | "global"): Promise<PromptCommandInfo[]> {
	const prompts: PromptCommandInfo[] = []

	if (!(await fileExistsAtPath(dirPath)) || !(await isDirectory(dirPath))) {
		return prompts
	}

	try {
		const entries = await fs.readdir(dirPath)

		for (const entryName of entries) {
			// Determine command name from filename
			let commandName: string | null = null
			if (entryName.endsWith(PROMPT_EXTENSION)) {
				commandName = entryName.slice(0, -PROMPT_EXTENSION.length)
			} else if (entryName.endsWith(MD_EXTENSION)) {
				commandName = entryName.slice(0, -MD_EXTENSION.length)
			}

			if (!commandName) continue

			// Validate command name (only alphanumeric, hyphens, underscores, dots)
			if (!/^[a-zA-Z0-9_.-]+$/.test(commandName)) {
				Logger.warn(`Skipping prompt file with invalid command name: ${entryName}`)
				continue
			}

			const filePath = path.join(dirPath, entryName)
			const stats = await fs.stat(filePath).catch(() => null)
			if (!stats?.isFile()) continue

			try {
				const fileContent = await fs.readFile(filePath, "utf-8")
				const { data: frontmatter } = parseYamlFrontmatter(fileContent)

				const description = typeof frontmatter.description === "string" ? frontmatter.description : undefined
				const skills = Array.isArray(frontmatter.skills)
					? frontmatter.skills.filter((s: unknown) => typeof s === "string")
					: undefined

				prompts.push({
					name: commandName,
					description,
					skills,
					source,
					filePath,
				})
			} catch (error) {
				Logger.warn(`Failed to parse prompt file ${filePath}:`, error)
			}
		}
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EACCES") {
			Logger.warn(`Permission denied reading prompts directory: ${dirPath}`)
		}
	}

	return prompts
}

/**
 * Discover all prompt commands from project (.cline/prompts/) and global (~/.cline/prompts/) directories.
 * Project prompts take precedence over global prompts with the same name.
 */
export async function discoverPrompts(cwd: string): Promise<PromptCommandInfo[]> {
	const allPrompts: PromptCommandInfo[] = []

	const scanDirs: PromptsScanDirectory[] = getPromptsDirectoriesForScan(cwd)

	for (const dir of scanDirs) {
		const dirPrompts = await scanPromptsDirectory(dir.path, dir.source)
		allPrompts.push(...dirPrompts)
	}

	// Deduplicate: project prompts override global ones with the same name
	const seen = new Set<string>()
	const result: PromptCommandInfo[] = []

	for (const prompt of allPrompts) {
		if (!seen.has(prompt.name)) {
			seen.add(prompt.name)
			result.push(prompt)
		}
	}

	return result
}

/**
 * Read the full content of a prompt file (body without frontmatter).
 */
export async function getPromptContent(promptInfo: PromptCommandInfo): Promise<string | null> {
	try {
		const fileContent = await fs.readFile(promptInfo.filePath, "utf-8")
		const { body } = parseYamlFrontmatter(fileContent)
		return body.trim()
	} catch {
		return null
	}
}
