/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React, { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ErrorMetadata } from '.';
import { APMError } from '../../../../../typings/es_schemas/ui/apm_error';
import { MockApmPluginContextWrapper } from '../../../../context/apm_plugin/mock_apm_plugin_context';
import {
  expectTextsInDocument,
  expectTextsNotInDocument,
} from '../../../../utils/testHelpers';

function Wrapper({ children }: { children?: ReactNode }) {
  return (
    <MemoryRouter>
      <MockApmPluginContextWrapper>{children}</MockApmPluginContextWrapper>
    </MemoryRouter>
  );
}

const renderOptions = {
  wrapper: Wrapper,
};

function getError() {
  return {
    labels: { someKey: 'labels value' },
    http: { someKey: 'http value' },
    host: { someKey: 'host value' },
    container: { someKey: 'container value' },
    service: { someKey: 'service value' },
    process: { someKey: 'process value' },
    agent: { someKey: 'agent value' },
    url: { someKey: 'url value' },
    user: { someKey: 'user value' },
    notIncluded: 'not included value',
    error: {
      id: '7efbc7056b746fcb',
      notIncluded: 'error not included value',
      custom: {
        someKey: 'custom value',
      },
    },
  } as unknown as APMError;
}

describe('ErrorMetadata', () => {
  it('should render a error with all sections', () => {
    const error = getError();
    const output = render(<ErrorMetadata error={error} />, renderOptions);

    // sections
    expectTextsInDocument(output, [
      'Labels',
      'HTTP',
      'Host',
      'Container',
      'Service',
      'Process',
      'Agent',
      'URL',
      'User',
      'Custom',
    ]);
  });

  it('should render a error with all included dot notation keys', () => {
    const error = getError();
    const output = render(<ErrorMetadata error={error} />, renderOptions);

    // included keys
    expectTextsInDocument(output, [
      'labels.someKey',
      'http.someKey',
      'host.someKey',
      'container.someKey',
      'service.someKey',
      'process.someKey',
      'agent.someKey',
      'url.someKey',
      'user.someKey',
      'error.custom.someKey',
    ]);

    // excluded keys
    expectTextsNotInDocument(output, ['notIncluded', 'error.notIncluded']);
  });

  it('should render a error with all included values', () => {
    const error = getError();
    const output = render(<ErrorMetadata error={error} />, renderOptions);

    // included values
    expectTextsInDocument(output, [
      'labels value',
      'http value',
      'host value',
      'container value',
      'service value',
      'process value',
      'agent value',
      'url value',
      'user value',
      'custom value',
    ]);

    // excluded values
    expectTextsNotInDocument(output, [
      'not included value',
      'error not included value',
    ]);
  });

  it('should render a error with only the required sections', () => {
    const error = {} as APMError;
    const output = render(<ErrorMetadata error={error} />, renderOptions);

    // required sections should be found
    expectTextsInDocument(output, ['Labels', 'User']);

    // optional sections should NOT be found
    expectTextsNotInDocument(output, [
      'HTTP',
      'Host',
      'Container',
      'Service',
      'Process',
      'Agent',
      'URL',
      'Custom',
    ]);
  });
});
