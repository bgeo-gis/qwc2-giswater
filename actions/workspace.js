/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 */
import ReducerIndex from "qwc2/reducers/index";
import workspaceReducer from "../reducers/workspace";
ReducerIndex.register("workspace", workspaceReducer);

export const SET_ACTIVE_WORKSPACE = 'SET_ACTIVE_WORKSPACE';
export const REFRESH_MANAGER = 'REFRESH_MANAGER';

export function setActiveWorkspace(workspaceData, keepManagerOpen) {
    console.log("Action: Set active workspace:", workspaceData);
    return {
        type: SET_ACTIVE_WORKSPACE,
        workspaceData: workspaceData,
        keepManagerOpen: keepManagerOpen
    };
}

export function setRefreshManager() {
    return {
        type: REFRESH_MANAGER,
    };
}
