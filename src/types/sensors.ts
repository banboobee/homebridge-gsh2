import type { SmartHomeV1ExecuteRequestCommands, SmartHomeV1ExecuteResponseCommands, SmartHomeV1SyncDevices } from 'actions-on-google';
import { ServiceType } from '@homebridge/hap-client';
import { Hap } from '../hap';
import { Characteristic, Service } from '../hap-types';
import { ghToHap, ghToHap_t } from './ghToHapTypes';

export class Sensor extends ghToHap implements ghToHap_t {
  constructor(
    private hap: Hap = undefined,
  ) {
    super();
  }

  private instances = {};
  private voidInstances = {};

  sync(service: ServiceType): SmartHomeV1SyncDevices | undefined {
    const traits = [];
    const attributes = {};

    if (!this.instances[service.uniqueId] && !this.voidInstances[service.uniqueId]) {
      const services = this.hap.services.filter(x => x.aid === service.aid && x.instance.username === service.instance.username) ?? [];
      const characteristics = [
        Characteristic.CurrentPosition,
        Characteristic.LockCurrentState,
        Characteristic.On,
        Characteristic.CurrentTemperature,
        Characteristic.CurrentRelativeHumidity,
        Characteristic.OccupancyDetected,
        Characteristic.ContactSensorState,
        Characteristic.MotionDetected,
        Characteristic.StatusLowBattery,
        Characteristic.BatteryLevel,
      ];
      let representative = undefined;
      const p = {};
      for (const characteristic of characteristics) {
        for (const x of services) {
          const c = x.serviceCharacteristics.find(x => x.uuid === characteristic);
          if (c) {
            if (characteristic === Characteristic.ContactSensorState &&
                services[representative]?.uuid === Service.WindowCovering) {
              this.hap.log.error(`Unable to merger devices due to conflicting traits. ${x.serviceName}`);
              continue;
            }
            representative ??= x.uniqueId;
            if (representative === x.uniqueId) {
              this.instances[x.uniqueId] = p;
            } else {
              this.voidInstances[x.uniqueId] = representative;
            }
            p[characteristic] = {
              service: x,
              characteristic: c,
            };
          }
        }
      }
      // console.log(Object.keys(this.instances).map(x => this.hap.services.find(y => y.uniqueId  === x).serviceName));
      // console.log(Object.keys(this.voidInstances).map(x => this.hap.services.find(y => y.uniqueId === x).serviceName));
      // console.log(`# of sensor services: ${Object.keys(this.instances).length}`);
      // console.log(`# of void sensor services: ${Object.keys(this.voidInstances).length}`);
    }
    if (this.voidInstances[service.uniqueId]) {
      return undefined;
    }
    const instance = this.instances[service.uniqueId];

    // check if the device reports CurrentTemperature
    if (instance?.[Characteristic.CurrentTemperature]) {
      traits.push('action.devices.traits.TemperatureControl');
      attributes['queryOnlyTemperatureControl'] = true;
      attributes['temperatureUnitForUX'] = this.hap?.config.forceFahrenheit ? 'F' : 'C';
    }

    // check if the device reports CurrentRelativeHumidity
    if (instance?.[Characteristic.CurrentRelativeHumidity]) {
      traits.push('action.devices.traits.HumiditySetting');
      attributes['queryOnlyHumiditySetting'] = true;
    }

    // check if the device reports OccupancyDetected
    if (instance?.[Characteristic.OccupancyDetected]) {
      traits.push('action.devices.traits.OccupancySensing');
      attributes['occupancySensorConfiguration'] = [{
        occupancySensorType: 'PIR',
      }];
    }

    // check if the device reports MotionDetected
    if (instance?.[Characteristic.MotionDetected]) {
      traits.push('action.devices.traits.OccupancySensing');
      attributes['occupancySensorConfiguration'] = [{
        occupancySensorType: 'PHYSICAL_CONTACT',
      }];
    }

    // check if the device reports ContactSensorState
    if (instance?.[Characteristic.ContactSensorState]) {
      traits.push('action.devices.traits.OpenClose');
      attributes['discreteOnlyOpenClose'] = true;
      attributes['openDirection'] = ['LEFT', 'RIGHT'];
      attributes['queryOnlyOpenClose'] = true;
    }

    // check if the device reports BatteryLevel or StatusLowBattery
    if (instance?.[Characteristic.StatusLowBattery] || instance?.[Characteristic.BatteryLevel]) {
      traits.push('action.devices.traits.EnergyStorage');
      attributes['queryOnlyEnergyStorage'] = true;
    }

    // console.log(traits, attributes);
    return this.createSyncData(service, {
      type: 'action.devices.types.SENSOR',
      traits,
      attributes,
    });
  }

