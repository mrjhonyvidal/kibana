/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import supertest from 'supertest';
import { JOB_PARAMS_RISON_CSV_DEPRECATED } from '../services/fixtures';
import { FtrProviderContext } from '../ftr_provider_context';

// eslint-disable-next-line import/no-default-export
export default function ({ getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const supertestSvc = getService('supertest');
  const reportingAPI = getService('reportingAPI');

  const generateAPI = {
    getCsvFromParamsInPayload: async (jobParams: object = {}) => {
      return await supertestSvc
        .post(`/api/reporting/generate/csv`)
        .set('kbn-xsrf', 'xxx')
        .send(jobParams);
    },
    getCsvFromParamsInQueryString: async (jobParams: string = '') => {
      return await supertestSvc
        .post(`/api/reporting/generate/csv?jobParams=${encodeURIComponent(jobParams)}`)
        .set('kbn-xsrf', 'xxx');
    },
  };

  describe('Generation from Job Params', () => {
    before(async () => {
      await esArchiver.load('x-pack/test/functional/es_archives/reporting/logs');
      await esArchiver.load('x-pack/test/functional/es_archives/logstash_functional');
    });

    after(async () => {
      await esArchiver.unload('x-pack/test/functional/es_archives/reporting/logs');
      await esArchiver.unload('x-pack/test/functional/es_archives/logstash_functional');
      await reportingAPI.deleteAllReports();
    });

    it('Rejects bogus jobParams', async () => {
      const { status: resStatus, text: resText } = (await generateAPI.getCsvFromParamsInPayload({
        jobParams: 0,
      })) as supertest.Response;

      expect(resText).to.match(/expected value of type \[string\] but got \[number\]/);
      expect(resStatus).to.eql(400);
    });

    it('Rejects empty jobParams', async () => {
      const { status: resStatus, text: resText } =
        (await generateAPI.getCsvFromParamsInPayload()) as supertest.Response;

      expect(resStatus).to.eql(400);
      expect(resText).to.match(/jobParams RISON string is required/);
    });

    it('Accepts jobParams in POST payload', async () => {
      const { status: resStatus, text: resText } = (await generateAPI.getCsvFromParamsInPayload({
        jobParams: JOB_PARAMS_RISON_CSV_DEPRECATED,
      })) as supertest.Response;
      expect(resText).to.match(/"jobtype":"csv"/);
      expect(resStatus).to.eql(200);
    });

    it('Accepts jobParams in query string', async () => {
      const { status: resStatus, text: resText } = (await generateAPI.getCsvFromParamsInQueryString(
        JOB_PARAMS_RISON_CSV_DEPRECATED
      )) as supertest.Response;
      expect(resText).to.match(/"jobtype":"csv"/);
      expect(resStatus).to.eql(200);
    });
  });
}
