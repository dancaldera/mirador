#!/usr/bin/env node
import { execSync } from "child_process";
import { render } from "ink";
import { App } from "./App.js";
import { runApiMode } from "./api-mode.js";
import { runHeadlessMode } from "./headless-mode.js";
import { registerInkInstance } from "./inkControl.js";
import { parseCliArgs, showAgentHelp, showHelp } from "./utils/cli-args.js";

const main = async () => {
	const args = parseCliArgs();

	if (args.help) {
		showHelp();
		process.exit(0);
	}

	if (args.agentHelp) {
		showAgentHelp();
		process.exit(0);
	}

	if (args.copy) {
		// Copy agent documentation to clipboard
		try {
			const header =
				"# SeerDB Agent API Documentation\n# Use this context for AI agents to understand SeerDB capabilities\n\n";
			const helpOutput = execSync("seerdb --agent-help", { encoding: "utf8" });
			const fullContent = header + helpOutput;

			// Try different clipboard commands
			if (process.platform === "darwin") {
				// macOS
				execSync("pbcopy", { input: fullContent });
				console.log("SeerDB agent docs copied to clipboard");
			} else if (process.platform === "linux") {
				// Linux
				try {
					execSync("xclip -selection clipboard", { input: fullContent });
					console.log("SeerDB agent docs copied to clipboard");
				} catch {
					console.log("No clipboard tool found. Output:");
					console.log();
					console.log(fullContent);
				}
			} else if (process.platform === "win32") {
				// Windows
				try {
					execSync("clip", { input: fullContent });
					console.log("SeerDB agent docs copied to clipboard");
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
