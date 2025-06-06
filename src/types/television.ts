import { ServiceType } from '@homebridge/hap-client';
import { SmartHomeV1ExecuteRequestCommands, SmartHomeV1ExecuteResponseCommands } from 'actions-on-google';
import { Hap } from '../hap';
import { Characteristic, Service } from '../hap-types';
import { ghToHap, ghToHap_t } from './ghToHapTypes';

export class Television extends ghToHap implements ghToHap_t {
  constructor(
    private hap: Hap,
  ) {
    super();
  }

  private instances = {};

  sync(service: ServiceType) {
    if (!this.instances[service.uniqueId]) {
      this.instances[service.uniqueId] = {
        Mute: [],
        volumeSelector: [],
        channels: [],
        lastChannel: undefined,
        inputs: [],
      };
    }
    const instance = this.instances[service.uniqueId];

    // console.log(`${service.type}: ${service.instance.username}, aid:${service.aid}, iid:${service.iid}, name: ${service.serviceName}`);
    const x = this.hap.services.filter(x => x.aid === service.aid && x.instance.username === service.instance.username) ?? [];

    for (const speaker of x.filter(x => x.uuid === Service.Speaker)) {
      instance.Mute = [];
      for (const c of speaker.serviceCharacteristics.filter(x => x.uuid === Characteristic.Mute)) {
        // console.log(`  ${speaker.type}: ${speaker.serviceName}, ${c.type}: ${c.serviceName}`);
        instance.Mute.push(c);
      }
      instance.volumeSelector = [];
      for (const c of speaker.serviceCharacteristics.filter(x => x.uuid === Characteristic.VolumeSelector)) {
        // console.log(`  ${speaker.type}: ${speaker.serviceName}, ${c.type}: ${c.serviceName}`);
        instance.volumeSelector.push(c);
      }
    }

    instance.channels = [];
    instance.inputs = [];
    for (const input of x.filter(x => x.uuid === Service.InputSource)) {    // service.linked is better?
      const cname = input.serviceCharacteristics.find(x => x.uuid === Characteristic.ConfiguredName)?.value as string;
      const c = {
        serviceName: input.serviceName,
        Identifier: input.serviceCharacteristics.find(x => x.uuid === Characteristic.Identifier)?.value,
        InputSourceType: input.serviceCharacteristics.find(x => x.uuid === Characteristic.InputSourceType)?.value,
      } as any;
      if (cname.substring(0, 10) === 'Station - ') {
        c.ConfiguredName = cname.substring(10);
        instance.channels.push(c);
      } else {
        c.ConfiguredName = cname;
        instance.inputs.push(c);
      }
    }
    // console.log(`${service.type}: ${service.instance.username}, aid:${service.aid}, iid:${service.iid}, name: ${service.serviceName}`);
    // console.log(`channels: ${JSON.stringify(this.instances[service.uniqueId].channels, null, 2)}`);
    // console.log(`inputs: ${JSON.stringify(this.instances[service.uniqueId].inputs, null, 2)}`);

    const traits = [
      'action.devices.traits.OnOff',
      'action.devices.traits.MediaState',
      //'action.devices.traits.Modes',
      //'action.devices.traits.Toggles',
      'action.devices.traits.AppSelector',
      'action.devices.traits.TransportControl',
    ];
    const attributes = {
      commandOnlyOnOff: false,	//OnOff
      queryOnlyOnOff: false,
      supportActivityState: false, //MediaState
      supportPlaybackState: false,
    } as any;
    attributes.availableApplications = [];
    attributes.transportControlSupportedCommands = [];
    if (service.serviceCharacteristics.find(x => x.uuid === Characteristic.RemoteKey)) {
      attributes.transportControlSupportedCommands = [
        'STOP',
        'RESUME',
        'PAUSE',
        'NEXT',
        'PREVIOUS',
      ];
    }
    if (instance.volumeSelector.find(x => x.uuid === Characteristic.VolumeSelector)) {
      traits.push('action.devices.traits.Volume');
      attributes.volumeCanMuteAndUnmute = instance.Mute.find(x => x.uuid === Characteristic.Mute) ? true : false;
      attributes.volumeMaxLevel = 20;	//Volume. Just in case for a relative operations
      attributes.commandOnlyVolume = true;
    }
    if (instance.channels.length > 0) {
      traits.push('action.devices.traits.Channel');
      attributes.commandOnlyChannels = true;
      attributes.availableChannels = [];
      for (const c of instance.channels) {
        const n = [c.ConfiguredName];
        const a = this.hap.config.channelAlias.find(x => x.channel === c.ConfiguredName);
        if (a) {
          for (const x of a.alias) {
            n.push(x);
          }
        }
        attributes.availableChannels.push({
          key: c.serviceName,
          names: n,
          number: `${c.Identifier + 1}`,
        });
      }
    }
    if (instance.inputs.length > 0) {
      traits.push('action.devices.traits.InputSelector');
      attributes.commandOnlyInputSelector = false;
      attributes.orderedInputs = true;
      attributes.availableInputs = [{
        key: '_tv',	//dummy for stations
        names: [
          {
            lang: 'en',
            name_synonym: [
              '_tv',
            ],
          },
        ],
      }];
      for (const c of instance.inputs) {
        attributes.availableInputs.push({
          key: c.serviceName,
          names: [
            {
              lang: 'en',
              name_synonym: [
                c.ConfiguredName,
              ],
            },
          ],
        });
      }
    }
    // console.log(JSON.stringify(traits, null, 2));
    // console.log(JSON.stringify(attributes, null, 2));

    return this.createSyncData(service, {
      type: 'action.devices.types.TV',
      traits: traits,
      attributes: attributes,
    });
  }

