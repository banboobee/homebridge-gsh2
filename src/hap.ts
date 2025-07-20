import { HapClient, ServiceType } from '@homebridge/hap-client';
import { SmartHomeV1ExecuteRequestCommands, SmartHomeV1ExecuteResponseCommands, SmartHomeV1SyncDevices } from 'actions-on-google';
import * as fs from 'fs';
import { Subject } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { Characteristic } from './hap-types';

import { PluginConfig } from './interfaces';
import { Log } from './logger';
import { Plugin } from './main';

import type { API } from 'homebridge';
import { createHash } from 'node:crypto';

import { Door } from './types/door';
import { Fan } from './types/fan';
import { Fanv2 } from './types/fan-v2';
import { GarageDoorOpener } from './types/garage-door-opener';
import { HeaterCooler } from './types/heater-cooler';
import { HumiditySensor } from './types/humidity-sensor';
import { Lightbulb } from './types/lightbulb';
import { LockMechanism } from './types/lock-mechanism';
import { SecuritySystem } from './types/security-system';
import { Switch } from './types/switch';
import { Television } from './types/television';
import { OccupancySensor } from './types/occupancy-sensor';
import { ContactSensor } from './types/contact-sensor';
import { MotionSensor } from './types/motion-sensor';
import { TemperatureSensor } from './types/temperature-sensor';
import { Battery } from './types/battery-status';
import { Sensor } from './types/sensors';
import { Thermostat } from './types/thermostat';
import { Window } from './types/window';
import { WindowCovering } from './types/window-covering';

export class Hap {
  plugin: Plugin;
  socket;
  log: Log;
  pin: string;
  config: PluginConfig;
  hapClient: HapClient;
  services: ServiceType[] = [];
  private startTimeout: NodeJS.Timeout;
  private discoveryTimeout: NodeJS.Timeout;
  private syncTimeout: NodeJS.Timeout;
  private api: API;
  private configDiscoveryTimeout: number;
  private configDiscoveryWait: number;

  public ready: boolean;

  private dummy = () => {};
  
  /* GSH Supported types */
  private types = {};

  /* event tracking */
  // evInstances: Instance[] = [];
  // evServices: ServiceType[] = [];
  reportStateSubject = new Subject();
  pendingStateReport = [];

  /* types of characteristics to track */
  evTypes = [
    Characteristic.Active,
    Characteristic.On,
    Characteristic.CurrentPosition,
    Characteristic.TargetPosition,
    Characteristic.CurrentDoorState,
    Characteristic.TargetDoorState,
    Characteristic.Brightness,
    Characteristic.HeatingThresholdTemperature,
    Characteristic.Hue,
    Characteristic.Saturation,
    Characteristic.LockCurrentState,
    Characteristic.LockTargetState,
    Characteristic.TargetHeatingCoolingState,
    Characteristic.TargetTemperature,
    Characteristic.CoolingThresholdTemperature,
    Characteristic.CurrentTemperature,
    Characteristic.CurrentRelativeHumidity,
    Characteristic.SecuritySystemTargetState,
    Characteristic.SecuritySystemCurrentState,
    Characteristic.ActiveIdentifier,
    Characteristic.Mute,
    Characteristic.OccupancyDetected,
    Characteristic.ContactSensorState,
    Characteristic.CurrentMediaState,
  ];

  accessoryFilter: Array<string> = [];
  accessoryFilterInverse: boolean;
  accessorySerialFilter: Array<string> = [];
  // deviceNameMap: Array<{ replace: string; with: string }> = [];

