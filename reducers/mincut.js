/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import {SET_ACTIVE_MINCUT} from '../actions/mincut';

// optional state
const defaultState = {};

export default function mincut(state = defaultState, action) {
    switch (action.type) {
    case SET_ACTIVE_MINCUT: {
        return {...state, mincutResult: action.mincutResult, mincutId: action.mincutId, keepManagerOpen: action.keepManagerOpen};
    }
    default:
        return state;
    }
}
