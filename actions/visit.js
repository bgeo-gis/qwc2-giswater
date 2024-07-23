/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import ReducerIndex from "qwc2/reducers/index";
import visitReducer from "../reducers/visit";
ReducerIndex.register("visit", visitReducer);

export const SET_ACTIVE_VISIT = 'SET_ACTIVE_VISIT';

export function setActiveVisit(visitResult, keepManagerOpen) {
    return {
        type: SET_ACTIVE_VISIT,
        visitResult: visitResult,
        keepManagerOpen: keepManagerOpen
    };
}