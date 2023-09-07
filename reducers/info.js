import {SET_IDENTIFY_RESULT} from '../actions/info';

// optional state
const defaultState = {}

export default function info(state = defaultState, action) {
    switch (action.type){
        case SET_IDENTIFY_RESULT: {
            return {...state, identifyResult: action.identifyResult};
        }
        default:
            return state;
    }
}