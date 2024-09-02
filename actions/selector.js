/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import ReducerIndex from "qwc2/reducers/index";
import selectorReducer from "../reducers/selector";
ReducerIndex.register("selector", selectorReducer);

export const SET_ACTIVE_SELECTOR = 'SET_ACTIVE_SELECTOR';

export function setActiveSelector(selectorResult, mincutIds) {
    return {
        type: SET_ACTIVE_SELECTOR,
        selectorResult: selectorResult,
        mincutIds: mincutIds
    };
}
