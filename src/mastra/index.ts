
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { registerApiRoute } from '@mastra/core/server';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: "mastra-storage",
      url: "file:./mastra.db",
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    }
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
  server: {
    apiRoutes: [
      // 非流式对话路由 —— 绕过 kdoo.ai 流式接口不稳定的问题
      // Studio 原生 chat 强制流式，此路由供前端/测试用 agent.generate() 单次返回
      registerApiRoute('/chat/:agentId', {
        method: 'POST',
        handler: async (c) => {
          const agentId = c.req.param('agentId');
          const agent = c.get('mastra').getAgent(agentId);
          if (!agent) {
            return c.json({ error: `Agent '${agentId}' not found` }, 404);
          }
          const body = await c.req.json();
          const result = await agent.generate(body.messages, body.options);
          return c.json({ text: result.text, toolCalls: result.toolCalls, toolResults: result.toolResults });
        },
      }),
    ],
  },
});
