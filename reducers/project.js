/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import {SET_PROJECT_DATA} from '../actions/project';

const defaultState = {
    tiled: false
};

export default function project(state = defaultState, action) {
    switch (action.type) {
    case SET_PROJECT_DATA: {
        return {...state, tiled: action.tiled};
    }
    default:
        return state;
    }
}
