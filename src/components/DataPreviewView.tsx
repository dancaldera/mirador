import { Box, Text, useInput, useStdout } from "ink";
import React, { useEffect, useMemo, useState } from "react";
import { ActionType } from "../state/actions.js";
import { useAppDispatch, useAppState } from "../state/context.js";
import {
	exportTableData,
	fetchColumns,
	fetchTableData,
} from "../state/effects.js";
import type { ColumnInfo, DataRow, TableInfo } from "../types/state.js";
import { ViewState } from "../types/state.js";
import {
	copyToClipboard,
	formatTableForClipboard,
} from "../utils/clipboard.js";
import {
	getColorForColumn,
	getColorForDataType,
	getHeaderColor,
	getPrimaryKeyHeaderColor,
} from "../utils/color-mapping.js";
import {
	calculateTableWidth,
	formatColumnList,
	getColumnDisplayWidth,
} from "../utils/column-selection.js";
import { processRows } from "../utils/data-processing.js";
import { getFixedPKColumns, getNavigableColumns } from "../utils/pk-utils.js";

const PAGE_SIZE = 20;
const FALLBACK_TOTAL_VISIBLE_COLUMNS = 5;
const TABLE_MARGIN = 4;
const BORDER_WIDTH = 2;
const INDICATOR_WIDTH = 2;

