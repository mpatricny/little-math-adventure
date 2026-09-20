import {
  defineRailway,
  group,
  postgres,
  preserve,
  project,
  service,
} from 'railway/iac';

export default defineRailway(context => {
  const production = context.environment === 'production' || context.environment === 'prd';
  const database = postgres('postgres');
  const api = service('api', {
    build: 'npm ci && npm run build',
    start: 'npm start',
    preDeploy: 'npm run db:migrate:prod',
    healthcheck: '/ready',
    healthcheckTimeout: 60,
    replicas: 1,
    env: {
      DATABASE_URL: database.env.DATABASE_URL,
      NODE_ENV: production ? 'production' : 'development',
      APP_RELEASE: preserve(),
      LOG_LEVEL: preserve(),
      DOPPLER_CONFIG: preserve(),
      DOPPLER_ENVIRONMENT: preserve(),
      DOPPLER_PROJECT: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      BETTER_AUTH_URL: production ? 'https://cislokraj.cz' : 'http://localhost:8002',
      CORS_ORIGINS: production
        ? 'https://cislokraj.cz,https://www.cislokraj.cz'
        : 'http://localhost:8002,http://localhost:8012',
    },
  });

  return project('cislokraj', {
    resources: [group('Backend', [api, database])],
  });
});
