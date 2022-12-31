import {computed, inject, ref, watch} from "vue";

export function useWebDjTrack() {
    const node = inject('node');

    const trackGain = ref(55);
    const trackPassThrough = ref(false);
    const position = ref(null);
    const volume = ref(0);

    let source = null;

    const isPlaying = computed(() => {
        return source !== null;
    });

    const isPaused = computed(() => {
        return (source !== null)
            ? source.paused
            : false;
    });

    const createControlsNode = () => {
        const bufferSize = 4096;
        const bufferLog = Math.log(parseFloat(bufferSize));
        const log10 = 2.0 * Math.log(10);

        let newSource = node.context.createScriptProcessor(bufferSize, 2, 2);

        newSource.onaudioprocess((buf) => {
            position.value = source?.position();

            for (let channel = 0; channel < buf.inputBuffer.numberOfChannels; channel++) {
                let channelData = buf.inputBuffer.getChannelData(channel);

                let rms = 0.0;
                for (let i = 0; i < channelData.length; i++) {
                    rms += Math.pow(channelData[i], 2);
                }

                volume.value = 100 * Math.exp((Math.log(rms) - bufferLog) / log10);

                buf.outputBuffer.getChannelData(channel).set(channelData);
            }
        });

        return newSource;
    };

    const createPassThrough = () => {
        let newSource = node.context.createScriptProcessor(256, 2, 2);

        newSource.onaudioprocess((buf) => {
            for (let channel = 0; channel < buf.inputBuffer.numberOfChannels; channel++) {
                let channelData = buf.inputBuffer.getChannelData(channel);

                if (trackPassThrough.value) {
                    buf.outputBuffer.getChannelData(channel).set(channelData);
                } else {
                    buf.outputBuffer.getChannelData(channel).set(new Float32Array(channelData.length));
                }
            }
        });

        return newSource;
    };

    let controlsNode = null;
    let trackGainNode = null;
    let passThroughNode = null;

    const setTrackGain = (newGain) => {
        if (null === trackGainNode) {
            return;
        }

        trackGainNode.gain.value = parseFloat(newGain) / 100.0;
    };
    watch(trackGain, setTrackGain);

    const prepare = () => {
        controlsNode = createControlsNode();
        controlsNode.connect(node.sink);

        trackGainNode = node.context.createGain();
        trackGainNode.connect(controlsNode);

        passThroughNode = createPassThrough();
        passThroughNode.connect(node.context.destination);
        trackGainNode.connect(passThroughNode);

        node.context.resume();
    }

    const togglePause = () => {
        if (source === null) {
            return;
        }

        if (source.paused) {
            source.play();
        } else {
            source.pause();
        }
    };

    const stop = () => {
        source?.stop();
        source?.disconnect();

        trackGainNode?.disconnect();
        controlsNode?.disconnect();
        passThroughNode?.disconnect();

        source = trackGainNode = controlsNode = passThroughNode = null;

        position.value = 0.0;
    };

    return {
        node,
        trackGain,
        trackPassThrough,
        position,
        volume,
        isPlaying,
        isPaused,
        prepare,
        togglePause,
        stop,
    };
}