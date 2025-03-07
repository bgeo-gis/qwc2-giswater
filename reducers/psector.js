/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import { SET_ACTIVE_PSECTOR } from '../actions/psector';

const defaultState = {
    psectorResult: null,
    keepManagerOpen: false,
    psectorObj: null
};

export default function psector(state = defaultState, action) {
    switch (action.type) {
        case SET_ACTIVE_PSECTOR: {
            return {
                ...state,
                psectorResult: action.psectorResult,
                keepManagerOpen: action.keepManagerOpen,
                psectorObj: action.psectorObj
            };
        }
        default:
            return state;
        }
}
