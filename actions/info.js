import ReducerIndex from "qwc2/reducers/index";
import infoReducer from "../reducers/info";
ReducerIndex.register("info", infoReducer);

export const SET_IDENTIFY_RESULT = 'SET_IDENTIFY_RESULT';

export function setIdentifyResult(identifyResult) {
    return {
        type: SET_IDENTIFY_RESULT,
        identifyResult: identifyResult
    };
}