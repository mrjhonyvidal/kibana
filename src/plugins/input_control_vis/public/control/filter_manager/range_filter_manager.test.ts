/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import expect from '@kbn/expect';

import { RangeFilterManager } from './range_filter_manager';
import {
  IndexPattern,
  FilterManager as QueryFilterManager,
  IndexPatternsContract,
} from '../../../../data/public';
import { RangeFilter, RangeFilterMeta } from '@kbn/es-query';

describe('RangeFilterManager', function () {
  const controlId = 'control1';

  describe('createFilter', function () {
    const indexPatternId = '1';
    const fieldMock = {
      name: 'field1',
    };
    const indexPatternMock: IndexPattern = {
      id: indexPatternId,
      fields: {
        getByName: (name: any) => {
          const fields: any = {
            field1: fieldMock,
          };
          return fields[name];
        },
      },
    } as IndexPattern;
    const indexPatternsServiceMock = {
      get: jest.fn().mockReturnValue(Promise.resolve(indexPatternMock)),
    } as unknown as jest.Mocked<IndexPatternsContract>;
    const queryFilterMock: QueryFilterManager = {} as QueryFilterManager;
    let filterManager: RangeFilterManager;
    beforeEach(async () => {
      filterManager = new RangeFilterManager(
        controlId,
        'field1',
        '1',
        indexPatternsServiceMock,
        queryFilterMock
      );
      await filterManager.init();
    });

    test('should create range filter from slider value', function () {
      const newFilter = filterManager.createFilter({ min: 1, max: 3 }) as RangeFilter;
      expect(newFilter).to.have.property('meta');
      expect(newFilter.meta.index).to.be(indexPatternId);
      expect(newFilter.meta.controlledBy).to.be(controlId);
      expect(newFilter.meta.key).to.be('field1');
      expect(newFilter).to.have.property('range');
      expect(JSON.stringify(newFilter.range, null, '')).to.be('{"field1":{"gte":1,"lte":3}}');
    });
  });

  describe('getValueFromFilterBar', function () {
    class MockFindFiltersRangeFilterManager extends RangeFilterManager {
      mockFilters: RangeFilter[];

      constructor(
        id: string,
        fieldName: string,
        indexPatternId: string,
        indexPatternsService: IndexPatternsContract,
        queryFilter: QueryFilterManager
      ) {
        super(id, fieldName, indexPatternId, indexPatternsService, queryFilter);
        this.mockFilters = [];
      }

      findFilters() {
        return this.mockFilters;
      }

      setMockFilters(mockFilters: RangeFilter[]) {
        this.mockFilters = mockFilters;
      }
    }

    const indexPatternsServiceMock = {} as IndexPatternsContract;
    const queryFilterMock: QueryFilterManager = {} as QueryFilterManager;
    let filterManager: MockFindFiltersRangeFilterManager;
    beforeEach(() => {
      filterManager = new MockFindFiltersRangeFilterManager(
        controlId,
        'field1',
        '1',
        indexPatternsServiceMock,
        queryFilterMock
      );
    });

    test('should extract value from range filter', function () {
      filterManager.setMockFilters([
        {
          range: {
            field1: {
              gt: 1,
              lt: 3,
            },
          },
          meta: {} as RangeFilterMeta,
        },
      ] as RangeFilter[]);
      const value = filterManager.getValueFromFilterBar();
      expect(value).to.be.a('object');
      expect(value).to.have.property('min');
      expect(value?.min).to.be(1);
      expect(value).to.have.property('max');
      expect(value?.max).to.be(3);
    });

    test('should return undefined when filter value can not be extracted from Kibana filter', function () {
      filterManager.setMockFilters([
        {
          range: {
            myFieldWhichIsNotField1: {
              gte: 1,
              lte: 3,
            },
          },
          meta: {} as RangeFilterMeta,
        },
      ] as RangeFilter[]);
      expect(filterManager.getValueFromFilterBar()).to.eql(undefined);
    });
  });
});
