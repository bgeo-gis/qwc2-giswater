import isEmpty from 'lodash.isempty';
import ConfigUtils from 'qwc2/utils/ConfigUtils';

const GwUtils = {
    getServiceUrl(service) {
        const request_url = ConfigUtils.getConfigProp("giswaterServiceUrl")
        if (isEmpty(request_url)) {
            return "";
        }
        return request_url + service + "/";
    },
    findLayer(layer, name, path = []) {
        if (layer.name === name) {
            return { layer, path };
        } else if (layer.sublayers) {
            for (let i = 0; i < layer.sublayers.length; i++) {
                const found = this.findLayer(layer.sublayers[i], name, [...path, i]);
                if (found.layer) {
                    return found;
                }
            }
        }
        return { layer: null, path };
    },
    forEachWidgetInForm(form, func) {
        this._handleWidget(form.ui.widget, func)
    },
    _handleWidget(widget, func) {
        func(widget)

        if (widget.layout) {
            this._handleLayout(widget.layout, func)
        }
        else if (widget.widget) {
            widget.widget.map(tab => {
                this._handleWidget(tab, func)
            })
        }
    },
    _handleLayout(layout, func) {
        layout.item.map(item => {
            if (item.layout) {
                this._handleLayout(item.layout, func)
            }
            else if (item.widget) {
                this._handleWidget(item.widget, func)
            }
        })
    }
};

export default GwUtils;