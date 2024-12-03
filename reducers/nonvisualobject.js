/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import {SET_ACTIVE_NONVISUALOBJECT} from '../actions/nonvisualobject';

// optional state
const defaultState = {
    nonvisualobjectResult: null,
    keepManagerOpen: false,
    filterFields: null,
    dialogParams: null,
};

export default function nonvisualobject(state = defaultState, action) {
    switch (action.type) {
    case SET_ACTIVE_NONVISUALOBJECT: {
        return {...state, nonvisualobjectResult: action.nonvisualobjectResult,
                keepManagerOpen: action.keepManagerOpen,
                filterFields: action.filterFields,
                dialogParams: action.dialogParams};
    }
    default:
        return state;
    }
}
