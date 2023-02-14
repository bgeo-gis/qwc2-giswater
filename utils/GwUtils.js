import isEmpty from 'lodash.isempty';
import ConfigUtils from 'qwc2/utils/ConfigUtils';

const GwUtils = {
    getServiceUrl(service) {
        const request_url = ConfigUtils.getConfigProp("giswaterServiceUrl")
        if (isEmpty(request_url)) {
            return "";
        }
        return request_url + service + "/";
    }
};

export default GwUtils;