/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import { SET_ACTIVE_DSCENARIO, OPEN_TOOLBOX_PROCESS } from '../actions/dscenario';
// optional state
const defaultState = {
    dscenarioResult: null,
    keepManagerOpen: false,
    dscenarioId: -1,
    processId: -1
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
