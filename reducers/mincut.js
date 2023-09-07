import {SET_ACTIVE_MINCUT} from '../actions/mincut';

// optional state
const defaultState = {}

export default function mincut(state = defaultState, action) {
    switch (action.type){
        case SET_ACTIVE_MINCUT: {
            return {...state, mincutResult: action.mincutResult, mincutId: action.mincutId, keepManagerOpen: action.keepManagerOpen};
        }
        default:
            return state;
    }
}