import { SmartHomeV1ExecuteRequestCommands, SmartHomeV1ExecuteResponseCommands, SmartHomeV1SyncDevices } from 'actions-on-google';
import { ServiceType } from '@homebridge/hap-client';
import { Hap } from '../hap';
import { ghToHap, ghToHap_t } from './ghToHapTypes';

export class Sensor extends ghToHap implements ghToHap_t {
  constructor(
    private hap?: Hap,
  ) {
    super();
  }

  private primaryService = {};
  private secondaryServices = {};
  private syncing = true;

  sync(service: ServiceType): SmartHomeV1SyncDevices | undefined {
    const response = {
      type: 'action.devices.types.SENSOR',
      traits: [],
      attributes: {},
    };
    
    if (this.syncing === false) {       // switch to syncing
      this.primaryService = {};
      this.secondaryServices = {};
      this.syncing = true;
    }
    if (!this.secondaryServices[service.uniqueId] && !this.primaryService[service.uniqueId]) {
      const services = this.hap.services.filter(x => x.aid === service.aid && x.instance.username === service.instance.username) ?? [];
      const primaryService = services
        .filter(x => Object.keys(this.hap.types).includes(x.type))
        .filter(x => !this.hap.sensorServices.includes(x.type))?.[0]; // select first one.
      let primarySensor = undefined;

      Object.keys(this.hap.sensorTypes).forEach(sensor => {
        const sensorService = services.find(x => x.type === sensor); // select first one.
        if (sensorService) {
          if (sensorService.type === 'ContactSensor' && primaryService?.type === 'WindowCovering') {
            this.hap.log.error(`Unable to combine ${sensorService.serviceName} due to conflicting traits. ${service.serviceName}`);
            return;
          }
          if (primarySensor === undefined) {
            primarySensor = sensorService;
            this.secondaryServices[primarySensor.uniqueId] = [];
            if (primaryService) {
              this.primaryService[primarySensor.uniqueId] = primaryService;
              this.hap.types[primaryService.type].secondaryServices[primaryService.uniqueId] = [primarySensor];
            }
          } else {
            this.primaryService[sensorService.uniqueId] = primarySensor;
          }
          // console.log('type:', service.type, ',primary:', primarySensor.serviceName, ',secondary:', sensorService.type);
          this.secondaryServices[primarySensor.uniqueId].push(sensorService);
        }
      });
    }
    if (Object.keys(this.hap.sensorTypes).includes(this.primaryService[service.uniqueId]?.type)) {
      return undefined;
    }

    const primary = this.primaryService[service.uniqueId]; // non-sensor primary service
    this.secondaryServices[service.uniqueId]?.forEach(sensor => {
      const update = this.hap.sensorTypes[sensor.type].sync(sensor);
      response.traits = [...response.traits, ...update.traits];
      response.attributes = {...response.attributes, ...update.attributes};
    });
    // console.log(response);

    return this.createSyncData(primary ?? service, response);
  }

  query(service: ServiceType) {
    this.syncing = false;       // switch to query
    let response = {
      online: true,
    } as any;

    const primary = this.primaryService[service.uniqueId];
    if (Object.keys(this.hap.sensorTypes).includes(primary?.type)) {
      // redirect to primary sensor service
      response = this.hap.types[primary.type].query(primary);
    }
    if (primary) {
      // keep top most primary service
      response['id'] ??= primary.uniqueId;
    }
    this.secondaryServices[service.uniqueId]?.forEach(sensor => {
      const update = this.hap.sensorTypes[sensor.type].query(sensor);
      Object.assign(response, update);
    });
    // console.log(response);

    return response;
  }

  async execute(service: ServiceType, command: SmartHomeV1ExecuteRequestCommands): Promise<SmartHomeV1ExecuteResponseCommands> {
    if (!command.execution.length) {
      return { ids: [service.uniqueId], status: 'ERROR', debugString: 'missing command' };
    }
    return { ids: [service.uniqueId], status: 'ERROR', debugString: `unknown command ${command.execution[0].command}` };
  }
}
