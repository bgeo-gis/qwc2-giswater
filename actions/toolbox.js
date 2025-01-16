/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import ReducerIndex from "qwc2/reducers/index";
import toolboxReducer from "../reducers/toolbox";
ReducerIndex.register("toolbox", toolboxReducer);

export const OPEN_TOOLBOX_PROCESS = 'OPEN_TOOLBOX_PROCESS';

export function openToolBoxProcess(processId) {
    return {
        type: OPEN_TOOLBOX_PROCESS,
        processId: processId
    };
}
