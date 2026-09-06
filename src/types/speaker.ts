import { ServiceType } from '@homebridge/hap-client';
import type { SmartHomeV1ExecuteRequestCommands, SmartHomeV1ExecuteResponseCommands } from 'actions-on-google';
import { Characteristic, Service } from '../hap-types.js';
import { Hap } from '../hap.js';
import { ghToHap, ghToHap_t } from './ghToHapTypes.js';

export class Speaker extends ghToHap implements ghToHap_t {
  // constructor(
  //   private hap: Hap,
  // ) {
  //   super();
  // }

  // private instances = {};

  sync(service: ServiceType) {
    // const services = this.hap.services.filter(x => x.aid === service.aid && x.instance.username === service.instance.username) ?? [];
    const traits = [
      'action.devices.traits.MediaState',
      'action.devices.traits.OnOff',
      'action.devices.traits.TransportControl',
      'action.devices.traits.Volume',
      // 'action.devices.traits.AppSelector',
      // 'action.devices.traits.InputSelector',
    ];
    const attributes = {
      commandOnlyOnOff: false,  //OnOff
      queryOnlyOnOff: false,
      supportActivityState: !!service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentMediaState),
      supportPlaybackState: !!service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentMediaState),
      transportControlSupportedCommands: service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentMediaState) ?
        [
          'STOP',
          'RESUME',
          'PAUSE',
        ] : [],
      availableApplications: [],
      volumeCanMuteAndUnmute: !!service.serviceCharacteristics.find(x => x.uuid === Characteristic.Mute),
      volumeMaxLevel: 20,   //Volume. Just in case for a relative operations
      commandOnlyVolume: true,
    } as any;
    // console.log(service.instance, service.serviceName, traits, attributes);

    return this.createSyncData(service, {
      type: 'action.devices.types.SPEAKER',
      traits: traits,
      attributes: attributes,
    });
  }
  
  query(service: ServiceType) {
    const response = {
      online: true,
    } as any;

    const active = service.serviceCharacteristics.find(x => x.uuid === Characteristic.Active);
    if (active) {
      response.on = !!active;
    } else {
      response.on = true;
    }
    const volume = service.serviceCharacteristics.find(x => x.uuid === Characteristic.Volume);
    if (volume) {
      response.currentVolume = volume.value;
    } else {
      response.currentVolume = 10;
    }
    // if (service.serviceCharacteristics.find(x => x.uuid === Characteristic.VolumeSelector)) {
    //   response.currentVolume = 10;
    // }
    const mute = service.serviceCharacteristics.find(x => x.uuid === Characteristic.Mute);
    if (mute) {
      response.isMuted = !!mute.value;
    }
    // public static readonly PLAY = 0;
    // public static readonly PAUSE = 1;
    // public static readonly STOP = 2;
    // public static readonly LOADING = 4;
    // public static readonly INTERRUPTED = 5;
    const mediaState = service.serviceCharacteristics.find(x => x.uuid === Characteristic.CurrentMediaState);
    if (mediaState) {
      response.activityState = response.on ? 'STANDBY' : 'INACTIVE';
      switch (mediaState.value) {
        case 0: // Characteristic.CurrentMediaState.PLAY:
          response.playbackState = 'PLAYING';
          break;
        case 1: // Characteristic.CurrentMediaState.PAUSE:
          response.playbackState = 'PAUSED';
          break;
        case 2: // Characteristic.CurrentMediaState.STOP:
          response.playbackState = 'STOPPED';
          break;
        case 4: // Characteristic.CurrentMediaState.LOADING:
        case 5: // Characteristic.CurrentMediaState.INTERRUPTED:
        default:
          response.playbackState = 'BUFFERING';
          break;
      }
    }
    // console.log(service.serviceName, response);

    return response;
  }

  async execute(service: ServiceType, command: SmartHomeV1ExecuteRequestCommands): Promise<SmartHomeV1ExecuteResponseCommands> {
    if (!command.execution.length) {
      return { ids: [service.uniqueId], status: 'ERROR', debugString: 'missing command' };
    }
    switch (command.execution[0].command) {
      case ('action.devices.commands.OnOff'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.Active).setValue(command.execution[0].params.on ? 1 : 0);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.mute'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.Mute).setValue(!!command.execution[0].params.mute);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      // case ('action.devices.commands.setVolume'): {  // Not supported
      // }
      case ('action.devices.commands.volumeRelative'): {
        // public static readonly INCREMENT = 0;
        // public static readonly DECREMENT = 1;
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.VolumeSelector)
	  .setValue(command.execution[0].params.relativeSteps < 0 ? 1 : 0);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.mediaStop'): {
        // public static readonly STOP = 2;
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.TargetMediaState).setValue(2);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.mediaResume'): {
        // public static readonly PLAY = 0;
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.RemoteKey).setValue(0);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.mediaPause'): {
        // public static readonly PAUSE = 1;
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.RemoteKey).setValue(1);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      default: { return { ids: [service.uniqueId], status: 'ERROR', debugString: `unknown command ${command.execution[0].command}` }; }
    }
  }
}

