import { ServiceType } from '@homebridge/hap-client';
import { SmartHomeV1ExecuteRequestCommands, SmartHomeV1ExecuteResponseCommands } from 'actions-on-google';
import { Hap } from '../hap';
import { Characteristic } from '../hap-types';
import { ghToHap, ghToHap_t } from './ghToHapTypes';

export class LockMechanism extends ghToHap implements ghToHap_t {
  public twoFactorRequired = true;

  constructor(
    private hap: Hap,
  ) {
    super();
  }

  sync(service: ServiceType) {
    let traits = [
      'action.devices.traits.LockUnlock',
    ];
    let attributes = {};

    if (this.hap.config.mergeSensorDevices) {
      const sensors = this.hap.sensors.sync(service);
      traits = [...traits, ...sensors.traits];
      attributes = {...attributes, ...sensors.attributes};
      console.log(service.serviceName, traits, attributes);
    }

    return this.createSyncData(service, {
      type: 'action.devices.types.LOCK',
      traits,
      attributes,
    });
  }

  query(service: ServiceType) {
    let response = {
      online: true,
    } as any;

    const currentLockState = service.serviceCharacteristics.find(x => x.uuid === Characteristic.LockCurrentState).value;

    switch (currentLockState) {
      case (0): {
        response.isLocked = false;
        response.isJammed = false;
        break;
      }
      case (1): {
        response.isLocked = true;
        response.isJammed = false;
        break;
      }
      case (2): {
        response.isLocked = false;
        response.isJammed = true;
        break;
      }
      case (3): {
        response.isLocked = false;
        response.isJammed = false;
        break;
      }
    }

    if (this.hap.config.mergeSensorDevices) {
      const sensors = this.hap.sensors.query(service);
      response = {...response, ...sensors};
      console.log(service.serviceName, response);
    }

    return response;
  }

  async execute(service: ServiceType, command: SmartHomeV1ExecuteRequestCommands): Promise<SmartHomeV1ExecuteResponseCommands> {
    if (!command.execution.length) {
      return { ids: [service.uniqueId], status: 'ERROR', debugString: 'missing command' };
    }

    switch (command.execution[0].command) {
      case ('action.devices.commands.LockUnlock'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.LockTargetState).setValue(command.execution[0].params.lock ? 1 : 0);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      default: { return { ids: [service.uniqueId], status: 'ERROR', debugString: `unknown command ${command.execution[0].command}` }; }
    }
  }

  is2faRequired(command): boolean {
    if (!command.execution.length) {
      return false;
    }

    switch (command.execution[0].command) {
      case ('action.devices.commands.LockUnlock'): {
        if (command.execution[0].params.lock === false) {
          return true;
        }
        return false;
      }
      default: { return false; }
    }

    return false;
  }
}
