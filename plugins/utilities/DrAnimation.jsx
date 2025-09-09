import React from 'react';
import { connect } from 'react-redux';

import MapUtils from 'qwc2/utils/MapUtils';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';

import PropTypes from 'prop-types';

import { setCurrentTask } from 'qwc2/actions/task';
import TileLayer from 'ol/layer/WebGLTile';
import GeoTIFF from 'ol/source/GeoTIFF.js';
import { transformExtent } from 'ol/proj';
import { fromUrl } from 'geotiff';
import colormap from 'colormap';

import './style/DrAnimation.css';

function getColorStops(name, steps, reverse) {
    const delta = 1 / (steps - 1);
    const stops = new Array(steps * 2);
    const colors = colormap({ colormap: name, nshades: steps, format: 'rgba' });
    if (reverse) {
        colors.reverse();
    }
    for (let i = 0; i < steps; i++) {
        const x = i * delta;
        const alpha = Math.min(1, Math.max(i / (steps * 0.1), 0.2));
        colors[i][3] = alpha;
        stops[i * 2] = x;
        stops[i * 2 + 1] = colors[i];
    }
    return stops;
}

const style = {
    variables: {
        index: 1,
        nodata: 0,
    },
    color: [
        'case',
        ['==', ['band', ['var', 'index']], ['var', 'nodata']],
        'rgba(0,0,0,0.0)',
        [
            'interpolate',
            ['linear'],
            ['band', ['var', 'index']],
            ...getColorStops('jet', 16, false),
        ]
    ]

};

function padToNumber(value, reference) {
    const digits = reference.toString().length;
    return value.toString().padStart(digits, '0');
}

class DrAnimation extends React.Component {
    static propTypes = {
        active: PropTypes.bool,
    };

    state = {
        numFrames: null,
        currentFrame: 1,
        frameDuration: 50,
        isPlaying: false,
    }

    layer = null;
    frameRef = React.createRef();
    lastFrameTstamp = null;
    animationRequest = null;

    componentDidUpdate(prevProps, prevState) {
        if (this.state.currentFrame !== prevState.currentFrame) {
            this.layer?.updateStyleVariables({
                index: this.state.currentFrame,
            });
        }
    }

    handleFile = (url) => {
        this.onClose();

        let map = MapUtils.getHook(MapUtils.GET_MAP);

        if (this.layer) {
            map.removeLayer(this.layer);
        }

        const source = new GeoTIFF({
            sources: [
                { url: url },
            ],
            interpolate: false,
        });
        this.layer = new TileLayer({
            style: style,
            source: source,
            opacity: 0.9,
            zIndex: 10000,
        });
        map.addLayer(this.layer);


        const displayPixelValue = (event) => {
            if (!this.layer) {
                return;
            }
            const data = this.layer.getData(event.pixel);
            if (!data) {
                return;
            }
            console.log("Pixel data:", data);
        }
        map.on(['pointermove', 'click'], displayPixelValue);


        fromUrl(url).then((tiff) => {
            tiff.getImage().then((image) => {
                console.log(image.getGDALNoData())
                const bands = image.getSamplesPerPixel()

                const alphaBand = bands - 1;
                this.layer.updateStyleVariables({
                    alphaBand: alphaBand,
                });

                this.setState({
                    numFrames: bands - 1,
                });
            });
        });

        // Zoom to the extent of the layer
        source.getView().then((sourceView) => {
            console.log("sourceView", sourceView);
            const view = map.getView();


            // sourceView.extent is in sourceView.projection
            // transform it to the map view projection before fitting
            const extentTransformed = transformExtent(
                sourceView.extent,
                sourceView.projection,
                view.getProjection()
            );  // transforms [minX, minY, maxX, maxY] :contentReference[oaicite:2]{index=2}

            // 3) fit the map view to the transformed extent
            view.fit(extentTransformed, {
                size: map.getSize(),
                padding: [20, 20, 20, 20]
            });
        });
    }

    animateFrame = (timestamp) => {
        if (!this.state.isPlaying) return;

        const numFrames = this.state.numFrames;
        const frameDuration = this.state.frameDuration;

        if (!this.lastFrameTstamp) {
            this.lastFrameTstamp = timestamp;
        }

        const elapsed = timestamp - this.lastFrameTstamp;

        if (elapsed > frameDuration) {
            const frame = (this.frameRef.current) % numFrames + 1; // Ensure frame is between 1 and numFrames

            this.frameRef.current = frame;
            this.setState({
                currentFrame: frame,
            });

            this.lastFrameTstamp = timestamp - (elapsed % frameDuration);
        }

        this.animationRequest = requestAnimationFrame(this.animateFrame);
    }