const DataPreviewViewComponent: React.FC = () => {
	const dispatch = useAppDispatch();
	const state = useAppState();
	const { stdout } = useStdout();
	const [stdoutWidth, setStdoutWidth] = useState<number | undefined>(
		stdout?.columns,
	);
	const [columnStartIndex, setColumnStartIndex] = useState(0);

	useEffect(() => {
		if (!stdout) {
			return;
		}

		const updateWidth = (): void => {
			setStdoutWidth(stdout.columns);
		};

		updateWidth();
		stdout.on("resize", updateWidth);

		return () => {
			stdout.off("resize", updateWidth);
		};
	}, [stdout]);

	const table = state.selectedTable;
	const widthLimit = stdoutWidth
		? Math.max(stdoutWidth - TABLE_MARGIN, 40)
		: undefined;

	// ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL LOGIC
	// Data processing hooks
	// NOTE: Sorting is done at the database level, so we only apply client-side filtering here
	const processedRows = useMemo(() => {
		// Only apply filtering, NOT sorting (sorting is done by the database)
		return state.filterValue
			? processRows(
					state.dataRows,
					{ column: null, direction: "off" }, // Disable client-side sorting
					state.filterValue,
					state.columns,
				)
			: state.dataRows;
	}, [state.dataRows, state.filterValue, state.columns]);

	const rowsToDisplay = processedRows;

	// Column processing hooks
	const fixedPKColumns = useMemo(
		() => getFixedPKColumns(state.columns),
		[state.columns],
	);
	const navigableColumns = useMemo(
		() => getNavigableColumns(state.columns),
		[state.columns],
	);
	const fallbackNavigableCapacity = Math.max(
		1,
		FALLBACK_TOTAL_VISIBLE_COLUMNS - fixedPKColumns.length,
	);

	const visibleNavigableColumns = useMemo(() => {
		if (navigableColumns.length === 0) return [];
		if (!widthLimit) {
			const endIndex = Math.min(
				columnStartIndex + fallbackNavigableCapacity,
				navigableColumns.length,
			);
			return navigableColumns.slice(columnStartIndex, endIndex);
		}

		const selected: ColumnInfo[] = [];

		for (let idx = columnStartIndex; idx < navigableColumns.length; idx += 1) {
			const candidateColumn = navigableColumns[idx];
			const candidateColumns = [
				...fixedPKColumns,
				...selected,
				candidateColumn,
			];
			const candidateWidth = calculateTableWidth(candidateColumns, {
				includeIndicator: true,
				minimum: 0,
			});

			if (candidateWidth <= widthLimit) {
				selected.push(candidateColumn);
			} else if (selected.length === 0) {
				// Ensure at least one navigable column is shown even if it exceeds the limit
				selected.push(candidateColumn);
				break;
			} else {
				break;
			}
		}

		return selected;
	}, [
		columnStartIndex,
		fallbackNavigableCapacity,
		fixedPKColumns,
		navigableColumns,
		widthLimit,
	]);

	const visibleColumns = useMemo(() => {
		return [...fixedPKColumns, ...visibleNavigableColumns];
	}, [fixedPKColumns, visibleNavigableColumns]);

	const columnWidths = useMemo(() => {
		return computeColumnWidths(visibleColumns, widthLimit);
	}, [visibleColumns, widthLimit]);

	const tableContentWidth = useMemo(() => {
		return getTableContentWidth(columnWidths);
	}, [columnWidths]);

	const tableBoxWidth = useMemo(() => {
		if (widthLimit) return widthLimit;
		return tableContentWidth > 0 ? tableContentWidth + BORDER_WIDTH : undefined;
	}, [tableContentWidth, widthLimit]);

	useEffect(() => {
		if (navigableColumns.length === 0) {
			if (columnStartIndex !== 0) {
				setColumnStartIndex(0);
			}
			return;
		}

		const capacity =
			widthLimit !== undefined && widthLimit !== null
				? Math.max(visibleNavigableColumns.length, 1)
				: fallbackNavigableCapacity;
		const maxStart = Math.max(0, navigableColumns.length - capacity);
		if (columnStartIndex > maxStart) {
			setColumnStartIndex(maxStart);
		}
	}, [
		columnStartIndex,
		fallbackNavigableCapacity,
		navigableColumns.length,
		visibleNavigableColumns.length,
		widthLimit,
	]);

	// Header information hook
	const compactHeaderInfo = useMemo(() => {
		const parts: string[] = [];

		// Table name
		if (table) {
			parts.push(renderTableName(table));
		}

		// Page info
		const currentPage = Math.floor(state.currentOffset / PAGE_SIZE) + 1;
		parts.push(`Pg${currentPage}`);

		// Sort info
		if (state.sortConfig.column && state.sortConfig.direction !== "off") {
			const arrow = state.sortConfig.direction === "asc" ? "↑" : "↓";
			parts.push(`Sort:${state.sortConfig.column}${arrow}`);
		}

		// PK info if present
		if (fixedPKColumns.length > 0) {
			parts.push(`PK(${fixedPKColumns.length})`);
		}

		// Column navigation info
		if (navigableColumns.length > 0) {
			parts.push(
				`${columnStartIndex + 1}-${Math.min(columnStartIndex + Math.max(visibleNavigableColumns.length, 1), navigableColumns.length)}/${navigableColumns.length}`,
			);
		}

		// Loading status
		if (state.loading) parts.push("Loading");

		return parts.join(" • ");
	}, [
		table,
		state.currentOffset,
		state.sortConfig,
		state.loading,
		fixedPKColumns.length,
		navigableColumns.length,
		columnStartIndex,
		visibleNavigableColumns.length,
	]);

	// Effect for data loading
	useEffect(() => {
		if (!state.activeConnection || !state.dbType || !table) {
			dispatch({ type: ActionType.SetView, view: ViewState.Tables });
			return;
		}

		if (state.columns.length === 0) {
			void fetchColumns(
				dispatch,
				state,
				{
					type: state.dbType,
					connectionString: state.activeConnection.connectionString,
				},
				table,
			);
		}

		if (state.dataRows.length === 0) {
			void fetchTableData(
				dispatch,
				state,
				{
					type: state.dbType,
					connectionString: state.activeConnection.connectionString,
				},
				table,
				{ offset: 0, limit: PAGE_SIZE },
			);
		}
	}, [
		dispatch,
		state.activeConnection,
		state.dbType,
		state.columns.length,
		state.dataRows.length,
		table,
	]);

	// Helper function to auto-scroll to make a column visible in sort picker mode
	const autoScrollToColumn = (columnIndex: number): void => {
		// Get the selected column from all columns
		const selectedColumn = state.columns[columnIndex];
		if (!selectedColumn) return;

		// Check if it's a fixed PK column (always visible, no scrolling needed)
		const isFixedPK = fixedPKColumns.some(
			(col) => col.name === selectedColumn.name,
		);
		if (isFixedPK) return;

		// Find the index in navigable columns
		const navigableIndex = navigableColumns.findIndex(
			(col) => col.name === selectedColumn.name,
		);
		if (navigableIndex === -1) return; // Column not found (shouldn't happen)

		// Check if the column is already visible
		const isVisible =
			navigableIndex >= columnStartIndex &&
			navigableIndex < columnStartIndex + visibleNavigableColumns.length;

		if (isVisible) return; // Already visible, no scrolling needed

		// Calculate new columnStartIndex to make the column visible
		let newColumnStartIndex = columnStartIndex;

		if (navigableIndex < columnStartIndex) {
			// Column is to the left - scroll left to show it
			newColumnStartIndex = navigableIndex;
		} else {
			// Column is to the right - scroll right to show it as the last visible column
			// Ensure at least 1 column is visible
			const visibleCount = Math.max(visibleNavigableColumns.length, 1);
			newColumnStartIndex = Math.max(0, navigableIndex - visibleCount + 1);
		}

		// Apply the scroll
		setColumnStartIndex(newColumnStartIndex);
	};

	// Input handling without early returns
	useInput((input, key) => {
		// Guard clause - but no early return, just continue
		if (!table || !state.activeConnection || !state.dbType) {
			return;
		}

		// Handle expanded row view first
		if (state.expandedRow) {
			if (key.escape || input === "q" || input === "b") {
				dispatch({ type: ActionType.SetExpandedRow, row: null });
			}
			return;
		}

		// Navigation between views
		if (key.escape || input === "b") {
			dispatch({ type: ActionType.ClearSelectedTable });
			dispatch({ type: ActionType.SetView, view: ViewState.Tables });
			return;
		}

		// Row selection with up/down arrows
		if (key.upArrow) {
			if (state.selectedRowIndex === null || state.selectedRowIndex === 0) {
				dispatch({
					type: ActionType.SetSelectedRowIndex,
					index: rowsToDisplay.length - 1,
				});
			} else {
				dispatch({
					type: ActionType.SetSelectedRowIndex,
					index: state.selectedRowIndex - 1,
				});
			}
			return;
		}

		if (key.downArrow) {
			if (state.selectedRowIndex === null) {
				dispatch({ type: ActionType.SetSelectedRowIndex, index: 0 });
			} else if (state.selectedRowIndex >= rowsToDisplay.length - 1) {
				dispatch({ type: ActionType.SetSelectedRowIndex, index: 0 });
			} else {
				dispatch({
					type: ActionType.SetSelectedRowIndex,
					index: state.selectedRowIndex + 1,
				});
			}
			return;
		}

		// Enter key to expand selected row
		if (
			key.return &&
			state.selectedRowIndex !== null &&
			rowsToDisplay[state.selectedRowIndex]
		) {
			dispatch({
				type: ActionType.SetExpandedRow,
				row: rowsToDisplay[state.selectedRowIndex],
			});
			dispatch({ type: ActionType.SetView, view: ViewState.RowDetail });
			return;
		}

		// Home key to jump to first page (if supported by terminal)
		if (
			"home" in key &&
			(key as Record<string, unknown>).home &&
			state.currentOffset > 0 &&
			!state.loading
		) {
			void fetchTableData(
				dispatch,
				state,
				{
					type: state.dbType,
					connectionString: state.activeConnection.connectionString,
				},
				table,
				{ offset: 0, limit: PAGE_SIZE },
			);
			return;
		}

		// Pagination - previous page
		if (
			(input === "p" || input === "P") &&
			state.currentOffset > 0 &&
			!state.loading
		) {
			const previousOffset = Math.max(0, state.currentOffset - PAGE_SIZE);
			void fetchTableData(
				dispatch,
				state,
				{
					type: state.dbType,
					connectionString: state.activeConnection.connectionString,
				},
				table,
				{ offset: previousOffset, limit: PAGE_SIZE },
			);
			return;
		}

		if (input === "r" && !state.loading) {
			void fetchTableData(
				dispatch,
				state,
				{
					type: state.dbType,
					connectionString: state.activeConnection.connectionString,
				},
				table,
				{ offset: state.currentOffset, limit: PAGE_SIZE },
			);
			return;
		}

		if ((input === "c" || input === "C") && !state.loading) {
			// Cache clearing functionality removed - all queries now fetch fresh data
			return;
		}

		if (input === "n" && state.hasMoreRows && !state.loading) {
			void fetchTableData(
				dispatch,
				state,
				{
					type: state.dbType,
					connectionString: state.activeConnection.connectionString,
				},
				table,
				{ offset: state.currentOffset + PAGE_SIZE, limit: PAGE_SIZE },
			);
		}

		if (input === "d" && state.dataRows.length > 0) {
			dispatch({
				type: ActionType.SetExpandedRow,
				row:
					state.selectedRowIndex !== null
						? (rowsToDisplay[state.selectedRowIndex] ?? null)
						: (rowsToDisplay[0] ?? null),
			});
			dispatch({ type: ActionType.SetView, view: ViewState.RowDetail });
		}

		if (input === "q") {
			dispatch({ type: ActionType.SetView, view: ViewState.Query });
		}

		// Sorting shortcuts - Enter sort picker mode
		if (input === "s" && state.columns.length > 0 && !state.sortPickerMode) {
			dispatch({ type: ActionType.EnterSortPickerMode });
			return;
		}

		// In sort picker mode, handle navigation and selection
		if (state.sortPickerMode) {
			// Exit sort picker mode without applying
			if (key.escape) {
				dispatch({ type: ActionType.ExitSortPickerMode });
				return;
			}

			// Navigate between columns with h/l (vim-style left/right) with wrapping
			if (input === "h" || input === "H") {
				const newIndex =
					state.sortPickerColumnIndex === 0
						? state.columns.length - 1
						: state.sortPickerColumnIndex - 1;
				dispatch({
					type: ActionType.SetSortPickerColumn,
					columnIndex: newIndex,
				});
				// Auto-scroll to make the selected column visible
				autoScrollToColumn(newIndex);
				return;
			}

			if (input === "l" || input === "L") {
				const newIndex =
					state.sortPickerColumnIndex >= state.columns.length - 1
						? 0
						: state.sortPickerColumnIndex + 1;
				dispatch({
					type: ActionType.SetSortPickerColumn,
					columnIndex: newIndex,
				});
				// Auto-scroll to make the selected column visible
				autoScrollToColumn(newIndex);
				return;
			}

			// Change sort direction with k/j (vim-style up/down)
			const selectedColumn = state.columns[state.sortPickerColumnIndex]?.name;
			if (selectedColumn && (input === "k" || input === "K")) {
				// k = ascending
				dispatch({
					type: ActionType.SetSortConfig,
					sortConfig: {
						column: selectedColumn,
						direction: "asc",
					},
				});
				return;
			}

			if (selectedColumn && (input === "j" || input === "J")) {
				// j = descending
				dispatch({
					type: ActionType.SetSortConfig,
					sortConfig: {
						column: selectedColumn,
						direction: "desc",
					},
				});
				return;
			}

			if (input === "o" || input === "O") {
				// o = off (clear sorting)
				dispatch({
					type: ActionType.SetSortConfig,
					sortConfig: {
						column: null,
						direction: "off",
					},
				});
				return;
			}

			// Apply sort and exit with Enter or 's'
			if (key.return || input === "s") {
				dispatch({ type: ActionType.ExitSortPickerMode });
				// Refetch data with new sort configuration, reset to page 1
				void fetchTableData(
					dispatch,
					state,
					{
						type: state.dbType,
						connectionString: state.activeConnection.connectionString,
					},
					table,
					{ offset: 0, limit: PAGE_SIZE }, // Reset to page 1 when applying sort
				);
				return;
			}
		}

		// Clear sorting (when not in picker mode)
		if (input === "S" && !state.sortPickerMode) {
			dispatch({
				type: ActionType.SetSortConfig,
				sortConfig: { column: null, direction: "off" },
			});
			// Automatically refresh without sort
			void fetchTableData(
				dispatch,
				state,
				{
					type: state.dbType,
					connectionString: state.activeConnection.connectionString,
				},
				table,
				{ offset: state.currentOffset, limit: PAGE_SIZE },
			);
		}

		// Column navigation with arrow keys (only for navigable columns, PK columns stay fixed)
		// Note: When in sort picker mode, arrows are used for column selection instead
		if (key.leftArrow && !state.sortPickerMode && columnStartIndex > 0) {
			setColumnStartIndex(Math.max(0, columnStartIndex - 1));
			return;
		}
		if (
			key.rightArrow &&
			!state.sortPickerMode &&
			visibleNavigableColumns.length > 0 &&
			columnStartIndex + visibleNavigableColumns.length <
				navigableColumns.length
		) {
			setColumnStartIndex(
				Math.min(
					navigableColumns.length - visibleNavigableColumns.length,
					columnStartIndex + 1,
				),
			);
			return;
		}
		if ("home" in key && (key as Record<string, unknown>).home) {
			setColumnStartIndex(0);
			return;
		}
		if (
			"end" in key &&
			(key as Record<string, unknown>).end &&
			visibleNavigableColumns.length > 0 &&
			navigableColumns.length > visibleNavigableColumns.length
		) {
			setColumnStartIndex(
				Math.max(0, navigableColumns.length - visibleNavigableColumns.length),
			);
			return;
		}

		// Filtering shortcuts
		if (input === "f") {
			// This would require a more complex input dialog
			// For now, just clear filter
			dispatch({ type: ActionType.SetFilterValue, filterValue: "" });
		}

		// Export shortcuts
		if (input === "e") {
			// Export as CSV
			void exportTableData(dispatch, state, "csv", true);
		}
		if (input === "E") {
			// Export as JSON
			void exportTableData(dispatch, state, "json", true);
		}

		// Clipboard shortcuts
		if (input === "c" && key.ctrl) {
			// Copy current view to clipboard
			const tableText = formatTableForClipboard(
				rowsToDisplay,
				state.columns,
				true,
			);
			copyToClipboard(tableText).then((success) => {
				if (success) {
					dispatch({
						type: ActionType.SetInfo,
						message: `Copied ${rowsToDisplay.length} rows to clipboard`,
					});
				} else {
					dispatch({
						type: ActionType.SetError,
						error: "Failed to copy to clipboard",
					});
				}
			});
			return;
		}
	});

	// CONDITIONAL JSX RENDERING - All hooks are now called consistently above
	if (!table) {
		return (
			<Box>
				<Text color="red">No table selected.</Text>
			</Box>
		);
	}

	// Show expanded row view if a row is expanded
	if (state.expandedRow && state.columns.length > 0) {
		return (
			<Box flexDirection="column">
				<Text>
					<Text color="cyan">{renderTableName(table)}</Text> • Row Details
				</Text>
				<Box marginTop={1}>
					{renderExpandedRow(state.expandedRow, state.columns)}
				</Box>
			</Box>
		);
	}

	// Main table view
	return (
		<Box flexDirection="column">
			{/* Compact header */}
			<Box flexDirection="row" marginBottom={1}>
				<Text color="cyan" bold>
					{compactHeaderInfo}
				</Text>
				<Text> • </Text>
				<Text dimColor>
					{rowsToDisplay.length} rows
					{state.hasMoreRows && " • more"}
				</Text>
			</Box>

			{/* Complete column information */}
			{visibleColumns.length > 0 && (
				<Box marginBottom={1}>
					<Text dimColor>Columns: {formatColumnList(visibleColumns)}</Text>
				</Box>
			)}

			{/* Table header row */}
			{visibleColumns.length > 0 && (
				<Box
					flexDirection="column"
					borderStyle="single"
					borderColor="gray"
					paddingX={0}
					width={tableBoxWidth}
				>
					{renderHeaderRow(
						visibleColumns,
						columnWidths,
						state.sortConfig,
						columnStartIndex,
						fixedPKColumns.length,
						state.sortPickerMode,
						state.sortPickerColumnIndex,
						state.columns,
					)}
					<Text dimColor>
						{renderSeparatorLine(
							columnWidths,
							widthLimit ? Math.max(widthLimit - BORDER_WIDTH, 0) : undefined,
						)}
					</Text>
				</Box>
			)}

			{/* Data rows */}
			<Box
				flexDirection="column"
				borderStyle="single"
				borderColor="gray"
				paddingX={0}
				width={tableBoxWidth}
			>
				{rowsToDisplay.length === 0 ? (
					<Text dimColor>
						{state.loading ? "Loading rows…" : "No rows available."}
					</Text>
				) : (
					rowsToDisplay.map((row, index) => (
						<Box key={index}>
							{renderCondensedRow(
								row,
								visibleColumns,
								columnWidths,
								index === state.selectedRowIndex,
								columnStartIndex,
								fixedPKColumns.length,
							)}
						</Box>
					))
				)}
			</Box>

			{/* Help text */}
			<Box marginTop={1}>
				<Text color="gray" dimColor>
					{state.sortPickerMode
						? "Sort Mode: h/l Select Column • k Asc • j Desc • o Off • Enter/s Apply • Esc Cancel"
						: "↑↓←→ Nav • Home/End • p/n Page • s Sort • f Filter • r Refresh • d Details • e Export • Ctrl+c Copy • Esc Back • ? Help"}
				</Text>
			</Box>
		</Box>
	);
};

