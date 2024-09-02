/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import ReducerIndex from "qwc2/reducers/index";
import profileReducer from "../reducers/profile";
ReducerIndex.register("profile", profileReducer);

export const CHANGE_PROFILE_STATE = 'CHANGE_PROFILE_STATE';

export function changeProfileState(profileState) {
    return {
        type: CHANGE_PROFILE_STATE,
        data: profileState
    };
}
