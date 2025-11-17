import { produce } from "immer";
import { type AppState, initialAppState, ViewState } from "../types/state.js";
import { ActionType, type AppAction } from "./actions.js";

// Simple function to create a cache key for a table
const tableCacheKey = (table: AppState["selectedTable"]): string | null => {
	if (!table) return null;
	return table.schema ? `${table.schema}.${table.name}` : table.name;
};

function resetSearchState(draft: AppState): void {
	draft.searchTerm = "";
	draft.searchResults = [];
	draft.searchTotalCount = 0;
	draft.searchOffset = 0;
	draft.searchHasMore = false;
	draft.searchSelectedIndex = null;
}

export function appReducer(
	state: AppState = initialAppState,
	action: AppAction,
): AppState {
	return produce(state, (draft) => {
		switch (action.type) {
			case ActionType.SetView:
				draft.currentView = action.view;
				draft.infoMessage = null;
				draft.errorMessage = null;
				break;

			case ActionType.SelectDBType:
				draft.dbType = action.dbType;
				draft.currentView = ViewState.Connection;
				break;

			case ActionType.SetDBType:
				draft.dbType = action.dbType;
				break;

			case ActionType.StartLoading:
				draft.loading = true;
				break;

			case ActionType.StopLoading:
				draft.loading = false;
				break;

			case ActionType.SetError:
				draft.errorMessage =
					typeof action.error === "string"
						? action.error
						: action.error.message;
				draft.loading = false;
				break;

			case ActionType.ClearError:
				draft.errorMessage = null;
				break;

			case ActionType.SetInfo:
				draft.infoMessage = action.message;
				break;

			case ActionType.ClearInfo:
				draft.infoMessage = null;
				break;

			case ActionType.SetShowCommandHints:
				draft.showCommandHints = action.show;
				break;

			case ActionType.SetActiveConnection:
				draft.activeConnection = action.connection;
				break;

			case ActionType.ClearActiveConnection:
				draft.activeConnection = null;
				draft.tables = [];
				draft.columns = [];
				draft.selectedTable = null;
				draft.dataRows = [];
				draft.hasMoreRows = false;
				draft.currentOffset = 0;
				draft.refreshingTableKey = null;
				draft.refreshTimestamps = {};
				draft.notifications = [];
				resetSearchState(draft);
				break;

			case ActionType.SetSavedConnections:
				draft.savedConnections = action.connections;
				break;

			case ActionType.AddSavedConnection:
				draft.savedConnections.push(action.connection);
				break;

			case ActionType.UpdateSavedConnection: {
				const index = draft.savedConnections.findIndex(
					(conn) => conn.id === action.connection.id,
				);
				if (index >= 0) {
					draft.savedConnections[index] = action.connection;
				}
				break;
			}

			case ActionType.RemoveSavedConnection:
				draft.savedConnections = draft.savedConnections.filter(
					(conn) => conn.id !== action.connectionId,
				);
				break;

			case ActionType.SetTables:
				draft.tables = action.tables;
				break;

			case ActionType.SetColumns:
				draft.columns = action.columns;
				break;

			case ActionType.SetSelectedTable:
				draft.selectedTable = action.table;
				resetSearchState(draft);
				draft.columns = [];
				draft.dataRows = [];
				draft.hasMoreRows = false;
				draft.currentOffset = 0;
				draft.refreshingTableKey = tableCacheKey(action.table);
				break;

			case ActionType.UpdateDataRowValue: {
				const { columnName, value, rowIndex, table } = action;
				const effectiveRowIndex =
					rowIndex !== null ? rowIndex : draft.selectedRowIndex;
				if (effectiveRowIndex !== null && draft.dataRows[effectiveRowIndex]) {
					draft.dataRows[effectiveRowIndex] = {
						...draft.dataRows[effectiveRowIndex],
						[columnName]: value,
					};
				}
				if (draft.expandedRow) {
					draft.expandedRow = {
						...draft.expandedRow,
						[columnName]: value,
					};
				}
				break;
			}

			case ActionType.ClearSelectedTable:
				draft.selectedTable = null;
				draft.dataRows = [];
				draft.hasMoreRows = false;
				draft.currentOffset = 0;
				draft.refreshingTableKey = null;
				resetSearchState(draft);
				break;

			case ActionType.SetDataRows:
				draft.dataRows = action.rows;
				break;

			case ActionType.SetRefreshingTable:
				draft.refreshingTableKey = action.key;
				break;

			case ActionType.SetHasMoreRows:
				draft.hasMoreRows = action.hasMore;
				break;

			case ActionType.SetCurrentOffset:
				draft.currentOffset = action.offset;
				draft.selectedRowIndex = null;
				draft.expandedRow = null;
				break;

			case ActionType.SetSelectedRowIndex:
				draft.selectedRowIndex = action.index;
				draft.expandedRow = null;
				break;

			case ActionType.SetExpandedRow:
				draft.expandedRow = action.row;
				break;

			case ActionType.SetColumnVisibilityMode:
				draft.columnVisibilityMode = action.mode;
				break;

			case ActionType.SetRefreshTimestamp:
				draft.refreshTimestamps[action.key] = action.timestamp;
				break;

			case ActionType.AddNotification:
				draft.notifications.push(action.notification);
				break;

			case ActionType.RemoveNotification:
				draft.notifications = draft.notifications.filter(
					(note) => note.id !== action.id,
				);
				break;

			case ActionType.SetQueryHistory:
				draft.queryHistory = action.history || [];
				break;

			case ActionType.AddQueryHistoryItem:
				if (!draft.queryHistory) {
					draft.queryHistory = [];
				}
				draft.queryHistory.unshift(action.item);
				break;

			case ActionType.SetSortConfig:
				draft.sortConfig = action.sortConfig;
				break;

			case ActionType.EnterSortPickerMode:
				draft.sortPickerMode = true;
				draft.sortPickerColumnIndex = 0;
				break;

			case ActionType.ExitSortPickerMode:
				draft.sortPickerMode = false;
				break;

			case ActionType.SetSortPickerColumn:
				draft.sortPickerColumnIndex = action.columnIndex;
				break;

			case ActionType.SetFilterValue:
				draft.filterValue = action.filterValue;
				break;

			case ActionType.SetSearchTerm:
				draft.searchTerm = action.term;
				break;

			case ActionType.SetSearchResultsPage:
				draft.searchResults = action.rows;
				draft.searchTotalCount = action.totalCount;
				draft.searchOffset = action.offset;
				draft.searchHasMore = action.hasMore;
				draft.searchSelectedIndex = action.rows.length > 0 ? 0 : null;
				break;

			case ActionType.SetSearchSelectedIndex:
				draft.searchSelectedIndex = action.index;
				break;

			case ActionType.ClearSearch:
				resetSearchState(draft);
				break;

			case ActionType.AddViewHistoryEntry: {
				// Prevent duplicate consecutive entries with the same summary
				const lastEntry = draft.viewHistory[draft.viewHistory.length - 1];
				if (!lastEntry || lastEntry.summary !== action.entry.summary) {
					draft.viewHistory.push(action.entry);
				}
				break;
			}

			case ActionType.SetBreadcrumbs:
				draft.breadcrumbs = action.breadcrumbs;
				break;

			case ActionType.AddBreadcrumb: {
				// Prevent duplicate consecutive breadcrumbs with the same label and view
				const lastCrumb = draft.breadcrumbs[draft.breadcrumbs.length - 1];
				if (
					!lastCrumb ||
					lastCrumb.label !== action.breadcrumb.label ||
					lastCrumb.view !== action.breadcrumb.view
				) {
					draft.breadcrumbs.push(action.breadcrumb);
				}
				break;
			}

			case ActionType.ClearHistory:
				draft.viewHistory = [];
				draft.breadcrumbs = [];
				break;

			default:
				return state;
		}
	});
}
