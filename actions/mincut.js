import ReducerIndex from "qwc2/reducers/index";
import mincutReducer from "../reducers/mincut";
ReducerIndex.register("mincut", mincutReducer);

export const SET_ACTIVE_MINCUT = 'SET_ACTIVE_MINCUT';

export function setActiveMincut(mincutResult, mincutId, keepManagerOpen) {
    return {
        type: SET_ACTIVE_MINCUT,
        mincutResult: mincutResult,
        mincutId: mincutId,
        keepManagerOpen: keepManagerOpen
    };
}