  query(service: ServiceType) {

    const instance = this.instances[service.uniqueId];
    const response = {
      on: !!service.serviceCharacteristics.find(x => x.uuid === Characteristic.Active).value,
      online: true,
    } as any;
    if (instance.volumeSelector.find(x => x.uuid === Characteristic.VolumeSelector)) {
      response.currentVolume = 10;
    }
    const cMute = instance.Mute.find(x => x.uuid === Characteristic.Mute);
    if (cMute) {
      response.isMuted = cMute.value ? true : false;
    }
    const cActive = service.serviceCharacteristics.find(x => x.uuid === Characteristic.ActiveIdentifier);
    if (cActive) {
      response.currentInput = '_tv';
      const i = instance.channels.find(x => x.Identifier === cActive.value);
      if (i) {
        response.currentInput = i.serviceName;
      }
    }
    // console.log(service.serviceName, response);
    // console.log(`${JSON.stringify(instance, null, 2)}`);

    return response;

    // return {
    //   on: !!service.serviceCharacteristics.find(x => x.uuid === Characteristic.Active).value,
    //   online: true,
    // };
  }

  async execute(service: ServiceType, command: SmartHomeV1ExecuteRequestCommands): Promise<SmartHomeV1ExecuteResponseCommands> {
    const instance = this.instances[service.uniqueId];
    if (!command.execution.length) {
      return { ids: [service.uniqueId], status: 'ERROR', debugString: 'missing command' };
    }
    switch (command.execution[0].command) {
      case ('action.devices.commands.OnOff'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.Active).setValue(command.execution[0].params.on ? 1 : 0);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.mute'): {
        await instance.Mute.find(x => x.uuid === Characteristic.Mute).setValue(command.execution[0].params.mute ? 1 : 0);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      // case ('action.devices.commands.setVolume'): {	// No proper characteristic
      // }
      case ('action.devices.commands.volumeRelative'): {
        // Characteristic.VolumeSelector.INCREMENT = 0;
        // Characteristic.VolumeSelector.DECREMENT = 1;
        await instance.volumeSelector.find(x => x.uuid === Characteristic.VolumeSelector).setValue(command.execution[0].params.relativeSteps < 0 ? 1 : 0);
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.selectChannel'): {

        if (command.execution[0].params?.channelCode) {
          const code = command.execution[0].params.channelCode;
          const c = instance.channels.find(x => x.serviceName === code);
          if (c) {
            await service.serviceCharacteristics.find(x => x.uuid === Characteristic.ActiveIdentifier).setValue(c.Identifier);
            return { ids: [service.uniqueId], status: 'SUCCESS' };
          }
        } else if (command.execution[0].params?.channelNumber) {
          const number = parseInt(command.execution[0].params.channelNumber) - 1;
          const c = instance.channels.find(x => x.Identifier === number);
          if (c) {
            await service.serviceCharacteristics.find(x => x.type === Characteristic.ActiveIdentifier).setValue(c.Identifier);
            return { ids: [service.uniqueId], status: 'SUCCESS' };
          }
          //} else if (command.execution[0].params?.channelName) {
        }
        break;
      }
      case ('action.devices.commands.relativeChannel'): {
        const change = command.execution[0].params?.relativeChannelChange;
        const n = instance.channels.length;
        let c = instance.lastChannel !== undefined ? instance.channels.findIndex(x => x.Identifier === instance.lastChannel) : n - 1;
        // const d = service.serviceCharacteristics.find(x => x.uuid === Characteristic.serviceName).value;
        // console.log(`Current channel index of ${d} is ${c}.`);
        if (change > 0) {
          if (++c > n - 1) {
            c = 0;
          }
        } else if (change < 0) {
          if (--c < 0) {
            c = n - 1;
          }
        }
        // console.log(`Updated channel index of ${d} to ${c}.`);
        c = instance.channels[c].Identifier;
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.ActiveIdentifier).setValue(c);
        instance.lastChannel = c;
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.returnChannel'): {
        let c = service.serviceCharacteristics.find(x => x.uuid === Characteristic.ActiveIdentifier).value;
        c = instance.lastChannel !== undefined ? instance.lastChannel : instance.channels[0]?.Identifier;
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.ActiveIdentifier).setValue(c);
        instance.lastChannel = c;
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.SetInput'): {
        const input = command.execution[0].params?.newInput;
        const c = instance.inputs.find(x => x.serviceName === input);
        if (c) {
          await service.serviceCharacteristics.find(x => x.uuid === Characteristic.ActiveIdentifier).setValue(parseInt(c.Identifier));
          return { ids: [service.uniqueId], status: 'SUCCESS', states: { currentInput: c.serviceName } };
        }
        break;
      }
      case ('action.devices.commands.NextInput'): {
        let c = service.serviceCharacteristics.find(x => x.uuid === Characteristic.ActiveIdentifier).value as number;
        const n = instance.inputs.length;
        if (instance.channels.find(x => x.Identifier === c)) {
          c = -1;
        } else {
          c = instance.inputs.findIndex(x => x.Identifier === c);
        }
        // const d = service.serviceCharacteristics.find(x => x.uuid === Characteristic.Name).value;
        // console.log(`Current input index of ${d} is ${c}.`);
        if (++c > n - 1) {
          c = 0;
        }
        // console.log(`Updated input index of ${d} to ${c}.`);
        c = instance.inputs[c]?.Identifier;
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.ActiveIdentifier).setValue(c);
        return { ids: [service.uniqueId], status: 'SUCCESS', states: { currentInput: instance.inputs.find(x => x.Identifier === c).serviceName } };
      }
      case ('action.devices.commands.PreviousInput'): {
        let c = service.serviceCharacteristics.find(x => x.uuid === Characteristic.ActiveIdentifier).value as number;
        const n = instance.inputs.length;
        if (instance.channels.find(x => x.Identifier === c)) {
          c = -1;
        } else {
          c = instance.inputs.findIndex(x => x.Identifier === c);
        }
        // const d = service.serviceCharacteristics.find(x => x.uuid === Characteristic.Name).value;
        // console.log(`Current input index of ${d} is ${c}.`);
        if (--c < 0) {
          c = n - 1;
        }
        // console.log(`Updated input index of ${d} to ${c}.`);
        c = instance.inputs[c]?.Identifier;
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.ActiveIdentifier).setValue(c);
        return { ids: [service.uniqueId], status: 'SUCCESS', states: { currentInput: instance.inputs.find(x => x.Identifier === c).serviceName } };
      }
      // Characteristic.RemoteKey.REWIND = 0;
      // Characteristic.RemoteKey.FAST_FORWARD = 1;
      // Characteristic.RemoteKey.NEXT_TRACK = 2;
      // Characteristic.RemoteKey.PREVIOUS_TRACK = 3;
      // Characteristic.RemoteKey.ARROW_UP = 4;
      // Characteristic.RemoteKey.ARROW_DOWN = 5;
      // Characteristic.RemoteKey.ARROW_LEFT = 6;
      // Characteristic.RemoteKey.ARROW_RIGHT = 7;
      // Characteristic.RemoteKey.SELECT = 8;
      // Characteristic.RemoteKey.BACK = 9;
      // Characteristic.RemoteKey.EXIT = 10;
      // Characteristic.RemoteKey.PLAY_PAUSE = 11;
      // Characteristic.RemoteKey.INFORMATION = 15;
      case ('action.devices.commands.mediaStop'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.RemoteKey).setValue(9); // Characteristic.RemoteKey.BACK,
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.mediaResume'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.RemoteKey).setValue(8); // Characteristic.RemoteKey.SELECT,
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.mediaPause'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.RemoteKey).setValue(11); // Characteristic.RemoteKey.PLAY_PAUSE,
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.mediaNext'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.RemoteKey).setValue(7); // Characteristic.RemoteKey.ARROW_RIGHT,
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      case ('action.devices.commands.mediaPrevious'): {
        await service.serviceCharacteristics.find(x => x.uuid === Characteristic.RemoteKey).setValue(6); // Characteristic.RemoteKey.ARROW_LEFT,
        return { ids: [service.uniqueId], status: 'SUCCESS' };
      }
      default: { return { ids: [service.uniqueId], status: 'ERROR', debugString: `unknown command ${command.execution[0].command}` }; }
    }
  }
}
