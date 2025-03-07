/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import ReducerIndex from "qwc2/reducers/index";
import psectorReducer from "../reducers/psector";
ReducerIndex.register("psector", psectorReducer);

export const SET_ACTIVE_PSECTOR = 'SET_ACTIVE_PSECTOR';

export function setActivePsector(psectorResult, keepManagerOpen, psectorObj) {
    return {
        type: SET_ACTIVE_PSECTOR,
        psectorResult: psectorResult,
        keepManagerOpen: keepManagerOpen,
        psectorObj: psectorObj
    };
}