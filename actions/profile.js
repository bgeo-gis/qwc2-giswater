import ReducerIndex from "qwc2/reducers/index";
import profileReducer from "../reducers/profile";
ReducerIndex.register("profile", profileReducer);

export const CHANGE_PROFILE_STATE = 'CHANGE_PROFILE_STATE';

export function changeProfileState(profileState){
    return {
        type: CHANGE_PROFILE_STATE,
        data: profileState
    };
}