    onClose = () => {
        cancelAnimationFrame(this.animationRequest);
        this.animationRequest = null;
        this.lastFrameTstamp = null;
        this.setState({
            numFrames: null,
            currentFrame: 1,
            isPlaying: false,
        });

        if (this.layer) {
            let map = MapUtils.getHook(MapUtils.GET_MAP);
            map.removeLayer(this.layer);
            this.layer = null;
        }
    }

    render() {
        if (!this.props.active) {
            return null;
        }
        return (
            <ResizeableWindow icon="camera" key="DrAnimation"
                onClose={() => {
                    this.onClose();
                    this.props.setCurrentTask(null);
                }} title="Drain Animation Viewer"
                initialWidth={400} initialHeight={200}
            >
                <div className="cog-container" role="body">
                    <div className="file-controls">
                        <label className="file-input-button">
                            <input
                                type="file"
                                id="file"
                                name="file"
                                accept=".tif, .tiff"
                                onChange={(event) => {
                                    const file = event.target.files[0];
                                    if (!file) return;
                                    const url = URL.createObjectURL(file);
                                    this.handleFile(url);
                                }}
                            />
                        </label>
                        <button
                            className="sample-file-button"
                            // HACK: the /bgeo is dependent on the tenant, the file should probably go somewhere else
                            onClick={() => this.handleFile('/bgeo/assets/data/cog.tif')}
                        >
                            Load Sample
                        </button>
                    </div>

                    {this.state.numFrames > 0 && (
                        <div className="animation-controls">

                            <div className="slider-row">
                                <input
                                    type="range"
                                    min="1"
                                    max={this.state.numFrames}
                                    value={this.state.currentFrame}
                                    onChange={(e) => {
                                        const frame = Number(e.target.value);
                                        this.frameRef.current = frame;
                                        this.setState({ currentFrame: frame });
                                    }}
                                    className="frame-slider"
                                />
                                <div className="frame-display">
                                    {padToNumber(this.state.currentFrame, this.state.numFrames)}/{this.state.numFrames}
                                </div>
                            </div>

                            <div className="controls-row">
                                <div className="controls">
                                    <button
                                        className="step-button"
                                        onClick={() => {
                                            const nextFrame = Math.max(this.state.currentFrame - 1, 1);
                                            this.frameRef.current = nextFrame;
                                            this.setState({ currentFrame: nextFrame });
                                        }}
                                        disabled={this.state.currentFrame == 1 || this.state.isPlaying}
                                    >{'<'}</button>
                                    <button
                                        className="play-button"
                                        onClick={() => {
                                            if (this.state.isPlaying) {
                                                cancelAnimationFrame(this.animationRequest);
                                                this.setState({ isPlaying: false });
                                            } else {
                                                this.frameRef.current = this.state.currentFrame;
                                                this.setState({ isPlaying: true }, () => {
                                                    this.animateFrame();
                                                });
                                            }
                                        }}
                                    >
                                        {this.state.isPlaying ? "Pause" : "Play"}
                                    </button>
                                    <button
                                        className="step-button"
                                        onClick={() => {
                                            const nextFrame = Math.min(this.state.currentFrame + 1, this.state.numFrames);
                                            this.frameRef.current = nextFrame;
                                            this.setState({ currentFrame: nextFrame });
                                        }}
                                        disabled={this.state.currentFrame == this.state.numFrames || this.state.isPlaying}
                                    >{'>'}</button>
                                </div>

                                <div className="speed-control">
                                    <label>Delay (ms): </label>
                                    <input
                                        type="number"
                                        min="10"
                                        max="1000"
                                        step="10"
                                        value={this.state.frameDuration}
                                        onChange={(e) => {
                                            const frameDuration = Math.max(50, Number(e.target.value));
                                            this.setState({ frameDuration });
                                        }}
                                        className="frame-duration-input"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </ResizeableWindow>
        );
    }
}

export default connect(state => ({
    active: state.task.id === "DrAnimation",
}), {
    setCurrentTask: setCurrentTask
})(DrAnimation);


