/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../__mocks__/kea_logic';
import '../../../../__mocks__/react_router';
import '../../../__mocks__/engine_logic.mock';

import React from 'react';

import { shallow } from 'enzyme';

import { CurationsTable, EmptyState } from '../components';

import { CurationsOverview } from './curations_overview';

describe('CurationsOverview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders an empty message when there are no curations', () => {
    setMockValues({ curations: [] });
    const wrapper = shallow(<CurationsOverview />);

    expect(wrapper.is(EmptyState)).toBe(true);
  });

  it('renders a curations table when there are curations present', () => {
    setMockValues({
      curations: [
        {
          id: 'cur-id-1',
        },
        {
          id: 'cur-id-2',
        },
      ],
    });
    const wrapper = shallow(<CurationsOverview />);

    expect(wrapper.find(CurationsTable)).toHaveLength(1);
  });
});