  query(service: ServiceType, representative: string[] = undefined) {
    let instance = this.instances[service.uniqueId];
    if (!instance) {
      if (representative) {
        const p = this.voidInstances[service.uniqueId];
        instance = this.instances[p];
        representative[0] = p;
      } else {
        return undefined;
      }
    }
    const response = {
      online: true,
    } as any;

    // check if the device reports CurrentTemperature
    if (instance?.[Characteristic.CurrentTemperature]) {
      response['temperatureAmbientCelsius'] = instance[Characteristic.CurrentTemperature].characteristic?.value;
    }

    // check if the device reports CurrentRelativeHumidity
    if (instance?.[Characteristic.CurrentRelativeHumidity]) {
      response['humidityAmbientPercent'] = instance[Characteristic.CurrentRelativeHumidity].characteristic?.value;
    }
    
    // check if the device reports OccupancyDetected
    if (instance?.[Characteristic.OccupancyDetected]) {
      response['occupancy'] = instance[Characteristic.OccupancyDetected].characteristic?.value ? 'OCCUPIED': 'UNOCCUPIED';
    }
    
    // check if the device reports MotionDetected
    if (instance?.[Characteristic.MotionDetected]) {
      response['occupancy'] = instance[Characteristic.MotionDetected].characteristic?.value ? 'OCCUPIED': 'UNOCCUPIED';
    }
    
    // check if the device reports ContactSensorState
    if (instance?.[Characteristic.ContactSensorState]) {
      response['openPercent'] = instance[Characteristic.ContactSensorState].characteristic?.value ? 100: 0;
    }
    
    // check if the device reports BatteryLevel or StatusLowBattery
    const lowBattery = instance?.[Characteristic.StatusLowBattery]?.characteristic?.value as number;
    if (instance?.[Characteristic.StatusLowBattery]) {
      if (lowBattery !== undefined) {
        response['descriptiveCapacityRemaining'] = lowBattery ? 'CRITICALLY_LOW' : 'MEDIUM';
      }
    }
    if (instance?.[Characteristic.BatteryLevel]) {
      const descriptions = ['CRITICALLY_LOW', 'CRITICALLY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'FULL', 'FULL'];
      const thresholds = [0, 10, 20, 40, 80, 90, 100];
      const current = instance[Characteristic.BatteryLevel].characteristic?.value as number;
      const description = lowBattery ? descriptions[0] : descriptions[
        thresholds.reduce((x, y, i) => {
          return current >= y ? i : x;
        }, 0)
      ];
      response['descriptiveCapacityRemaining'] = description,
      response['capacityRemaining'] = [{
        rawValue: current,
        unit: 'PERCENTAGE',
      }];
    }
    // console.log(`${service.serviceName}\n${service.uniqueId} ${JSON.stringify(response, null, 2)}`);

    return response;
  }

  async execute(service: ServiceType, command: SmartHomeV1ExecuteRequestCommands): Promise<SmartHomeV1ExecuteResponseCommands> {
    if (!command.execution.length) {
      return { ids: [service.uniqueId], status: 'ERROR', debugString: 'missing command' };
    }
    return { ids: [service.uniqueId], status: 'ERROR', debugString: `unknown command ${command.execution[0].command}` };
  }
}
