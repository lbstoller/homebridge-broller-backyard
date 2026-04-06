import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { BrollerHomebridgePlatform } from './platform.js';

/*
 * Layer an interface over the json object.
 */
interface Temperature {
  readonly temperature: number;
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class BrollerPlatformAccessory {
    private service: Service;

    /* Characteristic States */
    private accessoryState = {
	temperature: 45,
	statusActive: false,
    };
    private readonly url: string;

    constructor(
	private readonly platform: BrollerHomebridgePlatform,
	private readonly accessory: PlatformAccessory) {
	
	this.platform.log.debug('Setting up Broller temperature sensor');
	this.url = accessory.context.device.url;
	
	// set accessory information
	this.accessory.getService(this.platform.Service.AccessoryInformation)!
	    .setCharacteristic(this.platform.Characteristic.Manufacturer,
			       'Default-Manufacturer')
	    .setCharacteristic(this.platform.Characteristic.Model,
			       'Default-Model')
	    .setCharacteristic(this.platform.Characteristic.SerialNumber,
			       'Default-Serial');
	// get the sensor service if it exists, otherwise create a new service
	// you can create multiple services for each accessory
	this.service = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
	    this.accessory.addService(this.platform.Service.TemperatureSensor);

	// set the service name, this is what is displayed as the
	// default name on the Home app in this example we are using the
	// name we stored in the `accessory.context` in the
	// `discoverDevices` method.
	this.service.setCharacteristic(this.platform.Characteristic.Name,
				       accessory.context.device.name);

	// register handler for the temperature Characteristic
	this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
	    .onGet(this.getCurrentTemperature.bind(this));
	// and a handler for the statusActive Characteristic
	this.service.getCharacteristic(this.platform.Characteristic.StatusActive)
	    .onGet(this.getStatusActive.bind(this));

	/*
	 * Updating characteristics values asynchronously.
	 *
	 * Example showing how to update the state of a Characteristic
	 * asynchronously instead of using the `on('get')` handlers.
	 */
	setInterval(() => {
	    this.platform.log.debug('Triggering temperature interval:');

	    this.updateTemperature()
		.then(() => {
		    this.platform.log.debug('update temperature done');
		    // push the new value and status to HomeKit
		    this.service.updateCharacteristic(
			this.platform.Characteristic.CurrentTemperature,
			this.accessoryState.temperature);
		    this.service.updateCharacteristic(
			this.platform.Characteristic.StatusActive,
			this.accessoryState.statusActive);
		});
	}, 10000);
	
	this.platform.log.debug('Finished setting up Broller temperature sensor');
    }

    /*
     * Handle the "GET" requests from HomeKit
     * These are sent when HomeKit wants to know the current state of the accessory
     *
     * GET requests should return as fast as possible. A long delay here will result in
     * HomeKit being unresponsive and a bad user experience in general.
     *
     * If your device takes time to respond you should update the status of your device
     * asynchronously instead using the `updateCharacteristic` method instead.
     * In this case, you may decide not to implement `onGet` handlers, which may speed up
     * the responsiveness of your device in the Home app.
     */
    getCurrentTemperature() {
	this.platform.log.debug('Triggering getCurrentTemperature:');
	return this.accessoryState.temperature;
    }
    getStatusActive() {
	this.platform.log.debug('Triggering getStatusActive:');
	return this.accessoryState.statusActive;
    }

    /*
     * Handle the interval timer; async fetch temperature from the arduino which
     * responds to a http GET with a json string. 
     */
    async updateTemperature() {
	let updated = false;
	await this.callServer()
	    .then((temperature: Temperature) => {
		this.platform.log.debug('CallServerResponse: Temperature: '
		    + temperature.temperature);
		// Comes back in F, but Homebridge wants C.
		this.accessoryState.temperature = (temperature.temperature - 32) / 1.8;
		updated = true;
	    })
	    .catch((error) => {
		this.platform.log('updateTemperature Error : ' + error.message);
	    });
	this.accessoryState.statusActive = updated;
	return updated;
    }
    async callServer(): Promise<Temperature> {
	const response = await fetch(this.url);
	return response.json() as Promise<Temperature>;
    }
}
