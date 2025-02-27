/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 */
import { SET_ACTIVE_WORKSPACE, REFRESH_MANAGER } from "../actions/workspace";

const defaultState = {
    workspaceData: null,
    keepManagerOpen: false,
    refreshManager: false, // Add a new property to track refresh status
};

export default function workspace(state = defaultState, action) {
    switch (action.type) {
        case SET_ACTIVE_WORKSPACE: {
            return {
                ...state,
                workspaceData: action.workspaceData,
                keepManagerOpen: action.keepManagerOpen,
            };
        }
        case REFRESH_MANAGER: {
            return {
                ...state,
                refreshManager: !state.refreshManager, // Toggle the value to trigger a refresh
            };
        }
        default:
            return state;
    }
}
