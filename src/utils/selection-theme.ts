/**
 * Selection Theme Constants
 *
 * Defines the consistent visual style for selected items across all views in SeerDB.
 * This ensures a cohesive user experience throughout the application.
 */

export const SELECTION_THEME = {
	/**
	 * Indicator symbol and styling
	 */
	indicator: {
		symbol: "▶",
		selected: {
			color: "cyan" as const,
		},
		unselected: {
			symbol: "  ", // Two spaces for alignment
			color: "white" as const,
		},
	},

	/**
	 * Selected item styling
	 */
	selected: {
		textColor: "white" as const,
		bold: true,
		backgroundColor: "#014f4f", // Dark teal
		dimColor: false,
	},

	/**
	 * Unselected item styling
	 */
	unselected: {
		textColor: "white" as const,
		bold: false,
		backgroundColor: undefined,
		dimColor: false,
	},

	/**
	 * Hover state (for future use)
	 */
	hover: {
		textColor: "white" as const,
		bold: false,
		backgroundColor: undefined,
		dimColor: false,
	},
} as const;

/**
 * Helper function to get text color based on selection state
 */
export function getSelectionTextColor(isSelected: boolean): "white" {
	return SELECTION_THEME.selected.textColor;
}

/**
 * Helper function to get indicator symbol and color
 */
export function getSelectionIndicator(isSelected: boolean): {
	symbol: string;
	color: "cyan" | "white";
} {
	return isSelected
		? {
				symbol: SELECTION_THEME.indicator.symbol,
				color: SELECTION_THEME.indicator.selected.color,
			}
		: {
				symbol: SELECTION_THEME.indicator.unselected.symbol,
				color: SELECTION_THEME.indicator.unselected.color,
			};
}

/**
 * Helper function to check if bold should be applied
 */
export function isSelectionBold(isSelected: boolean): boolean {
	return isSelected
		? SELECTION_THEME.selected.bold
		: SELECTION_THEME.unselected.bold;
}

/**
 * Helper function to get background color
 */
export function getSelectionBackground(
	isSelected: boolean,
): string | undefined {
	return isSelected
		? SELECTION_THEME.selected.backgroundColor
		: SELECTION_THEME.unselected.backgroundColor;
}

/**
 * Helper function to check if dimColor should be applied
 */
export function isSelectionDimmed(isSelected: boolean): boolean {
	return isSelected
		? SELECTION_THEME.selected.dimColor
		: SELECTION_THEME.unselected.dimColor;
}