  constructor(socket, plugin, pin: string, config: PluginConfig, api) {
    this.plugin = plugin;
    this.config = config;
    this.socket = socket;
    this.log = plugin.log;
    this.pin = pin;
    this.api = api;

    this.configDiscoveryTimeout = (config.discoveryTimeout ? config.discoveryTimeout : 5);
    this.configDiscoveryWait = (config.discoveryWait ? config.discoveryWait : 15);

    this.accessoryFilter = config.accessoryFilter || [];
    this.accessoryFilterInverse = config.accessoryFilterInverse || false;
    this.accessorySerialFilter = config.accessorySerialFilter || [];
    config.instanceBlacklist = config.instanceDenylist || [];

    /* GSH Supported types */
    const sensors = new Sensor(this);
    this.types = {
      Door: new Door(),
      Fan: new Fan(),
      Fanv2: new Fanv2(),
      GarageDoorOpener: new GarageDoorOpener(),
      HeaterCooler: new HeaterCooler(this),
      HumiditySensor: config.mergeSensorDevices ? sensors : new HumiditySensor(),
      Lightbulb: new Lightbulb(),
      LockMechanism: new LockMechanism(),
      Outlet: new Switch('action.devices.types.OUTLET'),
      SecuritySystem: new SecuritySystem(),
      Switch: new Switch('action.devices.types.SWITCH'),
      Television: new Television(this),
      TemperatureSensor: config.mergeSensorDevices ? sensors : new TemperatureSensor(this),
      Thermostat: new Thermostat(this),
      Window: new Window(),
      WindowCovering: new WindowCovering(),
      Speaker: this.dummy,
      InputSource: this.dummy,
      OccupancySensor: config.mergeSensorDevices ? sensors : new OccupancySensor(),
      ContactSensor: config.mergeSensorDevices ? sensors : new ContactSensor(),
      MotionSensor: config.mergeSensorDevices ? sensors : new MotionSensor(),
      Battery: config.mergeSensorDevices ? sensors : new Battery(),
    };

    // eslint-disable-next-line max-len
    this.log.debug(`Waiting ${this.configDiscoveryWait} seconds before starting instance discovery, and ${this.configDiscoveryTimeout} seconds after last device is discovered to publish to Google.`);
    this.startTimeout = setTimeout(() => {
      this.discover();
    }, this.configDiscoveryWait * 1000);

    this.reportStateSubject
      .pipe(
        map((i) => {
          if (!this.pendingStateReport.includes(i)) {
            this.pendingStateReport.push(i);
          }
        }),
        debounceTime(1000),
      )
      .subscribe((data) => {
        const pendingStateReport = this.pendingStateReport;
        this.pendingStateReport = [];
        this.processPendingStateReports(pendingStateReport);
      });
  }

  /**
   * Homebridge Instance Discovery
   */

  async discover() {
    this.hapClient = new HapClient({
      config: this.config,
      pin: this.pin,
      logger: this.log,
    });

    this.waitForNoMoreDiscoveries();
    this.hapClient.on('instance-discovered', this.waitForNoMoreDiscoveries);

    this.hapClient.on('hapEvent', (event) => {
      this.handleHapEvent(event);
    });
  }

  waitForNoMoreDiscoveries = () => {
    // Clear any existing timeout
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
    }

