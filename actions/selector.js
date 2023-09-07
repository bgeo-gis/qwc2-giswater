import ReducerIndex from "qwc2/reducers/index";
import selectorReducer from "../reducers/selector";
ReducerIndex.register("selector", selectorReducer);

export const SET_ACTIVE_SELECTOR = 'SET_ACTIVE_SELECTOR';

export function setActiveSelector(selectorResult, mincutIds) {
    return {
        type: SET_ACTIVE_SELECTOR,
        selectorResult: selectorResult,
        mincutIds: mincutIds
    };
}