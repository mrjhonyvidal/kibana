/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { compact, flatten } from 'lodash';
import { Filter } from '@kbn/es-query';
import { mapFilter } from './map_filter';

export const mapAndFlattenFilters = (filters: Filter[]) => {
  return compact(flatten(filters)).map((item: Filter) => mapFilter(item));
};
