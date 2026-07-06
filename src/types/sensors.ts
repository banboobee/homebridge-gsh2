import type { SmartHomeV1ExecuteRequestCommands, SmartHomeV1ExecuteResponseCommands, SmartHomeV1SyncDevices } from 'actions-on-google';
import { ServiceType } from '@homebridge/hap-client';
import { Hap } from '../hap';
import { ghToHap, ghToHap_t } from './ghToHapTypes';

export class Sensor extends ghToHap implements ghToHap_t {
  constructor(
    private hap?: Hap,
  ) {
    super();
  }

  private syncing = true;

  sync(service: ServiceType): SmartHomeV1SyncDevices | undefined {
    if (this.syncing === false) {       // switch to syncing
      this.primaryService = {};
      this.secondaryServices = {};
      this.syncing = true;
    }
    if (!this.secondaryServices[service.uniqueId] && !this.primaryService[service.uniqueId]) {
      const services = this.hap.services.filter(x => x.aid === service.aid && x.instance.username === service.instance.username) ?? [];
      const primaryService = services
        .filter(x => Object.keys(this.hap.types).includes(x.type))
        .filter(x => !this.hap.sensorServices.includes(x.type))?.[0];
      let primarySensor = undefined;

      Object.keys(this.hap.sensorTypes).forEach(sensor => {
        const sensorService = services.filter(x => x.type === sensor)?.[0];
        if (sensorService) {
          if (sensorService.type === 'ContactSensor' && primaryService?.type === 'WindowCovering') {
            this.hap.log.error(`Unable to combine ${sensorService.serviceName} due to conflicting traits. ${service.serviceName}`);
            return;
          }
          if (primarySensor === undefined) {
            primarySensor = sensorService;
            this.secondaryServices[primarySensor.uniqueId] = [];
            if (primaryService) {
              // console.log('primaryService:', primaryService.serviceName, ',type:', primaryService.type, ',primarySensor:', primarySensor.serviceName, ',type:', sensorService.type);
              this.primaryService[primarySensor.uniqueId] = primaryService.uniqueId;
              this.hap.types[primaryService.type].secondaryServices[primaryService.uniqueId] = [primarySensor];
              this.hap.types[primaryService.type].updateSyncResponse[primaryService.uniqueId] = (primary, response) => {
                const secondary = this.hap.types[primary.type].secondaryServices[primary.uniqueId]?.[0];
                if (secondary) {
                  this.syncSecondaries(secondary, response);
                  // console.log('primaryService:', primary.serviceName, ',secondaryService:', secondary.serviceName, ',sync:', response);
                }
                return response;
              };
              this.hap.types[primaryService.type].updateQueryResponse[primaryService.uniqueId] = (primary, response) => {
                const secondary = this.hap.types[primary.type].secondaryServices[primary.uniqueId]?.[0];
                if (secondary) {
                  this.querySecondaries(secondary, response);
                  // console.log('primaryService:', primary.serviceName, ',secondaryService:', secondary.serviceName, ',query:', response);
                }
                return response;
              };
              // console.log(this.hap.types[primaryService.type]);
            }
            this.updateSyncResponse[primarySensor.uniqueId] = (primary, response) => {
              this.syncSecondaries(primary, response);
              return response;
            };
            this.updateQueryResponse[primarySensor.uniqueId] = (primary, response) => {
              this.querySecondaries(primary, response);
              return response;
            };
          } else {
            this.primaryService[sensorService.uniqueId] = primarySensor.uniqueId;
          }
          // console.log('type:', service.type, ',primary:', primarySensor.serviceName, ',secondary:', sensorService.type);
          this.secondaryServices[primarySensor.uniqueId].push(sensorService);
        }
      });
    }
    if (this.primaryService[service.uniqueId]) {
      return undefined;
    }

    return this.createSyncData(service, {
      type: 'action.devices.types.SENSOR',
      traits: [],
      attributes: {},
    });
  }

  syncSecondaries(service: ServiceType, response: any) {
    this.secondaryServices[service.uniqueId]?.forEach(sensor => {
      const update = this.hap.sensorTypes[sensor.type].sync(sensor);
      response.traits = [...response.traits, ...update.traits];
      response.attributes = {...response.attributes, ...update.attributes};
    });

    return response;
  }

  query(service: ServiceType) {
    this.syncing = false;       // switch to query
    const response = {
      online: true,
    } as any;

    const primary = this.primaryService[service.uniqueId];
    if (primary) {
      const primaryService = this.hap.services.find(x => x.uniqueId === primary);
      const primaryResponse = this.hap.types[primaryService.type].query(primaryService);
      primaryResponse['id'] = primary;
      
      return primaryResponse;
    }

    return this.createQueryData(service, response);
  }

  querySecondaries(service: ServiceType, response: any) {
    this.secondaryServices?.[service.uniqueId].forEach(sensor => {
      const update = this.hap.sensorTypes[sensor.type].query(sensor);
      Object.assign(response, update);
    });
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
