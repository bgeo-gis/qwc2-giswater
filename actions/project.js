/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import ReducerIndex from "qwc2/reducers/index";
import projectReducer from "../reducers/project";
ReducerIndex.register("project", projectReducer);

export const SET_PROJECT_DATA = 'SET_PROJECT_DATA';

export function setProjectData(tiled) {
    return {
        type: SET_PROJECT_DATA,
        tiled: tiled
    };
}
