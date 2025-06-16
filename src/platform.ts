/**
 * Homebridge Entry Point
 */

import * as fs from 'fs-extra';
import type { API, Characteristic, Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import * as path from 'node:path';
import { PluginConfig } from './interfaces';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { Plugin } from './main';
import os from 'os';

export class HomebridgeGoogleSmartHome {
  public accessory: PlatformAccessory;
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public plugin: Plugin;
  private manualSyncTimeout: NodeJS.Timeout | null = null;

  constructor(
    public log,
    public config: PluginConfig,
    public api: API,
  ) {
    api.on('didFinishLaunching', async () => {
      if (this.config.token) {
        this.start();
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    
    this.accessories.set(accessory.UUID, accessory);
  }
  
  async start() {
    const homebridgeConfig = await fs.readJson(path.resolve(this.api.user.configPath()));
    const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}`);
    
    this.accessory = this.accessories.get(uuid);
    if (!this.accessory) {
      this.accessory = new this.api.platformAccessory(`${PLUGIN_NAME}`, uuid);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
      this.accessory.context.latestSync = {};
    }
    for (const [x, y] of this.accessories) {
      if (x !== uuid) {
        this.log.info('Removing existing accessory from cache:', y.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [y]);
      }
    }
    this.setupAccessory();

    this.plugin = new Plugin(this, this.config, homebridgeConfig, this.api);
  }

  setupAccessory() {
    const version = fs.readJsonSync(path.resolve(__dirname, '../package.json')).version;
    const hostname = os.hostname();
    const service: typeof Service = this.api.hap.Service;
    const characteristic: typeof Characteristic = this.api.hap.Characteristic;
    
    this.accessory
      .getService(service.AccessoryInformation)
      .setCharacteristic(characteristic.Manufacturer, `${PLUGIN_NAME}`)
      .setCharacteristic(characteristic.SerialNumber, `${PLUGIN_NAME}@{hostname}`)
      .setCharacteristic(characteristic.FirmwareRevision, version);

    const sync =
          this.accessory.getService(service.Switch) ||
          this.accessory.addService(service.Switch, `${PLATFORM_NAME} Sync`);
    sync.getCharacteristic(this.api.hap.Characteristic.On)
      .onSet(async (on: CharacteristicValue) => {
        const x = this.accessory.getService(service.Switch);
        if (this.manualSyncTimeout) {
          const hap = this.api.hap;
          throw new hap.HapStatusError(hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
          // x.updateCharacteristic(characteristic.On, true);
        } else if (on) {
          this.manualSyncTimeout = setTimeout(() => {
            const x = this.accessory.getService(service.Switch);
            x.updateCharacteristic(characteristic.On, false);
            this.manualSyncTimeout = null;
          }, 30 * 1000);
          const latestSync: Record<string, any> = this.plugin.platform.accessory.context.latestSync;
          for (const y of Object.keys(latestSync as Record<string, any>)) {
            if (latestSync[y].unavailable) {
              const name = latestSync[y].sync?.name.name;
              const aid = latestSync[y].sync?.customData.aid;
              const iid = latestSync[y].sync?.customData.iid;
              const username = latestSync[y].sync?.customData.instanceUsername;
              delete this.plugin.platform.accessory.context.latestSync[y];
              this.log.info(`Removed outdated accessory '${name}'. aid:${aid}, iid:${iid}, username:${username}`);
            }
          }
          this.plugin.hap.requestSync();
        } else {
          x.updateCharacteristic(characteristic.On, false);
        }
      });
    sync.setCharacteristic(characteristic.On, false);

    const contact =
          this.accessory.getService(service.ContactSensor) ||
          this.accessory.addService(service.ContactSensor, `${PLATFORM_NAME} Contact`);
    contact.setCharacteristic(characteristic.ContactSensorState, characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  }
}