function renderTableName(table: TableInfo): string {
	return table.schema ? `${table.schema}.${table.name}` : table.name;
}

/**
 * Render a condensed row with colored values based on data types
 */
function renderCondensedRow(
	row: DataRow,
	columns: ColumnInfo[],
	columnWidths: number[],
	isSelected: boolean,
	columnStartIndex: number,
	fixedPKCount: number,
): React.ReactElement {
	if (columns.length === 0) {
		return <Text>{JSON.stringify(row)}</Text>;
	}

	const parts: React.ReactElement[] = [];
	const rowBackgroundColor = isSelected ? ("#014f4f" as const) : undefined;

	// Selection indicator
	if (isSelected) {
		parts.push(
			<Text
				key="indicator"
				color="cyan"
				bold
				backgroundColor={rowBackgroundColor}
			>
				▶{" "}
			</Text>,
		);
	} else {
		parts.push(
			<Text key="indicator" backgroundColor={rowBackgroundColor}>
				{" ".repeat(INDICATOR_WIDTH)}
			</Text>,
		);
	}

	// Render each column value with appropriate color and dynamic width
	columns.forEach((column, idx) => {
		const value = row[column.name];
		const width = columnWidths[idx] ?? 0;
		const formattedValue = formatDataCell(value, width);

		if (idx > 0) {
			// Add visual separator between PK and regular columns
			const isPKSeparator = idx === fixedPKCount && fixedPKCount > 0;
			parts.push(
				<Text
					key={`sep-${idx}`}
					color={isPKSeparator ? "yellow" : undefined}
					dimColor={!isPKSeparator}
					backgroundColor={rowBackgroundColor}
				>
					{isPKSeparator ? "‖" : "|"}
				</Text>,
			);
		}

		// Determine if this column should be highlighted
		const isPKColumn = idx < fixedPKCount;
		const isRegularSelectedColumn =
			idx === fixedPKCount && fixedPKCount > 0 && columnStartIndex === 0;
		const isOnlySelectedColumn = fixedPKCount === 0 && idx === 0;
		const isSelectedColumn =
			isPKColumn || isRegularSelectedColumn || isOnlySelectedColumn;

		// Get appropriate color considering PK status
		const finalColor = getColorForColumn(
			column.dataType,
			value,
			column.isPrimaryKey || false,
			isSelectedColumn,
		);

		parts.push(
			<Text
				key={`col-${idx}`}
				color={finalColor}
				bold={isSelectedColumn}
				dimColor={value === null || (value === undefined && !isSelectedColumn)}
				backgroundColor={rowBackgroundColor}
			>
				{formattedValue}
			</Text>,
		);
	});

	return <Text>{parts}</Text>;
}

