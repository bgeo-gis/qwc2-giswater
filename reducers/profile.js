/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import {CHANGE_PROFILE_STATE} from '../actions/profile';

// optional state
const defaultState = {
    profiling: false,
    coordinates: null,
    length: null,
    allNodeCoordinates: null,
    allNodeLength: null,
    feature: null,
    theme: null,
    initNode: null,
    endNode: null,
    epsg: null
};

export default function profile(state = defaultState, action) {
    switch (action.type) {
    case CHANGE_PROFILE_STATE: {
        return {...action.data};
    }
    default:
        return state;
    }
}
