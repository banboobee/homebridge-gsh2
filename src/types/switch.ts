import { ServiceType } from '@homebridge/hap-client';
import { SmartHomeV1ExecuteRequestCommands, SmartHomeV1ExecuteResponseCommands } from 'actions-on-google';
import { Hap } from '../hap';
import { Characteristic } from '../hap-types';
import { ghToHap, ghToHap_t } from './ghToHapTypes';

export class Switch extends ghToHap implements ghToHap_t {

  constructor(
    private hap: Hap,
  ) {
    super();
  }

  sync(service: ServiceType) {
    const type = service.type === 'Switch' ? 'action.devices.types.SWITCH' : 'action.devices.types.OUTLET';
    let traits = [
      'action.devices.traits.OnOff',
    ];
    let attributes = {};

    // check if the switch has the brightness characteristic
    if (service.type === 'Switch' &&
	service.serviceCharacteristics.find(x => x.uuid === Characteristic.Brightness)) {
      traits.push('action.devices.traits.Brightness');
    }
    if (this.hap.config.mergeSensorDevices) {
      const sensors = this.hap.sensors.sync(service);
      traits = [...traits, ...sensors.traits];
      attributes = {...attributes, ...sensors.attributes};
      // console.log(service.serviceName, traits, attributes);
    }

    return this.createSyncData(service, {
      type,
      traits,
      attributes,
    });
  }

  query(service: ServiceType) {
    let response = {
      on: !!service.serviceCharacteristics.find(x => x.uuid === Characteristic.On).value,
      online: true,
    } as any;

    // check if the switch has the brightness characteristic
    if (service.type === 'Switch' &&
	service.serviceCharacteristics.find(x => x.uuid === Characteristic.Brightness)) {
      response.brightness = service.serviceCharacteristics.find(x => x.uuid === Characteristic.Brightness).value;
    }
    if (this.hap.config.mergeSensorDevices) {
      const sensors = this.hap.sensors.query(service);
      response = {...response, ...sensors};
      // console.log(service.serviceName, response);
    }

    return response;
  }

  async execute(service: ServiceType, command: SmartHomeV1ExecuteRequestCommands): Promise<SmartHomeV1ExecuteResponseCommands> {
    if (!command.execution.length) {
      return { ids: [service.uniqueId], status: 'ERROR', debugString: 'missing command' };
    }
    switch (command.execution[0].command) {
      case ('action.devices.commands.OnOff'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.On).setValue(command.execution[0].params.on);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.BrightnessAbsolute'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.Brightness).setValue(command.execution[0].params.brightness);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      default: { return { ids: [service.uniqueId], status: 'ERROR', debugString: `unknown command ${command.execution[0].command}` }; }
    }
  }
}
