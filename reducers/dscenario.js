/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import { SET_ACTIVE_DSCENARIO } from '../actions/dscenario';

const defaultState = {
    dscenarioResult: null,
    keepManagerOpen: false,
    dscenarioId: -1
};

export default function dscenario(state = defaultState, action) {
    switch (action.type) {
        case SET_ACTIVE_DSCENARIO: {
            return {
                ...state,
                dscenarioResult: action.dscenarioResult,
                keepManagerOpen: action.keepManagerOpen,
                dscenarioId: action.dscenarioId
            };
        }
        default:
            return state;
        }
}
