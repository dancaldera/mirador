#!/usr/bin/env node
import { execSync } from "child_process";
import { render } from "ink";
import { App } from "./App.js";
import { runApiMode } from "./api-mode.js";
import { runHeadlessMode } from "./headless-mode.js";
import { registerInkInstance } from "./inkControl.js";
import { parseCliArgs, showHelp } from "./utils/cli-args.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const main = async () => {
	// Handle opencode subcommand before parsing other args
	if (process.argv[2] === "opencode") {
		const opencodeArgs = process.argv.slice(3);
		const subcommand = opencodeArgs[0];

		if (subcommand === "run") {
			// Parse arguments for "sdb opencode run"
			const userMessageIndex = opencodeArgs.indexOf("run") + 1;
			const message = opencodeArgs.slice(userMessageIndex).join(" ");

			// Parse additional flags
			const flags = opencodeArgs.slice(0, userMessageIndex);
			let model: string | undefined;

			// Extract --model flag
			for (let i = 0; i < flags.length; i++) {
				if (flags[i] === "--model" && flags[i + 1]) {
					model = flags[i + 1];
					break;
				}
			}

			// Default model
			const defaultModel = "opencode/big-pickle";
			const finalModel = model || defaultModel;

			// Get SeerDB agent documentation
			try {
				const header =
					"# SeerDB Agent API Documentation\n# Use this context for AI agents to understand SeerDB capabilities\n\n";

				// Try multiple possible locations for AGENTS.md
				let agentsMdPath: string | null = null;
				const possiblePaths = [
					// When running from project root
					join(process.cwd(), "AGENTS.md"),
					// When running from dist/
					join(process.cwd(), "..", "AGENTS.md"),
					// When running as installed binary (try common locations)
					"/usr/local/share/seerdb/AGENTS.md",
					"/opt/seerdb/AGENTS.md",
				];

				for (const path of possiblePaths) {
					if (existsSync(path)) {
						agentsMdPath = path;
						break;
					}
				}

				let agentsContent: string;

				if (agentsMdPath) {
					// Load from local file
					agentsContent = readFileSync(agentsMdPath, "utf-8");
				} else {
					// Fallback: fetch from GitHub
					console.log("📥 Downloading SeerDB agent documentation from GitHub...");
					const githubUrl = "https://raw.githubusercontent.com/dancaldera/seerdb/main/AGENTS.md";
					const response = await fetch(githubUrl);

					if (!response.ok) {
						throw new Error(`Failed to fetch AGENTS.md from GitHub: ${response.statusText}`);
					}

					agentsContent = await response.text();
				}

				// Combine documentation with user message
				const fullPrompt =
					header + agentsContent + "\n\n---\n\nUser Request:\n" + message;

				// Run opencode with the combined prompt
				console.log("🚀 Running OpenCode.ai with SeerDB context...");

				// Use stdin to pass the prompt to opencode
				const command = `opencode run -m ${finalModel}`;
				const child = execSync(command, {
					input: fullPrompt,
					stdio: ["pipe", "inherit", "inherit"],
				});

				process.exit(0);
			} catch (error) {
				console.error("Error running OpenCode.ai:", error);
				process.exit(1);
			}
		} else {
			console.error("Unknown opencode subcommand:", subcommand);
			console.log("Supported subcommands: run");
			process.exit(1);
		}
	}

	const args = parseCliArgs();

	if (args.help) {
		showHelp();
		process.exit(0);
	}

	if (args.copy) {
		// Copy agent documentation to clipboard
		try {
			const header =
				"# SeerDB Agent API Documentation\n# Use this context for AI agents to understand SeerDB capabilities\n\n";

			// Try multiple possible locations for AGENTS.md
			let agentsMdPath: string | null = null;
			const possiblePaths = [
				// When running from dist/ (bundled with binary)
				join(process.cwd(), "AGENTS.md"),
				// When running from project root
				join(process.cwd(), "..", "AGENTS.md"),
				// When running as installed binary (try common locations)
				"/usr/local/share/seerdb/AGENTS.md",
				"/opt/seerdb/AGENTS.md",
			];

			for (const path of possiblePaths) {
				if (existsSync(path)) {
					agentsMdPath = path;
					break;
				}
			}

			let agentsContent: string;

			if (agentsMdPath) {
				// Load from local file
				agentsContent = readFileSync(agentsMdPath, "utf-8");
			} else {
				// Fallback: fetch from GitHub
				console.log("📥 Downloading SeerDB agent documentation from GitHub...");
				const githubUrl = "https://raw.githubusercontent.com/dancaldera/seerdb/main/AGENTS.md";
				const response = await fetch(githubUrl);

				if (!response.ok) {
					throw new Error(`Failed to fetch AGENTS.md from GitHub: ${response.statusText}`);
				}

				agentsContent = await response.text();
			}

			const fullContent = header + agentsContent;

			// Try different clipboard commands
			if (process.platform === "darwin") {
				// macOS
				execSync("pbcopy", { input: fullContent });
				console.log("✅ SeerDB agent documentation copied to clipboard!");
			} else if (process.platform === "linux") {
				// Linux
				try {
					execSync("xclip -selection clipboard", { input: fullContent });
					console.log("✅ SeerDB agent documentation copied to clipboard!");
				} catch {
					console.log("No clipboard tool found. Output:");
					console.log();
					console.log(fullContent);
				}
			} else if (process.platform === "win32") {
				// Windows
				try {
					execSync("clip", { input: fullContent });
					console.log("✅ SeerDB agent documentation copied to clipboard!");
				} catch {
					console.log("No clipboard tool found. Output:");
					console.log();
					console.log(fullContent);
				}
			} else {
				console.log("No clipboard tool found. Output:");
				console.log();
				console.log(fullContent);
			}
		} catch (error) {
			console.error("Error copying to clipboard:", error);
			process.exit(1);
		}
		process.exit(0);
	}

	// API mode for programmatic control
	if (args.api) {
		await runApiMode();
		return;
	}

	// Headless mode for automation
	if (args.headless) {
		await runHeadlessMode(args);
		return;
	}

	// Default interactive TUI mode
	const inkInstance = render(<App />);
	registerInkInstance(inkInstance);
};

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
