/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { combineLatest } from 'rxjs';
import { map, take } from 'rxjs/operators';
import {
  CoreSetup,
  CoreStart,
  KibanaRequest,
  Logger,
  Plugin,
  PluginInitializerContext,
} from 'src/core/server';
import { isEmpty, mapValues } from 'lodash';
import { SavedObjectsClient } from '../../../../src/core/server';
import { mappingFromFieldMap } from '../../rule_registry/common/mapping_from_field_map';
import { Dataset } from '../../rule_registry/server';
import { APMConfig, APMXPackConfig, APM_SERVER_FEATURE_ID } from '.';
import { mergeConfigs } from './index';
import { UI_SETTINGS } from '../../../../src/plugins/data/common';
import { APM_FEATURE, registerFeaturesUsage } from './feature';
import { registerApmAlerts } from './lib/alerts/register_apm_alerts';
import { registerFleetPolicyCallbacks } from './lib/fleet/register_fleet_policy_callbacks';
import { createApmTelemetry } from './lib/apm_telemetry';
import { createApmEventClient } from './lib/helpers/create_es_client/create_apm_event_client';
import { getInternalSavedObjectsClient } from './lib/helpers/get_internal_saved_objects_client';
import { registerSearchStrategies } from './lib/search_strategies';
import { createApmAgentConfigurationIndex } from './lib/settings/agent_configuration/create_agent_config_index';
import { getApmIndices } from './lib/settings/apm_indices/get_apm_indices';
import { createApmCustomLinkIndex } from './lib/settings/custom_link/create_custom_link_index';
import { apmIndices, apmTelemetry, apmServerSettings } from './saved_objects';
import type {
  ApmPluginRequestHandlerContext,
  APMRouteHandlerResources,
} from './routes/typings';
import {
  APMPluginSetup,
  APMPluginSetupDependencies,
  APMPluginStartDependencies,
} from './types';
import { registerRoutes } from './routes/register_routes';
import { getGlobalApmServerRouteRepository } from './routes/get_global_apm_server_route_repository';
import {
  PROCESSOR_EVENT,
  SERVICE_ENVIRONMENT,
  SERVICE_NAME,
  TRANSACTION_TYPE,
} from '../common/elasticsearch_fieldnames';
import { tutorialProvider } from './tutorial';

