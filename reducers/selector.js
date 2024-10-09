/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import {SET_ACTIVE_SELECTOR} from '../actions/selector';

// optional state
const defaultState = {
    selectorResult: null,
    mincutIds: []
};

export default function selector(state = defaultState, action) {
    switch (action.type) {
    case SET_ACTIVE_SELECTOR: {
        return {...state, selectorResult: action.selectorResult, mincutIds: action.mincutIds};
    }
    default:
        return state;
    }
}
