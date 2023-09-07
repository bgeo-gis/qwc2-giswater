import {SET_ACTIVE_SELECTOR} from '../actions/selector';

// optional state
const defaultState = {}

export default function selector(state = defaultState, action) {
    switch (action.type){
        case SET_ACTIVE_SELECTOR: {
            return {...state, selectorResult: action.selectorResult, mincutIds: action.mincutIds};
        }
        default:
            return state;
    }
}