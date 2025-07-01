import type { SmartHomeV1ExecuteRequestCommands, SmartHomeV1ExecuteResponseCommands, SmartHomeV1SyncDevices } from 'actions-on-google';
import { ServiceType } from '@homebridge/hap-client';
import { Hap } from '../hap';
import { Characteristic } from '../hap-types';
import { ghToHap, ghToHap_t } from './ghToHapTypes';

export class TemperatureSensor extends ghToHap implements ghToHap_t {
  constructor(
    private hap: Hap,
  ) {
    super();
  }

  sync(service: ServiceType): SmartHomeV1SyncDevices {
    const traits = [
      'action.devices.traits.TemperatureControl',
    ];
    const attributes = {
      queryOnlyTemperatureControl: true,
      temperatureUnitForUX: this.hap.config.forceFahrenheit ? 'F' : 'C',
    } as any;

    // check if the sensor has the humidity characteristic
    if (service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentRelativeHumidity)) {
      traits.push('action.devices.traits.HumiditySetting');
      attributes['queryOnlyHumiditySetting'] = true;
    }

    // check if the sensor has the batteryLevel characteristic
    if (service.serviceCharacteristics.find(x => x.uuid === Characteristic.BatteryLevel)) {
      traits.push('action.devices.traits.EnergyStorage');
      attributes['queryOnlyEnergyStorage'] = true;
    }

    return this.createSyncData(service, {
      type: 'action.devices.types.SENSOR',
      traits,
      attributes,
    });
  }

  query(service: ServiceType) {
    const response = {
      online: true,
      temperatureSetpointCelsius: service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentTemperature)?.value,
      temperatureAmbientCelsius: service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentTemperature)?.value,
    } as any;

    // check if the sensor has the humidity characteristic
    if (service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentRelativeHumidity)) {
      response['humidityAmbientPercent'] = service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentRelativeHumidity)?.value;
    }
    
    // check if the sensor has the batteryLevel characteristic
    if (service.serviceCharacteristics.find(x => x.uuid === Characteristic.BatteryLevel)) {
      const descriptions = ['CRITICALLY_LOW', 'CRITICALLY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'FULL', 'FULL'];
      const thresholds = [0, 10, 20, 40, 80, 90, 100];
      const lowBattery = !!service.serviceCharacteristics.find(x => x.uuid === Characteristic.StatusLowBattery)?.value;
      const current = service.serviceCharacteristics.find(x => x.uuid === Characteristic.BatteryLevel)?.value as number;
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
    //console.log(response);

    return response;
  }

  async execute(service: ServiceType, command: SmartHomeV1ExecuteRequestCommands): Promise<SmartHomeV1ExecuteResponseCommands> {
    if (!command.execution.length) {
      return { ids: [service.uniqueId], status: 'ERROR', debugString: 'missing command' };
    }
    return { ids: [service.uniqueId], status: 'ERROR', debugString: `unknown command ${command.execution[0].command}` };
  }
}
