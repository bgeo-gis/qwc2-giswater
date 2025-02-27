/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import {SET_ACTIVE_VISIT} from '../actions/visit';

// optional state
const defaultState = {
    visitResult: null,
    keepManagerOpen: false
};

export default function visit(state = defaultState, action) {
    switch (action.type) {
    case SET_ACTIVE_VISIT: {
        return {...state, visitResult: action.visitResult, keepManagerOpen: action.keepManagerOpen};
    }
    default:
        return state;
    }
}
