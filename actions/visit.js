import ReducerIndex from "qwc2/reducers/index";
import visitReducer from "../reducers/visit";
ReducerIndex.register("visit", visitReducer);

export const SET_ACTIVE_VISIT = 'SET_ACTIVE_VISIT';

export function setActiveVisit(visitResult, keepManagerOpen) {
    return {
        type: SET_ACTIVE_VISIT,
        visitResult: visitResult,
        keepManagerOpen: keepManagerOpen
    };
}