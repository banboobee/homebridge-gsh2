import { ServiceType } from '@homebridge/hap-client';
import { SmartHomeV1ExecuteRequestCommands, SmartHomeV1ExecuteResponseCommands } from 'actions-on-google';
import { Hap } from '../hap';
import { Characteristic } from '../hap-types';
import { ghToHap, ghToHap_t } from './ghToHapTypes';

export class WindowCovering extends ghToHap implements ghToHap_t {

  constructor(
    private hap: Hap,
  ) {
    super();
  }

  sync(service: ServiceType) {
    let traits = [
      'action.devices.traits.OpenClose',
    ];
    let attributes = {
      openDirection: ['UP', 'DOWN'],
    };

    if (this.hap.config.mergeSensorDevices) {
      const sensors = this.hap.sensors.sync(service);
      traits = [...traits, ...sensors.traits];
      attributes = {...attributes, ...sensors.attributes};
      // console.log(service.serviceName, traits, attributes);
    }

    return this.createSyncData(service, {
      type: 'action.devices.types.BLINDS',
      traits,
      attributes,
    });
  }

  query(service: ServiceType) {
    let response = {
      on: true,
      online: true,
      openPercent: service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentPosition).value,
    };
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
      case ('action.devices.commands.OpenClose'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.TargetPosition).setValue(command.execution[0].params.openPercent);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      default: { return { ids: [service.uniqueId], status: 'ERROR', debugString: `unknown command ${command.execution[0].command}` }; }
    }
  }
}
