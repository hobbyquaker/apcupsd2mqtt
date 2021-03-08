#!/usr/bin/env node

const exec = require('child_process').exec;
const Mqtt = require('mqtt');
const log = require('yalm');
const pkg = require('./package.json');
const config = require('./config.js');

log.setLevel(config.verbosity);
log.info(pkg.name + ' version ' + pkg.version + ' starting');

const mqtt = Mqtt.connect(config.mqttUrl);

mqtt.on('connect', () => {
    log.info('mqtt connected to', config.mqttUrl);
});

mqtt.on('close', () => {
    log.warn('mqtt connection closed');
});

const datapoints = ['upsname', 'status', 'linev', 'linefreq', 'loadpct', 'battv', 'bcharge', 'timeleft'];
const numeric = ['linev', 'linefreq', 'loadpct', 'battv', 'bcharge', 'timeleft'];
const curvalues = {}; // Holds current values
let devicename = config.upsName;

function executeCmd(cmd, callback) {
    exec(cmd, (err, stdout, stderror) => {
        if (err) {
            callback(err);
        } else if (stderror) {
            callback(stderror);
        } else if (stdout) {
            callback(null, stdout);
        } else {
            callback(null, null);
        }
    });
}

function poll() {
    executeCmd('apcaccess', (err, response) => {
        if (err) {
            log.error(err);
        } else {
            log.debug(response);
            const lines = response.trim().split('\n');

            // Loop over every line
            lines.forEach(line => {
                // Assign values
                let [label, value] = line.split(' : ');

                label = label.toLowerCase();
                // Remove surrounding spaces
                label = label.replace(/(^\s+|\s+$)/g, '');
                // If found as wanted value, store it
                if (datapoints.indexOf(label) !== -1) {
                    value = value.replace(/(^\s+|\s+$)/g, '');
                    if (numeric.indexOf(label) !== -1) {
                        value = parseFloat(value.split(' ')[0]);
                    }

                    if (label === 'upsname') {
                        devicename = value;
                    } else if (!config.publishChangesOnly || (curvalues[label] !== value)) {
                        curvalues[label] = value;
                        log.debug(value + ' changed!');
                        // Publish value
                        const topic = config.name + '/status/' + devicename + '/' + label;
                        const payload = JSON.stringify({val: value});
                        log.debug('mqtt >', topic, payload);
                        mqtt.publish(topic, payload, {retain: true});
                    }
                }
            });
        }
        log.debug(curvalues);
        setTimeout(poll, config.interval * 1000);
    });
}

poll();
