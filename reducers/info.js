/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import {SET_IDENTIFY_RESULT} from '../actions/info';

// optional state
const defaultState = {
    identifyResult: null
};

export default function info(state = defaultState, action) {
    switch (action.type) {
    case SET_IDENTIFY_RESULT: {
        return {...state, identifyResult: action.identifyResult};
    }
    default:
        return state;
    }
}
