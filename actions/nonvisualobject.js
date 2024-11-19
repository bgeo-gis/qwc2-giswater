/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import ReducerIndex from "qwc2/reducers/index";
import nonvisualobjectReducer from "../reducers/nonvisualobject";
ReducerIndex.register("nonvisualobject", nonvisualobjectReducer);

export const SET_ACTIVE_NONVISUALOBJECT = 'SET_ACTIVE_NONVISUALOBJECT';

export function setActiveNonvisualobject(nonvisualobjectResult, keepManagerOpen, filterFields) {
    return {
        type: SET_ACTIVE_NONVISUALOBJECT,
        nonvisualobjectResult: nonvisualobjectResult,
        keepManagerOpen: keepManagerOpen,
        filterFields: filterFields,
    };
}