/**
 * Render column header row
 */
function renderHeaderRow(
	columns: ColumnInfo[],
	columnWidths: number[],
	sortConfig: { column: string | null; direction: "asc" | "desc" | "off" },
	columnStartIndex: number,
	fixedPKCount: number,
	sortPickerMode: boolean,
	sortPickerColumnIndex: number,
	allColumns: ColumnInfo[],
): React.ReactElement {
	const parts: React.ReactElement[] = [];

	parts.push(<Text key="indicator">{" ".repeat(INDICATOR_WIDTH)}</Text>);

	columns.forEach((column, idx) => {
		if (idx > 0) {
			// Add visual separator between PK and regular columns
			const isPKSeparator = idx === fixedPKCount && fixedPKCount > 0;
			parts.push(
				<Text
					key={`sep-${idx}`}
					color={isPKSeparator ? "yellow" : undefined}
					dimColor={!isPKSeparator}
				>
					{isPKSeparator ? "‖" : "|"}
				</Text>,
			);
		}

		const width = columnWidths[idx] ?? 0;
		const columnText = formatHeaderCell(column, width, sortConfig);

		// Determine if this column should be highlighted
		const isPKColumn = idx < fixedPKCount;
		const isRegularSelectedColumn =
			idx === fixedPKCount && fixedPKCount > 0 && columnStartIndex === 0;
		const isOnlySelectedColumn = fixedPKCount === 0 && idx === 0;
		const isSelectedColumn =
			isPKColumn || isRegularSelectedColumn || isOnlySelectedColumn;

		// Check if this column is selected in sort picker mode
		// Compare by column name instead of index since visibleColumns is a subset of state.columns
		const isSortPickerSelected =
			sortPickerMode && column.name === allColumns[sortPickerColumnIndex]?.name;

		// Choose appropriate color
		let headerColor = getHeaderColor();
		if (column.isPrimaryKey) {
			headerColor = getPrimaryKeyHeaderColor();
		}
		if (isSelectedColumn) {
			headerColor = "cyan";
		}
		if (isSortPickerSelected) {
			headerColor = "magenta"; // Highlight selected column in sort picker mode
		}

		parts.push(
			<Text
				key={`col-${idx}`}
				color={headerColor}
				bold={isSelectedColumn || column.isPrimaryKey || isSortPickerSelected}
				inverse={isSortPickerSelected} // Inverse colors for sort picker selection
			>
				{columnText}
			</Text>,
		);
	});

	return <Text>{parts}</Text>;
}

