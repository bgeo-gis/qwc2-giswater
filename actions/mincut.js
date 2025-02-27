/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import ReducerIndex from "qwc2/reducers/index";
import mincutReducer from "../reducers/mincut";
ReducerIndex.register("mincut", mincutReducer);

export const SET_ACTIVE_MINCUT = 'SET_ACTIVE_MINCUT';

export function setActiveMincut(mincutResult, keepManagerOpen) {
    return {
        type: SET_ACTIVE_MINCUT,
        mincutResult: mincutResult,
        keepManagerOpen: keepManagerOpen
    };
}
