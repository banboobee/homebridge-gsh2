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
    if (service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentRelativeHumidity)) {
      traits.push('action.devices.traits.HumiditySetting');
      attributes['queryOnlyHumiditySetting'] = true;
    }
    //console.log(JSON.stringify(traits));
    //console.log(JSON.stringify(attributes, null, 2));

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
    if (service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentRelativeHumidity)) {
      response['humidityAmbientPercent'] = service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentRelativeHumidity)?.value;
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
