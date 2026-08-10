export const OPENAPI = {
  openapi: '3.0.3',
  info: {
    title: 'Continue Protocol API',
    description:
      'A continue/resume state machine for long-running, resumable work. ' +
      'Sessions flow through an 11-state lifecycle with heartbeats, checkpoints, ' +
      'retry policy, webhooks, and metrics.',
    version: '1.0.0',
  },
  servers: [{ url: '/api' }],
  tags: [{ name: 'sessions' }, { name: 'system' }],
  paths: {
    '/sessions': {
      post: {
        tags: ['sessions'],
        summary: 'Create a session',
        operationId: 'createSession',
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateSessionInput' } } },
        },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionEnvelope' } } } },
          '200': { description: 'Replayed from Idempotency-Key' },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
      get: {
        tags: ['sessions'],
        summary: 'List sessions with pagination',
        operationId: 'listSessions',
        parameters: [
          { name: 'status', in: 'query', required: false, schema: { $ref: '#/components/schemas/Status' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0, default: 0 } },
          { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionListEnvelope' } } } },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/sessions/{id}': {
      get: {
        tags: ['sessions'],
        summary: 'Get a session',
        operationId: 'getSession',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionEnvelope' } } } },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/sessions/{id}/queue': actionOp('queueSession', 'Queue a pending session', 'pending -> queued'),
    '/sessions/{id}/start': actionOp('startSession', 'Start a queued session', 'queued -> active'),
    '/sessions/{id}/heartbeat': actionOp('heartbeatSession', 'Report liveness and progress', '-> active, records a checkpoint', true),
    '/sessions/{id}/checkpoint': actionOp('checkpointSession', 'Record an explicit resume point', '-> active, records a checkpoint', true),
    '/sessions/{id}/resume': actionOp('resumeSession', 'Resume a paused/stalled session', 'paused|stalled -> resuming', true),
    '/sessions/{id}/retry': actionOp('retrySession', 'Retry a stalled session', 'stalled -> retrying'),
    '/sessions/{id}/pause': actionOp('pauseSession', 'Pause an active session', 'active -> paused'),
    '/sessions/{id}/stall': actionOp('stallSession', 'Manually stall a session', '-> stalled'),
    '/sessions/{id}/complete': actionOp('completeSession', 'Complete work into verification', '-> verifying', true),
    '/sessions/{id}/finalize': actionOp('finalizeSession', 'Finalize a verified session', 'verifying -> done'),
    '/sessions/{id}/cancel': actionOp('cancelSession', 'Cancel a session', '-> cancelled', true),
    '/sessions/{id}/fail': actionOp('failSession', 'Fail a session', '-> failed', true),
    '/watchdog': {
      post: {
        tags: ['system'],
        summary: 'Run the stall watchdog',
        operationId: 'runWatchdog',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { stalled: { type: 'array', items: { $ref: '#/components/schemas/Session' } } } } } } },
        },
      },
    },
    '/metrics': {
      get: {
        tags: ['system'],
        summary: 'Service metrics',
        operationId: 'getMetrics',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { metrics: { $ref: '#/components/schemas/Metrics' } } } } } },
        },
      },
    },
    '/health': {
      get: {
        tags: ['system'],
        summary: 'Health check',
        operationId: 'health',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, service: { type: 'string' } } } } } },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
      apiKeyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    responses: {
      BadRequest: { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Conflict: { description: 'Invalid state transition', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
    schemas: {
      Status: {
        type: 'string',
        enum: ['pending', 'queued', 'active', 'paused', 'resuming', 'stalled', 'retrying', 'verifying', 'done', 'cancelled', 'failed'],
      },
      CreateSessionInput: {
        type: 'object',
        properties: {
          totalSteps: { type: 'integer', minimum: 0 },
          maxAttempts: { type: 'integer', minimum: 1 },
          webhookUrl: { type: 'string', format: 'uri' },
          metadata: { type: 'object', additionalProperties: true },
          data: {},
        },
      },
      Checkpoint: {
        type: 'object',
        required: ['id', 'at', 'step', 'progress'],
        properties: {
          id: { type: 'string' },
          at: { type: 'string', format: 'date-time' },
          step: { type: 'integer' },
          progress: { type: 'number', minimum: 0, maximum: 1 },
          data: {},
        },
      },
      Session: {
        type: 'object',
        required: ['id', 'status', 'tenant', 'createdAt', 'currentStep', 'progress', 'checkpoints', 'attempts', 'version'],
        properties: {
          id: { type: 'string' },
          status: { $ref: '#/components/schemas/Status' },
          tenant: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          lastHeartbeatAt: { type: 'string', format: 'date-time', nullable: true },
          currentStep: { type: 'integer' },
          totalSteps: { type: 'integer', nullable: true },
          progress: { type: 'number', minimum: 0, maximum: 1 },
          data: {},
          checkpoints: { type: 'array', items: { $ref: '#/components/schemas/Checkpoint' } },
          error: { type: 'string', nullable: true },
          metadata: { type: 'object', additionalProperties: true },
          webhookUrl: { type: 'string', format: 'uri', nullable: true },
          attempts: { type: 'integer' },
          maxAttempts: { type: 'integer', nullable: true },
          version: { type: 'integer' },
        },
      },
      SessionEnvelope: { type: 'object', required: ['session'], properties: { session: { $ref: '#/components/schemas/Session' } } },
      SessionListEnvelope: {
        type: 'object',
        required: ['sessions', 'pagination'],
        properties: {
          sessions: { type: 'array', items: { $ref: '#/components/schemas/Session' } },
          pagination: {
            type: 'object',
            required: ['total', 'offset', 'limit', 'hasMore'],
            properties: {
              total: { type: 'integer' },
              offset: { type: 'integer' },
              limit: { type: 'integer' },
              hasMore: { type: 'boolean' },
            },
          },
        },
      },
      Metrics: {
        type: 'object',
        required: ['created', 'transitions', 'fromTo', 'terminal', 'current'],
        properties: {
          created: { type: 'integer' },
          transitions: { type: 'integer' },
          fromTo: { type: 'object', additionalProperties: { type: 'integer' } },
          terminal: { type: 'object', additionalProperties: { type: 'integer' } },
          current: { type: 'object', additionalProperties: { type: 'integer' } },
        },
      },
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
    },
  },
} as const;

function actionOp(
  operationId: string,
  summary: string,
  description: string,
  withBody = false,
) {
  const path: Record<string, unknown> = {
    post: {
      tags: ['sessions'],
      summary,
      operationId,
      description,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'OK',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionEnvelope' } } },
        },
        '404': { $ref: '#/components/responses/NotFound' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  };
  if (withBody) {
    (path.post as Record<string, unknown>).requestBody = {
      required: false,
      content: { 'application/json': { schema: { type: 'object' } } },
    };
  }
  return path;
}