export class APMPlugin
  implements
    Plugin<
      APMPluginSetup,
      void,
      APMPluginSetupDependencies,
      APMPluginStartDependencies
    >
{
  private currentConfig?: APMConfig;
  private logger?: Logger;
  constructor(private readonly initContext: PluginInitializerContext) {
    this.initContext = initContext;
  }

  public setup(
    core: CoreSetup<APMPluginStartDependencies>,
    plugins: Omit<APMPluginSetupDependencies, 'core'>
  ) {
    this.logger = this.initContext.logger.get();
    const config$ = this.initContext.config.create<APMXPackConfig>();
    const mergedConfig$ = combineLatest(plugins.apmOss.config$, config$).pipe(
      map(([apmOssConfig, apmConfig]) => mergeConfigs(apmOssConfig, apmConfig))
    );

    core.savedObjects.registerType(apmIndices);
    core.savedObjects.registerType(apmTelemetry);
    core.savedObjects.registerType(apmServerSettings);

    const currentConfig = mergeConfigs(
      plugins.apmOss.config,
      this.initContext.config.get<APMXPackConfig>()
    );
    this.currentConfig = currentConfig;

    if (
      plugins.taskManager &&
      plugins.usageCollection &&
      currentConfig['xpack.apm.telemetryCollectionEnabled']
    ) {
      createApmTelemetry({
        core,
        config$: mergedConfig$,
        usageCollector: plugins.usageCollection,
        taskManager: plugins.taskManager,
        logger: this.logger,
        kibanaVersion: this.initContext.env.packageInfo.version,
      });
    }

    plugins.features.registerKibanaFeature(APM_FEATURE);

    registerFeaturesUsage({ licensingPlugin: plugins.licensing });

    const getCoreStart = () =>
      core.getStartServices().then(([coreStart]) => coreStart);

    const { ruleDataService } = plugins.ruleRegistry;
    const ruleDataClient = ruleDataService.initializeIndex({
      feature: APM_SERVER_FEATURE_ID,
      registrationContext: 'observability.apm',
      dataset: Dataset.alerts,
      componentTemplateRefs: [],
      componentTemplates: [
        {
          name: 'mappings',
          mappings: mappingFromFieldMap(
            {
              [SERVICE_NAME]: {
                type: 'keyword',
              },
              [SERVICE_ENVIRONMENT]: {
                type: 'keyword',
              },
              [TRANSACTION_TYPE]: {
                type: 'keyword',
              },
              [PROCESSOR_EVENT]: {
                type: 'keyword',
              },
            },
            'strict'
          ),
        },
      ],
    });

    const resourcePlugins = mapValues(plugins, (value, key) => {
      return {
        setup: value,
        start: () =>
          core.getStartServices().then((services) => {
            const [, pluginsStartContracts] = services;
            return pluginsStartContracts[
              key as keyof APMPluginStartDependencies
            ];
          }),
      };
    }) as APMRouteHandlerResources['plugins'];

    const boundGetApmIndices = async () =>
      getApmIndices({
        savedObjectsClient: await getInternalSavedObjectsClient(core),
        config: await mergedConfig$.pipe(take(1)).toPromise(),
      });

    boundGetApmIndices().then((indices) => {
      plugins.home?.tutorials.registerTutorial(
        tutorialProvider({
          apmConfig: currentConfig,
          apmIndices: indices,
          cloud: plugins.cloud,
          isFleetPluginEnabled: !isEmpty(resourcePlugins.fleet),
        })
      );
    });

    const telemetryUsageCounter =
      resourcePlugins.usageCollection?.setup.createUsageCounter(
        APM_SERVER_FEATURE_ID
      );

    registerRoutes({
      core: {
        setup: core,
        start: getCoreStart,
      },
      logger: this.logger,
      config: currentConfig,
      repository: getGlobalApmServerRouteRepository(),
      ruleDataClient,
      plugins: resourcePlugins,
      telemetryUsageCounter,
    });

    if (plugins.alerting) {
      registerApmAlerts({
        ruleDataClient,
        alerting: plugins.alerting,
        ml: plugins.ml,
        config$: mergedConfig$,
        logger: this.logger!.get('rule'),
      });
    }

    registerFleetPolicyCallbacks({
      plugins: resourcePlugins,
      ruleDataClient,
      config: currentConfig,
      logger: this.logger,
    });

    // search strategies for async partial search results
    core.getStartServices().then(([coreStart]) => {
      (async () => {
        const savedObjectsClient = new SavedObjectsClient(
          coreStart.savedObjects.createInternalRepository()
        );

        const includeFrozen = await coreStart.uiSettings
          .asScopedToClient(savedObjectsClient)
          .get(UI_SETTINGS.SEARCH_INCLUDE_FROZEN);

        registerSearchStrategies(
          plugins.data.search.registerSearchStrategy,
          boundGetApmIndices,
          includeFrozen
        );
      })();
    });

    return {
      config$: mergedConfig$,
      getApmIndices: boundGetApmIndices,
      createApmEventClient: async ({
        request,
        context,
        debug,
      }: {
        debug?: boolean;
        request: KibanaRequest;
        context: ApmPluginRequestHandlerContext;
      }) => {
        const [indices, includeFrozen] = await Promise.all([
          boundGetApmIndices(),
          context.core.uiSettings.client.get(UI_SETTINGS.SEARCH_INCLUDE_FROZEN),
        ]);

        const esClient = context.core.elasticsearch.client.asCurrentUser;

        return createApmEventClient({
          debug: debug ?? false,
          esClient,
          request,
          indices,
          options: {
            includeFrozen,
          },
        });
      },
    };
  }

  public start(core: CoreStart) {
    if (this.currentConfig == null || this.logger == null) {
      throw new Error('APMPlugin needs to be setup before calling start()');
    }

    // create agent configuration index without blocking start lifecycle
    createApmAgentConfigurationIndex({
      client: core.elasticsearch.client.asInternalUser,
      config: this.currentConfig,
      logger: this.logger,
    });
    // create custom action index without blocking start lifecycle
    createApmCustomLinkIndex({
      client: core.elasticsearch.client.asInternalUser,
      config: this.currentConfig,
      logger: this.logger,
    });
  }

  public stop() {}
}
