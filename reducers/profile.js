import {CHANGE_PROFILE_STATE} from '../actions/profile';

// optional state
const defaultState = {
    profiling: false,
    coordinates: null,
    length: null,
    allNodeCoordinates: null,
    allNodeLength: null,
    feature: null,
    theme: null,
    initNode: null,
    endNode: null,
    epsg: null
}

export default function profile(state = defaultState, action) {
    switch (action.type){
        case CHANGE_PROFILE_STATE: {
            return {...action.data};
        }
        default:
            return state;
    }
}