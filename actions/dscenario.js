/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import ReducerIndex from "qwc2/reducers/index";
import dscenarioReducer from "../reducers/dscenario";
ReducerIndex.register("dscenario", dscenarioReducer);

export const SET_ACTIVE_DSCENARIO = 'SET_ACTIVE_DSCENARIO';

export function setActiveDscenario(dscenarioResult, keepManagerOpen, dscenarioId) {
    return {
        type: SET_ACTIVE_DSCENARIO,
        dscenarioResult: dscenarioResult,
        keepManagerOpen: keepManagerOpen,
        dscenarioId: dscenarioId
    };
}