/**
 * Render expanded row view with full details
 */
function renderExpandedRow(
	row: DataRow,
	columns: ColumnInfo[],
): React.ReactElement {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="cyan"
			paddingX={1}
		>
			<Text bold color="cyan">
				Row Details
			</Text>
			<Text dimColor>
				─────────────────────────────────────────────────────────────
			</Text>
			<Box flexDirection="column" marginY={1}>
				{columns.map((column) => {
					const value = row[column.name];
					const color = getColorForDataType(column.dataType, value);
					const formattedValue =
						value === null || value === undefined
							? "NULL"
							: typeof value === "object"
								? JSON.stringify(value, null, 2)
								: String(value);

					return (
						<Box key={column.name} flexDirection="row">
							<Text bold color="cyan" dimColor>
								{column.name}:{" "}
							</Text>
							<Text
								color={color}
								dimColor={value === null || value === undefined}
							>
								{formattedValue}
							</Text>
						</Box>
					);
				})}
			</Box>
			<Text dimColor>
				─────────────────────────────────────────────────────────────
			</Text>
			<Text dimColor>Esc/q/b: Close</Text>
		</Box>
	);
}

function computeColumnWidths(
	columns: ColumnInfo[],
	widthLimit?: number,
): number[] {
	if (columns.length === 0) return [];

	const baseWidths = columns.map((column) => getColumnDisplayWidth(column));

	if (!widthLimit) {
		return baseWidths;
	}

	const separatorsWidth = Math.max(0, columns.length - 1);
	const baseContentWidth =
		INDICATOR_WIDTH +
		separatorsWidth +
		baseWidths.reduce((sum, width) => sum + width, 0);
	const targetContentWidth = Math.max(widthLimit - BORDER_WIDTH, 0);

	if (baseContentWidth >= targetContentWidth) {
		return baseWidths;
	}

	let leftover = targetContentWidth - baseContentWidth;
	const adjusted = [...baseWidths];
	const adjustableIndexes = columns.map((_, idx) => idx);

	while (leftover > 0 && adjustableIndexes.length > 0) {
		for (const index of adjustableIndexes) {
			adjusted[index] += 1;
			leftover -= 1;
			if (leftover <= 0) {
				break;
			}
		}
	}

	return adjusted;
}

