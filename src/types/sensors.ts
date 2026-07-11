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

  private syncing = true;

  private unsupportedPrimaryServiceTypes = [
    'Door',
    'Fan',
    'Fanv2',
    'GarageDoorOpener',
    'HeaterCooler',
    'Lightbulb',
    'SecuritySystem',
    'Television',
    'Thermostat',
    'Window',
  ];

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
        .filter(x => !this.hap.sensorServices.includes(x.type))
        .filter(x => !this.unsupportedPrimaryServiceTypes.includes(x.type))?.[0]; // select first one.
      const unsupported = services.find(x => this.unsupportedPrimaryServiceTypes.includes(x.type));
      if (unsupported) {
        this.hap.log.error(`Unsupported service type ${unsupported.type} to combine sensor services. ${unsupported.serviceName}`);
      }
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
              this.hap.types[primaryService.type].secondaryServices[primaryService.uniqueId] = primarySensor;
	      // primarySensor is not evaluated but its secondary services will be evaluated in the hook functions.
              this.hap.types[primaryService.type].updateSyncResponse[primaryService.uniqueId] = (primary, response) => {
                const secondary = this.hap.types[primary.type].secondaryServices[primary.uniqueId];
                if (secondary) {
                  this.syncSecondaries(secondary, response);
                  // console.log('primaryService:', primary.serviceName, ',secondaryService:', secondary.serviceName, ',sync:', response);
                }
                return response;
              };
              this.hap.types[primaryService.type].updateQueryResponse[primaryService.uniqueId] = (primary, response) => {
                const secondary = this.hap.types[primary.type].secondaryServices[primary.uniqueId];
                if (secondary) {
                  this.querySecondaries(secondary, response);
                  // console.log('primaryService:', primary.serviceName, ',secondaryService:', secondary.serviceName, ',query:', response);
                }
                return response;
              };
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
            this.primaryService[sensorService.uniqueId] = primarySensor;
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
      // secondary sensor services will be visited twice if non-sensor primary service.
      const primaryResponse = this.hap.types[primary.type].query(primary);
      primaryResponse['id'] ??= primary.uniqueId;	// keep top most service.
      
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
