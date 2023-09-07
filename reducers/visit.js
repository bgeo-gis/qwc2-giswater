import {SET_ACTIVE_VISIT} from '../actions/visit';

// optional state
const defaultState = {}

export default function visit(state = defaultState, action) {
    switch (action.type){
        case SET_ACTIVE_VISIT: {
            return {...state, visitResult: action.visitResult, keepManagerOpen: action.keepManagerOpen};
        }
        default:
            return state;
    }
}