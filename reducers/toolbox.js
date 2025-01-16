/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import { OPEN_TOOLBOX_PROCESS } from '../actions/toolbox';

const defaultState = {
    processId: -1
};

export default function toolbox(state = defaultState, action) {
    switch (action.type) {
        case OPEN_TOOLBOX_PROCESS: {
            return {
                ...state,
                processId: action.processId
            };
        }
        default:
            return state;
        }
}
