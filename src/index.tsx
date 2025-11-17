#!/usr/bin/env node
import { render } from "ink";
import React from "react";
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