function getTableContentWidth(columnWidths: number[]): number {
	if (columnWidths.length === 0) {
		return 0;
	}
	const separatorsWidth = Math.max(0, columnWidths.length - 1);
	const columnsWidth = columnWidths.reduce((sum, width) => sum + width, 0);
	return INDICATOR_WIDTH + separatorsWidth + columnsWidth;
}

function renderSeparatorLine(
	columnWidths: number[],
	targetContentWidth?: number,
): string {
	const contentWidth = getTableContentWidth(columnWidths);
	const finalWidth =
		targetContentWidth !== undefined ? targetContentWidth : contentWidth;
	const length = Math.max(finalWidth, contentWidth);
	return "─".repeat(Math.max(length, 0));
}

function truncateToWidth(text: string, width: number): string {
	if (width <= 0) return "";
	if (text.length <= width) {
		return text.padEnd(width, " ");
	}
	if (width <= 3) {
		return text.substring(0, width);
	}
	const truncated = text.substring(0, width - 3) + "...";
	return truncated.padEnd(width, " ");
}

function formatDataCell(value: unknown, width: number): string {
	let text: string;
	if (value === null || value === undefined) {
		text = "NULL";
	} else if (typeof value === "object") {
		try {
			text = JSON.stringify(value);
		} catch {
			text = String(value);
		}
	} else {
		text = String(value);
	}
	const truncated = truncateToWidth(text, width);
	return truncated.padEnd(width, " ");
}

function formatHeaderCell(
	column: ColumnInfo,
	width: number,
	sortConfig: { column: string | null; direction: "asc" | "desc" | "off" },
): string {
	let label = column.name;

	if (column.isPrimaryKey) {
		label = `🔑${label}`;
	}

	if (sortConfig.column === column.name) {
		if (sortConfig.direction === "asc") {
			label = `${label} ↑`;
		} else if (sortConfig.direction === "desc") {
			label = `${label} ↓`;
		}
	}

	const truncated = truncateToWidth(label, width);
	return truncated.padEnd(width, " ");
}

export const DataPreviewView = React.memo(DataPreviewViewComponent);
