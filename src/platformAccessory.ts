import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { BrollerBackyardPlatform } from './platform.js';

/*
 * Layer an interface over the json object.
 */
interface lightInfo {
    readonly mode: string;
    readonly onoff: string;
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class BrollerBackyardAccessory {
    private service: Service;
    private autoService: Service;

    /* Characteristic States */
    private accessoryState = {
	on: false,
	mode: "",
	active: false,
	auto: true,
    };
    private readonly baseurl: string;

    constructor(
	private readonly platform: BrollerBackyardPlatform,
	private readonly accessory: PlatformAccessory) {
	
	this.platform.log.debug('Setting up Broller backyard accessory');
	this.baseurl = accessory.context.device.url;
	
	// set accessory information
	this.accessory.getService(this.platform.Service.AccessoryInformation)!
	    .setCharacteristic(this.platform.Characteristic.Manufacturer,
			       'Default-Manufacturer')
	    .setCharacteristic(this.platform.Characteristic.Model,
			       'Default-Model')
	    .setCharacteristic(this.platform.Characteristic.SerialNumber,
			       'Default-Serial');
	// get the service if it exists, otherwise create a new service
	// you can create multiple services for each accessory
	this.service = this.accessory.getService(this.platform.Service.Switch) ||
	    this.accessory.addService(this.platform.Service.Switch);

	// set the service name, this is what is displayed as the
	// default name on the Home app in this example we are using the
	// name we stored in the `accessory.context` in the
	// `discoverDevices` method.
	this.service.setCharacteristic(this.platform.Characteristic.Name,
				       accessory.context.device.name);

	// register handler for on/off
	this.service.getCharacteristic(this.platform.Characteristic.On)
            .onGet(this.getOnOff.bind(this))
            .onSet(this.setOnOff.bind(this));

	// Add another switch for "auto" mode
	let autoName = accessory.context.device.name + " Auto";
	let autoID   = accessory.context.device.ID + "Auto";
	this.autoService = this.accessory.getService(autoName)
	    || this.accessory.addService(this.platform.Service.Switch,
					 autoName, autoID);
	
	this.autoService.setCharacteristic(this.platform.Characteristic.Name, "Auto");
	this.autoService.setCharacteristic(this.platform.Characteristic.ConfiguredName, "Auto");

	this.autoService.getCharacteristic(this.platform.Characteristic.On)
            .onGet(this.getAutoMode.bind(this))
            .onSet(this.setAutoMode.bind(this));

	/*
	 * Updating characteristics values asynchronously.
	 *
	 * Example showing how to update the state of a Characteristic
	 * asynchronously instead of using the `on('get')` handlers.
	 */
	setInterval(() => {
	    this.platform.log.debug('Triggering backyard accessory interval:');

	    this.updateOnOff()
		.then(() => {
		    this.platform.log.debug('update OnOff done');
		    this.updateHomeKit();
		});
	}, 10000);
	
	this.platform.log.debug('Finished setting up Broller backyard accessory');
    }

    // Update Homekit from current accessory values
    updateHomeKit() {
	this.service.updateCharacteristic(
	    this.platform.Characteristic.On, this.accessoryState.on);
	this.autoService.updateCharacteristic(
	    this.platform.Characteristic.On, this.accessoryState.auto);
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
    getOnOff() {
	this.platform.log.debug('Triggering getOnOff:');
	return this.accessoryState.on;
    }

    /*
     * Handle SET to turn lights on/off.
     */
    async setOnOff(value: CharacteristicValue) {
	let on = value as boolean;
	let url = this.baseurl;
	this.platform.log('setOnOff ->', value);
	
	if (on) {
	    url = url + "/on";
	}
	else {
	    url = url + "/off";
	}
	await fetch(url)
	    .then((response) => {
		this.platform.log('setOnOff returns : ' + response.ok);
		if (response.ok) {
		    if (on) {
			this.accessoryState.on = true;
			this.accessoryState.mode = "on";
		    }
		    else {
			this.accessoryState.on = false;
			this.accessoryState.mode = "off";
		    }
		    // Setting on/off turns off auto mode.
		    this.accessoryState.auto = false;
		    
		    // push the new values to HomeKit
		    this.updateHomeKit();
		}
	    })
	    .catch((error) => {
		this.platform.log('setOnOff Error : ' + error.message);
	    });
    }

    /*
     * Handle the interval timer; async fetch mode from the arduino which
     * responds to a http GET with a json string. 
     */
    async updateOnOff() {
	let updated = false;
	await this.callServer()
	    .then((info: lightInfo) => {
		this.platform.log.debug('CallServerResponse: lightInfo: '
		    + info.mode + "," + info.onoff);
		if (info.onoff == "on") {
		    this.accessoryState.on = true;
		}
		else {
		    this.accessoryState.on = false;
		}
		this.accessoryState.mode = info.mode;
		this.accessoryState.auto = (info.mode == "auto" ? true : false);
		updated = true;
	    })
	    .catch((error) => {
		this.platform.log('updateOnOff Error : ' + error.message);
	    });
	this.accessoryState.active = updated;
	return updated;
    }
    async callServer(): Promise<lightInfo> {
	let url = this.baseurl + "/info";
	
	const response = await fetch(url);
	return response.json() as Promise<lightInfo>;
    }

    getAutoMode() {
	this.platform.log('Triggering getAutoMode:');
	return this.accessoryState.auto;
    }
    
    async setAutoMode(value: CharacteristicValue) {
	let on = value as boolean;	
	let url = this.baseurl + "/auto";
	this.platform.log('Triggering setAutoMode: ' + on);

	// XXX: Only allowed to return to auto mode after on/off.
	if (! on) {
	    return this.accessoryState.auto;
	}
	await fetch(url)
	    .then((response) => {
		this.platform.log('setAutoMode returns : ' + response.ok);
		if (response.ok) {
		    this.accessoryState.auto = true;
		    this.accessoryState.mode = "auto";
		}
		// push the new values to HomeKit
		this.updateHomeKit();
	    })
	    .catch((error) => {
		this.platform.log('setAutoMode Error : ' + error.message);
	    });
    }
}
