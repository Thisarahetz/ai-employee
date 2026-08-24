export * from './types';
export * from './registry';
export * from './express-adapter';
export * from './nestjs-adapter';

// NOTE (scaffold limitation): this barrel re-exports both the Express and NestJS
// adapters. In CommonJS that means importing anything from '@ai-employee/integration-sdk'
// eagerly `require()`s both 'express' and '@nestjs/common', even if you only use one
// adapter. Both are declared as *optional* peerDependencies (see package.json) — if you
// only ever need one framework, prefer importing that adapter directly:
//   import { createExpressRouter } from '@ai-employee/integration-sdk/express-adapter';
//   import { AiActionsModule } from '@ai-employee/integration-sdk/nestjs-adapter';
// which avoids pulling in the other framework's dependency at load time.