    // Set up the timeout
    this.discoveryTimeout = setTimeout(() => {
      this.log.debug('No more instances discovered, publishing services');
      this.hapClient.removeListener('instance-discovered', this.waitForNoMoreDiscoveries);
      this.start();
      this.requestSync();
      this.hapClient.on('instance-discovered', this.requestSync.bind(this));  // Request sync on new instance discovery
    }, this.configDiscoveryTimeout * 1000);
  };

  /**
   * Start processing
   */
  async start() {
    this.services = await this.loadAccessories();
    this.log.info(`Discovered ${this.services.length} accessories`);
    this.ready = true;
    await this.buildSyncResponse();
    const evServices: ServiceType[] = this.services.filter(x => this.evTypes.some(uuid => x.serviceCharacteristics.find(c => c.uuid === uuid)));
    this.log.debug(`Monitoring ${evServices.length} services for changes`);

    const monitor = await this.hapClient.monitorCharacteristics(evServices);
    monitor.on('service-update', (services) => {
      // this.log.debug(`Service Update ${services}`);
      services.map((service: any) => {
        this.reportStateSubject.next(service.uniqueId);
      });
      // this.reportStateSubject.next(services[0].uniqueId);
    });
  }

  /**
   * Build Google SYNC intent payload
   */
  async buildSyncResponse(): Promise<SmartHomeV1SyncDevices[]> {
    const devices = this.services.filter((service) =>
      this.types?.[service.type]?.sync,
    ).reduce((response, service) => {
      const sync = this.types[service.type].sync(service);
      return sync ? [...response, sync] : response;
    }, []);
    // console.log(devices);
    // console.log(devices.length);

    const latestSync: Record<string, any> = this.plugin.platform.accessory.context.latestSync;
    // console.log(`caching ${Object.keys(latestSync).length} devices.`);
    for (const x of devices) {          // update sync response
      latestSync[x.id].sync = x;
    }
    for (const x of Object.values(latestSync)) {
      if (!x.unavailable && !devices.find(y => x.sync.id === y.id)) {
        if (x.sync.traits) {    // disables pre-merged/unmerged sensors.
          x.sync._traits = x.sync.traits;
          delete x.sync.traits;
          // console.log(x);
        }
      }
      if (x.unavailable && x.sync?.traits) {    // keep as zombie device
        devices.push(x.sync);
        // console.log(x);
      }
    }
    // console.log(devices);
    // console.log(devices.length);
    
    return devices;
  }

  /**
   * Ask google to send a sync request
   */
  async requestSync() {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = setTimeout(() => {
      this.log.info('Sending Sync Request');
      this.socket?.sendJson({
        type: 'request-sync',
      });
    }, 15000);
  }

  /**
   * Process the QUERY intent
   * @param devices
   */
  async query(devices) {
    // console.log('query', devices);
    const response = {};

    for (const device of devices) {
      const service = this.services.find(x => x.uniqueId === device.id);
      if (service) {
        await this.getStatus(service);
        const query = this.types[service.type].query(service);
        response[device.id] = query ? query : {};
      } else {
        response[device.id] = {};
      }
    }

    return response;
  }

  /**
   * Process the EXECUTE intent
   * @param commands
   */
  async execute(commands: SmartHomeV1ExecuteRequestCommands[]): Promise<SmartHomeV1ExecuteResponseCommands[]> {
    const response: SmartHomeV1ExecuteResponseCommands[] = [];

    for (const command of commands) {
      for (const device of command.devices) {
        const service = this.services.find(x => x.uniqueId === device.id);
        this.log.debug(`Processing command ${command.execution[0].command} for ${device.id} and ${service?.serviceName}`);
        if (service) {
          // check if two factor auth is required, and if we have it
          if (this.config.twoFactorAuthPin && this.types[service.type].twoFactorRequired
            && this.types[service.type].is2faRequired(command)
            && !(command.execution.length && command.execution[0].challenge
              && command.execution[0].challenge.pin === this.config.twoFactorAuthPin.toString()
            )
          ) {
            this.log.info('Requesting Two Factor Authentication Pin');
            response.push({
              ids: [device.id],
              status: 'ERROR',
              errorCode: 'challengeNeeded',
              challengeNeeded: {
                type: 'pinNeeded',
              },
            });
          } else {
            // process the request
            try {
              response.push(await this.types[service.type].execute(service, command));
            } catch (error) {
              if (this.config.debug) {
                this.log.debug(`Error executing service: ${JSON.stringify(service)}`);
                this.log.debug(`Error executing command: ${JSON.stringify(command)}`);
                this.log.debug(error);
              }
              this.log.error(`Error executing command: ${error.message}`);
              response.push({
                ids: [device.id],
                status: 'ERROR',
                debugString: error.message,
              });
            }
          }
        } else {
          this.log.error(`Device not found: ${device.id}`);
          response.push({
            ids: [device.id],
            status: 'OFFLINE',
            errorCode: 'deviceNotFound',
          });
        }
      }
    }
    return response;
  }

  /**
   * Request a status update from an accessory
   * @param service
   */
  async getStatus(service: ServiceType) {
    return await service.refreshCharacteristics();
  }

  /**
   * Load all the accessories from Homebridge
   */
  public async loadAccessories(): Promise<ServiceType[]> {
    return this.hapClient.getAllServices().then((services) => {
      if (this.config.debug && process.uptime() < 600) {
        try {
          // write the discovery response to a file for debugging
          const storagePath = this.api.user.storagePath() + '/homebridge-gsh-discovery.json';
          this.log.warn(`Writing Discovery Response to ${storagePath}`);
          fs.writeFileSync(storagePath, JSON.stringify(services, null, 2));
        } catch (e) {
          this.log.error(`Failed to write discovery response to file: ${e.message}`);
        }
      }
      services = services.filter(x => this.types[x.type] !== undefined);
      this.log.debug(`Loaded ${services.length} accessories from Homebridge - pre filter`);
      // Pre-compile accessoryFilter strings into RegExp objects
      const compiledAccessoryFilter = this.accessoryFilter.map(filter => new RegExp(filter));
      const searchList = (target: string, regexList: RegExp[]): boolean => {
        if (target) {
          for (const regex of regexList) {
            if (regex.test(target)) {
              this.log.debug(`${this.accessoryFilterInverse ? 'Including' : 'Skipping'} service '${target}' - matches accessoryFilter '${regex}'`);
              return true;
            }
          }
        }
        return false;
      };
      if (this.accessoryFilterInverse) {
        services = services.filter(x => searchList(x.serviceName, compiledAccessoryFilter));
      } else {
        services = services.filter(x => !searchList(x.serviceName, compiledAccessoryFilter));
      }
      services = services.filter(x => !this.accessorySerialFilter.includes(x.accessoryInformation['Serial Number']));
      // if 2fa is forced for this service type, but a pin has not been set ignore the service
      services = services.filter(x => {
        if (this.types[x.type].twoFactorRequired && !this.config.twoFactorAuthPin && !this.config.disablePinCodeRequirement) {
          this.log.warn(`Not registering ${x.serviceName} - Pin code has not been set and is required for secure ` +
            `${x.type} accessory types. See https://git.io/JUQWX`);
          return false;
        } else {
          return true;
        }
      });

      services = services.map(service => {
        return {
          ...service,
          uniqueId: createHash('sha256')
            .update(`${service.instance.username}${service.aid}${service.iid}${service.uuid}`)
            .digest('hex'),
        };
      });      // The embeded uniqueId formula is different with Hap Client
      this.log.debug(`Returned ${services.length} accessories from Homebridge - post filter`);

      const lostlimit = 96; // keep 1 day assuming 15 mins. interval to update
      const latestSync: Record<string, any> = this.plugin.platform.accessory.context.latestSync;
      for (const x of Object.values(latestSync)) {
        x.unavailable++;
      }
      for (const x of services) {
        if (!this.types?.[x.type]?.sync) {      // speaker, inputSource...
          continue;
        }
        if (!latestSync[x.uniqueId]) {          // new device
          this.log.debug(`Found new accessory '${x.serviceName}'. aid:${x.aid}, iid:${x.iid}, username:${x.instance.username}`);
          latestSync[x.uniqueId] = {		// save original for future removal
            sync: {
              id: x.uniqueId,
              name: {
                name: x.serviceName,
              },
              customData: {
                aid: x.aid,
                iid: x.iid,
                instanceUsername: x.instance.username,
              },
            },
            unavailable: 0,
          };
        } else {                                // consistent device
          latestSync[x.uniqueId].unavailable = 0;
        }
      }
      for (const x of Object.keys(latestSync)) {
        if (!latestSync[x]?.unavailable) {	// consistent or wrong record
          continue;
        }
        const response = latestSync[x]?.sync;	// inconsistent records
        const name = response?.name.name;
        const aid = response?.customData.aid;
        const iid = response?.customData.iid;
        const username = response?.customData.instanceUsername;
        if (latestSync[x].unavailable > lostlimit) {  // delete the device
          this.log.warn(`Removed accessory '${name}' due to exceeding missed count limit ${lostlimit}. aid:${aid}, iid:${iid}, username:${username}`);
          delete latestSync[x];
        } else if (latestSync[x].unavailable) {     // keep as zombie device
          this.log.warn(`Failed to find accessory '${name}' ${latestSync[x].unavailable} times. aid:${aid}, iid:${iid}, username:${username}`);
        }
      }

      return services;
    }).catch((e) => {
      if (e.response?.status === 401) {
        this.log.warn('Homebridge must be running in insecure mode to view and control accessories from this plugin.');
      } else {
        this.log.error(`Failed load accessories from Homebridge: ${e.message}`);
      }
      return [];
    });
  }

  /**
   * Handle events from HAP
   * @param event
   */
  async handleHapEvent(events) {
    for (const event of events) {
      const index = this.services.findIndex(item => item.uniqueId === event.uniqueId);
      if (index === -1) {
        this.log.debug(`[handleHapEvent] Service not found in services list ${event}`);
        return;
      } else {
        this.services[index] = event;
        this.reportStateSubject.next(event.uniqueId);
      }
    }
  }

  /**
   * Generate a state report from the list pending
   * @param pendingStateReport
   */
  async processPendingStateReports(pendingStateReport) {
    const states = {};

    for (const uniqueId of pendingStateReport) {
      const service = this.services.find(x => x.uniqueId === uniqueId);
      if (!this.types?.[service.type]?.query) {
        continue;
      }
      const representative = [];
      const query = this.types[service.type].query(service, representative);
      if (query) {
        const id = representative[0] ?? service.uniqueId;
        states[id] = query;
      }
    }

    return await this.sendStateReport(states);
  }

  async sendFullStateReport() {
    const states = {};

    // don't report state if there are no services
    if (!this.services.length) {
      return;
    }
    this.services.filter((service) => 
      this.types?.[service.type]?.query,
    ).map((service) => {
      const query = this.types[service.type].query(service);
      if (query) {
        states[service.uniqueId] = query;
      }
    });
    return await this.sendStateReport(states);
  }

  /**
   * Send the state report back to Google
   * @param states
   * @param requestId
   */
  async sendStateReport(states, requestId?) {
    const payload = {
      requestId,
      type: 'report-state',
      body: states,
    };
    this.log.debug('Sending State Report');
    this.log.debug(JSON.stringify(payload, null, 2));
    this.socket?.sendJson(payload);
  }

  /**
   * Close the HAP connection, used for testing
   */
  public async destroy() {
    if (this.startTimeout) {
      clearTimeout(this.startTimeout);
    }
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
    }
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    if (this.hapClient) {
      this.hapClient.destroy();
    }
  }
}
